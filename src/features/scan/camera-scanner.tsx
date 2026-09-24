"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";

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

/** Live camera preview that reports the first code it reads. Mount it only while scanning. */
export function CameraScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
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
              onDetectedRef.current(first.rawValue);
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
      <video
        ref={videoRef}
        muted
        playsInline
        className="aspect-video w-full rounded-md bg-slate-900 object-cover"
        aria-label="Camera preview"
      />
      <p className="text-xs text-slate-500">Hold the barcode or QR code steady inside the frame.</p>
    </div>
  );
}
