import { getEnv } from "./env";

export interface CompanyDetails {
  name: string;
  address?: string;
  gstin?: string;
}

/** Company identity printed on documents (COMPANY_* environment variables). */
export function getCompanyDetails(): CompanyDetails {
  const env = getEnv();
  return { name: env.COMPANY_NAME, address: env.COMPANY_ADDRESS, gstin: env.COMPANY_GSTIN };
}
