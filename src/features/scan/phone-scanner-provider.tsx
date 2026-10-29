"use client";

import { CheckCircle2, Smartphone, Wifi } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api-client";
import { lookupDocument, lookupSku } from "./scan-lookup";

export const PHONE_SESSION_STORAGE_KEY = "margix_phone_scan_session_id";
export const BARCODE_SCANNED_EVENT = "margix:barcode-scanned";

export interface BarcodeScannedEventDetail {
  barcode: string;
}

export function computeEffectiveQrUrl(serverQrUrl: string | null, sessionId: string): string {
  if (typeof window !== "undefined" && window.location) {
    const { origin, hostname } = window.location;
    if (origin && !hostname.startsWith("0.0.0.0")) {
      return `${origin}/scan-remote?session=${sessionId}`;
    }
  }
  if (serverQrUrl && !serverQrUrl.includes("0.0.0.0")) {
    return serverQrUrl;
  }
  return `https://ims.margixindia.com/scan-remote?session=${sessionId}`;
}

function playDesktopChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    // Pleasant double-chime: 880Hz (A5) then 1318Hz (E6)
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.28);
  } catch {
    // Audio optional
  }
}

interface PhoneScannerContextValue {
  sessionId: string | null;
  phoneConnected: boolean;
  qrUrl: string | null;
  qrCodeDataUrl: string | null;
  lastScanned: string | null;
  loading: boolean;
  error: string | null;
  initSession: (options?: { forceNew?: boolean; customHost?: string }) => Promise<void>;
  disconnect: () => Promise<void>;
}

const PhoneScannerContext = createContext<PhoneScannerContextValue | null>(null);

