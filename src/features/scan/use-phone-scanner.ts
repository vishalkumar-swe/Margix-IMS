"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";

export const PHONE_SESSION_STORAGE_KEY = "margix_phone_scan_session_id";

export function computeEffectiveQrUrl(serverQrUrl: string | null, sessionId: string): string {
  if (typeof window !== "undefined" && window.location) {
    const { origin, hostname } = window.location;
    // Real hostname or LAN IP (not 0.0.0.0)
    if (origin && !hostname.startsWith("0.0.0.0")) {
      return `${origin}/scan-remote?session=${sessionId}`;
    }
  }
  if (serverQrUrl && !serverQrUrl.includes("0.0.0.0")) {
    return serverQrUrl;
  }
  return `https://ims.margixindia.com/scan-remote?session=${sessionId}`;
}

export function usePhoneScanner({
  active = false,
  onScan,
}: {
  active?: boolean;
  onScan?: (barcode: string) => void;
} = {}) {
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

  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

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

  // Polling for incoming barcodes & connection status when active
  useEffect(() => {
    if (!active || !sessionId) return;
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
          const latest = res.barcodes[res.barcodes.length - 1];
          setLastScanned(latest);
          if (onScanRef.current) {
            onScanRef.current(latest);
          }
        }
      } catch (err) {
        // If session was deleted or expired on server, clear and reset
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("404") || msg.includes("not found") || msg.includes("expired")) {
          try {
            localStorage.removeItem(PHONE_SESSION_STORAGE_KEY);
          } catch {
            // ignore
          }
          setPhoneConnected(false);
        }
      }
    };

    // Initial check
    void poll();
    const interval = window.setInterval(poll, 850);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, sessionId]);

  return {
    sessionId,
    phoneConnected,
    qrUrl,
    qrCodeDataUrl,
    loading,
    error,
    lastScanned,
    initSession,
    disconnect,
  };
}
