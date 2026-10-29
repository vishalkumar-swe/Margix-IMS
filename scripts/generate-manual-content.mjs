import fs from "node:fs";
import path from "node:path";

const docsDir = path.resolve("docs/manual");
const manualIndexFile = path.resolve("docs/MANUAL.md");
const outputFile = path.resolve("src/lib/manual-content.ts");

const masterManual = fs.readFileSync(manualIndexFile, "utf-8");

const metadata = {
  "00-overview.md": {
    number: "00",
    title: "System Overview, Architecture & Value Proposition",
    shortTitle: "System Overview",
    category: "Architecture",
    readingTime: "7 min",
    summary: "Full platform architecture, core engineering tenets, tech stack specifications, and capabilities matrix.",
  },
  "01-masters-and-catalog.md": {
    number: "01",
    title: "Master Data Management & Product Catalog",
    shortTitle: "Master Data & Catalog",
    category: "Master Data",
    readingTime: "6 min",
    summary: "SKU configuration, multi-UOM conversion factors, HSN/SAC tariff master, Categories, Godowns, and CSV bulk imports.",
  },
  "02-universal-barcode-engine.md": {
    number: "02",
    title: "Universal Barcode & Scanner Engine",
    shortTitle: "Universal Barcode Engine",
    category: "Hardware & Scanning",
    readingTime: "8 min",
    summary: "15 industrial barcode symbologies, checksum validation, GTIN-14 outer carton breakdown, and wireless smartphone scanner (/scan-remote).",
  },
  "03-inbound-logistics.md": {
    number: "03",
    title: "Inbound Logistics & Purchasing Operations",
    shortTitle: "Inbound & Purchasing",
    category: "Logistics",
    readingTime: "5 min",
    summary: "Purchase order lifecycle, PO-linked vs direct GRN, quality inspection split, batch numbers, and purchase returns.",
  },
  "04-outbound-logistics.md": {
    number: "04",
    title: "Outbound Logistics, Invoicing & Dispatch QC",
    shortTitle: "Outbound & Dispatch QC",
    category: "Logistics",
    readingTime: "5 min",
    summary: "Sales tax invoices, intra vs inter-state GST split, dispatch verification station (/dispatches), and credit notes.",
  },
  "05-warehouse-and-inventory.md": {
    number: "05",
    title: "Warehouse & Inventory Stock Operations",
    shortTitle: "Warehouse & Inventory",
    category: "Inventory",
    readingTime: "7 min",
    summary: "Live stock balances, SKU batch detail, immutable stock ledger, inter-godown transfers, and physical cycle count adjustments.",
  },
  "06-gst-and-taxation.md": {
    number: "06",
    title: "Statutory Indian GST Taxation & Compliance",
    shortTitle: "GST & Taxation",
    category: "Compliance",
    readingTime: "8 min",
    summary: "Indian CGST/SGST/IGST rules, place of supply determination, Rule 46 Tax Invoices, integer paise math, and GSTR filing readiness.",
  },
  "07-reports-and-analytics.md": {
    number: "07",
    title: "Reports, Dead Stock & Stock Health Analytics",
    shortTitle: "Reports & Analytics",
    category: "Analytics",
    readingTime: "5 min",
    summary: "Stock movement summary (Opening + In - Out = Closing), dead stock detection (>90 days), slow-moving stock radar, and executive dashboard.",
  },
  "08-tally-prime-integration.md": {
    number: "08",
    title: "Tally Prime ERP Bidirectional Integration",
    shortTitle: "Tally Prime ERP",
    category: "Integrations",
    readingTime: "6 min",
    summary: "Asynchronous XML over HTTP bridge, master syncing, sales/purchase/journal voucher posting, and atomic retry queue.",
  },
  "09-copilot-ai-assistant.md": {
    number: "09",
    title: "Warehouse Copilot AI Assistant",
    shortTitle: "Warehouse Copilot AI",
    category: "AI & Automation",
    readingTime: "5 min",
    summary: "Natural language inventory queries, autonomous database tools (queryStock, suggestHsn), and printable warehouse cheatsheet.",
  },
  "10-administration-and-security.md": {
    number: "10",
    title: "System Administration, RBAC & Security Audit",
    shortTitle: "Administration & Security",
    category: "Administration",
    readingTime: "6 min",
    summary: "RBAC permissions matrix (Admin, Manager, Operator, Accounts, Management), document numbering, notifications, and tamper-proof audit trail.",
  },
  "11-customer-onboarding-and-runbook.md": {
    number: "11",
    title: "Customer Implementation, Onboarding & Go-Live Runbook",
    shortTitle: "Implementation Runbook",
    category: "Implementation",
    readingTime: "7 min",
    summary: "7-Day phased rollout plan, hardware pairing, CSV opening balance cutover, staff certification, and Go-Live sign-off.",
  },
};

const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md")).sort();

const chapters = files.map((fileName) => {
  const content = fs.readFileSync(path.join(docsDir, fileName), "utf-8");
  const slug = fileName.replace(/\.md$/, "");
  const meta = metadata[fileName] || {
    number: slug.slice(0, 2),
    title: slug,
    shortTitle: slug,
    category: "General",
    readingTime: "5 min",
    summary: "",
  };

  return {
    slug,
    fileName,
    ...meta,
    content,
  };
});

const fileContent = `/**
 * Auto-generated documentation content registry.
 * Bundles the 12-chapter operational manual directly into TypeScript memory for sub-millisecond,
 * zero-disk-dependency delivery online.
 */

export interface ManualChapter {
  slug: string;
  fileName: string;
  number: string;
  title: string;
  shortTitle: string;
  category: string;
  readingTime: string;
  summary: string;
  content: string;
}

export const MASTER_MANUAL_INDEX = ${JSON.stringify(masterManual)};

export const MANUAL_CHAPTERS: ManualChapter[] = ${JSON.stringify(chapters, null, 2)};

export function getChapterBySlug(slug: string): ManualChapter | undefined {
  return MANUAL_CHAPTERS.find((c) => c.slug === slug || c.number === slug);
}
`;

fs.writeFileSync(outputFile, fileContent, "utf-8");
console.log(`Successfully generated ${outputFile} with ${chapters.length} chapters.`);

