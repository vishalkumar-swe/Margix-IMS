import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { skuId, godownId, quantity, referenceId, referenceType, actor, batchNumber, manufacturingDate, expiryDate } = body;

    if (!skuId || !godownId || !quantity || !actor || !batchNumber) {
      return NextResponse.json({ error: 'Missing required fields (including batchNumber)' }, { status: 400 });
    }

    if (quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be positive for INWARD GRN' }, { status: 400 });
    }

    // 1. Upsert the Batch (A batch is unique per SKU)
    const batch = await prisma.batch.upsert({
      where: {
        skuId_batchNumber: { skuId, batchNumber }
      },
      update: {
        manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
      create: {
        skuId,
        batchNumber,
        manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      }
    });

    // 2. Post the Ledger Entry instantly — no approval step.
    const grnEntry = await prisma.inventoryLedger.create({
      data: {
        skuId,
        godownId,
        batchId: batch.id,
        movementType: referenceType === 'OPENING_STOCK' ? 'OPENING' : 'INWARD',
        quantity: Number(quantity), // MUST BE POSITIVE
        referenceType: referenceType || 'GRN',
        referenceId,
        actor,
        syncStatus: 'PENDING', // Queued for Tally sync (#30)
      },
    });

    return NextResponse.json(grnEntry, { status: 201 });
  } catch (error) {
    console.error('Failed to post GRN:', error);
    return NextResponse.json({ error: 'Failed to post GRN' }, { status: 500 });
  }
}
