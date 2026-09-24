import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { approvedBy } = body; // 'approvedBy' used here for the actor who rejected it

    if (!approvedBy) {
      return NextResponse.json({ error: 'Rejector ID is required' }, { status: 400 });
    }

    const adjustmentReq = await prisma.adjustmentRequest.findUnique({
      where: { id },
    });

    if (!adjustmentReq || adjustmentReq.status !== 'SUBMITTED') {
      return NextResponse.json({ error: 'Invalid or already processed adjustment request' }, { status: 400 });
    }

    const updatedReq = await prisma.adjustmentRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy,
      },
    });

    return NextResponse.json(updatedReq, { status: 200 });
  } catch (error) {
    console.error('Failed to reject adjustment:', error);
    return NextResponse.json({ error: 'Failed to reject adjustment' }, { status: 500 });
  }
}
