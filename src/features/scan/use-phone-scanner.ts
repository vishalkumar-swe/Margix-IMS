"use client";

export {
  PhoneScannerProvider,
  usePhoneScannerContext,
  useBarcodeScanListener,
  computeEffectiveQrUrl,
  PHONE_SESSION_STORAGE_KEY,
  BARCODE_SCANNED_EVENT,
  type BarcodeScannedEventDetail,
} from "./phone-scanner-provider";

import { usePhoneScannerContext } from "./phone-scanner-provider";

/** Legacy compatibility wrapper around context */
export function usePhoneScanner() {
  return usePhoneScannerContext();
}
