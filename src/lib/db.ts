import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const g = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  // Raise the transaction timeout above Prisma's 5s default: cross-region
  // dev DBs (e.g. Neon in another region) make a result-write + job-update
  // round-trip exceed 5s and abort. 30s gives ample headroom; self-hosted
  // local Postgres in prod completes these in milliseconds.
  return new PrismaClient({
    adapter,
    transactionOptions: { timeout: 30_000, maxWait: 15_000 },
  });
}

export const db = g.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") g.prisma = db;
