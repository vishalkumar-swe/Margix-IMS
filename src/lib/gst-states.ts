/**
 * GST state codes (the first two characters of every GSTIN) and how a party's
 * state is worked out. Isomorphic and dependency-free.
 */

export const GST_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
] as const;

export type GstStateCode = (typeof GST_STATES)[number]["code"];

export const GST_STATE_CODES = GST_STATES.map((s) => s.code) as GstStateCode[];

const NAMES = new Map<string, string>(GST_STATES.map((s) => [s.code, s.name]));

export function isGstStateCode(value: string): value is GstStateCode {
  return NAMES.has(value);
}

/** "29" → "Karnataka"; unknown codes are returned as they are. */
export function gstStateName(code: string | null | undefined): string {
  if (!code) return "—";
  return NAMES.get(code) ?? code;
}

/** "Karnataka (29)" for documents. */
export function gstStateLabel(code: string | null | undefined): string {
  return code ? `${gstStateName(code)} (${code})` : "—";
}

/** State code of a GSTIN (its first two digits), or null when it has none that is known. */
export function stateCodeOfGstin(gstin: string | null | undefined): GstStateCode | null {
  const prefix = gstin?.trim().slice(0, 2) ?? "";
  return isGstStateCode(prefix) ? prefix : null;
}

/** A party's GST state: from its GSTIN when it has one, otherwise its recorded state code. */
export function partyStateCode(party: { gstin?: string | null; stateCode?: string | null }): string | null {
  return stateCodeOfGstin(party.gstin) ?? (party.stateCode || null);
}
