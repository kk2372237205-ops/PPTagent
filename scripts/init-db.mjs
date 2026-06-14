import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("prisma", { recursive: true });
const db = new DatabaseSync("prisma/dev.db");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(`
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "phone" TEXT NOT NULL UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "animationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "notifications" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS "VerificationCode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "ip" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VerificationCode_phone_createdAt_idx" ON "VerificationCode"("phone", "createdAt");
CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "deviceLabel" TEXT NOT NULL,
  "ip" TEXT,
  "remember" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Consultation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" TEXT NOT NULL UNIQUE,
  "budget" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT '等待人工客服',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "Consultation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "role" TEXT NOT NULL DEFAULT 'customer',
  "content" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consultationId" TEXT NOT NULL,
  "employeeId" TEXT,
  CONSTRAINT "Message_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE CASCADE,
  CONSTRAINT "Message_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "Service" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "purchasedAt" DATETIME NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "progress" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "consultationId" TEXT,
  "assigneeId" TEXT,
  CONSTRAINT "Service_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "Service_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE SET NULL,
  CONSTRAINT "Service_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee" ("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "DeliveryVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  CONSTRAINT "DeliveryVersion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  UNIQUE("serviceId", "version")
);
CREATE TABLE IF NOT EXISTS "Attachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL UNIQUE,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "messageId" TEXT,
  "versionId" TEXT,
  CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE,
  CONSTRAINT "Attachment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DeliveryVersion" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "RevisionRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT '待处理',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "consultationId" TEXT NOT NULL,
  CONSTRAINT "RevisionRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "RevisionRequest_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL UNIQUE,
  CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "Asset_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "phone" TEXT UNIQUE,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "EmployeeSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "deviceLabel" TEXT NOT NULL,
  "ip" TEXT,
  "remember" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "employeeId" TEXT NOT NULL,
  CONSTRAINT "EmployeeSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "WorkDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL UNIQUE,
  "fileType" TEXT NOT NULL DEFAULT 'pptx',
  "documentKey" TEXT NOT NULL UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "serviceId" TEXT NOT NULL UNIQUE,
  CONSTRAINT "WorkDocument_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "WorkVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "storedName" TEXT NOT NULL UNIQUE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "workDocumentId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "WorkVersion_workDocumentId_fkey" FOREIGN KEY ("workDocumentId") REFERENCES "WorkDocument" ("id") ON DELETE CASCADE,
  CONSTRAINT "WorkVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee" ("id") ON DELETE RESTRICT,
  UNIQUE("workDocumentId", "version")
);
CREATE TABLE IF NOT EXISTS "ServiceActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "action" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  CONSTRAINT "ServiceActivity_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceActivity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "GenerationJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "prompt" TEXT NOT NULL,
  "referenceStoredName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  CONSTRAINT "GenerationJob_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "GenerationJob_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "GeneratedImage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storedName" TEXT NOT NULL UNIQUE,
  "originalUrl" TEXT,
  "isMaterial" BOOLEAN NOT NULL DEFAULT false,
  "materialOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "jobId" TEXT NOT NULL,
  CONSTRAINT "GeneratedImage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob" ("id") ON DELETE CASCADE
);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  }
}

ensureColumn("Message", "employeeId", "TEXT");
ensureColumn("Service", "assigneeId", "TEXT");

const admins = db.prepare(`
  SELECT "id", "code" FROM "Employee"
  WHERE "isAdmin" = true
  ORDER BY "createdAt" ASC
`).all();
if (admins.length) {
  const canonicalId = admins[0].id;
  for (const duplicate of admins.slice(1)) {
    db.prepare(`UPDATE "EmployeeSession" SET "employeeId" = ? WHERE "employeeId" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`UPDATE "Service" SET "assigneeId" = ? WHERE "assigneeId" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`UPDATE "Message" SET "employeeId" = ? WHERE "employeeId" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`UPDATE "ServiceActivity" SET "employeeId" = ? WHERE "employeeId" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`UPDATE "WorkVersion" SET "createdById" = ? WHERE "createdById" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`UPDATE "GenerationJob" SET "employeeId" = ? WHERE "employeeId" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`DELETE FROM "Employee" WHERE "id" = ?`).run(duplicate.id);
  }
  db.prepare(`
    UPDATE "Employee"
    SET "code" = ?, "phone" = ?, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ?
  `).run("12345678", "15875754338", canonicalId);
}

db.close();
console.log("SQLite database initialized.");
