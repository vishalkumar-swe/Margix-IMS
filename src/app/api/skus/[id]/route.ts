import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getStockBreakdown } from '@/lib/inventory/stock';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sku = await prisma.sKU.findUnique({
      where: { id },
    });

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 });
    }

    // Include stock breakdown by godown as per PRD #5
    const stockBreakdown = await getStockBreakdown(id);

    return NextResponse.json({ ...sku, stock: stockBreakdown });
  } catch (error) {
    console.error('Failed to fetch SKU:', error);
    return NextResponse.json({ error: 'Failed to fetch SKU' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Allow updating status (e.g. Active -> Inactive) or conversion factor
    const { lifecycleStatus, name, conversionFactor } = body;
    
    // If trying to reactivate an ARCHIVED sku, block it.
    if (lifecycleStatus === 'ACTIVE') {
      const currentSku = await prisma.sKU.findUnique({ where: { id }});
      if (currentSku?.lifecycleStatus === 'ARCHIVED') {
        return NextResponse.json({ error: 'Cannot reactivate an ARCHIVED SKU per PRD #4' }, { status: 400 });
      }
    }

    const updatedSku = await prisma.sKU.update({
      where: { id },
      data: {
        ...(lifecycleStatus && { lifecycleStatus }),
        ...(name && { name }),
        ...(conversionFactor && { conversionFactor }),
      },
    });

    return NextResponse.json(updatedSku);
  } catch (error) {
    console.error('Failed to update SKU:', error);
    return NextResponse.json({ error: 'Failed to update SKU' }, { status: 500 });
  }
}

// DELETE maps to "ARCHIVED" state per PRD #4, rather than physical deletion
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const archivedSku = await prisma.sKU.update({
      where: { id },
      data: { lifecycleStatus: 'ARCHIVED' },
    });

    return NextResponse.json(archivedSku);
  } catch (error) {
    console.error('Failed to archive SKU:', error);
    return NextResponse.json({ error: 'Failed to archive SKU' }, { status: 500 });
  }
}
