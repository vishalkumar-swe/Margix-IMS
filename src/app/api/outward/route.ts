import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentBatchStock } from '@/lib/inventory/stock';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { skuId, godownId, quantity, referenceType, referenceId, actor, batchId } = body;

    if (!skuId || !godownId || !quantity || !actor || !referenceType || !batchId) {
      return NextResponse.json({ error: 'Missing required fields (including batchId)' }, { status: 400 });
    }

    if (quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be positive for OUTWARD' }, { status: 400 });
    }

    // Check if this outward will cause negative stock for this specific batch.
    const currentStock = await getCurrentBatchStock(batchId, godownId);
    if (currentStock - quantity < 0) {
      return NextResponse.json({ error: `Insufficient stock in batch. Available: ${currentStock}, Requested: ${quantity}` }, { status: 400 });
    }

    // Post the OUTWARD entry.
    const outwardEntry = await prisma.inventoryLedger.create({
      data: {
        skuId,
        godownId,
        batchId,
        movementType: 'OUTWARD',
        quantity: Number(quantity), // MUST BE POSITIVE in the new ledger
        referenceType,
        referenceId,
        actor,
        syncStatus: 'PENDING',
      },
    });

    return NextResponse.json({
      entry: outwardEntry,
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to post Outward:', error);
    return NextResponse.json({ error: 'Failed to post Outward' }, { status: 500 });
  }
}
