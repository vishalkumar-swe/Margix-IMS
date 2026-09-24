import Link from "next/link";
import { documentHref } from "@/lib/document-links";

/** Link from a ledger entry to its source document (spec §2: traceability). */
export function ReferenceLink({ type, id, no }: { type: string; id: string; no: string }) {
  const href = documentHref(type, id);
  if (!href) return <span className="font-mono text-xs text-slate-600">{no}</span>;
  return (
    <Link href={href} className="font-mono text-xs text-brand-700 hover:underline">
      {no}
    </Link>
  );
}
