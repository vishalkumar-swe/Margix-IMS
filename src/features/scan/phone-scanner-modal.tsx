"use client";

import { CheckCircle2, ChevronDown, ChevronUp, Loader2, QrCode, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-controls";
import { usePhoneScanner } from "./use-phone-scanner";

interface PhoneScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export function PhoneScannerModal({
  open,
  onClose,
  onScan,
  title = "Use Phone as Barcode Reader",
}: PhoneScannerModalProps) {
  const [showQrAnyway, setShowQrAnyway] = useState(false);
  const [customHost, setCustomHost] = useState("");
  const [showLocalhostConfig, setShowLocalhostConfig] = useState(false);

  const {
    sessionId,
    phoneConnected,
    qrUrl,
    qrCodeDataUrl,
    loading,
    error,
    lastScanned,
    initSession,
    disconnect,
  } = usePhoneScanner({
    active: open,
    onScan: (barcode) => {
      onScan(barcode);
      // Close modal after brief visual confirmation so the form is visible
      setTimeout(() => {
        onClose();
      }, 600);
    },
  });

  // Check if client is browsing on localhost / 0.0.0.0
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0");

  useEffect(() => {
    if (open) {
      void initSession({ forceNew: false });
    }
  }, [open, initSession]);

  const handlePairNewPhone = async () => {
    setShowQrAnyway(false);
    await initSession({ forceNew: true, customHost: customHost || undefined });
  };

  const handleApplyCustomHost = async () => {
    if (!customHost.trim()) return;
    await initSession({ forceNew: false, customHost: customHost.trim() });
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="flex flex-col items-center text-center p-2 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
            <Loader2 className="size-8 animate-spin text-brand-500" />
            <p className="text-xs font-medium">Checking phone scanner session...</p>
          </div>
        )}

        {/* 1. Phone is ALREADY connected */}
        {!loading && phoneConnected && !showQrAnyway && (
          <div className="flex flex-col items-center gap-4 py-2 w-full animate-in fade-in zoom-in-95 duration-200">
            <div className="relative flex size-24 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 ring-8 ring-emerald-500/10">
              <Smartphone className="size-12 text-emerald-600 animate-pulse" />
              <span className="absolute top-2 right-2 flex size-3.5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                <Wifi className="size-2 text-white" />
              </span>
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-300">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Phone Connected & Ready!
              </div>
              <p className="text-xs text-slate-600 font-medium max-w-xs pt-1">
                Your mobile phone is active as a wireless barcode reader. Aim your phone at any product barcode to scan
                it into this form.
              </p>
            </div>

            {lastScanned && (
              <div className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-md">
                <CheckCircle2 className="size-5" />
                <span className="text-xs font-bold">Scanned:</span>
                <span className="font-mono text-sm font-black">{lastScanned}</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-2 pt-2 w-full border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePairNewPhone}
                className="w-full text-xs font-semibold"
              >
                <RefreshCw className="size-3.5 mr-1.5" /> Pair Different Phone / New QR Code
              </Button>

              <button
                type="button"
                onClick={() => setShowQrAnyway(true)}
                className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <QrCode className="size-3" /> Show pairing QR code anyway
              </button>
            </div>
          </div>
        )}

        {/* 2. Phone is NOT connected yet (or user requested to see QR code) */}
        {!loading && (!phoneConnected || showQrAnyway) && qrCodeDataUrl && (
          <>
            <div className="relative rounded-2xl border-2 border-slate-200 bg-white p-3 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCodeDataUrl} alt="Pairing QR code" className="size-48 rounded-lg" />

              {lastScanned && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-emerald-600/95 p-3 text-white backdrop-blur-xs animate-in zoom-in-95 duration-200">
                  <CheckCircle2 className="size-10 text-white animate-bounce" />
                  <p className="text-xs uppercase font-bold tracking-wider mt-1 text-emerald-100">Barcode Received</p>
                  <p className="font-mono text-base font-black truncate max-w-full px-2">{lastScanned}</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-1.5">
                <span
                  className={
                    phoneConnected
                      ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300"
                      : "inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300 animate-pulse"
                  }
                >
                  <span className={`size-2 rounded-full ${phoneConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {phoneConnected ? "Phone Connected & Ready!" : "Waiting for phone..."}
                </span>
              </div>

              <p className="text-xs text-slate-600 font-medium max-w-xs">
                Scan this QR code using your phone camera (iPhone Camera / Android Chrome). No app download needed —
                your phone stays paired across products!
              </p>
            </div>

            {/* Localhost helper for developers testing on local Wi-Fi */}
            {isLocalhost && (
              <div className="w-full text-left rounded-xl bg-amber-50/80 p-2.5 text-xs text-amber-900 border border-amber-200/80">
                <button
                  type="button"
                  onClick={() => setShowLocalhostConfig((v) => !v)}
                  className="flex items-center justify-between w-full font-semibold text-[11px] text-amber-800 hover:underline"
                >
                  <span>⚠️ Localhost Wi-Fi Configuration</span>
                  {showLocalhostConfig ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
                {showLocalhostConfig && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] text-amber-800">
                      Mobile phones cannot open <code>localhost</code>. Enter your computer&apos;s local Wi-Fi IP (e.g.{" "}
                      <code>192.168.1.15:3000</code>):
                    </p>
                    <div className="flex gap-1.5">
                      <Input
                        value={customHost}
                        onChange={(e) => setCustomHost(e.target.value)}
                        placeholder="192.168.1.15:3000"
                        className="h-7 text-xs bg-white"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleApplyCustomHost}
                        className="h-7 text-xs px-2"
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {qrUrl && (
              <div className="w-full pt-1 flex flex-col gap-1 items-center">
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-brand-600 hover:text-brand-700 underline block"
                >
                  Or open scanner link in this browser tab
                </a>
                <span className="text-[10px] text-slate-400 font-mono truncate max-w-xs">{qrUrl}</span>
              </div>
            )}

            <div className="w-full flex justify-between items-center pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePairNewPhone}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                <RefreshCw className="size-3 mr-1" /> New QR Code
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
                Close
              </Button>
            </div>
          </>
        )}

        {/* Bottom Cancel if phone connected view */}
        {!loading && phoneConnected && !showQrAnyway && (
          <div className="w-full flex justify-between items-center pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={disconnect}
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              Disconnect Phone
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
              Close
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
