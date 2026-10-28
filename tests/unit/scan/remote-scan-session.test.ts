import { describe, expect, it } from "vitest";
import {
  createScanSession,
  getScanSession,
  markSessionConnected,
  popBarcodesFromSession,
  pushBarcodeToSession,
} from "@/server/modules/scan/remote-scan-session";

describe("Remote Scan Session Store", () => {
  it("creates a new scan session with waiting status", () => {
    const { id } = createScanSession();
    expect(id).toMatch(/^scan_[a-f0-9]{16}$/);

    const session = getScanSession(id);
    expect(session).not.toBeNull();
    expect(session?.status).toBe("waiting");
    expect(session?.barcodes).toEqual([]);
  });

  it("updates status to connected when phone joins", () => {
    const { id } = createScanSession();
    const ok = markSessionConnected(id);
    expect(ok).toBe(true);

    const session = getScanSession(id);
    expect(session?.status).toBe("connected");
  });

  it("pushes and pops barcodes cleanly", () => {
    const { id } = createScanSession();
    pushBarcodeToSession(id, "8901030382910");
    pushBarcodeToSession(id, "8901030382927");

    const popped1 = popBarcodesFromSession(id);
    expect(popped1?.barcodes).toEqual(["8901030382910", "8901030382927"]);
    expect(popped1?.status).toBe("connected");

    // Second pop should be empty (drained)
    const popped2 = popBarcodesFromSession(id);
    expect(popped2?.barcodes).toEqual([]);
  });
});

