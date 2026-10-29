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
    readingTime: "5 min",
    summary: "Full platform architecture, core engineering tenets, tech stack specifications, and capabilities matrix.",
    goldenRule: "Immutable double-entry ledger: Stock movements are never deleted or mutated, only reversed via compensating entries.",
    primaryRoute: "/dashboard",
    applicableRoles: ["CTO & IT Leads", "Business Owners", "Operations Directors"],
    quickTakeaways: [
      "Sub-millisecond local in-memory queries with PostgreSQL persistence and zero vendor lock-in.",
      "Append-only ledger guarantees 100% mathematical auditability for physical stock and GST invoices.",
      "Universal barcode scanning works across hardware guns, webcams, and zero-install smartphone remotes.",
    ],
    workflowSteps: ["1. Register Tenant Masters", "2. Connect Hardware / Remote Scanners", "3. Transact on Single Ledger"],
  },
  "01-masters-and-catalog.md": {
    number: "01",
    title: "Master Data Management & Product Catalog",
    shortTitle: "Master Data & Catalog",
    category: "Master Data",
    readingTime: "5 min",
    summary: "SKU configuration, multi-UOM conversion factors, HSN/SAC tariff master, Categories, Godowns, and CSV bulk imports.",
    goldenRule: "Always configure the smallest handling unit as the Base UOM (e.g. Pieces or Kgs) to ensure ledger precision.",
    primaryRoute: "/masters/skus",
    applicableRoles: ["Catalog Managers", "Data Entry Clerks", "Inventory Supervisors"],
    quickTakeaways: [
      "Multi-UOM conversion factors automatically translate Boxes and Cartons into Base Ledger Units (PCS).",
      "GST HSN tariff library links statutory tax rates (0%, 5%, 12%, 18%, 28%) to categories and SKUs.",
      "Bulk CSV cutover import enables fast migration of existing ERP catalogs with zero downtime.",
    ],
    workflowSteps: ["1. Define Base & Alternate UOMs", "2. Map Category & 8-Digit HSN", "3. Import or Create SKUs"],
  },
  "02-universal-barcode-engine.md": {
    number: "02",
    title: "Universal Barcode & Scanner Engine",
    shortTitle: "Universal Barcode Engine",
    category: "Hardware & Scanning",
    readingTime: "6 min",
    summary: "15 industrial barcode symbologies, checksum validation, GTIN-14 outer carton breakdown, and wireless smartphone scanner (/scan-remote).",
    goldenRule: "Scanning a GTIN-14 outer carton automatically increments the base SKU stock by the packaging multiplier.",
    primaryRoute: "/scan-remote",
    applicableRoles: ["Warehouse Workers", "Receiving Staff", "Packing & Dispatch Teams"],
    quickTakeaways: [
      "Supports 15 symbologies: EAN-13, UPC-A, Code-128, Code-39, GS1 Databar, GTIN-14, ISBN, and Data Matrix.",
      "Turns any smartphone into a wireless scanner via QR code pairing at /scan-remote with zero app installs.",
      "Built-in battery saver auto-sleeps after 45 seconds of camera inactivity to conserve phone power.",
    ],
    workflowSteps: ["1. Open Active Document on Desktop", "2. Scan Screen QR with Smartphone", "3. Aim at Barcodes & Auto-Fill"],
  },
  "03-inbound-logistics.md": {
    number: "03",
    title: "Inbound Logistics & Purchasing Operations",
    shortTitle: "Inbound & Purchasing",
    category: "Logistics",
    readingTime: "5 min",
    summary: "Purchase order lifecycle, PO-linked vs direct GRN, quality inspection split, batch numbers, and purchase returns.",
    goldenRule: "Accepted goods enter Available stock; rejected quantities remain segregated in quarantine until return or disposal.",
    primaryRoute: "/grns",
    applicableRoles: ["Storekeepers", "Procurement Officers", "Quality Inspectors"],
    quickTakeaways: [
      "Supports both formal PO-linked receiving (with balance tracking) and rapid direct vendor GRNs.",
      "Quality inspection splits received goods into Accepted, Rejected, and Under-Quarantine batches.",
      "Debit note generation for vendor returns directly reverses purchase ledger postings.",
    ],
    workflowSteps: ["1. Issue PO to Vendor", "2. Scan Received Items into GRN", "3. Post Accepted Stock to Godown"],
  },
  "04-outbound-logistics.md": {
    number: "04",
    title: "Outbound Logistics, Invoicing & Dispatch QC",
    shortTitle: "Outbound & Dispatch QC",
    category: "Logistics",
    readingTime: "5 min",
    summary: "Sales tax invoices, intra vs inter-state GST split, dispatch verification station (/dispatches), and credit notes.",
    goldenRule: "No carton leaves the dock without 100% barcode match at the Dispatch Verification Station.",
    primaryRoute: "/dispatches",
    applicableRoles: ["Billing Clerks", "Dispatch Supervisors", "Sales Coordinators"],
    quickTakeaways: [
      "Rule 46 compliant GST tax invoices automatically determine CGST+SGST vs IGST via customer state code.",
      "Dedicated Dispatch QC station prevents shipping errors by barcode scanning each packed item before release.",
      "Credit note engine handles returns and damages with automatic reverse GST tax calculations.",
    ],
    workflowSteps: ["1. Create Sales Tax Invoice", "2. Scan & Verify at Dispatch Station", "3. Release Goods & Generate Delivery Challan"],
  },
  "05-warehouse-and-inventory.md": {
    number: "05",
    title: "Warehouse & Inventory Stock Operations",
    shortTitle: "Warehouse & Inventory",
    category: "Inventory",
    readingTime: "5 min",
    summary: "Live stock balances, SKU batch detail, immutable stock ledger, inter-godown transfers, and physical cycle count adjustments.",
    goldenRule: "Physical cycle count discrepancies require manager authorization and compensating journal adjustments.",
    primaryRoute: "/stock",
    applicableRoles: ["Warehouse Managers", "Inventory Controllers", "Auditors"],
    quickTakeaways: [
      "Multi-godown visibility tracks physical inventory across central warehouses, retail counters, and transit bays.",
      "FEFO (First Expired, First Out) batch allocation prioritizes older batches to eliminate expiration waste.",
      "Inter-godown stock transfers preserve original batch numbers and valuation across transit locations.",
    ],
    workflowSteps: ["1. Monitor Real-Time Godown Balances", "2. Execute Godown Transfer Orders", "3. Perform Physical Cycle Counts"],
  },
  "06-gst-and-taxation.md": {
    number: "06",
    title: "Statutory Indian GST Taxation & Compliance",
    shortTitle: "GST & Taxation",
    category: "Compliance",
    readingTime: "6 min",
    summary: "Indian CGST/SGST/IGST rules, place of supply determination, Rule 46 Tax Invoices, integer paise math, and GSTR filing readiness.",
    goldenRule: "All monetary amounts are computed in integer paise (cents) to eliminate floating-point rounding errors.",
    primaryRoute: "/invoices",
    applicableRoles: ["Chartered Accountants", "Tax Auditors", "Finance Managers"],
    quickTakeaways: [
      "Automatic POS (Place of Supply) engine applies CGST+SGST for intra-state and IGST for inter-state sales.",
      "Statutory Rule 46 invoices feature HSN summaries, reverse charge declarations, and company GSTIN.",
      "Direct GSTR-1 and GSTR-3B audit-ready summaries with zero manual reconciliation required.",
    ],
    workflowSteps: ["1. Map Company & Customer GSTIN", "2. Select 8-Digit HSN with Statutory Rate", "3. Export GSTR Audit Summaries"],
  },
  "07-reports-and-analytics.md": {
    number: "07",
    title: "Reports, Dead Stock & Stock Health Analytics",
    shortTitle: "Reports & Analytics",
    category: "Analytics",
    readingTime: "5 min",
    summary: "Stock movement summary (Opening + In - Out = Closing), dead stock detection (>90 days), slow-moving stock radar, and executive dashboard.",
    goldenRule: "Stock equation always balances mathematically: Opening + Inwards - Outwards = Closing Stock.",
    primaryRoute: "/reports",
    applicableRoles: ["Operations Executives", "Financial Controllers", "Procurement Heads"],
    quickTakeaways: [
      "Automated Dead Stock radar identifies stagnant capital locked in SKUs untouched for over 90 days.",
      "Slow-moving stock radar flags declining velocity before capital turns completely illiquid.",
      "One-click CSV exports for monthly stock reconciliations and external statutory audits.",
    ],
    workflowSteps: ["1. Run Movement Summary Report", "2. Review Dead & Slow Stock Radar", "3. Take Liquidation or Reorder Action"],
  },
  "08-tally-prime-integration.md": {
    number: "08",
    title: "Tally Prime ERP Bidirectional Integration",
    shortTitle: "Tally Prime ERP",
    category: "Integrations",
    readingTime: "5 min",
    summary: "Asynchronous XML over HTTP bridge, master syncing, sales/purchase/journal voucher posting, and atomic retry queue.",
    goldenRule: "Ledgers post asynchronously via an idempotent queue: network drops never result in duplicate Tally vouchers.",
    primaryRoute: "/tally",
    applicableRoles: ["Tally Operators", "Chief Accountants", "ERP Systems Admins"],
    quickTakeaways: [
      "Native bidirectional integration communicates via Tally XML over HTTP on port 9000.",
      "Automatically posts Sales, Purchase, Credit Note, and Stock Journal vouchers into Tally ledgers.",
      "Robust retry queue buffers vouchers during Tally maintenance or office internet disruptions.",
    ],
    workflowSteps: ["1. Configure Tally Port :9000 & Company", "2. Map Ledger Names", "3. Automatic Ambient Voucher Posting"],
  },
  "09-copilot-ai-assistant.md": {
    number: "09",
    title: "Warehouse Copilot AI Assistant",
    shortTitle: "Warehouse Copilot AI",
    category: "AI & Automation",
    readingTime: "4 min",
    summary: "Natural language inventory queries, autonomous database tools (queryStock, suggestHsn), and printable warehouse cheatsheet.",
    goldenRule: "Grounded AI: Copilot queries real PostgreSQL ledger data and never hallucinates stock quantities.",
    primaryRoute: "/copilot/cheatsheet",
    applicableRoles: ["All Users", "Warehouse Floor Staff", "New Hires"],
    quickTakeaways: [
      "Ask plain-English questions: 'Show me SKUs expiring next month in Godown B' or 'Suggest HSN for stainless steel bolt'.",
      "Grounded in real tenant database records: zero hallucination of quantities or pricing.",
      "Includes printable physical warehouse cheatsheet for floor staff reference.",
    ],
    workflowSteps: ["1. Open Copilot Floating Assistant", "2. Type Plain-Language Query", "3. Review Live Filtered Stock Data"],
  },
  "10-administration-and-security.md": {
    number: "10",
    title: "System Administration, RBAC & Security Audit",
    shortTitle: "Administration & Security",
    category: "Administration",
    readingTime: "5 min",
    summary: "RBAC permissions matrix (Admin, Manager, Operator, Accounts, Management), document numbering, notifications, and tamper-proof audit trail.",
    goldenRule: "Principle of least privilege: Operators can scan and receive, but only Managers and Admins can approve adjustments.",
    primaryRoute: "/admin/users",
    applicableRoles: ["System Administrators", "Security Officers", "Compliance Auditors"],
    quickTakeaways: [
      "5 granular RBAC roles: Admin, Manager, Operator, Accounts, and Management viewer.",
      "Custom document prefixes: customize invoice, PO, and GRN sequence formats (e.g. INV/2026-27/0001).",
      "Tamper-proof audit log captures every user action, IP address, timestamp, and before/after state diff.",
    ],
    workflowSteps: ["1. Invite Users & Assign Roles", "2. Configure Custom Document Numbering", "3. Review Audit Trail Logs"],
  },
  "11-customer-onboarding-and-runbook.md": {
    number: "11",
    title: "Customer Implementation, Onboarding & Go-Live Runbook",
    shortTitle: "Implementation Runbook",
    category: "Implementation",
    readingTime: "5 min",
    summary: "7-Day phased rollout plan, hardware pairing, CSV opening balance cutover, staff certification, and Go-Live sign-off.",
    goldenRule: "Physical inventory must be frozen for 4 hours during Day 4 cutover to guarantee 100% ledger accuracy.",
    primaryRoute: "/admin/onboarding",
    applicableRoles: ["Field Engineers", "Project Managers", "Customer Success Leads"],
    quickTakeaways: [
      "Proven 7-Day implementation plan: from catalog import and scanner pairing to staff certification.",
      "Hands-on hardware pairing guide for Honeywell, Zebra, and generic USB/Bluetooth HID scanners.",
      "Complete sign-off criteria checklist ensuring customers reach confident go-live within one week.",
    ],
    workflowSteps: ["Day 1-2: Setup & Import", "Day 3-4: Hardware Pairing & Cutover", "Day 5-7: Staff Training & Go-Live"],
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
    goldenRule: "",
    primaryRoute: "/dashboard",
    applicableRoles: [],
    quickTakeaways: [],
    workflowSteps: [],
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
  goldenRule?: string;
  primaryRoute?: string;
  applicableRoles?: string[];
  quickTakeaways?: string[];
  workflowSteps?: string[];
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
