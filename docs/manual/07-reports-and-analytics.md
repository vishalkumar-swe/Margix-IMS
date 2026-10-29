# Chapter 7: Reports, Dead Stock & Stock Health Analytics

## 7.1 Overview & Reporting Philosophy

Margix IMS features a financial and operational intelligence engine that transforms low-level ledger events into actionable management insights. Rather than relying on slow batch aggregations, Margix IMS computes reports directly from the immutable double-entry ledger using optimized PostgreSQL analytical queries with strict row limits (`REPORT_ROW_LIMIT = 10,000`) to guarantee sub-second response times.

---

## 7.2 Stock Movement Summary Report (`/reports/stock-summary`)

The Stock Movement Summary provides an accounting-grade view of inventory movements over any given calendar period (defaulting to Month-to-Date in Indian Standard Time - IST).

### Core Formula:
$$\text{Closing Stock} = \text{Opening Balance} + \text{Inward} - \text{Outward} \pm \text{Adjustments}$$

### Movement Classification Rules:
- **Opening Balance**: Net sum of all ledger movements prior to the period start date ($t < t_{\text{start}}$).
- **Inward (+)**: All stock additions occurring within the period, including:
  - `OPENING` (New opening stock balances entered during the period)
  - `INWARD` (Supplier GRN receipts)
  - `TRANSFER_IN` (Stock received from another godown)
  - `RETURN_IN` (Customer sales returns / Credit Notes)
- **Outward (-)**: All stock reductions occurring within the period, including:
  - `OUTWARD` (Sales invoice dispatches)
  - `TRANSFER_OUT` (Stock sent to another godown)
  - `RETURN_OUT` (Supplier purchase returns / Debit Notes)
- **Adjustments ($\pm$)**: Cycle count corrections, shrinkage write-offs, scrap entries, and document reversals.
- **Closing Balance**: Physical stock balance at the period end timestamp.

### Grouping & Filters:
- **By SKU & Godown**: Aggregates total movements per item per physical location.
- **By Batch (`groupBy=batch`)**: Drills down into individual batch numbers for pharmaceuticals, chemicals, and FMCG lots.
- **Export**: One-click **Export to CSV** for management reporting and external audit preparation.

---

## 7.3 Dead Stock Report (`/reports/dead-stock`)

Dead stock represents frozen working capital, warehouse space blockage, and impending obsolescence. 

### Detection Algorithm:
Margix IMS identifies dead stock by executing a real-time join between positive stock balances and the last recorded ledger movement:
1. Filters SKUs with positive on-hand quantity:
   $$\sum \text{Quantity} > 0$$
2. Identifies the timestamp of the most recent movement in `inventory_ledger`:
   $$t_{\text{last}} = \max(\text{created\_at})$$
3. Calculates idle duration in days:
   $$\text{Days Idle} = \left\lfloor \frac{\text{Current Time} - t_{\text{last}}}{86400} \right\rfloor$$
4. Flags stock as **Dead Stock** when:
   $$\text{Days Idle} \ge \text{DEAD\_STOCK\_DAYS} \quad (\text{Default: } 90 \text{ days})$$

### Report Columns:
| Field | Description |
| :--- | :--- |
| **SKU Code & Name** | Product identifier. |
| **Godown** | Specific warehouse where dead inventory is stored. |
| **Quantity on Hand** | Total stagnant units. |
| **UOM** | Unit of measurement. |
| **Last Movement Date** | Exact date and time when the item was last received, sold, or transferred. |
| **Days Idle** | Number of consecutive days without movement (sorted descending by default). |
| **Action Link** | Direct link to create an Inter-Godown Transfer or Price Adjustment. |

---

## 7.4 Slow-Moving Stock Report (`/reports/slow-stock`)

The Slow-Moving Stock report acts as an early warning radar before products turn into dead stock.

### Criteria:
- Stock items whose last movement occurred between `SLOW_STOCK_DAYS` (default: 30 days) and `DEAD_STOCK_DAYS` (default: 90 days).
- Allows procurement and sales teams to design promotional bundles, customer discount campaigns, or reorder freeze directives before inventory shelf life expires.

---

## 7.5 Comprehensive Movement History Report (`/reports/movements`)

The Movement History Report provides a chronological record of all ledger entries for forensic reconciliation.

### Available Filters:
- **Date Range**: Inclusive start and end dates (IST calendar).
- **Godown**: Filter by specific warehouse location.
- **SKU**: Filter by individual product.
- **Movement Type**: Filter specifically by `INWARD`, `OUTWARD`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT`, `RETURN_IN`, `RETURN_OUT`, or `REVERSAL`.

Every line items the exact entry number, source document reference (`GRN-xxxx`, `INV-xxxx`), batch number, operator, and quantity delta.

---

## 7.6 Executive Analytics Dashboard (`/analytics` & `/dashboard`)

The Executive Analytics console aggregates operational metrics across commercial pipelines:

### Key Performance Indicators (KPIs):
1. **Total Stock Valuation (₹)**: Current inventory asset value computed by multiplying on-hand quantity by SKU standard/purchase rate.
2. **Inbound vs Outbound Velocity**: Monthly comparison of incoming goods (GRNs) versus outgoing dispatches (Sales Invoices).
3. **Fulfillment Cycle Time**: Average duration between Sales Invoice creation and final physical gate dispatch.
4. **Active SKU Breadth**: Percentage of catalog SKUs actively circulating versus dormant items.
5. **Quality Rejection Rate**: Ratio of goods rejected during GRN inspection to total goods received.
