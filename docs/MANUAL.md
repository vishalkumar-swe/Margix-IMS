# Margix IMS — Enterprise Operational & Delivery Manual

> **Product**: Margix Inventory Management System (Margix IMS)  
> **Platform Version**: Production Release (Next.js 16 + React 19 + PostgreSQL 16 + Prisma ORM)  
> **Deployment Target**: Azure Container Apps (`ims.margixindia.com`)  
> **Target Audience**: Customer Operations Teams, Warehouse Managers, Accountants, System Administrators, Field Implementation Engineers  

---

## Executive Summary & System Philosophy

Margix IMS is an enterprise-grade Inventory, Warehouse, and Statutory Indian GST Management System engineered for high-throughput commercial and industrial facilities. Built on strict architectural integrity, Margix IMS enforces:

1. **Immutable Double-Entry Ledger**: Stock balances are never modified via unchecked raw queries. Every physical event records an unalterable transaction in the `inventory_ledger` table with running balance tracking.
2. **Integer-Paise Precision**: All statutory Indian GST calculations are executed in exact integer paise (`bigint`) with half-up rounding, eliminating floating-point reconciliation errors on GSTR-1 and GSTR-3B filings.
3. **Universal Industrial Barcode Engine**: Zero-hardware barcode capture supporting 15 industrial symbologies (EAN-13, UPC-A, Code-39, GTIN-14, ISBN, ISSN, PZN, JAN) via USB/Bluetooth scanners, desktop cameras, or wireless smartphone remote pairing (`/scan-remote`).
4. **Asynchronous Non-Blocking ERP Bridge**: Bidirectional integration with Tally Prime over HTTP/XML with atomic lease-locked job queueing, ensuring that network interruptions in Tally never block physical warehouse receiving or dispatch.
5. **Warehouse Copilot AI Assistant**: Built-in AI assistant with tool execution (`queryStock`, `findExpiringBatches`, `lookupBarcode`, `suggestHsn`) and offline-first fallback capabilities.

---

## Operational Manual Table of Contents

The complete documentation suite is organized into 12 detailed chapters covering every module and feature end-to-end:

| Chapter | Title & Scope | Primary Stakeholders | Document Link |
| :---: | :--- | :--- | :--- |
| **00** | **System Overview, Architecture & Value Proposition**<br/>Technology stack, system architecture, core engineering tenets, and capabilities matrix. | Executives, IT Directors | [Chapter 00: Overview](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/00-overview.md) |
| **01** | **Master Data Management & Product Catalog**<br/>SKU master, Multi-UOM conversion factors, HSN/SAC master, Categories, Godowns, Parties (GSTIN 2-digit auto-detection), and CSV bulk imports. | Data Admins, Catalog Managers | [Chapter 01: Masters](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/01-masters-and-catalog.md) |
| **02** | **Universal Barcode & Scanner Engine**<br/>15 symbologies, checksum validation, GTIN-14 outer carton breakdown, wireless smartphone scanner (`/scan-remote`), and multi-tier auto-discovery. | Floor Operators, Warehouse Techs | [Chapter 02: Barcode Engine](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/02-universal-barcode-engine.md) |
| **03** | **Inbound Logistics & Purchasing Operations**<br/>Purchase Orders, PO-linked vs Direct GRNs, Quality Inspection (Accepted vs Rejected split), Batch numbers, Expiry dates, and Purchase Returns / Debit Notes. | Receiving Inbound Staff, QC | [Chapter 03: Inbound Logistics](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/03-inbound-logistics.md) |
| **04** | **Outbound Logistics, Invoicing & Dispatch QC**<br/>Sales Tax Invoices, Intra vs Inter-State GST automatic splitting, Dispatch Verification & Packing QC station (`/dispatches`), and Credit Notes. | Sales Desk, Packing Operators | [Chapter 04: Outbound Logistics](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/04-outbound-logistics.md) |
| **05** | **Warehouse & Inventory Stock Operations**<br/>Live stock balances (`/stock`), SKU detail views (`/stock/[skuId]`), Inter-Godown Transfers (`/transfers`), Stock Adjustments / Write-Offs, and Opening Stock. | Warehouse Managers, Supervisors | [Chapter 05: Inventory Operations](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/05-warehouse-and-inventory.md) |
| **06** | **Statutory Indian GST Taxation & Compliance**<br/>Place of Supply logic, CGST/SGST vs IGST splitting, Rule 46 Tax Invoice standards, HSN summaries, and GSTR-1/3B readiness. | Chief Accountants, Tax Auditors | [Chapter 06: GST & Taxation](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/06-gst-and-taxation.md) |
| **07** | **Reports, Dead Stock & Stock Health Analytics**<br/>Stock Movement Summary (`Opening + In - Out = Closing`), Dead Stock (>90 days idle), Slow-Moving Stock, and Executive Analytics Dashboard. | Business Leaders, Supply Chain | [Chapter 07: Reports & Analytics](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/07-reports-and-analytics.md) |
| **08** | **Tally Prime ERP Bidirectional Integration**<br/>XML over HTTP bridge, Master sync, Transaction voucher posting (Sales, Purchase, Stock Journal), and Queue error diagnostics. | ERP Consultants, Accountants | [Chapter 08: Tally Prime Integration](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/08-tally-prime-integration.md) |
| **09** | **Warehouse Copilot AI Assistant**<br/>Natural language stock queries, tool execution (`queryStock`, `findExpiringBatches`, `suggestHsn`), and printable warehouse cheatsheet. | Floor Supervisors, Operators | [Chapter 09: Copilot AI Assistant](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/09-copilot-ai-assistant.md) |
| **10** | **System Administration, RBAC & Security Audit**<br/>RBAC matrix (`ADMIN`, `STORE_MANAGER`, `WAREHOUSE_OPERATOR`, `ACCOUNTS`, `MANAGEMENT`), custom numbering, notifications, and tamper-proof audit trail. | Security Officers, IT Admins | [Chapter 10: Administration & RBAC](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/10-administration-and-security.md) |
| **11** | **Customer Implementation, Onboarding & Go-Live Runbook**<br/>7-Day deployment methodology, hardware pairing, CSV opening balance cutover, staff certification, and Go-Live sign-off checklist. | Field Engineers, Project Managers | [Chapter 11: Onboarding Runbook](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/11-customer-onboarding-and-runbook.md) |

