# Chapter 6: Statutory Indian GST Taxation & Compliance

## 6.1 Regulatory Overview & Statutory Compliance

Margix IMS is designed from the ground up in strict accordance with the **Central Goods and Services Tax (CGST) Act, 2017**, the **Integrated Goods and Services Tax (IGST) Act, 2017**, and state-specific **SGST/UTGST statutes**. 

Unlike generic Western ERP systems that rely on configurable, error-prone tax plugins, Margix IMS features an integrated, hardcoded Indian taxation engine with zero floating-point math: all monetary calculations are computed using exact integer paise (`bigint`) with half-up rounding.

---

## 6.2 Place of Supply & Tax Type Determination Engine

Every commercial transaction (Sales Invoices, Purchase Orders, Debit Notes, Credit Notes) must establish the legal **Place of Supply** pursuant to Sections 10 and 12 of the IGST Act.

### State Code Extraction Algorithm:
1. **Company State Code**: Extracted from the first two digits of the tenant's registered GSTIN (or `COMPANY_STATE_CODE` in configuration). For example: `29` represents Karnataka, `27` represents Maharashtra, `07` represents Delhi.
2. **Counterparty State Code**: Automatically parsed from the customer's or supplier's 15-digit GSTIN (`party.gstin.slice(0, 2)`). If the party is unregistered (B2C), the state code defaults to the registered address state code.
3. **Tax Type Assignment**:
   - **Intra-State (`INTRA_STATE`)**:
     $$\text{Seller State Code} = \text{Buyer State Code}$$
     Split equally into **Central Tax (CGST)** and **State/UT Tax (SGST/UTGST)**:
     $$\text{CGST Rate} = \frac{\text{GST Rate}}{2}, \quad \text{SGST Rate} = \frac{\text{GST Rate}}{2}$$
   - **Inter-State (`INTER_STATE`)**:
     $$\text{Seller State Code} \neq \text{Buyer State Code}$$
     Charged entirely as **Integrated Tax (IGST)**:
     $$\text{IGST Rate} = \text{GST Rate}$$
   - **Fallback Rule**: If either state code is missing or unverified, the system defaults to `INTRA_STATE` and raises an informational warning `statesKnown: false` so operators are prompted to complete the tax profile.

---

## 6.3 HSN / SAC Code Tariff Master (`/masters/hsn`)

Harmonized System of Nomenclature (HSN) codes classify physical goods, while Service Accounting Codes (SAC) classify logistics, handling, and freight charges.

### Hierarchy & Statutory Slabs:
- **4-Digit HSN**: Required for businesses with annual aggregate turnover (AATO) up to ₹5 Crores in B2B transactions.
- **6-Digit HSN**: Mandatory for businesses with AATO exceeding ₹5 Crores for all B2B supplies.
- **8-Digit HSN**: Required for export, import, and government supplies.

### Pre-Configured GST Slabs in Margix IMS:
| Slab | Statutory Categories | Examples |
| :---: | :--- | :--- |
| **0.00% (Exempt)** | Books, periodicals, fresh grains, unbranded agro-commodities | HSN `4901` (Printed Books), HSN `4902` (Newspapers/Journals), HSN `1006` (Unpacked Rice) |
| **5.00%** | Basic essentials, tea, edible oils, bulk apparel, footwear (<₹1000) | HSN `0902` (Tea), HSN `1513` (Coconut Oil), HSN `5515` (Fabrics) |
| **12.00%** | Packaged foods, pharmaceuticals, medical diagnostic equipment | HSN `1902` (Processed Foods), HSN `3004` (Formulation Medicaments), HSN `9018` (Medical Instruments) |
| **18.00%** | Standard industrial goods, switchgear, bearings, detergents, cosmetics | HSN `8482` (Ball Bearings), HSN `8536` (Electrical Switchgear), HSN `3401` (Soaps & Detergents) |
| **28.00%** | Luxury goods, cement, automotive components, air conditioners | HSN `2523` (Portland Cement), HSN `8708` (Motor Vehicle Spares), HSN `8415` (Air Conditioning Units) |

---

## 6.4 Mathematical Precision & Rounding Rules

Floating-point representations (e.g. `0.1 + 0.2 = 0.30000000000000004`) lead to cumulative rounding errors that trigger GST portal reconciliation rejections during GSTR-1 and GSTR-3B filing.

### Margix Integer-Paise Computation Pipeline:
$$\text{Gross} = \operatorname{Round}\left(\frac{\text{Quantity} \times \text{Rate}}{\text{Rate Factor}}\right)$$
$$\text{Discount} = \operatorname{Round}\left(\text{Gross} \times \frac{\text{Discount \%}}{100}\right)$$
$$\text{Taxable Value} = \text{Gross} - \text{Discount}$$

