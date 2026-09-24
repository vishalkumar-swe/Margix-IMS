import Link from "next/link";

const DOCUMENT_PATHS: Partial<Record<string, string>> = {
  GRN: "/grns",
  DISPATCH: "/dispatches",
  ADJUSTMENT: "/adjustments",
};

/** Link from a ledger entry to its source document (spec §2: traceability). */
export function ReferenceLink({ type, id, no }: { type: string; id: string; no: string }) {
  const base = DOCUMENT_PATHS[type];
  if (!base) return <span className="font-mono text-xs text-slate-600">{no}</span>;
  return (
    <Link href={`${base}/${id}`} className="font-mono text-xs text-brand-700 hover:underline">
      {no}
    </Link>
  );
}
