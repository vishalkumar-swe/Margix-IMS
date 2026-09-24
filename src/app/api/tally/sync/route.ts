import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { pushToTally } from '@/lib/tally/client';

export async function POST(request: Request) {
  try {
    // 1. Fetch pending or failed entries, excluding Margix-only godowns (#36)
    const pendingEntries = await prisma.inventoryLedger.findMany({
      where: {
        syncStatus: { in: ['PENDING', 'FAILED'] },
        godown: {
          isPactleOnly: false, // Only fetch godowns mapped to Tally
        },
      },
      include: {
        godown: true,
        sku: true,
      },
      orderBy: { createdAt: 'asc' }, // Process in chronological order
      take: 50, // Batch size
    });

    if (pendingEntries.length === 0) {
      return NextResponse.json({ message: 'No entries to sync' }, { status: 200 });
    }

    const results = {
      successCount: 0,
      failedCount: 0,
      processedIds: [] as string[],
    };

    // 2. Process queue
    for (const entry of pendingEntries) {
      const tallyResponse = await pushToTally(entry);

      if (tallyResponse.success) {
        await prisma.inventoryLedger.update({
          where: { id: entry.id },
          data: {
            syncStatus: 'SYNCED',
            syncError: null,
          },
        });
        results.successCount++;
      } else {
        await prisma.inventoryLedger.update({
          where: { id: entry.id },
          data: {
            syncStatus: 'FAILED',
            syncError: tallyResponse.error,
          },
        });
        results.failedCount++;
      }
      results.processedIds.push(entry.id);
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('Failed to run Tally sync job:', error);
    return NextResponse.json({ error: 'Failed to run Tally sync job' }, { status: 500 });
  }
}
