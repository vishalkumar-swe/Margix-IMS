import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const pos = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        createdBy: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(pos);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch POs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { supplierId, items } = body; 
    // items should be an array of { skuId, orderedQty, rate }

    if (!supplierId || !items || !items.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Default admin user for demo
    const adminUser = await prisma.user.findFirst({
      where: { role: { name: 'ADMIN' } }
    });

    if (!adminUser) {
      return NextResponse.json({ error: 'System error: no admin user found' }, { status: 500 });
    }

    const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newPo = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        createdById: adminUser.id,
        status: 'OPEN',
        items: {
          create: items.map((item: any) => ({
            skuId: item.skuId,
            orderedQty: parseFloat(item.orderedQty),
            rate: parseFloat(item.rate || 0),
          }))
        }
      },
      include: {
        items: true
      }
    });

    return NextResponse.json(newPo, { status: 201 });
  } catch (error) {
    console.error('Failed to create PO:', error);
    return NextResponse.json({ error: 'Failed to create PO' }, { status: 500 });
  }
}
