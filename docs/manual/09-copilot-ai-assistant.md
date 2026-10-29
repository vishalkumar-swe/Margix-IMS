# Chapter 9: Warehouse Copilot AI Assistant

## 9.1 Overview & Architecture

The Margix Warehouse Copilot is an intelligent assistant designed to operate directly inside busy warehouse environments. It bridges the gap between natural human conversation and operational inventory database execution.

### Key Capabilities:
- **Natural Language Stock Queries**: Floor operators and supervisors can ask plain English questions (e.g. *"How many units of Parle-G are left in Central Godown?"* or *"List all batches expiring before next month"*).
- **Autonomous Tool Execution**: The Copilot does not speculate or guess answers. It translates operator questions into typed tool calls (`queryStock`, `findExpiringBatches`, `lookupBarcode`, `suggestHsn`, `getDeadStockReport`) that execute against the PostgreSQL database in real-time.
- **Offline-First Resilience**: Even when an external LLM provider is offline or unconfigured (`AI_PROVIDER=none`), the Copilot continues to operate using its embedded curated retrieval-augmented knowledge base (`knowledge.ts`), answering operational rules, code lookups, and troubleshooting workflows without an internet connection.
- **Strict RBAC & Audit Guardrails**: Every query and tool execution is filtered through the authenticated user's session role (`guard.ts`), ensuring operators cannot view financial summaries or change administrative configurations.

---

## 9.2 Copilot Operational Tools & Capabilities

The Copilot agent is equipped with native tools that query live inventory tables:

| Tool Name | Purpose | Example Operator Query |
| :--- | :--- | :--- |
| `queryStock` | Retrieves real-time on-hand, allocated, and available balances per SKU and godown. | *"Do we have 500 units of SKU-042 available in Main Godown?"* |
| `findExpiringBatches` | Scans active batches for approaching expiration dates based on FEFO thresholds. | *"Which medicine batches expire within the next 45 days?"* |
| `lookupBarcode` | Decodes 1D/2D barcodes, GS1 AI identifiers, GTIN-14 cartons, ISBNs, or part numbers. | *"What product has barcode 8901030012345?"* |
| `suggestHsn` | Searches the Indian GST HSN/SAC master for applicable tax codes and statutory slabs. | *"What is the HSN code and GST rate for hydraulic valves?"* |
| `getDeadStockReport` | Fetches stagnant inventory with no ledger movement for >90 days. | *"Show me dead stock currently occupying space in the Cold Storage godown."* |
| `checkReorderStatus` | Evaluates inventory against configured minimum safety levels and reorder points. | *"Which items have breached reorder thresholds today?"* |

---

## 9.3 The Product-to-Sale Journey & Cheatsheet

Margix IMS provides a structured, role-adapted walkthrough called the **Product-to-Sale Journey**. This can be viewed interactively in the app or printed as a clean warehouse clipboard cheatsheet at `/print/copilot/cheatsheet`.

### The Core Journey:
$$\text{Product} \longrightarrow \text{PO} \longrightarrow \text{GRN (Batch + Exp)} \longrightarrow \text{Stock Ledger} \longrightarrow \text{GST Invoice} \longrightarrow \text{FEFO Dispatch} \longrightarrow \text{Tally Sync}$$

### Core Operating Rules Enforced by Copilot:
1. **Stock Never Changes Directly**: Only a formal Goods Receipt Note (GRN), Dispatch Note, Inter-Godown Transfer, Return Note, or approved Physical Adjustment writes to the ledger.
2. **The Ledger is Immutable**: Corrections to posted movements require a formal offset entry or reversal note; entries are never edited or deleted.
3. **Invoices Record the Sale, Not the Stock Movement**: An approved invoice reserves stock (`allocated`), but stock does not exit the warehouse until a **Dispatch Note** passes physical gate-verification.
4. **FEFO Shipping**: The system prioritizes the earliest-expiring unexpired batch first. Operators can click *Pick Batches (FEFO)* to auto-allocate correct lots.
5. **Quality Gating at Receipt**: Only the accepted quantity on a GRN enters active stock. Damaged or non-compliant units are routed to quarantine with mandatory rejection reasons.
6. **Non-Blocking ERP Sync**: Tally Prime connection failures never prevent warehouse operators from receiving or shipping physical stock.

---

## 9.4 Printable Warehouse Cheatsheet (`/print/copilot/cheatsheet`)

The printable cheatsheet is formatted for standard A4 and thermal clipboard displays. Warehouse supervisors can print and post it at packing stations, forklift terminals, and dockmaster desks.

### Cheatsheet Includes:
- **Milestone Checklists**: Step-by-step role instructions for Inbound Receiving, Quality Inspection, Stock Transfers, Invoice Creation, and Dispatch QC.
- **Common Error Codes & Immediate Fixes**: Quick reference table decoding system errors (e.g. `INSUFFICIENT_STOCK`, `EXPIRED_BATCH`, `STATE_CODE_MISMATCH`) and the exact operational steps to resolve them.
- **Barcode Symbology Guide**: Visual reference of retail EAN-13, wholesale GTIN-14, automotive Code-39, and pharmaceutical PZN labels.
