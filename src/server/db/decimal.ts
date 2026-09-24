import { Prisma } from "@prisma/client";

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

export const ZERO = new Prisma.Decimal(0);

/** Converts user/DB input to an exact Decimal. Never goes through a float for strings. */
export function toDecimal(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function isDecimal(value: unknown): value is Prisma.Decimal {
  return Prisma.Decimal.isDecimal(value);
}