export function PhoneScannerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(PHONE_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [toastBarcode, setToastBarcode] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const generateQrImage = useCallback(async (url: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        margin: 1,
        width: 240,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
      setQrCodeDataUrl(dataUrl);
    } catch {
      // ignore
    }
  }, []);

  const initSession = useCallback(
    async (options?: { forceNew?: boolean; customHost?: string }) => {
      setLoading(true);
      setError(null);

      try {
        const storedId = options?.forceNew ? null : sessionId;
        const res = await apiRequest<{ sessionId: string; status: "waiting" | "connected"; qrUrl: string }>(
          "/scan-session",
          {
            method: "POST",
            body: {
              sessionId: storedId || undefined,
              forceNew: options?.forceNew ?? false,
            },
          },
        );

        setSessionId(res.sessionId);
        try {
          localStorage.setItem(PHONE_SESSION_STORAGE_KEY, res.sessionId);
        } catch {
          // ignore
        }

        setPhoneConnected(res.status === "connected");

        let targetUrl = computeEffectiveQrUrl(res.qrUrl, res.sessionId);
        if (options?.customHost) {
          const host = options.customHost.trim().replace(/^https?:\/\//, "");
          const proto = window.location.protocol;
          targetUrl = `${proto}//${host}/scan-remote?session=${res.sessionId}`;
        }

        setQrUrl(targetUrl);
        await generateQrImage(targetUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize phone scan session.");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, generateQrImage],
  );

  const disconnect = useCallback(async () => {
    if (sessionId) {
      try {
        await apiRequest(`/scan-session/${sessionId}`, { method: "DELETE" });
      } catch {
        // ignore
      }
    }
    try {
      localStorage.removeItem(PHONE_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSessionId(null);
    setPhoneConnected(false);
    setQrUrl(null);
    setQrCodeDataUrl(null);
    setLastScanned(null);
  }, [sessionId]);

  // 1. Initial check on mount: reconnect to user's active session if present
  useEffect(() => {
    let cancelled = false;

    apiRequest<{ sessionId: string; status: "waiting" | "connected"; qrUrl: string }>("/scan-session", {
      method: "GET",
    })
      .then((res) => {
        if (cancelled) return;
        setSessionId(res.sessionId);
        try {
          localStorage.setItem(PHONE_SESSION_STORAGE_KEY, res.sessionId);
        } catch {
          // ignore
        }
        setPhoneConnected(res.status === "connected");
        const effective = computeEffectiveQrUrl(res.qrUrl, res.sessionId);
        setQrUrl(effective);
        void generateQrImage(effective);
      })
      .catch(() => {
        // Not fatal, will initialize when user opens scanner modal
      });

    return () => {
      cancelled = true;
    };
  }, [generateQrImage]);

  // 2. Ambient background polling loop across the entire app
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await apiRequest<{ status: "waiting" | "connected"; barcodes: string[] }>(
          `/scan-session/${sessionId}`,
        );
        if (cancelled) return;

        if (res.status === "connected") {
          setPhoneConnected(true);
        } else if (res.status === "waiting") {
          setPhoneConnected(false);
        }

        if (res.barcodes.length > 0) {
          for (const raw of res.barcodes) {
            const code = raw.trim();
            if (!code) continue;

            setLastScanned(code);
            playDesktopChime();

            // Flash toast notification on desktop
            setToastBarcode(code);
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => {
              setToastBarcode(null);
            }, 3000);

            // Dispatch event to see if an active dialog or form handles it
            const event = new CustomEvent<BarcodeScannedEventDetail>(BARCODE_SCANNED_EVENT, {
              detail: { barcode: code },
              cancelable: true,
            });
            const consumed = !window.dispatchEvent(event);

            // If no form consumed the event, perform global smart routing
            if (!consumed) {
              void (async () => {
                try {
                  const doc = await lookupDocument(code);
                  if (doc) {
                    router.push(doc.url);
                    return;
                  }
                  const sku = await lookupSku(code);
                  if (sku) {
                    router.push(`/stock/${sku.id}`);
                    return;
                  }
                  // Numeric barcode not in DB: open SKU creation form with pre-filled code
                  if (/^\d{6,14}$/.test(code)) {
                    router.push(`/masters/skus/new?barcode=${encodeURIComponent(code)}`);
                    return;
                  }
                } catch {
                  // ignore
                }
              })();
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("404") || msg.includes("not found") || msg.includes("expired")) {
          setPhoneConnected(false);
          try {
            localStorage.removeItem(PHONE_SESSION_STORAGE_KEY);
          } catch {
            // ignore
          }
        }
      }
    };

    // Check immediately, then poll
    void poll();
    const intervalTime = typeof document !== "undefined" && document.visibilityState === "hidden" ? 2500 : 850;
    const interval = window.setInterval(poll, intervalTime);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionId, router]);

  const value = useMemo<PhoneScannerContextValue>(
    () => ({
      sessionId,
      phoneConnected,
      qrUrl,
      qrCodeDataUrl,
      lastScanned,
      loading,
      error,
      initSession,
      disconnect,
    }),
    [sessionId, phoneConnected, qrUrl, qrCodeDataUrl, lastScanned, loading, error, initSession, disconnect],
  );

  return (
    <PhoneScannerContext.Provider value={value}>
      {children}

      {/* Floating Ambient Scan Toast */}
      {toastBarcode && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-slate-950/95 px-4 py-3 text-white shadow-2xl ring-1 ring-emerald-500/40 backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-bold shrink-0">
            <Smartphone className="size-4" />
          </div>
          <div className="text-left min-w-0 pr-1">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">Mobile Barcode Received</p>
            </div>
            <p className="font-mono text-sm font-black truncate max-w-xs">{toastBarcode}</p>
          </div>
        </aside>
      )}
    </PhoneScannerContext.Provider>
  );
}

export function usePhoneScannerContext(): PhoneScannerContextValue {
  const ctx = useContext(PhoneScannerContext);
  if (!ctx) {
    throw new Error("usePhoneScannerContext must be used within a PhoneScannerProvider");
  }
  return ctx;
}

/**
 * Hook to listen for barcode scans in any active form, dialog, or input.
 * When enabled, automatically consumes the scan so global navigation is prevented.
 */
export function useBarcodeScanListener(onScan: (barcode: string) => void, enabled: boolean = true) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<BarcodeScannedEventDetail>;
      // Prevent default to mark as handled by this active form
      customEvent.preventDefault();
      if (customEvent.detail?.barcode) {
        onScanRef.current(customEvent.detail.barcode);
      }
    };

    window.addEventListener(BARCODE_SCANNED_EVENT, handler);
    return () => {
      window.removeEventListener(BARCODE_SCANNED_EVENT, handler);
    };
  }, [enabled]);
}

