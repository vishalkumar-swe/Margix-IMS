# Chapter 11: Customer Implementation, Onboarding & Go-Live Runbook

## 11.1 The 7-Day Enterprise Deployment Methodology

Deploying Margix IMS in a production warehouse follows a structured 7-day phased rollout methodology designed to prevent operational disruption, maintain inventory accuracy, and certify warehouse staff prior to physical go-live.

```mermaid
flowchart LR
    D1["Day 1:<br/>Environment & Company Setup"] --> D2["Day 2:<br/>Hardware & Barcode Scanners"]
    D2 --> D3["Day 3:<br/>Master Data Import (CSV)"]
    D3 --> D4["Day 4:<br/>Tally Prime ERP Bridge"]
    D4 --> D5["Day 5:<br/>Staff Training & Sandbox"]
    D5 --> D6["Day 6:<br/>Physical Stock Cutover"]
    D6 --> D7["Day 7:<br/>Go-Live & Hypercare"]
```

---

## 11.2 Day 1: System Provisioning & Company Identity

1. **Tenant Provisioning**: Access the deployment URL (e.g. `https://ims.customer.com`).
2. **Configure Company Profile (`getCompanyDetails`)**:
   - Legal Business Name (`COMPANY_NAME`)
   - Registered Business Address (`COMPANY_ADDRESS`)
   - 15-Digit GSTIN (`COMPANY_GSTIN`)
   - 2-Digit GST State Code (`COMPANY_STATE_CODE`, e.g. `29` for Karnataka, `27` for Maharashtra, `07` for Delhi)
   - Official Bank Account Details (Bank Name, A/C Number, IFSC Code) for Tax Invoice letterheads.
3. **Configure Godowns (Locations) (`/masters/godowns`)**:
   - Create all storage facilities: *Main Godown*, *Quarantine Zone*, *Bulk Warehouse*, *Dispatch Staging*.
4. **Provision Administrator & Manager Accounts (`/admin/users`)**:
   - Create accounts for the Warehouse Head, Operations Manager, and Chief Accountant.

---

## 11.3 Day 2: Hardware Peripherals & Wireless Scanner Setup

1. **Handheld Barcode Scanners**:
   - Connect USB / Bluetooth 2D barcode scanners (Honeywell, Zebra, Datalogic).
   - Configure scanner to send standard `ENTER` suffix (Carriage Return) after every scan.
   - Verify scanning across standard EAN-13, GS1-128, Code-39, and GTIN-14 labels.
2. **Mobile Smartphone Wireless Scanner (`/scan-remote`)**:
   - Dock workers open `https://ims.customer.com/scan-remote` on Android / iOS devices.
   - Pair smartphone to desktop workstation screen using the dynamic 6-digit numeric pairing code.
   - Test low-light LED torch toggle and continuous camera streaming.
3. **Thermal Shipping & Barcode Printers**:
   - Install TSC, Zebra, or TVS 4x6" thermal label printers for dispatch cartons.
   - Set browser print margin to *None* and paper size to *4" x 6"* or *2" x 1"* barcode stickers.
4. **Office Laser Invoicing Printers**:
   - Load Letter / A4 paper for statutory GST Tax Invoices.

---

## 11.4 Day 3: Master Data Migration (All-or-Nothing CSV Imports)

Margix IMS features atomic, transactional CSV bulk loaders that validate 100% of rows before writing to the database:

### 1. Categories (`/masters/categories`):
- Create broad item classifications (e.g. *Raw Materials*, *Finished Goods*, *Packaging*, *Spare Parts*).

### 2. Units of Measurement (`/masters`):
- Ensure standard UOM codes match commercial definitions: `PCS`, `BOX`, `KGS`, `MTR`, `LTR`, `PACK`.
- Define Multi-UOM conversion factors (e.g. `1 BOX = 24 PCS`).

### 3. SKU Product Master (`/masters/skus` $\to$ Import CSV):
- Prepare CSV with columns:
  `code, name, description, category, unit, hsn_code, gst_rate, batch_tracked, tally_stock_item_name`
