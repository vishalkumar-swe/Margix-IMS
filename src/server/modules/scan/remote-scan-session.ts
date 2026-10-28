import { randomUUID } from "node:crypto";

export interface RemoteScanSession {
  id: string;
  userId?: string;
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

// 8 hours so warehouse workers can keep their phone scanner connected for an entire shift
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function cleanupExpired() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActiveAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function getScanSession(id: string): RemoteScanSession | null {
  cleanupExpired();
  const session = sessions.get(id);
  if (!session) return null;
  session.lastActiveAt = Date.now();
  return session;
}

export function getOrCreateScanSession(opts: {
  sessionId?: string;
  userId?: string;
  forceNew?: boolean;
}): RemoteScanSession {
  cleanupExpired();

  if (!opts.forceNew) {
    // 1. Check if the provided sessionId is valid and active
    if (opts.sessionId) {
      const existing = sessions.get(opts.sessionId);
      if (existing) {
        existing.lastActiveAt = Date.now();
        if (opts.userId) existing.userId = opts.userId;
        return existing;
      }
    }

    // 2. Check if this authenticated user already has an active session
    if (opts.userId) {
      for (const session of sessions.values()) {
        if (session.userId === opts.userId) {
          session.lastActiveAt = Date.now();
          return session;
        }
      }
    }
  }

  // 3. If forceNew or no existing session found, create a new one
  if (opts.userId) {
    // Remove previous session for this user to avoid dangling sessions
    for (const [id, s] of sessions.entries()) {
      if (s.userId === opts.userId) {
        sessions.delete(id);
      }
    }
  }

  const id = `scan_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const session: RemoteScanSession = {
    id,
    userId: opts.userId,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    status: "waiting",
    barcodes: [],
  };
  sessions.set(id, session);
  return session;
}

/** Legacy wrapper creating a fresh session */
export function createScanSession(userId?: string): { id: string } {
  const session = getOrCreateScanSession({ userId, forceNew: true });
  return { id: session.id };
}

export function markSessionConnected(id: string): boolean {
  const session = getScanSession(id);
  if (!session) return false;
  session.status = "connected";
  session.lastActiveAt = Date.now();
  return true;
}

export function touchScanSession(id: string): boolean {
  const session = getScanSession(id);
  if (!session) return false;
  session.lastActiveAt = Date.now();
  return true;
}

export function deleteScanSession(id: string): boolean {
  return sessions.delete(id);
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
