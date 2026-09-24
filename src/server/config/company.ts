import { stateCodeOfGstin } from "@/lib/gst-states";
import { getEnv } from "./env";

export interface CompanyDetails {
  name: string;
  address?: string;
  gstin?: string;
  /** GST state code: from the GSTIN, else COMPANY_STATE_CODE; decides CGST+SGST vs IGST. */
  stateCode?: string;
  bankDetails?: string;
}

/** Company identity printed on documents (COMPANY_* environment variables). */
export function getCompanyDetails(): CompanyDetails {
  const env = getEnv();
  return {
    name: env.COMPANY_NAME,
    address: env.COMPANY_ADDRESS,
    gstin: env.COMPANY_GSTIN,
    stateCode: stateCodeOfGstin(env.COMPANY_GSTIN) ?? env.COMPANY_STATE_CODE,
    bankDetails: env.COMPANY_BANK_DETAILS,
  };
}
