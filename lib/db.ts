import { PrismaClient } from "@prisma/client";

const sqliteUrl = process.env.DATABASE_URL;
if (!sqliteUrl?.startsWith("file:")) {
  console.warn(
    "DATABASE_URL is missing or invalid; falling back to the local SQLite database.",
  );
  process.env.DATABASE_URL = "file:./dev.db";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
// Prisma's generated delegates change when a new data model is introduced. During
// `next dev` hot reload, an older singleton can otherwise survive without the new
// delegate and make a route return an empty 500 response. Recreate it once here.
const existingPrisma = globalForPrisma.prisma;
export const db = existingPrisma && "imageExplodeRun" in existingPrisma ? existingPrisma : new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
