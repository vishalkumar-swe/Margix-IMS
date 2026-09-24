import { prisma } from "@/server/db/client";
import { userRefSelect } from "@/server/modules/users/users.queries";

export function listOpeningBalances() {
  return prisma.openingBalance.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      openingNumber: true,
      status: true,
      asOf: true,
      remarks: true,
      createdAt: true,
      godown: { select: { code: true, name: true } },
      createdBy: { select: userRefSelect },
      _count: { select: { items: true } },
    },
  });
}