- The loader automatically validates HSN codes, associates category IDs, and catches duplicate codes.

### 4. Customers & Suppliers (`/masters/customers`, `/masters/suppliers`):
- Import vendor and client address books with verified 15-digit GSTINs and state codes.

---

## 11.5 Day 4: Tally Prime ERP Bridge & Queue Configuration

1. **Tally Prime Gateway Setup**:
   - Enable Tally Prime HTTP Server: *F12: Configure $\to$ Advanced Configuration $\to$ Enable ODBC / HTTP Server = Yes (Port: 9000)*.
   - Ensure the customer's company is currently open and active in Tally Prime.
2. **Set Environment Configuration**:
   ```env
   TALLY_MODE=xml
   TALLY_URL=http://tally-server-lan-ip:9000
   TALLY_COMPANY="Acme Trading Enterprises Pvt Ltd"
   ```
3. **Verify Connection**:
   - Navigate to `/tally` in Margix IMS.
   - Confirm the status badge reads: **Connected (Tally Prime Server is Running)**.
4. **Post Mock Sync & Test Vouchers**:
   - Test master synchronization of Godowns and Ledgers to verify mapping accuracy.

---

## 11.6 Day 5: Staff Training & Sandbox Simulation

Warehouse teams must be certified before handling physical cutover:

1. **Interactive Product-to-Sale Walkthrough (`/admin/onboarding`)**:
   - Dock staff complete the guided milestone walkthrough:
     - *Milestone 1: SKU Catalog & Barcode Lookup*
     - *Milestone 2: Purchase Order Creation*
     - *Milestone 3: Inbound GRN with Batch & Expiry Entry*
     - *Milestone 4: Stock Ledger & Godown Verification*
     - *Milestone 5: Sales Invoice & Intra/Inter-State Tax Split*
     - *Milestone 6: Dispatch Verification & Packing QC*
     - *Milestone 7: Tally Prime Reconciliation*
2. **Print & Post Warehouse Cheatsheet (`/print/copilot/cheatsheet`)**:
   - Post laminated copies at all packing tables and inbound receiving bays.
3. **Reset Sandbox Test Data**:
   - Clear test transactions to return the database to a clean pre-stock state.

---

## 11.7 Day 6: Physical Stock Count & Opening Balance Cutover

1. **Freeze Warehouse Operations**:
   - Halt physical inbound deliveries and outbound dispatches for the duration of the count.
2. **Execute Complete Physical Stock Count**:
   - Teams count shelf by shelf, recording SKU Code, Godown Location, Batch Number, Expiry Date, and Physical Count.
3. **Import Opening Stock Balances (`/opening-stock` $\to$ Import CSV)**:
   - Prepare cutover CSV with columns:
     `sku_code, godown_code, batch_number, quantity, manufacturing_date, expiry_date, unit_cost`
   - Upload CSV. The system writes `OPENING` movements to the immutable ledger and establishes initial on-hand stock balances in `stock_balance`.
4. **Reconcile Opening Balances**:
   - Compare the Stock Summary report (`/reports/stock-summary`) total valuation against the company's financial closing balance sheet.

---

## 11.8 Day 7: Physical Go-Live & Operational Sign-Off

1. **Unfreeze Operations**:
   - Inbound receiving docks begin issuing live Goods Receipt Notes (`/grns/new`).
   - Sales order desks begin generating live Sales Tax Invoices (`/invoices/new`).
2. **Gate-Pass & Packing QC Enforcement**:
   - Packing stations begin mandatory barcode verification (`/dispatches`).
3. **First End-of-Day Reconciliation Checklist**:
   - [ ] Verify all day's GRNs have accepted vs rejected quantities recorded.
   - [ ] Verify all day's sales dispatches match physical vehicle gate passes.
   - [ ] Check Tally Sync Queue (`/tally`): 100% of jobs in `SYNCED` status.
   - [ ] Review Daily Stock Movement Report (`/reports/movements`).
   - [ ] Operational Sign-Off signed by Warehouse Head and Chief Accountant.
