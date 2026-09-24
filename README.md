# Margix Inventory Management System 🚀

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?style=for-the-badge&logo=postgresql)

Margix is an enterprise-grade Inventory Management System built on a strict **Immutable Financial Ledger** architecture. Designed for precision, every single stock movement is recorded as an immutable transaction, ensuring a flawless audit trail and eliminating "ghost stock" anomalies.

---

## 🌟 Core Philosophy: The Immutable Ledger

Unlike traditional inventory apps where a `currentStock` number is overwritten, Margix calculates real-time stock dynamically by aggregating absolute quantities from the `InventoryLedger` table. 

- **Adds to Stock (+):** `OPENING`, `INWARD`, `TRANSFER_IN`, `RETURN_IN`
- **Deducts from Stock (-):** `OUTWARD`, `TRANSFER_OUT`, `RETURN_OUT`
- **Corrections (±):** `ADJUSTMENT`
- **Error Handling (±):** `REVERSAL`

By calculating `Sum(+) - Sum(-)`, the system can instantly determine the exact stock of any SKU in any Godown down to the specific Batch.

---

## 🚀 Key Features

### 📦 Procurement & GRN
- **Purchase Orders:** Create POs linked to specific Suppliers.
- **Goods Receipt Note (GRN):** Receive stock directly against POs.
- **Dynamic Status:** POs automatically transition to `PARTIALLY_RECEIVED` or `FULLY_RECEIVED` based on incoming ledger entries.

### 🚚 Dispatch & Outward Validation
- **Batch Tracking:** Outward movements require selecting a specific manufactured Batch.
- **Strict Validation:** The system blocks transactions if the requested dispatch quantity exceeds the physical availability of that specific batch.

### ⚖️ Stock Adjustments (Approvals)
- Submit variance requests for physical counting discrepancies (Damage, Shrinkage, Expiry).
- Manager approval workflow instantly posts an `ADJUSTMENT` movement to the ledger.

### ⏪ Self-Healing Reversals
- Mistakes cannot be edited or deleted.
- Click "Reverse" on any erroneous entry to generate a `REVERSAL` transaction that perfectly counter-balances the mathematical impact of the mistake.

### 🔄 Tally Prime Sync
- Background asynchronous queueing system.
- Formats physical stock movements into Tally-compliant XML payloads and syncs them automatically to bridge operations with financial accounting.

---

## 🛠️ Technical Architecture

- **Framework:** Next.js 15 (App Router) with React Server Components (RSC).
- **Styling:** Tailwind CSS v4 (configured via `@tailwindcss/postcss`) with CSS Modules.
- **Database ORM:** Prisma ORM.
- **Database:** PostgreSQL (Cloud/Local).
- **Build Engine:** Turbopack for ultra-fast local development.

---

## 💻 Getting Started (Local Development)

### 1. Clone the repository
```bash
git clone https://github.com/vishalkumar-swe/Margix-IMS.git
cd Margix-IMS
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Database
Ensure you have a PostgreSQL database running. Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/margixdb"
```

### 4. Push Schema & Seed Data
Push the Prisma schema to your database and seed it with dummy Suppliers, SKUs, Godowns, and ledgers to start testing immediately:
```bash
npx prisma db push
node prisma/seed.js
```

### 5. Run the Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000` to interact with the Margix Dashboard!

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/vishalkumar-swe/Margix-IMS/issues).

## 📄 License
This project is licensed under the MIT License.
