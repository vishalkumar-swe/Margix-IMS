# Chapter 10: System Administration, RBAC & Security Audit

## 10.1 Role-Based Access Control (RBAC) Architecture

Margix IMS implements a strict, defense-in-depth Role-Based Access Control (RBAC) model. Permissions are enforced both **server-side** on all API routes and database mutations, and **client-side** to adapt the user interface dynamically.

### System Roles:
1. **`ADMIN` (System Administrator)**: Unrestricted access across all operational, financial, master data, configuration, user management, and security audit settings.
2. **`STORE_MANAGER` (Warehouse & Inventory Manager)**: Operational authority over inbound/outbound approvals, stock transfers, physical adjustment approvals, purchase order creation, and stock aging parameters.
3. **`WAREHOUSE_OPERATOR` (Dock & Floor Staff)**: Execution authority for receiving goods (GRN entry), scanning barcodes, packing and dispatch verification, and creating stock adjustment requests.
4. **`ACCOUNTS` (Finance & Taxation Team)**: Full visibility into sales tax invoices, credit/debit notes, GSTR compliance data, and Tally Prime synchronization.
5. **`MANAGEMENT` (Executive & Read-Only Stakeholders)**: High-level visibility into dashboards, analytics, reports, and stock balances with zero modification privileges.

### Permission Matrix:
| Operational Capability | Code | `ADMIN` | `STORE_MANAGER` | `WAREHOUSE_OPERATOR` | `ACCOUNTS` | `MANAGEMENT` |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| View Dashboard & Reports | `dashboard.view`, `report.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Live Stock & Ledger | `stock.view`, `ledger.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Purchase Orders (Create/Edit) | `po.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create Goods Receipt Note (GRN) | `grn.create` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Sales Tax Invoices | `invoice.manage` | ✅ | ✅ | ❌ | ✅ | ❌ |
| Verify & Post Dispatches | `dispatch.create` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Request Stock Adjustment | `adjustment.request` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve Stock Adjustment Note | `adjustment.approve` | ✅ | ✅ | ❌ | ❌ | ❌ |
| Execute Stock Reversals | `ledger.reverse` | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Catalog Masters (SKU/HSN/Party) | `master.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| Trigger Tally ERP Synchronization | `tally.sync` | ✅ | ✅ | ❌ | ✅ | ❌ |
| Manage Users & System Security | `user.manage`, `settings.manage` | ✅ | ❌ | ❌ | ❌ | ❌ |
| Inspect Immutable Security Audit Logs | `audit.view` | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 10.2 User Account Administration (`/admin/users`)

The user management console allows administrators to provision, maintain, and secure user accounts.

### Account Security Controls:
1. **Password Hashing**: Stored using industry-standard salted Argon2id / Bcrypt key derivation functions.
2. **Brute-Force Protection (`LOGIN_MAX_ATTEMPTS`)**: Accounts automatically lock after 5 consecutive failed login attempts (configurable up to 100).
3. **Lockout Cooldown (`LOGIN_LOCKOUT_MINUTES`)**: Locked accounts enter a mandatory 15-minute cooldown period unless an administrator manually unlocks the account.
4. **Session Lifetime (`SESSION_TTL_HOURS`)**: User sessions expire after 12 hours of inactivity, requiring re-authentication.
5. **Instant Status Toggles**: Administrators can deactivate an employee account in 1 click, instantly revoking all active sessions across desktop browsers and handheld mobile scanners.

---

## 10.3 Custom Document Numbering Rules (`/admin/numbering`)

Commercial and statutory compliance in India requires sequential, tamper-evident document numbers. Margix IMS provides custom sequence formatters for all 9 document types:

