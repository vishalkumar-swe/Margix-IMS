"use client";

import { useEffect, useRef, useState } from "react";
import { FlipHorizontal, Image, Loader2, Volume2, VolumeX, Zap, ZapOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  detect(source: HTMLVideoElement | ImageBitmap): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorClass {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}

/** Symbologies used on our labels and documents, plus common retail codes. */
const WANTED_FORMATS = ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"];

/** Scan frequency in milliseconds: 80ms gives snappy 12fps recognition without lag */
const SCAN_INTERVAL_MS = 80;

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
export function CameraScanner({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [camerasCount, setCamerasCount] = useState(1);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);

  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  // Check how many video cameras are available
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setCamerasCount(videoInputs.length);
    }).catch(() => {});
  }, []);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await (track.applyConstraints as (c: unknown) => Promise<void>)({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch {
      setHasTorch(false);
    }
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzingPhoto(true);
    setPhotoError(null);
    try {
      const Detector = await loadDetectorClass();
      const supported = await Detector.getSupportedFormats();
      const formats = WANTED_FORMATS.filter((f) => supported.includes(f));
      const detector = new Detector(formats.length ? { formats } : undefined);
      const bitmap = await createImageBitmap(file);
      const results = await detector.detect(bitmap);
      if (results?.length && results[0]?.rawValue) {
        const raw = results[0].rawValue;
        setDetectedCode(raw);
        if (soundEnabledRef.current) playScanFeedback();
        setTimeout(() => {
          onDetectedRef.current(raw);
        }, 350);
      } else {
        setPhotoError("No barcode or QR code detected in this photo. Please try a clearer picture.");
      }
    } catch {
      setPhotoError("Could not analyze image. Try taking another picture.");
    } finally {
      setAnalyzingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function start() {
      try {
        setError(null);
        setPhotoError(null);
        const Detector = await loadDetectorClass();
        const supported = await Detector.getSupportedFormats();
        const formats = WANTED_FORMATS.filter((f) => supported.includes(f));
        const detector = new Detector(formats.length ? { formats } : undefined);

        // Stop any previous stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        const capabilities =
          typeof (track as unknown as { getCapabilities?: () => { torch?: boolean } }).getCapabilities === "function"
            ? (track as unknown as { getCapabilities: () => { torch?: boolean } }).getCapabilities()
            : null;
        setHasTorch(Boolean(capabilities?.torch));

        const tick = async () => {
          if (stopped) return;
          try {
            const [first] = await detector.detect(video);
            if (first?.rawValue && !stopped) {
              stopped = true;
              const raw = first.rawValue;
              setDetectedCode(raw);
              if (soundEnabledRef.current) playScanFeedback();
              // Keep camera stream active for a brief moment to show success indicator before closing
              setTimeout(() => {
                onDetectedRef.current(raw);
              }, 350);
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [facingMode]);

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {photoError && <Alert tone="info">{photoError}</Alert>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageUpload}
        className="hidden"
        aria-hidden="true"
      />

      <div className="relative overflow-hidden rounded-lg bg-slate-950 border border-slate-800 shadow-inner">
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
              "relative h-28 w-52 sm:h-36 sm:w-64 rounded-xl border-2 transition-all duration-300 flex items-center justify-center overflow-hidden",
              detectedCode
                ? "border-emerald-400 bg-emerald-500/20 scale-105 shadow-[0_0_25px_rgba(16,185,129,0.5)]"
                : "border-dashed border-white/60 bg-black/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            )}
          >
            {/* Corner accent marks */}
            <div className="absolute top-0 left-0 h-3 w-3 border-t-2 border-l-2 border-brand-400" />
            <div className="absolute top-0 right-0 h-3 w-3 border-t-2 border-r-2 border-brand-400" />
            <div className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-brand-400" />
            <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-brand-400" />

            {/* Scanning line animation */}
            {!detectedCode && (
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_8px_rgba(234,179,8,0.9)] animate-pulse" />
            )}
          </div>
        </div>

        {/* Detected banner */}
        {detectedCode && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="flex items-center gap-2 rounded-full bg-emerald-600/95 backdrop-blur-xs px-4 py-1.5 text-xs font-semibold text-white shadow-xl ring-1 ring-emerald-400">
              <span className="inline-block size-2 rounded-full bg-white animate-pulse" />
              <span>Scanned:</span>
              <span className="font-mono tracking-wider">{detectedCode}</span>
            </span>
          </div>
        )}

        {analyzingPhoto && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white text-xs">
            <Loader2 className="size-6 animate-spin text-brand-400" />
            <span>Analyzing photo for barcodes...</span>
          </div>
        )}
      </div>

      {/* Control Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          {hasTorch && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={toggleTorch}
              title={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
              className={cn("h-7.5 px-2.5 text-xs font-medium", torchOn ? "bg-amber-100 border-amber-300 text-amber-900" : "text-slate-600")}
            >
              {torchOn ? <Zap className="size-3.5 fill-amber-500 text-amber-600 mr-1" /> : <ZapOff className="size-3.5 mr-1" />}
              {torchOn ? "Light on" : "Torch"}
            </Button>
          )}

          {camerasCount > 1 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={toggleCamera}
              title="Switch front/back camera"
              className="h-7.5 px-2.5 text-xs text-slate-600 font-medium"
            >
              <FlipHorizontal className="size-3.5 mr-1" /> Flip
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            loading={analyzingPhoto}
            title="Upload photo from device to scan barcode"
            className="h-7.5 px-2.5 text-xs text-slate-600 font-medium"
          >
            <Image className="size-3.5 mr-1" /> Photo
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled((v) => !v)}
            title={soundEnabled ? "Mute beep sound" : "Enable beep sound"}
            className="h-7.5 w-7.5 text-slate-500"
          >
            {soundEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5 text-slate-400" />}
          </Button>
        </div>

        {onClose && (
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-7.5 text-xs text-slate-600">
            Cancel
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">
        {detectedCode ? "Success! Applying scanned barcode..." : "Align barcode or QR code inside the box."}
      </p>
    </div>
  );
}
