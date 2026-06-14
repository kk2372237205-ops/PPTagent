import { PrismaClient } from "@prisma/client";

const sqliteUrl = process.env.DATABASE_URL;
if (!sqliteUrl?.startsWith("file:")) {
  console.warn(
    "DATABASE_URL is missing or invalid; falling back to the local SQLite database.",
  );
  process.env.DATABASE_URL = "file:./dev.db";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
