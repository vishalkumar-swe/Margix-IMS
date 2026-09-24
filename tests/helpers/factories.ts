import type { Godown, RoleCode, Sku, User } from "@prisma/client";
import type { Actor } from "@/server/actor";
import { prisma } from "@/server/db/client";

let counter = 0;
const nextId = () => String(++counter).padStart(4, "0");

/** Placeholder hash for tests that never log in. Auth tests create real hashes. */
const UNUSABLE_PASSWORD_HASH = "test$unusable";

export async function createUser(
  role: RoleCode = "ADMIN",
  overrides: Partial<Pick<User, "name" | "email" | "passwordHash" | "isActive">> = {},
): Promise<User & { role: { code: RoleCode } }> {
  const roleRow = await prisma.role.upsert({
    where: { code: role },
    update: {},
    create: { code: role, name: role },
  });
  const id = nextId();
  return prisma.user.create({
    data: {
      name: overrides.name ?? `${role} user ${id}`,
      email: overrides.email ?? `${role.toLowerCase()}.${id}@test.local`,
      passwordHash: overrides.passwordHash ?? UNUSABLE_PASSWORD_HASH,
      isActive: overrides.isActive ?? true,
      roleId: roleRow.id,
    },
    include: { role: { select: { code: true } } },
  });
}

export function actorFor(user: User & { role: { code: RoleCode } }): Actor {
  return { userId: user.id, role: user.role.code, requestId: "test" };
}

export async function createGodown(overrides: Partial<Pick<Godown, "code" | "name" | "tallySyncEnabled">> = {}) {
  const id = nextId();
  return prisma.godown.create({
    data: {
      code: overrides.code ?? `G${id}`,
      name: overrides.name ?? `Godown ${id}`,
      tallySyncEnabled: overrides.tallySyncEnabled ?? true,
    },
  });
}

export async function createUom(code = "KG", decimalPlaces = 3) {
  return prisma.uom.upsert({
    where: { code },
    update: {},
    create: { code, name: code, decimalPlaces },
  });
}

export async function createSku(
  overrides: Partial<Pick<Sku, "code" | "name" | "isBatchTracked" | "status">> & { uomCode?: string } = {},
) {
  const uom = await createUom(overrides.uomCode ?? "KG", overrides.uomCode === "PCS" ? 0 : 3);
  const id = nextId();
  return prisma.sku.create({
    data: {
      code: overrides.code ?? `RM-${id}`,
      name: overrides.name ?? `Material ${id}`,
      isBatchTracked: overrides.isBatchTracked ?? true,
      status: overrides.status ?? "ACTIVE",
      baseUomId: uom.id,
    },
  });
}

export async function createBatch(skuId: string, batchNumber = `B-${nextId()}`) {
  return prisma.batch.create({ data: { skuId, batchNumber } });
}

export async function createSupplier() {
  const id = nextId();
  return prisma.supplier.create({ data: { code: `SUP-${id}`, name: `Supplier ${id}` } });
}

export async function createCustomer() {
  const id = nextId();
  return prisma.customer.create({ data: { code: `CUS-${id}`, name: `Customer ${id}` } });
}
