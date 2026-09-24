import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: poId } = await params;
    const body = await request.json();
    const { receivedItems, godownId, actor } = body; 
    // receivedItems = [{ skuId, quantity, batchNumber, expiryDate }]

    if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
      return NextResponse.json({ error: 'No items provided for receipt' }, { status: 400 });
    }

    if (!godownId) {
      return NextResponse.json({ error: 'Godown destination is required' }, { status: 400 });
    }

    // 1. Fetch the PO
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });

    if (!po) {
      return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
    }

    if (po.status === 'FULLY_RECEIVED') {
      return NextResponse.json({ error: 'Purchase Order is already fully received' }, { status: 400 });
    }

    // 2. Fetch existing receipts to calculate if it's partially or fully received after this
    const existingReceipts = await prisma.inventoryLedger.findMany({
      where: { referenceType: 'PO', referenceId: poId, movementType: 'INWARD' },
    });

    const receivedBySku: Record<string, number> = {};
    for (const r of existingReceipts) {
      receivedBySku[r.skuId] = (receivedBySku[r.skuId] || 0) + r.quantity;
    }

    // 3. Process each received item
    let allFullyReceived = true;

    // Use a transaction if possible, but for simplicity we'll do sequential awaits.
    for (const item of receivedItems) {
      if (item.quantity <= 0) continue;

      const poItem = po.items.find(i => i.skuId === item.skuId);
      if (!poItem) continue;

      // Create or find Batch
      let batch = null;
      if (item.batchNumber) {
        batch = await prisma.batch.findUnique({
          where: {
            skuId_batchNumber: {
              skuId: item.skuId,
              batchNumber: item.batchNumber,
            },
          },
        });

        if (!batch) {
          batch = await prisma.batch.create({
            data: {
              skuId: item.skuId,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            },
          });
        }
      }

      // Post the INWARD Ledger Entry
      await prisma.inventoryLedger.create({
        data: {
          skuId: item.skuId,
          godownId: godownId,
          batchId: batch ? batch.id : null,
          movementType: 'INWARD',
          quantity: item.quantity,
          referenceType: 'PO', // Pointing to the Purchase Order!
          referenceId: poId, 
          actor: actor || 'warehouse_user',
          syncStatus: 'PENDING',
        },
      });

      // Update calculations
      receivedBySku[item.skuId] = (receivedBySku[item.skuId] || 0) + item.quantity;
      
      if (receivedBySku[item.skuId] < poItem.orderedQty) {
        allFullyReceived = false;
      }
    }

    // Check if any other PO items are still under-received
    for (const poItem of po.items) {
      if ((receivedBySku[poItem.skuId] || 0) < poItem.orderedQty) {
        allFullyReceived = false;
      }
    }

    // 4. Update PO Status
    const newStatus = allFullyReceived ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: newStatus },
    });

    return NextResponse.json({ message: 'GRN Posted Successfully', status: newStatus }, { status: 201 });
  } catch (error) {
    console.error('Failed to post GRN:', error);
    return NextResponse.json({ error: 'Failed to post GRN' }, { status: 500 });
  }
}
