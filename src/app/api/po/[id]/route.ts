import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        createdBy: true,
        items: {
          include: {
            sku: {
              include: {
                baseUom: true,
                category: true,
              }
            }
          }
        },
      },
    });

    if (!po) {
      return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
    }

    // We also need to find out how much has already been received for this PO.
    // Received quantities are logged in the InventoryLedger with referenceType = 'PO' and referenceId = PO.id
    // But since the GRN might be against a specific item, the ledger currently only stores skuId.
    // Let's aggregate the received quantities for each SKU in this PO.
    const receipts = await prisma.inventoryLedger.findMany({
      where: {
        referenceType: 'PO',
        referenceId: id,
        movementType: 'INWARD',
      },
    });

    // Map received quantities by SKU
    const receivedBySku: Record<string, number> = {};
    for (const r of receipts) {
      receivedBySku[r.skuId] = (receivedBySku[r.skuId] || 0) + r.quantity;
    }

    return NextResponse.json({
      po,
      receivedBySku,
    });
  } catch (error) {
    console.error('Failed to fetch PO details:', error);
    return NextResponse.json({ error: 'Failed to fetch PO details' }, { status: 500 });
  }
}
