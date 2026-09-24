import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const adjustments = await prisma.adjustmentRequest.findMany({
      include: {
        godown: true,
        submittedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // We also need to manually fetch SKUs because of the loosely-coupled 'skuId' string in this MVP schema.
    const skuIds = adjustments.map(a => a.skuId).filter(id => id) as string[];
    const skus = await prisma.sKU.findMany({ where: { id: { in: skuIds } } });
    const skuMap = skus.reduce((acc, sku) => {
      acc[sku.id] = sku;
      return acc;
    }, {} as Record<string, any>);

    const enriched = adjustments.map(a => ({
      ...a,
      sku: a.skuId ? skuMap[a.skuId] : null,
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch adjustments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { godownId, skuId, quantity, reasonCode, reason } = body;

    if (!godownId || !skuId || !quantity || !reasonCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const adjustmentNumber = `ADJ-${new Date().getTime()}`;

    const adjustment = await prisma.adjustmentRequest.create({
      data: {
        adjustmentNumber,
        godownId,
        skuId,
        quantity: parseFloat(quantity),
        reasonCode,
        reason,
        status: 'SUBMITTED', // Straight to submitted for MVP
      }
    });

    return NextResponse.json(adjustment, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create adjustment' }, { status: 500 });
  }
}
