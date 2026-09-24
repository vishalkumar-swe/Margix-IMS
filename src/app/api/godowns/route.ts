import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const godowns = await prisma.godown.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(godowns);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch godowns' }, { status: 500 });
  }
}