#### Tax Calculation per Line:
- **Intra-State**:
  $$\text{CGST} = \operatorname{Round}\left(\text{Taxable Value} \times \frac{\text{CGST \%}}{100}\right)$$
  $$\text{SGST} = \operatorname{Round}\left(\text{Taxable Value} \times \frac{\text{SGST \%}}{100}\right)$$
  $$\text{Total Line Tax} = \text{CGST} + \text{SGST}$$
- **Inter-State**:
  $$\text{IGST} = \operatorname{Round}\left(\text{Taxable Value} \times \frac{\text{IGST \%}}{100}\right)$$
  $$\text{Total Line Tax} = \text{IGST}$$

$$\text{Line Total} = \text{Taxable Value} + \text{Total Line Tax}$$
$$\text{Grand Total} = \sum \text{Line Totals} + \text{Other Charges}$$

> [!IMPORTANT]
> All rounding uses **Half-Up Rounding** (`(2n * n + d) / (2n * d)`) at the individual line level. Document totals represent the exact sum of line values, guaranteeing that printed totals match line items without 1-paise variance.

---

## 6.5 Statutory Sales Tax Invoice Generation (`/invoices`)

Tax Invoices generated in Margix IMS comply with Rule 46 of the CGST Rules, 2017.

### Mandatory Invoice Fields Rendered:
1. **Title**: "TAX INVOICE" prominently displayed at the top.
2. **Supplier Details**: Legal Business Name, Registered Address, 15-digit GSTIN, State Name, and 2-digit State Code.
3. **Recipient Details**: Customer Business Name, Delivery Address, Billing Address, GSTIN/UIN, State Name, and State Code.
4. **Document Controls**: Unique Invoice Number (consecutive alphanumeric sequence, e.g. `INV/2026/00142`), Invoice Date.
5. **Place of Supply**: Explicit state name and 2-digit state code.
6. **Line-Item Tax Table**:
   - Column 1: S.No.
   - Column 2: SKU Description & Technical Specification
   - Column 3: HSN Code (4, 6, or 8 digits)
   - Column 4: Quantity & Unit of Measure (UOM)
   - Column 5: Unit Rate (₹)
   - Column 6: Trade Discount (₹ / %)
   - Column 7: Taxable Value (₹)
   - Column 8: CGST Rate & Amount (₹)
   - Column 9: SGST Rate & Amount (₹)
   - Column 10: IGST Rate & Amount (₹)
   - Column 11: Total Amount (₹)
7. **HSN Summary Breakdown**: Statutory summary table aggregating Taxable Value, CGST, SGST, and IGST grouped by HSN code.
8. **Amount in Words**: Indian Rupee currency notation generated automatically (e.g. *"Rupees Two Lakh Forty-Five Thousand Eight Hundred and Fifty Only"*).
9. **Bank Details & Terms**: Bank name, account number, IFSC code, and legal terms of sale.
10. **Authorized Signatory**: Space for digital signature or physical stamp.

---

## 6.6 Credit Notes & Debit Notes (Sales & Purchase Returns)

### 1. Sales Returns / Credit Notes (`/sales-returns`):
Pursuant to Section 34(1) of the CGST Act, when goods are returned by a customer or an invoice price was overstated:
- A Credit Note is created linking directly to the original Invoice Number.
- The original tax rate and HSN code are locked to the return line.
- The credit note reduces output tax liability in the corresponding tax period.
- Accepted goods are returned to godown stock via the immutable ledger (`RETURN_IN`).

### 2. Purchase Returns / Debit Notes (`/purchase-returns`):
Pursuant to Section 34(3) of the CGST Act, when goods received from a supplier are rejected or returned:
- A Debit Note is created referencing the supplier's Invoice / GRN.
- Input Tax Credit (ITC) previously claimed is reversed according to statutory guidelines.
- Stock is removed from the quarantine or warehouse ledger (`RETURN_OUT`).

---

## 6.7 GSTR-1, GSTR-2B & GSTR-3B Readiness Checklist

Margix IMS stores tax information in an unaggregated, structured format suitable for monthly tax filings:
- **Table 4 (B2B Invoices)**: All sales to registered GSTINs with full line-item HSN detail.
- **Table 7 (B2C Others)**: Retail or unregistered sales aggregated by state and tax rate.
- **Table 9 (Credit/Debit Notes)**: Registered return notes linked to original tax invoices.
- **Table 12 (HSN Summary of Outward Supplies)**: Total quantity, taxable value, and tax amounts grouped by HSN code.

Operators can export filtered transaction lists to CSV for one-click upload into the GST Offline Tool or direct sync with Tally Prime.

