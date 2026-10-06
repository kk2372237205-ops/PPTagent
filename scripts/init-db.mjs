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
  "customerInfo" TEXT NOT NULL DEFAULT '',
  "userId" TEXT NOT NULL,
  "consultationId" TEXT,
  "organizationId" TEXT,
  "assigneeId" TEXT,
  CONSTRAINT "Service_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "Service_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation" ("id") ON DELETE SET NULL,
  CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL,
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
  "username" TEXT UNIQUE,
  "passwordHash" TEXT,
  "passwordChangedAt" DATETIME,
  "phone" TEXT UNIQUE,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "corpId" TEXT NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "EmployeeMembership" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "identityProvider" TEXT NOT NULL DEFAULT 'wecom',
  "externalUserId" TEXT NOT NULL DEFAULT '',
  "unionId" TEXT NOT NULL DEFAULT '',
  "wecomUserId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "permissionsJson" TEXT NOT NULL DEFAULT '{}',
  "departmentIdsJson" TEXT NOT NULL DEFAULT '[]',
  "position" TEXT NOT NULL DEFAULT '',
  "avatarUrl" TEXT NOT NULL DEFAULT '',
  "lastLoginAt" DATETIME,
  "loginCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE,
  CONSTRAINT "EmployeeMembership_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE,
  UNIQUE("organizationId", "wecomUserId"),
  UNIQUE("organizationId", "identityProvider", "externalUserId"),
  UNIQUE("organizationId", "employeeId")
);
CREATE TABLE IF NOT EXISTS "ServiceCollaborator" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceCollaborator_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceCollaborator_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE,
  UNIQUE("serviceId", "employeeId")
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
  "membershipId" TEXT,
  CONSTRAINT "EmployeeSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE,
  CONSTRAINT "EmployeeSession_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "EmployeeMembership" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "EmployeeLoginEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeLoginEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE,
  CONSTRAINT "EmployeeLoginEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE
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
  "scope" TEXT NOT NULL DEFAULT 'personal',
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
  "generationMode" TEXT NOT NULL DEFAULT 'quick',
  "projectName" TEXT NOT NULL,
  "projectType" TEXT NOT NULL DEFAULT '',
  "brief" TEXT NOT NULL,
  "referenceText" TEXT NOT NULL DEFAULT '',
  "pageCount" INTEGER NOT NULL DEFAULT 12,
  "stylePack" TEXT NOT NULL,
  "paletteMode" TEXT NOT NULL DEFAULT 'preset',
  "paletteContractJson" TEXT NOT NULL DEFAULT '{}',
  "outlineInputJson" TEXT NOT NULL DEFAULT '{}',
  "analysisSummaryJson" TEXT NOT NULL DEFAULT '{}',
  "themeReferenceStoredName" TEXT,
  "sourceCount" INTEGER NOT NULL DEFAULT 0,
  "unityOptionsJson" TEXT NOT NULL DEFAULT '{}',
  "outlineJson" TEXT NOT NULL DEFAULT '{}',
  "visualIdentityJson" TEXT NOT NULL DEFAULT '{}',
  "visualStoryboardJson" TEXT NOT NULL DEFAULT '{}',
  "slideImageSpecsJson" TEXT NOT NULL DEFAULT '{}',
  "styleFingerprintJson" TEXT NOT NULL DEFAULT '{}',
  "styleStripStoredName" TEXT,
  "deckQualityStatus" TEXT NOT NULL DEFAULT 'pending',
  "deckQualityReportJson" TEXT NOT NULL DEFAULT '{}',
  "deckQualityAttempts" INTEGER NOT NULL DEFAULT 0,
  "initialImageBudget" INTEGER NOT NULL DEFAULT 0,
  "imageCallsStarted" INTEGER NOT NULL DEFAULT 0,
  "imageCallsCompleted" INTEGER NOT NULL DEFAULT 0,
  "manualImageCalls" INTEGER NOT NULL DEFAULT 0,
  "automaticRedraws" INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS "DeckGenerationSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL DEFAULT 'reference',
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL UNIQUE,
  "mimeType" TEXT NOT NULL DEFAULT '',
  "size" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "extractedText" TEXT NOT NULL DEFAULT '',
  "metadataJson" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "DeckGenerationSource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeckGenerationRun" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "DeckGenerationEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "locator" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "dataJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  CONSTRAINT "DeckGenerationEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeckGenerationRun" ("id") ON DELETE CASCADE,
  CONSTRAINT "DeckGenerationEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DeckGenerationSource" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "DeckGenerationVisualEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL DEFAULT 'context',
  "locator" TEXT NOT NULL DEFAULT '',
  "originalName" TEXT NOT NULL DEFAULT '',
  "storedName" TEXT NOT NULL UNIQUE,
  "thumbnailStoredName" TEXT NOT NULL UNIQUE,
  "mimeType" TEXT NOT NULL DEFAULT 'image/png',
  "width" INTEGER NOT NULL DEFAULT 0,
  "height" INTEGER NOT NULL DEFAULT 0,
  "size" INTEGER NOT NULL DEFAULT 0,
  "contentHash" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "usefulness" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  CONSTRAINT "DeckGenerationVisualEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeckGenerationRun" ("id") ON DELETE CASCADE,
  CONSTRAINT "DeckGenerationVisualEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DeckGenerationSource" ("id") ON DELETE CASCADE,
  UNIQUE("runId", "contentHash")
);
CREATE TABLE IF NOT EXISTS "DeckGenerationPagePlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pageIndex" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT 'content',
  "purpose" TEXT NOT NULL DEFAULT '',
  "blocksJson" TEXT NOT NULL DEFAULT '[]',
  "mustIncludeJson" TEXT NOT NULL DEFAULT '[]',
  "conclusion" TEXT NOT NULL DEFAULT '',
  "density" TEXT NOT NULL DEFAULT 'standard',
  "layoutType" TEXT NOT NULL DEFAULT 'auto',
  "constraintMode" TEXT NOT NULL DEFAULT 'polish',
  "evidenceJson" TEXT NOT NULL DEFAULT '[]',
  "visualEvidenceJson" TEXT NOT NULL DEFAULT '[]',
  "directorContractJson" TEXT NOT NULL DEFAULT '{}',
  "warningsJson" TEXT NOT NULL DEFAULT '[]',
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "DeckGenerationPagePlan_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeckGenerationRun" ("id") ON DELETE CASCADE,
  UNIQUE("runId", "pageIndex")
);
CREATE TABLE IF NOT EXISTS "DeckGenerationSlide" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slideIndex" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT '',
  "prompt" TEXT NOT NULL DEFAULT '',
  "specJson" TEXT NOT NULL DEFAULT '{}',
  "renderContractJson" TEXT NOT NULL DEFAULT '{}',
  "storedName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "qualityStatus" TEXT NOT NULL DEFAULT 'pending',
  "qualityReportJson" TEXT NOT NULL DEFAULT '{}',
  "qualityAttempts" INTEGER NOT NULL DEFAULT 0,
  "qualityCheckedAt" DATETIME,
  "error" TEXT,
  "regenerationCount" INTEGER NOT NULL DEFAULT 0,
  "lastInstruction" TEXT NOT NULL DEFAULT '',
  "pendingImageCallKey" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  CONSTRAINT "DeckGenerationSlide_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeckGenerationRun" ("id") ON DELETE CASCADE,
  UNIQUE("runId", "slideIndex")
);
CREATE TABLE IF NOT EXISTS "DeckGenerationImageCall" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestKey" TEXT NOT NULL UNIQUE,
  "kind" TEXT NOT NULL DEFAULT 'initial',
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "endpoint" TEXT NOT NULL DEFAULT '',
  "referenceCount" INTEGER NOT NULL DEFAULT 0,
  "transport" TEXT NOT NULL DEFAULT 'none',
  "error" TEXT,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runId" TEXT NOT NULL,
  "slideId" TEXT NOT NULL,
  CONSTRAINT "DeckGenerationImageCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeckGenerationRun" ("id") ON DELETE CASCADE,
  CONSTRAINT "DeckGenerationImageCall_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "DeckGenerationSlide" ("id") ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS "DeckGenerationSource_runId_kind_createdAt_idx" ON "DeckGenerationSource"("runId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "DeckGenerationEvidence_runId_sourceId_idx" ON "DeckGenerationEvidence"("runId", "sourceId");
