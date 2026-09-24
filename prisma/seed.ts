/**
 * Idempotent seed: safe to run any number of times.
 * - Master data is upserted by natural key.
 * - Stock is posted through the real services with fixed idempotency keys,
 *   so the ledger and stock_balance always agree.
 */
import { PrismaClient, type RoleCode } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/permissions";
import { todayIst } from "@/lib/dates";
import type { Actor } from "@/server/actor";
import { hashPassword } from "@/server/auth/password";
import { postOpeningBalance } from "@/server/modules/opening/opening.service";
import { createPurchaseOrder } from "@/server/modules/purchasing/purchase-order.service";

const prisma = new PrismaClient();

const OPENING_KEY = "6d3f0c1e-5b1a-4f37-9d2e-0a1b2c3d4e01";
const PO_KEY = "6d3f0c1e-5b1a-4f37-9d2e-0a1b2c3d4e02";
const DEMO_PASSWORD = "Margix@2026";

const DEMO_USERS: { email: string; name: string; role: RoleCode }[] = [
  { email: "manager@margix.local", name: "Store Manager", role: "STORE_MANAGER" },
  { email: "operator@margix.local", name: "Warehouse Operator", role: "WAREHOUSE_OPERATOR" },
  { email: "accounts@margix.local", name: "Accounts", role: "ACCOUNTS" },
  { email: "management@margix.local", name: "Management", role: "MANAGEMENT" },
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding.");
  }
  const seedDemoUsers = process.env.SEED_DEMO_USERS === "true" && process.env.NODE_ENV !== "production";

  // ---- Roles & users ----
  const roles = new Map<RoleCode, string>();
  for (const code of Object.keys(ROLE_LABELS) as RoleCode[]) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_LABELS[code] },
      create: { code, name: ROLE_LABELS[code] },
    });
    roles.set(code, role.id);
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "System Administrator",
      roleId: roles.get("ADMIN")!,
      passwordHash: await hashPassword(adminPassword),
      passwordChangedAt: new Date(),
    },
  });
  const actor: Actor = { userId: admin.id, role: "ADMIN", requestId: "seed" };

  if (seedDemoUsers) {
    const demoHash = await hashPassword(DEMO_PASSWORD);
    for (const { email, name, role } of DEMO_USERS) {
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name, roleId: roles.get(role)!, passwordHash: demoHash },
      });
    }
  }

  // ---- Master data ----
  const kg = await prisma.uom.upsert({
    where: { code: "KG" },
    update: {},
    create: { code: "KG", name: "Kilogram", decimalPlaces: 3 },
  });
  const pcs = await prisma.uom.upsert({
    where: { code: "PCS" },
    update: {},
    create: { code: "PCS", name: "Pieces", decimalPlaces: 0 },
  });
  await prisma.uom.upsert({ where: { code: "BOX" }, update: {}, create: { code: "BOX", name: "Box", decimalPlaces: 0 } });

  const rawMaterials = await prisma.category.upsert({
    where: { name: "Raw Materials" },
    update: {},
    create: { name: "Raw Materials" },
  });
  const finishedGoods = await prisma.category.upsert({
    where: { name: "Finished Goods" },
    update: {},
    create: { name: "Finished Goods" },
  });
  const packaging = await prisma.category.upsert({
    where: { name: "Packaging" },
    update: {},
    create: { name: "Packaging" },
  });

  const mainWarehouse = await prisma.godown.upsert({
    where: { code: "G001" },
    update: {},
    create: { code: "G001", name: "Main Warehouse", tallyGodownName: "Main Location" },
  });
  await prisma.godown.upsert({
    where: { code: "G002" },
    update: {},
    create: { code: "G002", name: "Raw Material Store", tallyGodownName: "RM Store" },
  });
  await prisma.godown.upsert({
    where: { code: "G003" },
    update: {},
    create: { code: "G003", name: "Quarantine Area", tallySyncEnabled: false },
  });

  const supplier = await prisma.supplier.upsert({
    where: { code: "SUP-001" },
    update: {},
    create: { code: "SUP-001", name: "Global Polymers Pvt Ltd", gstin: "27AAACG1234F1Z5" },
  });
  await prisma.customer.upsert({
    where: { code: "CUS-001" },
    update: {},
    create: { code: "CUS-001", name: "Retail Chain India Ltd", gstin: "29AABCR5678K1Z2" },
  });

  const resin = await prisma.sku.upsert({
    where: { code: "RM-001" },
    update: {},
    create: {
      code: "RM-001",
      name: "Premium Polymer Resin",
      categoryId: rawMaterials.id,
      baseUomId: kg.id,
      hsnCode: "3901",
      gstRate: "18",
      tallyStockItemName: "Premium Polymer Resin",
    },
  });
  const bottle = await prisma.sku.upsert({
    where: { code: "FG-001" },
    update: {},
    create: {
      code: "FG-001",
      name: "Molded Bottle 500ml",
      categoryId: finishedGoods.id,
      baseUomId: pcs.id,
      hsnCode: "3923",
      gstRate: "18",
      tallyStockItemName: "Molded Bottle 500ml",
    },
  });
  const carton = await prisma.sku.upsert({
    where: { code: "PK-001" },
    update: {},
    create: {
      code: "PK-001",
      name: "Shipping Carton (Large)",
      categoryId: packaging.id,
      baseUomId: pcs.id,
      isBatchTracked: false,
      tallyStockItemName: "Shipping Carton Large",
    },
  });

  // ---- Opening stock & a purchase order (idempotent via fixed keys) ----
  await postOpeningBalance(actor, {
    godownId: mainWarehouse.id,
    asOf: "2026-04-01",
    remarks: "Go-live opening balances",
    idempotencyKey: OPENING_KEY,
    items: [
      { skuId: resin.id, batchNumber: "B-100", expiryDate: "2027-03-31", quantity: "500" },
      { skuId: bottle.id, batchNumber: "FG-2609", quantity: "1200" },
      { skuId: carton.id, quantity: "300" },
    ],
  });

  await createPurchaseOrder(actor, {
    supplierId: supplier.id,
    orderDate: todayIst(),
    submit: true,
    idempotencyKey: PO_KEY,
    remarks: "Monthly resin replenishment",
    items: [{ skuId: resin.id, orderedQty: "1000", rate: "145.50", gstRate: "18" }],
  });

  console.log(`Seed complete. Admin: ${adminEmail}`);
  if (seedDemoUsers) {
    console.log(`Demo users (password "${DEMO_PASSWORD}"): ${DEMO_USERS.map((u) => u.email).join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
