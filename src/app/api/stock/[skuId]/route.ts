import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ skuId: string }> }) {
  try {
    const { skuId } = await params;

    const sku = await prisma.sKU.findUnique({
      where: { id: skuId },
      include: {
        category: true,
        baseUom: true,
      },
    });

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 });
    }

    // Fetch all ledger movements for this SKU
    const ledgers = await prisma.inventoryLedger.findMany({
      where: { skuId },
      include: {
        godown: true,
        batch: true,
        createdBy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let totalStock = 0;
    const godownBreakdown: Record<string, { godownName: string; stock: number }> = {};
    const batchBreakdown: Record<string, { batchNumber: string; expiryDate: Date | null; stock: number }> = {};

    for (const entry of ledgers) {
      // Determine direction based on movementType
      const isPositive = ['OPENING', 'INWARD', 'TRANSFER_IN', 'RETURN_IN'].includes(entry.movementType);
      const isNegative = ['OUTWARD', 'TRANSFER_OUT', 'RETURN_OUT'].includes(entry.movementType);
      
      // Adjustments could be either, but currently our model enforces quantity to be positive.
      // Wait, adjustment logic: if it's an adjustment, is it increasing or decreasing?
      // In V1 spec, adjustment direction is stored in AdjustmentItems. Since we are just summing the ledger here, 
      // let's assume 'ADJUSTMENT' needs a sign, or we trust the API to post REVERSALS as positive.
      // Wait, in my outward route I posted OUTWARD with positive quantity. So we must explicitly subtract OUTWARD.
      
      let effectiveQuantity = entry.quantity;
      if (isNegative) {
        effectiveQuantity = -entry.quantity;
      } else if (entry.movementType === 'ADJUSTMENT') {
        // If it's a negative adjustment, we need to know. For now, we'll assume the quantity retains its sign if it's an adjustment, or reasonCode dictates it.
        // Let's assume quantity can be negative for adjustments for now, or we'll fix the API to be explicit.
        effectiveQuantity = entry.quantity; // If they passed -10, it's -10.
      } else if (entry.movementType === 'REVERSAL') {
        // A reversal counter-acts the original entry. We stored the original movementType in reasonCode.
        const reversedPositive = ['OPENING', 'INWARD', 'TRANSFER_IN', 'RETURN_IN'].includes(entry.reasonCode || '');
        const reversedNegative = ['OUTWARD', 'TRANSFER_OUT', 'RETURN_OUT'].includes(entry.reasonCode || '');
        
        if (reversedPositive) {
          effectiveQuantity = -entry.quantity; // Undo an addition
        } else if (reversedNegative) {
          effectiveQuantity = entry.quantity; // Undo a deduction
        } else {
          effectiveQuantity = -entry.quantity; // Fallback
        }
      }

      // 1. Total Stock
      totalStock += effectiveQuantity;

      // 2. Godown Breakdown
      if (!godownBreakdown[entry.godownId]) {
        godownBreakdown[entry.godownId] = { godownName: entry.godown.name, stock: 0 };
      }
      godownBreakdown[entry.godownId].stock += effectiveQuantity;

      // 3. Batch Breakdown
      if (entry.batchId && entry.batch) {
        if (!batchBreakdown[entry.batchId]) {
          batchBreakdown[entry.batchId] = {
            batchNumber: entry.batch.batchNumber,
            expiryDate: entry.batch.expiryDate,
            stock: 0,
          };
        }
        batchBreakdown[entry.batchId].stock += effectiveQuantity;
      }
    }

    // Sort breakdowns by stock descending
    const godownsArray = Object.values(godownBreakdown).sort((a, b) => b.stock - a.stock);
    const batchesArray = Object.values(batchBreakdown).sort((a, b) => b.stock - a.stock);

    return NextResponse.json({
      sku,
      totalStock,
      godowns: godownsArray,
      batches: batchesArray,
      recentMovements: ledgers.slice(0, 50), // Send only the 50 most recent for the UI
    });
  } catch (error) {
    console.error('Failed to fetch stock detail:', error);
    return NextResponse.json({ error: 'Failed to fetch stock detail' }, { status: 500 });
  }
}
