"use client";

import {
  Camera,
  CameraOff,
  CheckCircle2,
  FlipHorizontal,
  Loader2,
  Moon,
  Send,
  Smartphone,
  Volume2,
  VolumeX,
  Zap,
  ZapOff,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { loadDetectorClass } from "@/features/scan/camera-scanner";

const WANTED_FORMATS = [
  "qr_code",
  "data_matrix",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "pdf417",
  "aztec",
  "codabar",
];
const PHONE_STORAGE_KEY = "margix_remote_phone_session";

function playBeep() {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5 tone
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    if ("vibrate" in navigator) {
      navigator.vibrate(60);
    }
  } catch {
    // Audio optional
  }
}

function RemoteScannerContent() {
  const searchParams = useSearchParams();
  const rawSessionFromUrl = searchParams.get("session");

  const [sessionId, setSessionId] = useState<string | null>(rawSessionFromUrl);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [sendingManual, setSendingManual] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Camera Power & Battery Saver States
  const [cameraActive, setCameraActive] = useState(true);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [autoSleepSeconds] = useState(60);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const lastActivityRef = useRef(Date.now());

  const resetActivity = () => {
    lastActivityRef.current = Date.now();
    setSecondsRemaining(autoSleepSeconds);
  };

  const pauseCamera = () => {
    setCameraActive(false);
    setIsAutoPaused(false);
    setTorchOn(false);
  };

  const resumeCamera = () => {
    lastActivityRef.current = Date.now();
    setSecondsRemaining(autoSleepSeconds);
    setIsAutoPaused(false);
    setCameraActive(true);
  };

  // 1. Resolve and persist session ID
  useEffect(() => {
    if (rawSessionFromUrl) {
      setSessionId(rawSessionFromUrl);
      try {
        localStorage.setItem(PHONE_STORAGE_KEY, rawSessionFromUrl);
      } catch {
        // ignore
      }
    } else {
      try {
        const cached = localStorage.getItem(PHONE_STORAGE_KEY);
        if (cached) {
          setSessionId(cached);
        }
      } catch {
        // ignore
      }
    }
  }, [rawSessionFromUrl]);

  // 2. Join session on mount
  useEffect(() => {
    if (!sessionId) {
      setError("No session ID found. Please scan the QR code from your Margix computer screen.");
      setConnecting(false);
      return;
    }

    setConnecting(true);
    setError(null);

    fetch(`/api/v1/scan-session/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join" }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Session expired or invalid. Please scan the QR code on your computer again.");
        return res.json();
      })
      .then(() => {
        setConnected(true);
        setConnecting(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to connect to desktop session.");
        setConnecting(false);
        try {
          localStorage.removeItem(PHONE_STORAGE_KEY);
        } catch {
          // ignore
        }
      });
  }, [sessionId]);

  // 3. Heartbeat keepalive every 12 seconds so connection stays fresh and detects desktop reset
  useEffect(() => {
    if (!connected || !sessionId) return;

    const interval = setInterval(() => {
      fetch(`/api/v1/scan-session/${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      })
        .then((res) => {
          if (!res.ok) {
            setConnected(false);
            setError("Session ended on desktop. Please scan the new QR code on your computer.");
            try {
              localStorage.removeItem(PHONE_STORAGE_KEY);
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {
          // Network blip, retry next cycle
        });
    }, 12000);

    return () => clearInterval(interval);
  }, [connected, sessionId]);

  // 4. Inactivity & Auto-Sleep Battery Saver Listeners
  useEffect(() => {
    const handleTouch = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("touchstart", handleTouch, { passive: true });
    window.addEventListener("click", handleTouch, { passive: true });
    window.addEventListener("keydown", handleTouch, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouch);
      window.removeEventListener("click", handleTouch);
      window.removeEventListener("keydown", handleTouch);
    };
  }, []);

  // Countdown timer for automatic camera sleep
  useEffect(() => {
    if (!connected || !cameraActive || autoSleepSeconds <= 0) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, autoSleepSeconds - elapsed);
      setSecondsRemaining(remaining);

      if (remaining === 0) {
        setCameraActive(false);
        setIsAutoPaused(true);
        setTorchOn(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [connected, cameraActive, autoSleepSeconds]);

  // Page visibility / lock detection: immediately sleep camera when screen is locked or tab minimized
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (cameraActive) {
          setCameraActive(false);
          setIsAutoPaused(true);
          setTorchOn(false);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [cameraActive]);

  // 5. Camera feed and continuous detection
  useEffect(() => {
    if (!connected || !sessionId || !cameraActive) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cooldown = false;

    async function startCamera() {
      try {
        const Detector = await loadDetectorClass();
        const supported = await Detector.getSupportedFormats();
        const formats = WANTED_FORMATS.filter((f) => supported.includes(f));
        const detector = new Detector(formats.length ? { formats } : undefined);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        streamRef.current = stream;
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        const capabilities =
          typeof (track as unknown as { getCapabilities?: () => { torch?: boolean } }).getCapabilities === "function"
            ? (track as unknown as { getCapabilities: () => { torch?: boolean } }).getCapabilities()
            : null;
        setHasTorch(Boolean(capabilities?.torch));

        const tick = async () => {
          if (stopped) return;
          try {
            if (!cooldown) {
              const [first] = await detector.detect(video);
              if (first?.rawValue && !stopped && !cooldown) {
                const code = first.rawValue.trim();
                cooldown = true;
                resetActivity();
                if (soundOnRef.current) playBeep();
                setLastScanned(code);
                setScanCount((c) => c + 1);

                // Send to desktop
                void fetch(`/api/v1/scan-session/${encodeURIComponent(sessionId || "")}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "scan", barcode: code }),
                });

                // 1.5s cooldown before reading next code to avoid double reads of same label
                setTimeout(() => {
                  cooldown = false;
                }, 1500);
              }
            }
          } catch {
            // Drop unreadable frame
          }
          timer = setTimeout(tick, 100);
        };
        void tick();
      } catch (err) {
        if (!stopped) {
          setError(err instanceof Error ? err.message : "Could not open phone camera.");
        }
      }
    }

    void startCamera();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [connected, sessionId, facingMode, cameraActive]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await (track.applyConstraints as (c: unknown) => Promise<void>)({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch {
      setHasTorch(false);
    }
  };

  const handleSendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code || !sessionId) return;
    resetActivity();
    setSendingManual(true);
    try {
      await fetch(`/api/v1/scan-session/${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", barcode: code }),
      });
      if (soundOn) playBeep();
      setLastScanned(code);
      setScanCount((c) => c + 1);
      setManualCode("");
    } finally {
      setSendingManual(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Top App Header */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-slate-950 font-black text-sm">
            M
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Margix Wireless Scanner</h1>
            <p className="text-[11px] text-slate-400">Connected to PC</p>
          </div>
        </div>

        {connected ? (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" /> Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-950/80 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
            <span className="size-2 rounded-full bg-amber-400 animate-pulse" /> Connecting...
          </span>
        )}
      </header>

      {/* Main Scanner Container */}
      <main className="flex flex-1 flex-col p-4 max-w-md mx-auto w-full gap-4">
        {connecting && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <Loader2 className="size-8 animate-spin text-brand-400" />
            <p className="text-sm font-medium">Connecting to desktop session...</p>
          </div>
        )}

        {error && (
          <div className="space-y-3">
            <Alert tone="error">{error}</Alert>
            <Button
              type="button"
              variant="secondary"
              className="w-full text-xs"
              onClick={() => {
                try {
                  localStorage.removeItem(PHONE_STORAGE_KEY);
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
            >
              Retry Connection
            </Button>
          </div>
        )}

        {connected && (
          <>
            {/* Camera Viewfinder */}
            <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-black border border-slate-800 shadow-2xl">
              <video ref={videoRef} playsInline muted autoPlay className="size-full object-cover" />

              {/* Power-Saving / Paused Sleep Overlay */}
              {!cameraActive && (
                <div
                  onClick={resumeCamera}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center cursor-pointer transition-all hover:bg-slate-900/95"
                >
                  <div className="size-16 rounded-full bg-slate-900 flex items-center justify-center mb-3 text-amber-400 ring-2 ring-amber-500/30 animate-pulse">
                    {isAutoPaused ? <Moon className="size-8" /> : <CameraOff className="size-8 text-rose-400" />}
                  </div>
                  <p className="font-bold text-sm text-white">
                    {isAutoPaused ? "Camera Paused (Battery Saver)" : "Camera is Turned Off"}
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-xs mt-1 mb-4 leading-relaxed">
                    {isAutoPaused
                      ? "Auto-paused after 60s of inactivity to prevent phone overheating and save battery."
                      : "Turned off manually to preserve your phone battery while not scanning."}
                  </p>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resumeCamera();
                    }}
                    className="bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold px-5 text-xs shadow-lg shadow-brand-500/20"
                  >
                    <Camera className="size-3.5 mr-1.5" /> Tap to Resume Camera
                  </Button>
                </div>
              )}

              {/* Aiming Reticle with Corner Accents (only when camera is active) */}
              {cameraActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative h-36 w-64 rounded-xl border-2 border-dashed border-white/50 bg-black/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                    <div className="absolute -top-1 -left-1 size-4 border-t-3 border-l-3 border-brand-400" />
                    <div className="absolute -top-1 -right-1 size-4 border-t-3 border-r-3 border-brand-400" />
                    <div className="absolute -bottom-1 -left-1 size-4 border-b-3 border-l-3 border-brand-400" />
                    <div className="absolute -bottom-1 -right-1 size-4 border-b-3 border-r-3 border-brand-400" />
                    {/* Laser Scan line */}
                    <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_12px_rgba(234,179,8,1)] animate-pulse" />
                  </div>
                </div>
              )}

              {/* Last Scanned Overlay Card */}
              {lastScanned && (
                <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-600/95 backdrop-blur-md px-3.5 py-2 text-white shadow-xl ring-1 ring-emerald-400/50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="size-5 shrink-0 text-white" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-100">Sent to Desktop</p>
                      <p className="font-mono text-sm font-black truncate">{lastScanned}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold bg-emerald-800/80 px-2 py-0.5 rounded-md shrink-0">
                    #{scanCount}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Actions Bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {/* Camera Power Toggle Button */}
                <Button
                  type="button"
                  variant={cameraActive ? "secondary" : "primary"}
                  size="sm"
                  onClick={cameraActive ? pauseCamera : resumeCamera}
                  className={
                    cameraActive
                      ? "bg-slate-800 hover:bg-rose-950/40 text-slate-200 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40"
                      : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  }
                  title={cameraActive ? "Turn off camera to save battery" : "Turn on camera"}
                >
                  {cameraActive ? (
                    <>
                      <CameraOff className="size-4 mr-1 text-rose-400" /> Stop Camera
                    </>
                  ) : (
                    <>
                      <Camera className="size-4 mr-1" /> Start Camera
                    </>
                  )}
                </Button>

                {cameraActive && hasTorch && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={toggleTorch}
                    className={torchOn ? "bg-amber-400 text-slate-950 font-semibold" : "bg-slate-800 text-slate-200"}
                  >
                    {torchOn ? <Zap className="size-4 mr-1 fill-slate-950" /> : <ZapOff className="size-4 mr-1" />}
                    {torchOn ? "Torch On" : "Torch"}
                  </Button>
                )}

                {cameraActive && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
                    className="bg-slate-800 text-slate-200"
                  >
                    <FlipHorizontal className="size-4 mr-1" /> Flip
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSoundOn((s) => !s)}
                  className="text-slate-400 hover:text-white"
                  title={soundOn ? "Mute sound" : "Enable sound"}
                >
                  {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {cameraActive && (
                  <span
                    className={
                      secondsRemaining <= 15
                        ? "text-[10px] font-mono font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40 animate-pulse"
                        : "text-[10px] text-slate-400 font-medium"
                    }
                    title="Auto-sleeps when inactive to save phone battery"
                  >
                    {secondsRemaining <= 15 ? `Sleep in ${secondsRemaining}s` : `Sleep: ${secondsRemaining}s`}
                  </span>
                )}
                <span className="text-xs text-slate-400 font-medium">
                  {scanCount} {scanCount === 1 ? "item" : "items"}
                </span>
              </div>
            </div>

            {/* Manual Code Fallback */}
            <form
              onSubmit={handleSendManual}
              className="mt-2 space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
            >
              <label htmlFor="manual-barcode" className="text-xs font-semibold text-slate-300 block">
                Type barcode manually
              </label>
              <div className="flex gap-2">
                <Input
                  id="manual-barcode"
                  value={manualCode}
                  placeholder="e.g. 8901030382910"
                  onChange={(e) => setManualCode(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 h-9"
                />
                <Button
                  type="submit"
                  size="sm"
                  loading={sendingManual}
                  disabled={!manualCode.trim()}
                  className="bg-brand-500 text-slate-950 font-semibold shrink-0"
                >
                  <Send className="size-3.5 mr-1" /> Send
                </Button>
              </div>
            </form>

            <p className="text-center text-xs text-slate-500 pb-4">
              Your phone stays connected. Aim at barcodes as you create products on your computer screen.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default function RemoteScannerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white gap-2 text-sm">
          <Loader2 className="size-5 animate-spin text-brand-400" />
          <span>Loading scanner...</span>
        </div>
      }
    >
      <RemoteScannerContent />
    </Suspense>
  );
}
