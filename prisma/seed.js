const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Roles & Users
  const adminRole = await prisma.role.create({
    data: { name: 'ADMIN', permissions: { all: true } }
  });
  
  const managerRole = await prisma.role.create({
    data: { name: 'STORE_MANAGER', permissions: { inventory: true } }
  });
  
  const adminUser = await prisma.user.create({
    data: {
      name: 'System Admin',
      email: 'admin@margix.com',
      passwordHash: 'hashed_password_placeholder',
      roleId: adminRole.id
    }
  });

  // 2. Categories & UOMs
  const catRaw = await prisma.category.create({ data: { name: 'Raw Materials' } });
  const catFG = await prisma.category.create({ data: { name: 'Finished Goods' } });
  
  const uomKg = await prisma.uOM.create({ data: { code: 'KG', name: 'Kilogram' } });
  const uomPcs = await prisma.uOM.create({ data: { code: 'PCS', name: 'Pieces' } });

  // 3. Company & Godowns
  const company = await prisma.company.create({
    data: { name: 'Prudata India' }
  });

  const gwMain = await prisma.godown.create({
    data: { code: 'G001', name: 'Main Warehouse', companyId: company.id }
  });
  const gwRaw = await prisma.godown.create({
    data: { code: 'G002', name: 'Raw Material Store', companyId: company.id }
  });
  const gwFG = await prisma.godown.create({
    data: { code: 'G003', name: 'Finished Goods Warehouse', companyId: company.id }
  });

  // 4. Suppliers & Customers
  const supplier = await prisma.supplier.create({
    data: { supplierCode: 'SUP-001', name: 'Acme Steel Works' }
  });
  const customer = await prisma.customer.create({
    data: { customerCode: 'CUS-001', name: 'Global Retailers Inc' }
  });

  // 5. SKUs
  const rm1 = await prisma.sKU.create({
    data: { 
      productCode: 'RM-001', 
      name: 'Steel Sheet 5mm', 
      companyId: company.id,
      categoryId: catRaw.id,
      baseUomId: uomKg.id,
    }
  });
  
  const fg1 = await prisma.sKU.create({
    data: { 
      productCode: 'FG-001', 
      name: 'Steel Cabinet Model A', 
      companyId: company.id,
      categoryId: catFG.id,
      baseUomId: uomPcs.id,
    }
  });

  // 6. Batches
  const batch1 = await prisma.batch.create({
    data: {
      batchNumber: 'B-260923',
      skuId: rm1.id,
      manufacturingDate: new Date()
    }
  });

  // 7. Initial Ledger Entries
  await prisma.inventoryLedger.create({
    data: {
      skuId: rm1.id,
      godownId: gwRaw.id,
      batchId: batch1.id,
      movementType: 'OPENING',
      quantity: 500,
      referenceType: 'OPENING_BALANCE',
      referenceId: 'OPEN-001',
      createdById: adminUser.id,
      syncStatus: 'SYNCED',
    }
  });

  await prisma.inventoryLedger.create({
    data: {
      skuId: rm1.id,
      godownId: gwRaw.id,
      batchId: batch1.id,
      movementType: 'INWARD',
      quantity: 300,
      referenceType: 'GRN',
      referenceId: 'GRN-1002',
      createdById: adminUser.id,
      syncStatus: 'PENDING',
    }
  });
  
  await prisma.inventoryLedger.create({
    data: {
      skuId: rm1.id,
      godownId: gwRaw.id,
      batchId: batch1.id,
      movementType: 'OUTWARD',
      quantity: 50,
      referenceType: 'GST_INVOICE',
      referenceId: 'INV-3004',
      createdById: adminUser.id,
      syncStatus: 'FAILED',
      syncError: 'Tally Sync Timeout'
    }
  });

  // 8. Alerts & Rules
  await prisma.reorderRule.create({
    data: { skuId: rm1.id, godownId: gwRaw.id, reorderLevel: 150 }
  });

  // 7. Dummy Purchase Order
  const po1 = await prisma.purchaseOrder.create({
    data: {
      poNumber: 'PO-2026-0001',
      supplierId: supplier.id,
      createdById: adminUser.id,
      status: 'OPEN',
      items: {
        create: [
          {
            skuId: rm1.id,
            orderedQty: 1000,
            rate: 45.5,
          }
        ]
      }
    }
  });

  console.log('Database seeded with V1 Technical Architecture + PO!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
