import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CodeSeriesDialog } from "@/features/settings/code-series-dialog";
import { formatDateTime } from "@/lib/dates";
import { codeDateParts } from "@/lib/numbering";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCodeSeries } from "@/server/modules/numbering/numbering.service";

export const metadata: Metadata = { title: "Numbering" };

export default async function NumberingPage() {
  await requirePagePermission("settings.manage");
  const series = await listCodeSeries();
  const today = codeDateParts(new Date());

  return (
    <>
      <PageHeader
        title="Numbering"
        description="How product, party and document codes are generated. New records get the next free code automatically; codes of products, customers, suppliers and godowns can also be typed by hand."
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Series</TH>
              <TH>Type</TH>
              <TH>Format</TH>
              <TH>Next code</TH>
              <TH>Last changed</TH>
              <TH className="sr-only">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {series.map((s) => (
              <TR key={s.key}>
                <TD className="font-medium">{s.label}</TD>
                <TD>
                  <Badge tone={s.kind === "master" ? "neutral" : "info"}>{s.kind === "master" ? "Master" : "Document"}</Badge>
                </TD>
                <TD className="font-mono text-xs">
                  {s.settings.pattern.replace("{PREFIX}", s.settings.prefix)} · {s.settings.padding} digits
                </TD>
                <TD className="font-mono text-xs font-semibold">{s.nextCode}</TD>
                <TD className="text-xs text-slate-500">
                  {s.customised && s.updatedAt ? `${formatDateTime(s.updatedAt)} by ${s.updatedBy}` : "Default"}
                </TD>
                <TD className="text-right">
                  <CodeSeriesDialog seriesKey={s.key} label={s.label} initial={s.settings} today={today} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
