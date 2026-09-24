import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { approvedBy } = body;

    if (!approvedBy) {
      return NextResponse.json({ error: 'Approver ID is required' }, { status: 400 });
    }

    const adjustmentReq = await prisma.adjustmentRequest.findUnique({
      where: { id },
    });

    if (!adjustmentReq || adjustmentReq.status !== 'SUBMITTED') {
      return NextResponse.json({ error: 'Invalid or already processed adjustment request' }, { status: 400 });
    }

    // Execute in a transaction to ensure both the request state and ledger are updated together
    const result = await prisma.$transaction(async (tx) => {
      // 1. Post to ledger
      const ledgerEntry = await tx.inventoryLedger.create({
        data: {
          skuId: adjustmentReq.skuId || '',
          godownId: adjustmentReq.godownId,
          movementType: 'ADJUSTMENT',
          quantity: Math.abs(adjustmentReq.quantity || 0),
          referenceType: 'ADJUSTMENT',
          referenceId: adjustmentReq.id,
          reasonCode: adjustmentReq.reasonCode,
          createdById: approvedBy,
          syncStatus: 'PENDING',
        },
      });

      // 2. Mark request as APPROVED
      const updatedReq = await tx.adjustmentRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: approvedBy,
          ledgerEntryId: ledgerEntry.id,
        },
      });

      return { ledgerEntry, updatedReq };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Failed to approve adjustment:', error);
    return NextResponse.json({ error: 'Failed to approve adjustment' }, { status: 500 });
  }
}
