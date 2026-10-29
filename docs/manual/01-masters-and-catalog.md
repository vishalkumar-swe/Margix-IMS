# Margix IMS — Enterprise Inventory & Warehouse Management System
## Chapter 1: Master Data Management & Product Catalog

---

### 1. Introduction to Master Data

Master data forms the foundation of all inventory, sales, purchasing, and warehouse movements in Margix IMS. Clean master data ensures accurate stock balances, automated GST tax calculations, and seamless ERP/Tally integration.

Margix IMS manages seven core master entities:
1. **Stock Keeping Units (SKUs / Products)**
2. **Units of Measure (UOMs) & Conversion Units**
3. **Product Categories**
4. **GST HSN Codes & Tariff Rates**
5. **Godowns (Warehouses & Storage Locations)**
6. **Suppliers (Vendors / Creditors)**
7. **Customers (Buyers / Debtors)**

---

### 2. SKU (Stock Keeping Unit) Master

The SKU master (`/masters/skus`) defines every physical item bought, stored, transferred, or sold.

#### SKU Fields & Specifications

| Field Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| **Product Code (`code`)** | Text (Uppercase) | Yes | Unique business identifier (e.g., `SKU-000142` or `BEAR-6205-RS`). If left blank, the system automatically allocates the next code from the configured numbering sequence. |
| **Product Name (`name`)** | Text | Yes | Complete commercial or technical product name. |
| **Barcode (`barcode`)** | Text (Numeric/Alphanumeric) | Optional | The primary scannable barcode printed on the item. If left blank, the system allocates a valid internal EAN-13 starting with prefix `20`. |
| **Base UOM (`baseUomId`)** | Dropdown | Yes | The foundational stocking unit (e.g., `PCS`, `KG`, `LTR`, `BOX`). Stock balances in the ledger are always tracked in this base unit. |
| **Category (`categoryId`)** | Dropdown | Optional | Broad merchandise or industrial classification. Linking a category can automatically provide default HSN codes. |
| **HSN Code (`hsnCode`)** | Text (4–8 digits) | Optional | The Indian GST Harmonized System of Nomenclature code (e.g., `8482` for ball bearings, `3004` for medicaments, `2201` for water). |
| **GST Rate (`gstRate`)** | Decimal (%) | Optional | Statutory tax rate (`0%`, `5%`, `12%`, `18%`, `28%`). If omitted, Margix automatically inherits the rate configured on the selected HSN master. |
| **Batch Tracking (`isBatchTracked`)** | Boolean Toggle | Yes (Default: ON) | When enabled, all receipts and sales require entering batch numbers and manufacturing/expiry dates. **Note**: Cannot be toggled once stock ledger movements exist. |
| **Tally Stock Item Name (`tallyStockItemName`)** | Text | Optional | Name of the ledger in Tally Prime if it differs from the internal Margix product name. |
| **Status (`status`)** | Enum | Yes | `ACTIVE` (standard operational item), `INACTIVE` (prevented from new orders), `ARCHIVED` (hidden from catalogs; blocked if stock on hand > 0). |

#### Alternate Units & Conversion Ratios (`SkuUnit`)

Many products are purchased in bulk cases but stored or sold individually. Margix IMS supports multi-unit conversion directly on the SKU:
- **Base Unit**: `PCS` (Factor = 1.0)
- **Alternate Unit 1**: `BOX` (Conversion Factor: 1 `BOX` = 12 `PCS`)
- **Alternate Unit 2**: `CTN` (Carton) (Conversion Factor: 1 `CTN` = 120 `PCS`)

When creating a Purchase Order or Sales Invoice in `BOX`, the system automatically translates the inventory movement to the base unit in the immutable ledger.

```mermaid
flowchart LR
    CTN["1 Carton (CTN)"] -- "x 10" --> BOX["10 Boxes (BOX)"]
    BOX -- "x 12" --> PCS["120 Pieces (PCS) [Base UOM in Ledger]"]
```

---

### 3. GST HSN Tariff Master

Located at `/masters/hsn`, the HSN master maintains official Indian GST classification rules.

- **4-Digit Chapter/Heading**: Used by businesses under ₹5 Crore turnover.
- **8-Digit Tariff Item**: Required for large businesses and chemical/pharmaceutical exports.
- **Statutory Rate**: 0%, 5%, 12%, 18%, 28%.
- **Full-Text Keywords**: Includes commercial synonyms (e.g. `bearing, roller, ball bearing, pillow block`) enabling instant semantic auto-matching during scanning.

---

### 4. Product Categories

Located at `/masters/categories`:
- Organizes catalog into functional groups (e.g., *Industrial Bearings*, *Electrical Switchgear*, *Fasteners*, *Packaged Foods*).
- Default HSN Linkage: Assigning an HSN code to a Category ensures that all new products assigned to that category immediately receive compliant GST tax rates.

---

### 5. Godowns (Warehouses & Locations)

Located at `/masters/godowns`:
- Represents physical or logical storage locations (e.g., *Central Godown - Bhiwandi*, *Floor 1 Rack B*, *Raw Material Store - Manesar*).
- **Movement Validation**: Goods cannot be received into or dispatched from an inactive godown.
- **Inter-Godown Isolation**: Stock balances are tracked independently per SKU, per Batch, per Godown.

---

### 6. Parties: Suppliers & Customers

#### Suppliers (`/masters/suppliers`)
- **Name & Trade Name**: Legal company name.
- **GSTIN**: 15-character Goods and Services Tax Identification Number.
- **State Code Auto-Resolution**: The system automatically extracts the 2-digit GST state code (e.g. `27` for Maharashtra, `07` for Delhi, `09` for Uttar Pradesh) from the first two characters of the GSTIN.
- **Address & Contact Details**: Used for generating purchase orders and tax returns.

#### Customers (`/masters/customers`)
- **Classification**: Registered B2B Taxpayer, Composition Dealer, Unregistered Consumer (B2C), or Overseas Client.
- **GSTIN**: Required for B2B tax invoice generation and input tax credit (ITC) validity.
- **Billing & Shipping Addresses**: Supports multi-location delivery points for enterprise clients.

---

### 7. Bulk CSV Master Import

To onboard new facilities or migrate from legacy software (Tally, Busy, SAP, Excel), Margix IMS provides high-speed validated CSV bulk importers at `/masters/skus` and `/masters/customers`:

#### SKU CSV Format Specification

```csv
code,name,description,category,unit,hsn_code,gst_rate,batch_tracked,tally_stock_item_name
SKU-1001,SKF 6205 Ball Bearing,Deep groove 25x52x15mm,Bearings,PCS,84821011,18,yes,SKF 6205 2RSH
SKU-1002,Havells 16A SP MCB,Euro-II C-Curve 10kA,Electrical,PCS,85362030,18,no,Havells 16A MCB
SKU-1003,Bisleri Water 1L,Packaged Drinking Water,Beverages,BTL,22011010,18,yes,Bisleri 1L Pet
```

#### Validation & Atomic Transaction Rules
1. **All-or-Nothing Import**: If line 42 has an invalid UOM or duplicate SKU code, the entire transaction is rolled back with exact line-by-line error messages.
2. **Auto-Allocation**: Leaving `code` blank in the CSV automatically assigns clean sequential codes (`SKU-000101`, `SKU-000102`).
3. **HSN Cross-Check**: Rejects HSN codes that are inactive or missing from the statutory tariff table.