| Document Type | Code | Default Pattern | Example Number |
| :--- | :--- | :--- | :--- |
| **Sales Tax Invoice** | `INV` | `INV/{YY}-{YY+1}/{SEQ:4}` | `INV/26-27/0042` |
| **Purchase Order** | `PO` | `PO-{SEQ:5}` | `PO-00108` |
| **Goods Receipt Note** | `GRN` | `GRN-{SEQ:5}` | `GRN-00095` |
| **Dispatch Note** | `DISP` | `DSP-{SEQ:5}` | `DSP-00084` |
| **Inter-Godown Transfer** | `TRN` | `TRN-{SEQ:4}` | `TRN-0015` |
| **Stock Adjustment** | `ADJ` | `ADJ-{SEQ:4}` | `ADJ-0008` |
| **Purchase Return (Debit Note)** | `PR` | `DN/{YY}-{YY+1}/{SEQ:4}` | `DN/26-27/0003` |
| **Sales Return (Credit Note)** | `SR` | `CN/{YY}-{YY+1}/{SEQ:4}` | `CN/26-27/0007` |
| **Opening Stock Balance** | `OPN` | `OPN-{SEQ:4}` | `OPN-0001` |

### Configuration Options:
- **Prefix**: Custom commercial letters (e.g. `DEL-INV` for Delhi branch, `BLR-INV` for Bangalore branch).
- **Separator**: Slash (`/`), dash (`-`), or underscore (`_`).
- **Zero Padding**: Configurable minimum digits (3 to 6 digits, e.g. `0001` to `000001`).
- **Fiscal Year Reset**: Automatically restarts sequence counters to 1 on April 1st of every Indian financial year.

---

## 10.4 Multi-Channel Notifications (`/admin/notifications`)

Margix IMS features an event-driven notification engine supporting three delivery channels:

### 1. Corporate Email (SMTP):
- Connects to corporate mail servers (Gmail Workspace, Microsoft 365, AWS SES).
- Configurable port (`587` with STARTTLS or `465` with SSL).
- Dispatches purchase order PDFs to suppliers, low stock alerts to managers, and daily dispatch summaries to directors.

### 2. WhatsApp Cloud API (Meta):
- Sends instant notifications directly to store managers' mobile phones via Meta's official WhatsApp Business Cloud API.
- Approved message templates for:
  - Critical Out-of-Stock breaches.
  - Approaching batch expirations (<30 days).
  - High-value sales invoice dispatches.

### 3. Outbound Webhooks:
- Emits real-time JSON webhooks for external integrations (e.g. logistics tracking, third-party courier APIs, custom dashboards).

---

## 10.5 Inbound & Outbound Quality Checklists (`/admin/checklist`)

To standardize warehouse discipline, administrators can mandate operational quality checklists that dock workers must complete before saving commercial documents.

### Inbound Inspection Gates:
- *"Check delivery truck temperature for cold-chain goods"*
- *"Inspect outer carton seal and tamper tape integrity"*
- *"Verify supplier invoice matches physical bill of lading"*
- *"Check for physical carton damage or water leakage"*

### Outbound Packing Gates:
- *"Verify bubble-wrap packaging for fragile glass/electronic items"*
- *"Ensure batch number printed on outer box matches dispatch challan"*
- *"Confirm invoice copy and delivery challan enclosed inside shipping pouch"*

---

## 10.6 Immutable Security Audit Trail (`/audit`)

Every action within Margix IMS writes a tamper-proof event to the `audit_log` table within the same database transaction as the primary change.

### Audit Log Schema:
- **Timestamp**: Microsecond-precision ISO-8601 UTC timestamp.
- **Actor**: User ID, Full Name, Email, and Session Role.
- **IP Address & User-Agent**: Client network address and device metadata.
- **Action Type**: E.g. `INVOICE_CREATED`, `GRN_APPROVED`, `STOCK_ADJUSTMENT_POSTED`, `USER_PASSWORD_RESET`.
- **Entity Reference**: Target table and UUID (e.g. `Invoice`, `9b1deb4d-...`).
- **Full JSON Delta**:
  - `oldData`: Snapshot of row attributes prior to the modification.
  - `newData`: Snapshot of row attributes immediately following the modification.

Audit records cannot be altered or purged through any user interface, ensuring full compliance with ISO 27001, SOC 2, and statutory tax audit standards.
