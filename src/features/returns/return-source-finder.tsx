"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ScanInput } from "@/features/scan/scan-input";

export interface ReturnSourceChoice {
  href: string;
  number: string;
  detail: string;
}

/**
 * First step of a return: identify the original document by scanning its
 * barcode / QR code (or typing its number). The page resolves the code; when
 * it names a parent document (an invoice or purchase order) with several
 * deliveries, they are offered as choices.
 */
export function ReturnSourceFinder({
  basePath,
  title,
  description,
  error,
  choices,
  choicesTitle,
}: {
  /** The return page itself; the scanned code is passed back as ?code=. */
  basePath: string;
  title: string;
  description: string;
  error?: string | null;
  choices?: ReturnSourceChoice[];
  choicesTitle?: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={title} description={description} />
        <CardBody>
          <ScanInput
            label="Scan document"
            placeholder="Scan the document's barcode or QR code, or type its number"
            autoFocus
            onScan={(code) => router.push(`${basePath}?${new URLSearchParams({ code })}`)}
            status={error ? { tone: "error", text: error } : null}
            className="max-w-xl"
          />
        </CardBody>
      </Card>
      {choices && (
        <Card>
          <CardHeader title={choicesTitle ?? "Choose the delivery"} />
          {choices.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {choices.map((choice) => (
                <li key={choice.href}>
                  <Link href={choice.href} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                    <span className="font-mono font-medium text-brand-700">{choice.number}</span>
                    <span className="text-slate-500">{choice.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody className="text-sm text-slate-500">Nothing has been delivered against it yet.</CardBody>
          )}
        </Card>
      )}
    </div>
  );
}
