import { randomUUID } from "node:crypto";

export interface RemoteScanSession {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  status: "waiting" | "connected";
  barcodes: string[];
}

declare global {
  // eslint-disable-next-line no-var
  var __remoteScanSessions: Map<string, RemoteScanSession> | undefined;
}

const sessions = (globalThis.__remoteScanSessions ??= new Map<string, RemoteScanSession>());

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupExpired() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActiveAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function createScanSession(): { id: string } {
  cleanupExpired();
  const id = `scan_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  sessions.set(id, {
    id,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    status: "waiting",
    barcodes: [],
  });
  return { id };
}

export function getScanSession(id: string): RemoteScanSession | null {
  cleanupExpired();
  const session = sessions.get(id);
  if (!session) return null;
  session.lastActiveAt = Date.now();
  return session;
}

export function markSessionConnected(id: string): boolean {
  const session = getScanSession(id);
  if (!session) return false;
  session.status = "connected";
  session.lastActiveAt = Date.now();
  return true;
}

export function pushBarcodeToSession(id: string, barcode: string): boolean {
  const session = getScanSession(id);
  if (!session) return false;
  session.status = "connected";
  session.lastActiveAt = Date.now();
  session.barcodes.push(barcode.trim());
  return true;
}

export function popBarcodesFromSession(id: string): { status: "waiting" | "connected"; barcodes: string[] } | null {
  const session = getScanSession(id);
  if (!session) return null;
  const barcodes = [...session.barcodes];
  session.barcodes = []; // drain
  return {
    status: session.status,
    barcodes,
  };
}

