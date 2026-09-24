import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTotalTenantStock } from '@/lib/inventory/stock';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const companyId = searchParams.get('companyId');

    const where: any = {};
    if (status) where.lifecycleStatus = status;
    if (companyId) where.companyId = companyId;

    const skus = await prisma.sKU.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    // We shouldn't calculate total stock across tenant typically as per PRD #5
    // But for a master list, sometimes users want a quick glance. 
    // The PRD says "never a single tenant-wide number", so we'll just return the SKUs.
    return NextResponse.json(skus);
  } catch (error) {
    console.error('Failed to fetch SKUs:', error);
    return NextResponse.json({ error: 'Failed to fetch SKUs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productCode, name, companyId, conversionFactor } = body;

    if (!productCode || !name || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newSku = await prisma.sKU.create({
      data: {
        productCode,
        name,
        companyId,
        conversionFactor: conversionFactor || 1.0,
        lifecycleStatus: 'ACTIVE', // DRAFT, ACTIVE, INACTIVE, ARCHIVED (#4)
      },
    });

    return NextResponse.json(newSku, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create SKU:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Product Code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create SKU' }, { status: 500 });
  }
}
