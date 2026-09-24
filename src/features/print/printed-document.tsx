import type { ReactNode } from "react";
import type { CompanyDetails } from "@/server/config/company";
import { PrintButton } from "./print-button";
import { BrandLogo } from "@/components/layout/brand-logo";

/** A4 layout shared by printed notes: company header, title, parties, lines, signatures. */
export function PrintedDocument({
  company,
  title,
  number,
  back,
  details,
  children,
  signatures,
}: {
  company: CompanyDetails;
  title: string;
  number: string;
  back: ReactNode;
  details: { label: string; value: ReactNode }[];
  children: ReactNode;
  signatures: string[];
}) {
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-sm text-slate-900 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        {back}
        <PrintButton />
      </div>

      <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div className="flex items-start gap-4">
          <BrandLogo variant="full" className="h-16" priority />
          <div>
            <p className="text-lg font-bold">{company.name}</p>
            {company.address && <p className="text-xs text-slate-600">{company.address}</p>}
            {company.gstin && <p className="text-xs text-slate-600">GSTIN {company.gstin}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold tracking-wide uppercase">{title}</p>
          <p className="font-mono">{number}</p>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
        {details.map((d) => (
          <div key={d.label} className="flex gap-2">
            <dt className="w-32 shrink-0 text-slate-500">{d.label}</dt>
            <dd className="font-medium">{d.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">{children}</div>

      <footer className="mt-16 grid grid-cols-3 gap-8 text-center text-xs break-inside-avoid">
        {signatures.map((label) => (
          <div key={label} className="border-t border-slate-400 pt-2">
            {label}
          </div>
        ))}
      </footer>
    </div>
  );
}

/** Plain bordered table for printed lines (no screen chrome). */
export function PrintTable({ headers, children }: { headers: { label: string; numeric?: boolean }[]; children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h.label} className={`border border-slate-400 bg-slate-100 px-2 py-1.5 ${h.numeric ? "text-right" : "text-left"}`}>
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function PrintCell({ children, numeric }: { children: ReactNode; numeric?: boolean }) {
  return <td className={`border border-slate-400 px-2 py-1.5 ${numeric ? "text-right tabular-nums" : ""}`}>{children}</td>;
}