---

## Role-Based Reading Guide

To help team members and customer personnel get up to speed quickly, recommend following these reading paths:

### 1. Warehouse & Inbound Operations Staff
- [Chapter 02: Universal Barcode & Scanner Engine](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/02-universal-barcode-engine.md)
- [Chapter 03: Inbound Logistics & Purchasing Operations](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/03-inbound-logistics.md)
- [Chapter 05: Warehouse & Inventory Stock Operations](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/05-warehouse-and-inventory.md)
- [Printable Warehouse Cheatsheet (`/print/copilot/cheatsheet`)](file:///Users/deepstacker/WorkSpace/Margix-IMS/src/app/(print)/copilot/cheatsheet/page.tsx)

### 2. Dispatch, Packing & Logistics Teams
- [Chapter 02: Universal Barcode & Scanner Engine](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/02-universal-barcode-engine.md)
- [Chapter 04: Outbound Logistics, Invoicing & Dispatch QC](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/04-outbound-logistics.md)
- [Chapter 05: Warehouse & Inventory Stock Operations](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/05-warehouse-and-inventory.md)

### 3. Finance, Billing & Taxation Accountants
- [Chapter 01: Master Data Management & Product Catalog](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/01-masters-and-catalog.md)
- [Chapter 04: Outbound Logistics, Invoicing & Dispatch QC](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/04-outbound-logistics.md)
- [Chapter 06: Statutory Indian GST Taxation & Compliance](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/06-gst-and-taxation.md)
- [Chapter 08: Tally Prime ERP Bidirectional Integration](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/08-tally-prime-integration.md)

### 4. IT Administrators & Deployment Engineers
- [Chapter 00: System Overview & Architecture](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/00-overview.md)
- [Chapter 10: System Administration, RBAC & Security Audit](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/10-administration-and-security.md)
- [Chapter 11: Customer Implementation, Onboarding & Go-Live Runbook](file:///Users/deepstacker/WorkSpace/Margix-IMS/docs/manual/11-customer-onboarding-and-runbook.md)

---

## Technical Support & Maintenance

- **Production Health Check**: `https://ims.margixindia.com/api/health`
- **Readiness Probe**: `https://ims.margixindia.com/api/ready`
- **Tally Connectivity Ping**: Accessible via Tally Sync Dashboard (`/tally`)
- **System Logs & Diagnostics**: Standard JSON logger (`pino`) piped to Azure Container Apps log analytics workspace.
