import { afterAll, beforeEach } from "vitest";
import { prisma } from "@/server/db/client";
import { resetDatabase } from "./database";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