CREATE INDEX IF NOT EXISTS "DeckGenerationVisualEvidence_runId_sourceId_usefulness_idx" ON "DeckGenerationVisualEvidence"("runId", "sourceId", "usefulness");
CREATE INDEX IF NOT EXISTS "DeckGenerationPagePlan_runId_pageIndex_idx" ON "DeckGenerationPagePlan"("runId", "pageIndex");
CREATE INDEX IF NOT EXISTS "DeckGenerationImageCall_runId_status_createdAt_idx" ON "DeckGenerationImageCall"("runId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "DeckGenerationImageCall_slideId_createdAt_idx" ON "DeckGenerationImageCall"("slideId", "createdAt");
CREATE INDEX IF NOT EXISTS "ImageExplodePart_runId_zIndex_idx" ON "ImageExplodePart"("runId", "zIndex");
CREATE INDEX IF NOT EXISTS "ImageExplodeTextLayer_runId_groupKey_createdAt_idx" ON "ImageExplodeTextLayer"("runId", "groupKey", "createdAt");
CREATE INDEX IF NOT EXISTS "ImageExplodeEvent_runId_createdAt_idx" ON "ImageExplodeEvent"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeMembership_organizationId_status_updatedAt_idx" ON "EmployeeMembership"("organizationId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "EmployeeMembership_employeeId_updatedAt_idx" ON "EmployeeMembership"("employeeId", "updatedAt");
CREATE INDEX IF NOT EXISTS "EmployeeLoginEvent_organizationId_createdAt_idx" ON "EmployeeLoginEvent"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeLoginEvent_employeeId_createdAt_idx" ON "EmployeeLoginEvent"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ServiceCollaborator_employeeId_updatedAt_idx" ON "ServiceCollaborator"("employeeId", "updatedAt");
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  }
}

