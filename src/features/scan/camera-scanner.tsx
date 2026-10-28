"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";

/**
 * Camera scanning. Uses the browser's native BarcodeDetector where it exists
 * (Chrome on Android, ChromeOS and macOS); everywhere else — Chrome/Edge on
 * Windows and Linux, Firefox, Safari — the same API from the `barcode-detector`
 * ponyfill (ZXing compiled to WebAssembly). The ponyfill and its engine are
 * loaded only when a camera scan starts, and the engine is served by this app
 * (public/vendor, copied on install), never from a CDN.
 */

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorClass {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}

/** Symbologies used on our labels and documents, plus common retail codes. */
const WANTED_FORMATS = ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"];

const SCAN_INTERVAL_MS = 250;

/** The native detector when the browser has one, otherwise the bundled ZXing ponyfill. */
async function loadDetectorClass(): Promise<BarcodeDetectorClass> {
  const native = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (native) return native;
  const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? `/vendor/zxing/zxing_reader-${ZXING_WASM_VERSION}.wasm` : prefix + path,
    },
  });
  return BarcodeDetector as unknown as BarcodeDetectorClass;
}

/**
 * True when a camera scan can work here: a secure page (HTTPS), the camera
 * API, and at least one camera. Listing devices needs no permission; false
 * during server rendering and on machines without a webcam.
 */
export function useCameraScanSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const devices = navigator.mediaDevices;
    if (!window.isSecureContext || !devices?.getUserMedia || !devices.enumerateDevices) return;
    const check = () =>
      devices
        .enumerateDevices()
        .then((list) => !cancelled && setSupported(list.some((d) => d.kind === "videoinput")))
        .catch(() => {});
    void check();
    // A webcam plugged in (or removed) later.
    devices.addEventListener?.("devicechange", check);
    return () => {
      cancelled = true;
      devices.removeEventListener?.("devicechange", check);
    };
  }, []);
  return supported;
}

/** Emits a pleasant scan confirmation beep and haptic vibration when available */
function playScanFeedback() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([40]);
    }
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // 880Hz A5 chime
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    }
  } catch {
    // Audio / vibrate might not be permitted or supported, fail silently
  }
}

/** Live camera preview that reports the first code it reads. Mount it only while scanning. */
export function CameraScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function start() {
      try {
        const Detector = await loadDetectorClass();
        const supported = await Detector.getSupportedFormats();
        const formats = WANTED_FORMATS.filter((f) => supported.includes(f));
        const detector = new Detector(formats.length ? { formats } : undefined);
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (stopped) return;
          try {
            const [first] = await detector.detect(video);
            if (first?.rawValue && !stopped) {
              stopped = true;
              const raw = first.rawValue;
              setDetectedCode(raw);
              playScanFeedback();
              // Keep camera stream active for a brief moment to show success indicator before closing
              setTimeout(() => {
                onDetectedRef.current(raw);
              }, 400);
              return;
            }
          } catch {
            // A frame that cannot be read yet (camera warming up); try the next one.
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (cause) {
        if (stopped) return;
        setError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Camera access was refused. Allow the camera for this site, or use a scanner."
            : cause instanceof DOMException && cause.name === "NotFoundError"
              ? "No camera was found on this device. Use a scanner or type the code."
              : cause instanceof Error
                ? cause.message
              : "The camera could not be started.",
        );
      }
    }

    void start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="relative overflow-hidden rounded-lg bg-slate-950 border border-slate-800">
        <video
          ref={videoRef}
          muted
          playsInline
          className={cn(
            "aspect-video w-full object-cover transition-all duration-300",
            detectedCode ? "opacity-90 ring-4 ring-emerald-500 scale-[1.01]" : ""
          )}
          aria-label="Camera preview"
        />
        {/* Reticle / aiming guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div
            className={cn(
              "relative h-28 w-48 sm:h-36 sm:w-64 rounded-xl border-2 transition-all duration-300 flex items-center justify-center",
              detectedCode
                ? "border-emerald-400 bg-emerald-500/20 scale-105 shadow-[0_0_25px_rgba(16,185,129,0.5)]"
                : "border-dashed border-white/60 bg-black/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]"
            )}
          >
            {/* Corner accent marks */}
            <div className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-brand-400" />
            <div className="absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-brand-400" />
            <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-brand-400" />
            <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-brand-400" />
          </div>
        </div>

        {detectedCode && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="flex items-center gap-2 rounded-full bg-emerald-600/95 backdrop-blur-xs px-4 py-1.5 text-xs font-semibold text-white shadow-xl ring-1 ring-emerald-400">
              <span className="inline-block size-2 rounded-full bg-white animate-pulse" />
              <span>Scanned:</span>
              <span className="font-mono tracking-wider">{detectedCode}</span>
            </span>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-500">
        {detectedCode ? "Success! Applying scanned barcode..." : "Hold the barcode or QR code steady inside the frame."}
      </p>
    </div>
  );
}
