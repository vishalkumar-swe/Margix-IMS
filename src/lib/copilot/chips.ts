/** Page-aware question chips (PRD §5.2). Three short, concrete prompts per route. */
interface ChipRule {
  match: string | RegExp;
  chips: [string, string, string];
}

const RULES: ChipRule[] = [
  {
    match: "/masters/skus",
    chips: [
      "How do I configure carton-to-piece conversions?",
      "Can I bulk import SKUs via CSV?",
      "How do GST tax slabs apply to categories?",
    ],
  },
  {
    match: "/purchase-orders",
    chips: [
      "How do I cancel or short-close a PO?",
      "Can I enter lines in alternate units (e.g. BOX)?",
      "Who has approval rights to submit POs?",
    ],
  },
  {
    match: "/grns",
    chips: [
      "How do I record damaged or rejected quantities?",
      "Why is batch expiry mandatory for food/pharma items?",
      "Can I create multiple GRNs against one PO?",
    ],
  },
  {
    match: "/stock",
    chips: [
      "Why can't I edit stock quantities directly?",
      "How do I reverse an accidental inward entry?",
      "How do godown-to-godown transfers work?",
    ],
  },
  {
    match: "/ledger",
    chips: [
      "Why can't I edit stock quantities directly?",
      "How do I reverse an accidental inward entry?",
      "What does a negative ledger quantity mean?",
    ],
  },
  {
    match: "/invoices",
    chips: [
      "Why hasn't my stock decreased after saving an invoice?",
      "Can I cancel an unpaid invoice?",
      "How do I print a GST-compliant tax invoice?",
    ],
  },
  {
    match: "/dispatches",
    chips: [
      "How does FEFO automatic batch picking work?",
      "What causes an INSUFFICIENT_STOCK error?",
      "How do I do a partial dispatch?",
    ],
  },
  {
    match: "/alerts",
    chips: [
      "When does a low-stock alert trigger?",
      "How do I set a reorder level?",
      "Why did my alert resolve by itself?",
    ],
  },
  {
    match: "/tally",
    chips: [
      "What happens when Tally sync fails?",
      "Which documents are sent to Tally?",
      "Can I retry a failed sync?",
    ],
  },
  {
    match: "/transfers",
    chips: [
      "How do godown-to-godown transfers work?",
      "Does a transfer change total company stock?",
      "Can I transfer a specific batch?",
    ],
  },
  {
    match: "/adjustments",
    chips: [
      "Why do adjustments need approval?",
      "What is the difference between adjust and write off?",
      "Who can approve an adjustment?",
    ],
  },
  {
    match: "/reports",
    chips: [
      "What is the difference between slow and dead stock?",
      "How do I download a stock movement report?",
      "Which report reconciles with the ledger?",
    ],
  },
  {
    match: "/dashboard",
    chips: [
      "What does 'inward today' count?",
      "Why is an invoice awaiting dispatch?",
      "How do I clear the low-stock alerts?",
    ],
  },
];

const FALLBACK: [string, string, string] = [
  "Where do I start with a new product?",
  "Why can't I edit stock directly?",
  "How does FEFO dispatch work?",
];

export function chipsForRoute(pathname: string): string[] {
  const rule = RULES.find((entry) =>
    typeof entry.match === "string" ? pathname === entry.match || pathname.startsWith(`${entry.match}/`) : entry.match.test(pathname),
  );
  return [...(rule?.chips ?? FALLBACK)];
}