ensureColumn("Message", "employeeId", "TEXT");
ensureColumn("Service", "assigneeId", "TEXT");
ensureColumn("Service", "organizationId", "TEXT");
ensureColumn("Service", "customerInfo", "TEXT NOT NULL DEFAULT ''");
db.exec(`
  UPDATE "Service"
  SET "customerInfo" = COALESCE((SELECT "phone" FROM "User" WHERE "User"."id" = "Service"."userId"), '')
  WHERE "customerInfo" = ''
`);
ensureColumn("EmployeeSession", "membershipId", "TEXT");
ensureColumn("Employee", "username", "TEXT");
ensureColumn("Employee", "passwordHash", "TEXT");
ensureColumn("Employee", "passwordChangedAt", "DATETIME");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "Employee_username_key" ON "Employee"("username") WHERE "username" IS NOT NULL');
ensureColumn("MaterialItem", "scope", "TEXT NOT NULL DEFAULT 'personal'");
ensureColumn("EmployeeMembership", "identityProvider", "TEXT NOT NULL DEFAULT 'wecom'");
ensureColumn("EmployeeMembership", "externalUserId", "TEXT NOT NULL DEFAULT ''");
ensureColumn("EmployeeMembership", "unionId", "TEXT NOT NULL DEFAULT ''");
db.exec(`
  UPDATE "EmployeeMembership"
  SET "externalUserId" = "wecomUserId"
  WHERE "externalUserId" = ''
`);
db.exec(`
  UPDATE "EmployeeMembership"
  SET "role" = 'member'
  WHERE "role" NOT IN ('platform_admin', 'member')
`);
db.exec(`
  UPDATE "Employee"
  SET "isAdmin" = EXISTS (
    SELECT 1 FROM "EmployeeMembership"
    WHERE "EmployeeMembership"."employeeId" = "Employee"."id"
      AND "EmployeeMembership"."role" = 'platform_admin'
  )
`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeMembership_organizationId_identityProvider_externalUserId_key" ON "EmployeeMembership"("organizationId", "identityProvider", "externalUserId")');
db.exec('CREATE INDEX IF NOT EXISTS "EmployeeMembership_identityProvider_unionId_idx" ON "EmployeeMembership"("identityProvider", "unionId")');
db.exec('CREATE INDEX IF NOT EXISTS "Service_organizationId_purchasedAt_idx" ON "Service"("organizationId", "purchasedAt")');
db.exec('CREATE INDEX IF NOT EXISTS "EmployeeSession_employeeId_expiresAt_idx" ON "EmployeeSession"("employeeId", "expiresAt")');
db.exec('CREATE INDEX IF NOT EXISTS "EmployeeSession_membershipId_expiresAt_idx" ON "EmployeeSession"("membershipId", "expiresAt")');
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
ensureColumn("DeckGenerationRun", "generationMode", "TEXT NOT NULL DEFAULT 'quick'");
ensureColumn("DeckGenerationRun", "referenceText", "TEXT NOT NULL DEFAULT ''");
ensureColumn("DeckGenerationRun", "paletteMode", "TEXT NOT NULL DEFAULT 'preset'");
ensureColumn("DeckGenerationRun", "paletteContractJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationRun", "outlineInputJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationRun", "analysisSummaryJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationRun", "themeReferenceStoredName", "TEXT");
ensureColumn("DeckGenerationRun", "sourceCount", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DeckGenerationRun", "pdfStoredName", "TEXT");
ensureColumn("DeckGenerationRun", "pptStoredName", "TEXT");
ensureColumn("DeckGenerationRun", "coverStoredName", "TEXT");
ensureColumn("DeckGenerationRun", "codiaTaskId", "TEXT");
ensureColumn("DeckGenerationRun", "codiaResponseJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationRun", "pptGeneratedAt", "DATETIME");
ensureColumn("DeckGenerationRun", "styleFingerprintJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationRun", "styleStripStoredName", "TEXT");
ensureColumn("DeckGenerationRun", "deckQualityStatus", "TEXT NOT NULL DEFAULT 'pending'");
ensureColumn("DeckGenerationRun", "deckQualityReportJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationRun", "deckQualityAttempts", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DeckGenerationRun", "initialImageBudget", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DeckGenerationRun", "imageCallsStarted", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DeckGenerationRun", "imageCallsCompleted", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DeckGenerationRun", "manualImageCalls", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DeckGenerationRun", "automaticRedraws", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DeckGenerationSlide", "lastInstruction", "TEXT NOT NULL DEFAULT ''");
ensureColumn("DeckGenerationSlide", "renderContractJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationSlide", "qualityStatus", "TEXT NOT NULL DEFAULT 'pending'");
ensureColumn("DeckGenerationSlide", "qualityReportJson", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("DeckGenerationSlide", "qualityAttempts", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("DeckGenerationSlide", "qualityCheckedAt", "DATETIME");
ensureColumn("DeckGenerationSlide", "pendingImageCallKey", "TEXT NOT NULL DEFAULT ''");
ensureColumn("DeckGenerationPagePlan", "visualEvidenceJson", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("DeckGenerationPagePlan", "directorContractJson", "TEXT NOT NULL DEFAULT '{}'");
db.exec('CREATE INDEX IF NOT EXISTS "ImageExplodePart_runId_groupKey_idx" ON "ImageExplodePart"("runId", "groupKey")');

db.close();
console.log("SQLite database initialized.");
