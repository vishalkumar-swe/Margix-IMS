import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: originalLedgerId } = await params;

    // 1. Fetch the original ledger entry
    const originalEntry = await prisma.inventoryLedger.findUnique({
      where: { id: originalLedgerId },
    });

    if (!originalEntry) {
      return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 });
    }

    if (originalEntry.movementType === 'REVERSAL') {
      return NextResponse.json({ error: 'Cannot reverse a reversal' }, { status: 400 });
    }

    if (originalEntry.movementType === 'OPENING') {
      return NextResponse.json({ error: 'Cannot reverse opening stock directly' }, { status: 400 });
    }

    // 2. Verify it hasn't already been reversed
    const existingReversal = await prisma.inventoryLedger.findFirst({
      where: {
        movementType: 'REVERSAL',
        referenceId: originalLedgerId,
      },
    });

    if (existingReversal) {
      return NextResponse.json({ error: 'Transaction has already been reversed' }, { status: 400 });
    }

    // 3. Post the Counter-Entry
    const reversalEntry = await prisma.inventoryLedger.create({
      data: {
        skuId: originalEntry.skuId,
        godownId: originalEntry.godownId,
        batchId: originalEntry.batchId,
        movementType: 'REVERSAL',
        quantity: originalEntry.quantity, // Keep absolute quantity
        referenceType: 'REVERSAL',
        referenceId: originalEntry.id, // Point to the original transaction ID
        reasonCode: originalEntry.movementType, // Store what we are reversing so the Stock API knows how to calculate it
        actor: 'warehouse_user', // Hardcoded for demo
        syncStatus: 'PENDING',
      },
    });

    return NextResponse.json(reversalEntry, { status: 201 });
  } catch (error) {
    console.error('Failed to post Reversal:', error);
    return NextResponse.json({ error: 'Failed to post Reversal' }, { status: 500 });
  }
}
