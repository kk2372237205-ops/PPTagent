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
  "selectedBudgets" TEXT NOT NULL DEFAULT '[]',
  "isCustomerGroup" BOOLEAN NOT NULL DEFAULT false,
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
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "model" TEXT NOT NULL DEFAULT '',
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
CREATE TABLE IF NOT EXISTS "AiConversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "summary" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  CONSTRAINT "AiConversation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "AiConversation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "AiMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'text',
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "conversationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id") ON DELETE CASCADE,
  CONSTRAINT "AiMessage_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "MaterialItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "materialOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "imageId" TEXT NOT NULL,
  CONSTRAINT "MaterialItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "MaterialItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE,
  CONSTRAINT "MaterialItem_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "GeneratedImage" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "DesignAgentRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "generationMode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "brief" TEXT NOT NULL,
  "visionReport" TEXT NOT NULL DEFAULT '{}',
  "layoutPlan" TEXT NOT NULL DEFAULT '{}',
  "designIntent" TEXT NOT NULL DEFAULT '{}',
  "workflowState" TEXT NOT NULL DEFAULT 'queued',
  "qualityMode" TEXT NOT NULL DEFAULT 'standard',
  "generationAttempts" INTEGER NOT NULL DEFAULT 0,
  "generationBudget" INTEGER NOT NULL DEFAULT 2,
  "evaluationAttempts" INTEGER NOT NULL DEFAULT 0,
  "selectedImageId" TEXT,
  "visualPrompt" TEXT NOT NULL DEFAULT '',
  "error" TEXT,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "appliedAt" DATETIME,
  "appliedSlideNumber" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "generatedJobId" TEXT UNIQUE,
  CONSTRAINT "DesignAgentRun_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "DesignAgentRun_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE,
  CONSTRAINT "DesignAgentRun_generatedJobId_fkey" FOREIGN KEY ("generatedJobId") REFERENCES "GenerationJob" ("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "DesignAgentReference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "storedName" TEXT,
  "generatedImageId" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "DesignAgentReference_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DesignAgentRun" ("id") ON DELETE CASCADE,
  CONSTRAINT "DesignAgentReference_generatedImageId_fkey" FOREIGN KEY ("generatedImageId") REFERENCES "GeneratedImage" ("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "DesignAgentEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "DesignAgentEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DesignAgentRun" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "DesignAgentEvaluation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "totalScore" REAL NOT NULL DEFAULT 0,
  "scoresJson" TEXT NOT NULL DEFAULT '{}',
  "reasonsJson" TEXT NOT NULL DEFAULT '[]',
  "candidateId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "DesignAgentEvaluation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DesignAgentRun"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "DesignPreferenceMemory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "industry" TEXT NOT NULL DEFAULT '',
  "pageType" TEXT NOT NULL DEFAULT 'single-slide',
  "style" TEXT NOT NULL DEFAULT '',
  "paletteJson" TEXT NOT NULL DEFAULT '[]',
  "informationTone" TEXT NOT NULL DEFAULT 'balanced',
  "outcome" TEXT NOT NULL DEFAULT 'accepted',
  "signalsJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "ImageExplodeRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "sourceStoredName" TEXT,
  "sourceImageId" TEXT,
  "width" INTEGER NOT NULL DEFAULT 0,
  "height" INTEGER NOT NULL DEFAULT 0,
  "layerPlanJson" TEXT NOT NULL DEFAULT '{}',
  "qaReportJson" TEXT NOT NULL DEFAULT '{}',
  "reconstructionName" TEXT,
  "backgroundStrategy" TEXT NOT NULL DEFAULT 'local-mask-inpaint',
  "cloudCleanupUsed" BOOLEAN NOT NULL DEFAULT false,
  "recommendedPartIds" TEXT NOT NULL DEFAULT '[]',
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "error" TEXT,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "appliedAt" DATETIME,
  "appliedSlideNumber" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  CONSTRAINT "ImageExplodeRun_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "ImageExplodeRun_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE,
  CONSTRAINT "ImageExplodeRun_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "GeneratedImage" ("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "DeckGenerationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "projectName" TEXT NOT NULL,
  "projectType" TEXT NOT NULL DEFAULT '',
  "brief" TEXT NOT NULL,
  "pageCount" INTEGER NOT NULL DEFAULT 12,
  "stylePack" TEXT NOT NULL,
  "unityOptionsJson" TEXT NOT NULL DEFAULT '{}',
  "outlineJson" TEXT NOT NULL DEFAULT '{}',
  "visualIdentityJson" TEXT NOT NULL DEFAULT '{}',
  "visualStoryboardJson" TEXT NOT NULL DEFAULT '{}',
  "slideImageSpecsJson" TEXT NOT NULL DEFAULT '{}',
  "pdfStoredName" TEXT,
  "pptStoredName" TEXT,
  "coverStoredName" TEXT,
  "codiaTaskId" TEXT,
  "codiaResponseJson" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "startedAt" DATETIME,
  "planReadyAt" DATETIME,
  "confirmedAt" DATETIME,
  "finishedAt" DATETIME,
  "pdfGeneratedAt" DATETIME,
  "pptGeneratedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  CONSTRAINT "DeckGenerationRun_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "DeckGenerationRun_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "DeckGenerationSlide" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slideIndex" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT '',
  "prompt" TEXT NOT NULL DEFAULT '',
  "specJson" TEXT NOT NULL DEFAULT '{}',
  "storedName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "regenerationCount" INTEGER NOT NULL DEFAULT 0,
  "lastInstruction" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "DeckGenerationSlide_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeckGenerationRun" ("id") ON DELETE CASCADE,
  UNIQUE("runId", "slideIndex")
);
CREATE TABLE IF NOT EXISTS "ImageExplodePart" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "label" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "variant" TEXT NOT NULL DEFAULT 'semantic',
  "semanticId" TEXT NOT NULL DEFAULT '',
  "parentSemanticId" TEXT,
  "groupKey" TEXT,
  "storedName" TEXT,
  "refinedName" TEXT,
  "textContent" TEXT,
  "x" REAL NOT NULL,
  "y" REAL NOT NULL,
  "width" REAL NOT NULL,
  "height" REAL NOT NULL,
  "zIndex" INTEGER NOT NULL DEFAULT 0,
  "confidence" REAL NOT NULL DEFAULT 0,
  "maskQuality" REAL NOT NULL DEFAULT 0,
  "extractMode" TEXT NOT NULL DEFAULT 'local',
  "recommended" BOOLEAN NOT NULL DEFAULT false,
  "selected" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "ImageExplodePart_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImageExplodeRun" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "ImageExplodeTextLayer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "content" TEXT NOT NULL,
  "groupKey" TEXT,
  "x" REAL NOT NULL,
  "y" REAL NOT NULL,
  "width" REAL NOT NULL,
  "height" REAL NOT NULL,
  "rotation" REAL NOT NULL DEFAULT 0,
  "styleJson" TEXT NOT NULL DEFAULT '{}',
  "complexity" TEXT NOT NULL DEFAULT 'simple',
  "mode" TEXT NOT NULL DEFAULT 'native',
  "confidence" REAL NOT NULL DEFAULT 0,
  "ocrConfidence" REAL NOT NULL DEFAULT 0,
  "visionConfidence" REAL NOT NULL DEFAULT 0,
  "semanticRole" TEXT NOT NULL DEFAULT 'unknown',
  "selected" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "ImageExplodeTextLayer_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImageExplodeRun" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "ImageExplodeEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "ImageExplodeEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImageExplodeRun" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiConversation_serviceId_employeeId_key" ON "AiConversation"("serviceId", "employeeId");
CREATE INDEX IF NOT EXISTS "AiConversation_employeeId_updatedAt_idx" ON "AiConversation"("employeeId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialItem_employeeId_imageId_key" ON "MaterialItem"("employeeId", "imageId");
CREATE INDEX IF NOT EXISTS "MaterialItem_serviceId_employeeId_materialOrder_idx" ON "MaterialItem"("serviceId", "employeeId", "materialOrder");
CREATE INDEX IF NOT EXISTS "DesignAgentRun_employeeId_createdAt_idx" ON "DesignAgentRun"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "DesignAgentRun_serviceId_status_createdAt_idx" ON "DesignAgentRun"("serviceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "DesignAgentReference_runId_sortOrder_idx" ON "DesignAgentReference"("runId", "sortOrder");
CREATE INDEX IF NOT EXISTS "DesignAgentEvent_runId_createdAt_idx" ON "DesignAgentEvent"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "DesignAgentEvaluation_runId_createdAt_idx" ON "DesignAgentEvaluation"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "DesignPreferenceMemory_industry_pageType_createdAt_idx" ON "DesignPreferenceMemory"("industry", "pageType", "createdAt");
CREATE INDEX IF NOT EXISTS "DesignPreferenceMemory_serviceId_createdAt_idx" ON "DesignPreferenceMemory"("serviceId", "createdAt");
CREATE INDEX IF NOT EXISTS "ImageExplodeRun_employeeId_createdAt_idx" ON "ImageExplodeRun"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ImageExplodeRun_serviceId_status_createdAt_idx" ON "ImageExplodeRun"("serviceId", "status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ImageExplodeRun_sourceImageId_key" ON "ImageExplodeRun"("sourceImageId");
CREATE INDEX IF NOT EXISTS "DeckGenerationRun_employeeId_createdAt_idx" ON "DeckGenerationRun"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeckGenerationRun_serviceId_status_createdAt_idx" ON "DeckGenerationRun"("serviceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "DeckGenerationSlide_runId_slideIndex_idx" ON "DeckGenerationSlide"("runId", "slideIndex");
CREATE INDEX IF NOT EXISTS "ImageExplodePart_runId_zIndex_idx" ON "ImageExplodePart"("runId", "zIndex");
CREATE INDEX IF NOT EXISTS "ImageExplodeTextLayer_runId_groupKey_createdAt_idx" ON "ImageExplodeTextLayer"("runId", "groupKey", "createdAt");
CREATE INDEX IF NOT EXISTS "ImageExplodeEvent_runId_createdAt_idx" ON "ImageExplodeEvent"("runId", "createdAt");
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  }
}

ensureColumn("Message", "employeeId", "TEXT");
ensureColumn("Service", "assigneeId", "TEXT");
ensureColumn("Consultation", "selectedBudgets", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("Consultation", "isCustomerGroup", "BOOLEAN NOT NULL DEFAULT false");
ensureColumn("GenerationJob", "provider", "TEXT NOT NULL DEFAULT 'openai'");
ensureColumn("GenerationJob", "model", "TEXT NOT NULL DEFAULT ''");
ensureColumn("ImageExplodePart", "groupKey", "TEXT");
ensureColumn("ImageExplodeRun", "layerPlanJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("ImageExplodeRun", "qaReportJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("ImageExplodeRun", "reconstructionName", "TEXT");
ensureColumn("ImageExplodeRun", "backgroundStrategy", "TEXT NOT NULL DEFAULT 'local-mask-inpaint'");
ensureColumn("ImageExplodeRun", "cloudCleanupUsed", "BOOLEAN NOT NULL DEFAULT false");
ensureColumn("ImageExplodeRun", "recommendedPartIds", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("ImageExplodeRun", "needsReview", "BOOLEAN NOT NULL DEFAULT false");
ensureColumn("ImageExplodePart", "semanticId", "TEXT NOT NULL DEFAULT ''");
ensureColumn("ImageExplodePart", "parentSemanticId", "TEXT");
ensureColumn("ImageExplodePart", "maskQuality", "REAL NOT NULL DEFAULT 0");
ensureColumn("ImageExplodePart", "extractMode", "TEXT NOT NULL DEFAULT 'local'");
ensureColumn("ImageExplodePart", "recommended", "BOOLEAN NOT NULL DEFAULT false");
ensureColumn("ImageExplodeTextLayer", "ocrConfidence", "REAL NOT NULL DEFAULT 0");
ensureColumn("ImageExplodeTextLayer", "visionConfidence", "REAL NOT NULL DEFAULT 0");
ensureColumn("ImageExplodeTextLayer", "semanticRole", "TEXT NOT NULL DEFAULT 'unknown'");
ensureColumn("DesignAgentRun", "designIntent", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DesignAgentRun", "workflowState", "TEXT NOT NULL DEFAULT 'queued'");
ensureColumn("DesignAgentRun", "qualityMode", "TEXT NOT NULL DEFAULT 'standard'");
ensureColumn("DesignAgentRun", "generationAttempts", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DesignAgentRun", "generationBudget", "INTEGER NOT NULL DEFAULT 2");
ensureColumn("DesignAgentRun", "evaluationAttempts", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DesignAgentRun", "selectedImageId", "TEXT");
ensureColumn("DeckGenerationRun", "pdfStoredName", "TEXT");
ensureColumn("DeckGenerationRun", "pptStoredName", "TEXT");
ensureColumn("DeckGenerationRun", "coverStoredName", "TEXT");
ensureColumn("DeckGenerationRun", "codiaTaskId", "TEXT");
ensureColumn("DeckGenerationRun", "codiaResponseJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationRun", "pptGeneratedAt", "DATETIME");
ensureColumn("DeckGenerationSlide", "lastInstruction", "TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS "ImageExplodePart_runId_groupKey_idx" ON "ImageExplodePart"("runId", "groupKey")');

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
    db.prepare(`UPDATE "AiConversation" SET "employeeId" = ? WHERE "employeeId" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`UPDATE "AiMessage" SET "employeeId" = ? WHERE "employeeId" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`UPDATE "MaterialItem" SET "employeeId" = ? WHERE "employeeId" = ?`).run(canonicalId, duplicate.id);
    db.prepare(`UPDATE "DeckGenerationRun" SET "employeeId" = ? WHERE "employeeId" = ?`).run(canonicalId, duplicate.id);
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
