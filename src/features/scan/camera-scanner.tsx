"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/alert";

/**
 * Camera scanning with the browser's native BarcodeDetector (Chrome/Edge on
 * Android, ChromeOS and macOS; not every desktop browser). Where it is
 * missing the camera option is simply not offered — keyboard-wedge scanners
 * work everywhere.
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

function detectorClass(): BarcodeDetectorClass | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
}

const noSubscription = () => () => {};

/** True in browsers with BarcodeDetector and a camera API (false during server rendering). */
export function useCameraScanSupported(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => Boolean(detectorClass() && navigator.mediaDevices?.getUserMedia),
    () => false,
  );
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
    const Detector = detectorClass();
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function start() {
      try {
        if (!Detector) throw new Error("This browser cannot read barcodes from the camera.");
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
