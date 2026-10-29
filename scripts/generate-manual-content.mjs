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
    readingTime: "4 min",
    summary: "Full platform architecture, core engineering tenets, tech stack specifications, and capabilities matrix.",
    goldenRule: "Immutable double-entry ledger: Stock movements are never deleted or mutated, only reversed via compensating entries.",
    primaryRoute: "/dashboard",
    applicableRoles: ["CTO & IT Leads", "Business Owners", "Operations Directors"],
    realWorldScenario: "A business operating 3 warehouses across Maharashtra and Gujarat tracks 15,000 SKUs with zero inventory discrepancies because every receipt, transfer, and sale writes to an immutable double-entry ledger in real time.",
    dosAndDonts: {
      do: "Rely on the ledger for all audits: it tracks every item movement with user timestamps, batch numbers, and godown IDs.",
      dont: "Never attempt direct SQL updates to stock balances; all balance changes must originate from ledger transactions.",
    },
    faqs: [
      {
        q: "What makes Margix IMS different from traditional desktop ERPs?",
        a: "Unlike legacy desktop software that locks data to a single machine, Margix provides sub-millisecond cloud ledger processing with universal hardware scanning, mobile phone pairing, and ambient Tally sync.",
      },
      {
        q: "Does Margix work without internet access?",
        a: "Client workstations buffer barcode input, while the server maintains high availability with sub-millisecond response times.",
      },
    ],
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
    readingTime: "4 min",
    summary: "SKU configuration, multi-UOM conversion factors, HSN/SAC tariff master, Categories, Godowns, and CSV bulk imports.",
    goldenRule: "Always configure the smallest handling unit as the Base UOM (e.g. Pieces or Kgs) to ensure ledger precision.",
    primaryRoute: "/masters/skus",
    applicableRoles: ["Catalog Managers", "Data Entry Clerks", "Inventory Supervisors"],
    realWorldScenario: "You purchase ball bearings in Master Cartons of 10 Boxes, each containing 12 Pieces. By setting conversion factors (1 CTN = 10 BOX = 120 PCS), staff can purchase in Cartons, sell in Boxes, and the ledger tracks exactly 120 base Pieces.",
    dosAndDonts: {
      do: "Set the base unit to the smallest physical piece (e.g., PCS) and define multipliers for Boxes and Cartons.",
      dont: "Don't create separate SKU codes for individual pieces and cartons of the same item; use Multi-UOM conversion factors.",
    },
    faqs: [
      {
        q: "How do I import 1,000 existing SKUs from our previous software?",
        a: "Navigate to /masters/skus, download the CSV template, fill in SKU name, barcode, base UOM, HSN code, and purchase price, then click 'Import CSV'.",
      },
      {
        q: "Can one SKU have multiple barcodes?",
        a: "Yes. An item can have its primary consumer barcode (EAN-13) plus secondary packaging barcodes (GTIN-14 outer carton) mapped to different UOMs.",
      },
    ],
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
    readingTime: "5 min",
    summary: "15 industrial barcode symbologies, checksum validation, GTIN-14 outer carton breakdown, and wireless smartphone scanner (/scan-remote).",
    goldenRule: "Scanning a GTIN-14 outer carton automatically increments the base SKU stock by the packaging multiplier.",
    primaryRoute: "/scan-remote",
    applicableRoles: ["Warehouse Workers", "Receiving Staff", "Packing & Dispatch Teams"],
    realWorldScenario: "A worker walks down an aisle with their personal Android or iPhone. They scan the on-screen QR code at /scan-remote. The phone connects as a wireless scanner, beeping and vibrating on every scan, instantly typing quantities into the desktop document.",
    dosAndDonts: {
      do: "Use the built-in torch toggle on your smartphone for scanning barcodes in dimly lit back-row godown racks.",
      dont: "Don't worry about duplicate scans: the engine enforces a 1,500ms software cooldown to prevent accidental double-reads.",
    },
    faqs: [
      {
        q: "Do I need to buy expensive handheld barcode terminals?",
        a: "No. Any existing smartphone camera works as an industrial wireless scanner via /scan-remote with zero app downloads.",
      },
      {
        q: "Which barcode types does Margix recognize?",
        a: "All 15 major formats: EAN-13, EAN-8, UPC-A, UPC-E, Code-128, Code-39, GS1 Databar, GTIN-14, ISBN-10/13, ISSN, JAN, and Data Matrix.",
      },
    ],
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
    readingTime: "4 min",
    summary: "Purchase order lifecycle, PO-linked vs direct GRN, quality inspection split, batch numbers, and purchase returns.",
    goldenRule: "Accepted goods enter Available stock; rejected quantities remain segregated in quarantine until return or disposal.",
    primaryRoute: "/grns",
    applicableRoles: ["Storekeepers", "Procurement Officers", "Quality Inspectors"],
    realWorldScenario: "A delivery truck arrives with 100 industrial valves under PO #104. The inspector finds 95 valves in perfect condition and 5 with cracked casings. The GRN posts 95 to Available Godown stock and 5 to Quarantine, generating an automatic Debit Note for the vendor.",
    dosAndDonts: {
      do: "Always record the manufacturer batch number and expiry date during GRN entry to enable FEFO picking.",
      dont: "Never post rejected goods into standard inventory; use the Quality Inspection split to segregate damaged items.",
    },
    faqs: [
      {
        q: "Can I receive goods without creating a Purchase Order first?",
        a: "Yes. Margix supports Direct GRNs (/grns/new?mode=direct) for spot cash purchases and emergency stock inwarding.",
      },
      {
        q: "What happens if a vendor delivers partial quantity?",
        a: "The PO status changes to 'Partially Received' and retains the open balance until the remaining shipment arrives.",
      },
    ],
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
    readingTime: "4 min",
    summary: "Sales tax invoices, intra vs inter-state GST split, dispatch verification station (/dispatches), and credit notes.",
    goldenRule: "No carton leaves the dock without 100% barcode match at the Dispatch Verification Station.",
    primaryRoute: "/dispatches",
    applicableRoles: ["Billing Clerks", "Dispatch Supervisors", "Sales Coordinators"],
    realWorldScenario: "A picker boxes 20 drill bits for an export customer. At the Dispatch QC Station (/dispatches), they scan each carton. An audible green chime sounds for each correct item; if the picker accidentally picks a 10mm bit instead of 12mm, an alert sounds immediately.",
    dosAndDonts: {
      do: "Scan items at the Dispatch Station to verify every outgoing carton against the invoice before printing the Delivery Challan.",
      dont: "Never release unverified shipments; the dispatch station eliminates 99.8% of incorrect item delivery claims.",
    },
    faqs: [
      {
        q: "How does the system decide between CGST+SGST versus IGST?",
        a: "The engine compares the company state code with the customer shipping address state code; matching states get CGST+SGST, different states get IGST.",
      },
      {
        q: "Can I generate delivery challans without pricing for transport compliance?",
        a: "Yes. Invoices include a 1-click 'Print Delivery Challan' view displaying items, quantities, and HSN without commercial rates.",
      },
    ],
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
    realWorldScenario: "During a Friday evening stock transfer from Central Godown (Bhiwandi) to Retail Counter (Andheri), the transfer order locks the items in 'Transit' status. The destination counter scans them upon arrival to confirm receipt without ledger discrepancies.",
    dosAndDonts: {
      do: "Use FEFO (First Expired, First Out) batch picking suggestions to ensure older inventory is dispatched before newer stock.",
      dont: "Don't bypass the Physical Adjustment approval workflow; all stock gains/losses must have documented manager sign-off.",
    },
    faqs: [
      {
        q: "How do I see our live stock across all godowns at once?",
        a: "Visit /stock for a consolidated inventory view, or filter by specific godown (e.g. Godown A, Quarantine, Counter) in 1 click.",
      },
      {
        q: "What is an immutable stock ledger?",
        a: "Every transaction writes a permanent record (timestamp, SKU, batch, godown, quantity +/-). History can never be altered or erased.",
      },
    ],
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
    readingTime: "5 min",
    summary: "Indian CGST/SGST/IGST rules, place of supply determination, Rule 46 Tax Invoices, integer paise math, and GSTR filing readiness.",
    goldenRule: "All monetary amounts are computed in integer paise (cents) to eliminate floating-point rounding errors.",
    primaryRoute: "/invoices",
    applicableRoles: ["Chartered Accountants", "Tax Auditors", "Finance Managers"],
    realWorldScenario: "A ₹1,00,000 order has 18% GST. Under floating-point systems, line item sums frequently drift by 1 or 2 paise. Margix performs all tax calculations in integer paise (10,000,000 paise), guaranteeing exact matching with GST portal GSTR-1 and GSTR-3B filings.",
    dosAndDonts: {
      do: "Verify the 2-digit state code prefix of the customer GSTIN (e.g. 27 for Maharashtra, 24 for Gujarat) to guarantee accurate POS.",
      dont: "Never use 2-digit HSN codes for B2B billing; Indian GST requires minimum 4 digits (< ₹5 Cr) or 8 digits (> ₹5 Cr).",
    },
    faqs: [
      {
        q: "Does Margix support Reverse Charge Mechanism (RCM)?",
        a: "Yes. Invoices feature an RCM checkbox that formats the statutory declaration and flags the liability appropriately.",
      },
      {
        q: "Can I export data directly for our CA's monthly GST filing?",
        a: "Yes. Navigate to /reports/stock-summary or /invoices to export GSTR-1 compliant CSV tables with HSN summaries and tax splits.",
      },
    ],
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
    readingTime: "4 min",
    summary: "Stock movement summary (Opening + In - Out = Closing), dead stock detection (>90 days), slow-moving stock radar, and executive dashboard.",
    goldenRule: "Stock equation always balances mathematically: Opening + Inwards - Outwards = Closing Stock.",
    primaryRoute: "/reports",
    applicableRoles: ["Operations Executives", "Financial Controllers", "Procurement Heads"],
    realWorldScenario: "A business owner checks the Dead Stock Radar at /reports/dead-stock and discovers ₹4,20,000 worth of specialty gaskets that have had zero movement for 120 days. They launch a bundle clearance offer, liberating working capital before the goods degrade.",
    dosAndDonts: {
      do: "Review the Slow-Moving Radar monthly to adjust reorder levels and prevent capital from locking up in stale inventory.",
      dont: "Don't wait for annual stocktaking: use the real-time Movement Summary to audit monthly stock changes immediately.",
    },
    faqs: [
      {
        q: "How does Margix define 'Dead Stock'?",
        a: "Any SKU with available physical balance that has recorded zero sales or consumption movements in the last 90 consecutive days.",
      },
      {
        q: "Can I export movement reports to Microsoft Excel?",
        a: "Yes. Every report includes a 1-click 'Export CSV' button compatible with Excel, Google Sheets, and Power BI.",
      },
    ],
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
    readingTime: "4 min",
    summary: "Asynchronous XML over HTTP bridge, master syncing, sales/purchase/journal voucher posting, and atomic retry queue.",
    goldenRule: "Ledgers post asynchronously via an idempotent queue: network drops never result in duplicate Tally vouchers.",
    primaryRoute: "/tally",
    applicableRoles: ["Tally Operators", "Chief Accountants", "ERP Systems Admins"],
    realWorldScenario: "A warehouse clerk creates a Sales Invoice in Margix. Seconds later, the invoice posts directly into the company's Tally Prime server running in the back office over port 9000, creating the sales voucher and debiting the customer ledger automatically.",
    dosAndDonts: {
      do: "Keep Tally Prime running with ODBC / HTTP server enabled on port 9000 for seamless real-time voucher synchronization.",
      dont: "Don't re-enter invoices manually in Tally: Margix posts Sales, Purchase, and Debit/Credit notes automatically.",
    },
    faqs: [
      {
        q: "What if the Tally computer is turned off or the internet disconnects?",
        a: "Margix queues every voucher in an atomic retry buffer. As soon as Tally comes back online, all pending vouchers sync automatically.",
      },
      {
        q: "Does Tally integration require third-party paid plugins?",
        a: "No. Margix uses Tally's native XML over HTTP communication standard—no third-party DLLs or TDL plugins required.",
      },
    ],
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
    readingTime: "3 min",
    summary: "Natural language inventory queries, autonomous database tools (queryStock, suggestHsn), and printable warehouse cheatsheet.",
    goldenRule: "Grounded AI: Copilot queries real PostgreSQL ledger data and never hallucinates stock quantities.",
    primaryRoute: "/copilot/cheatsheet",
    applicableRoles: ["All Users", "Warehouse Floor Staff", "New Hires"],
    realWorldScenario: "A new warehouse intern types into Copilot: 'Where do we have 100mm flange bearings in stock?' Copilot queries the database and answers: 'Godown 1, Rack B-3 (42 PCS) and Transit Bay (10 PCS). Current reorder rule is 25 PCS.'",
    dosAndDonts: {
      do: "Use Copilot to suggest compliant 8-digit HSN codes when creating unfamiliar industrial products.",
      dont: "Don't guess stock balances when customers call: ask Copilot for instant multi-godown availability.",
    },
    faqs: [
      {
        q: "Does the AI assistant hallucinate stock numbers?",
        a: "No. The Copilot uses strictly grounded tool-calling (queryStock, suggestHsn) and reports only verifiable database records.",
      },
      {
        q: "Can warehouse floor staff print a reference guide?",
        a: "Yes. Visit /copilot/cheatsheet for a 1-page printable cheatsheet of barcode shortcuts and common commands.",
      },
    ],
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
    readingTime: "4 min",
    summary: "RBAC permissions matrix (Admin, Manager, Operator, Accounts, Management), document numbering, notifications, and tamper-proof audit trail.",
    goldenRule: "Principle of least privilege: Operators can scan and receive, but only Managers and Admins can approve adjustments.",
    primaryRoute: "/admin/users",
    applicableRoles: ["System Administrators", "Security Officers", "Compliance Auditors"],
    realWorldScenario: "An auditor asks who authorized a ₹25,000 inventory write-off three weeks ago. The administrator opens /audit, searches the SKU, and shows the exact timestamp, manager ID, IP address, and approved discrepancy reason.",
    dosAndDonts: {
      do: "Assign users the Operator role for floor workers so they can scan and pick without access to tax invoices or company settings.",
      dont: "Never share admin credentials; individual accounts guarantee complete traceability in the security audit log.",
    },
    faqs: [
      {
        q: "Can I customize the numbering format of our invoices and GRNs?",
        a: "Yes. Navigate to /admin/numbering to define custom prefixes, fiscal year tags, and padding (e.g. INV/2026-27/0001).",
      },
      {
        q: "How many user roles are supported?",
        a: "5 roles: Admin (full rights), Manager (approvals & ops), Operator (floor scanning & receiving), Accounts (billing & Tally), and Management (read-only reports).",
      },
    ],
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
    readingTime: "4 min",
    summary: "7-Day phased rollout plan, hardware pairing, CSV opening balance cutover, staff certification, and Go-Live sign-off.",
    goldenRule: "Physical inventory must be frozen for 4 hours during Day 4 cutover to guarantee 100% ledger accuracy.",
    primaryRoute: "/admin/onboarding",
    applicableRoles: ["Field Engineers", "Project Managers", "Customer Success Leads"],
    realWorldScenario: "A new client with 4,000 SKUs successfully cuts over from legacy Excel spreadsheets to Margix in 7 days: Day 1 catalog upload, Day 3 scanner test, Day 4 weekend physical stock count, Day 7 live billing without shipping disruptions.",
    dosAndDonts: {
      do: "Follow the 7-day checklist step by step and test scanner barcode decode speeds before the Go-Live date.",
      dont: "Do not attempt cutover during live warehouse operating hours; freeze stock movements for 4 hours for opening counts.",
    },
    faqs: [
      {
        q: "How long does a typical customer implementation take?",
        a: "Standard deployment takes 7 business days following the structured Margix Onboarding Methodology.",
      },
      {
        q: "What hardware needs to be installed before Day 1?",
        a: "No server hardware required (100% cloud-hosted). Only standard barcode guns (USB/Bluetooth) or smartphones with cameras.",
      },
    ],
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
    readingTime: "4 min",
    summary: "",
    goldenRule: "",
    primaryRoute: "/dashboard",
    applicableRoles: [],
    realWorldScenario: "",
    dosAndDonts: null,
    faqs: [],
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

export interface ManualFaq {
  q: string;
  a: string;
}

export interface ManualDosAndDonts {
  do: string;
  dont: string;
}

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
  realWorldScenario?: string;
  dosAndDonts?: ManualDosAndDonts;
  faqs?: ManualFaq[];
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
