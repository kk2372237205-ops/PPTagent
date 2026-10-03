/**
 * 员工工作台共享类型（主干层）
 *
 * 职责：集中定义员工端接口返回的数据结构，让从 employee-app.tsx 拆出的组件
 *       可以直接引用类型，而不必反向 import 主文件（避免循环依赖）。
 * 谁可以改：主干层；改动会影响多个组件，改完必须跑 `npm run verify`。
 * 依赖：无（纯类型）。
 * 被谁用：`components/employee-app.tsx` 与 `components/employee/**` 下的各模块。
 * 验证方式：`npm run verify`。
 *
 * 约定：字段与 `app/api/employee/**` 的返回结构保持一致；新增字段时先确认接口真的返回。
 */

export type EmployeeFeature =
  "orders" | "customerMessages" | "team" | "officeEditor" | "aiAssistant" |
  "smartPpt" | "materials" | "imageTools" | "exports";
export type EmployeePermissions = Record<EmployeeFeature, boolean>;
export type EmployeeMembership = {
  id: string; organizationId: string; identityProvider: string; externalUserId: string; unionId: string;
  role: string; status: string;
  permissionsJson: string; departmentIdsJson: string; position: string; avatarUrl: string;
  lastLoginAt?: string | null; loginCount?: number;
  organization: { id: string; name: string; slug: string };
};
export type Employee = {
  id: string; code: string; name: string; username?: string | null; hasPassword?: boolean; phone: string | null; isAdmin: boolean; enabled: boolean; createdAt: string;
  membership: EmployeeMembership;
  permissions: EmployeePermissions;
};
export type Attachment = { id: string; originalName: string; storedName?: string; size: number };
export type Message = {
  id: string; role: string; content: string; createdAt: string; attachments: Attachment[];
  employee?: { id: string; name: string } | null;
};
export type Consultation = {
  id: string; number: string; budget: string; selectedBudgets?: string; isCustomerGroup?: boolean; status: string; updatedAt: string;
  user: { phone: string }; services: { id: string; number: string; title: string }[]; messages: Message[];
};
export type GeneratedImage = {
  id: string; isMaterial: boolean; materialOrder: number; createdAt: string;
};
export type DeckGenerationSlide = {
  id: string; slideIndex: number; title: string; role: string; storedName?: string | null; status: string; error?: string | null;
  regenerationCount: number; updatedAt: string; specJson?: string; qualityStatus?: string; qualityReportJson?: string; qualityAttempts?: number;
};
export type DeckGenerationSource = {
  id: string; kind: string; originalName: string; storedName?: string | null; size: number; status: string; extractedText?: string; error?: string | null;
};
export type DeckPageBlock = {
  id: string; subtitle: string; instruction: string; constraintMode: "exact" | "polish" | "direction"; content?: string; evidenceIds?: string[];
};
export type DeckGenerationPagePlan = {
  id: string; pageIndex: number; title: string; role: string; purpose: string; blocksJson: string; mustIncludeJson: string;
  conclusion: string; density: "sparse" | "standard" | "compact"; layoutType: string; constraintMode: string;
  evidenceJson: string; visualEvidenceJson: string; directorContractJson: string; warningsJson: string; locked: boolean;
};
export type DeckVisualEvidence = {
  id: string; kind: string; file?: string; source?: string; locator?: string; description?: string; usefulness?: number;
};
export type DeckPageDraft = {
  pageIndex: number; title: string; role: string; purpose: string; blocks: DeckPageBlock[]; mustInclude: string[];
  conclusion: string; density: "sparse" | "standard" | "compact"; layoutType: string; constraintMode: string;
  evidence: { id?: string; file?: string; source?: string; locator?: string; content?: string }[];
  visualEvidence: DeckVisualEvidence[]; directorContract: Record<string, unknown>; warnings: string[]; locked: boolean;
};
export type DeckGenerationRun = {
  id: string; kind?: string; status: string; generationMode?: "quick" | "advanced"; projectName: string; projectType: string; brief: string; pageCount: number; stylePack: string;
  unityOptionsJson: string; outlineInputJson?: string; outlineJson: string; visualIdentityJson: string; visualStoryboardJson: string; slideImageSpecsJson: string;
  styleFingerprintJson?: string; deckQualityStatus?: string; deckQualityReportJson?: string; deckQualityAttempts?: number;
  initialImageBudget?: number; imageCallsStarted?: number; imageCallsCompleted?: number; manualImageCalls?: number; automaticRedraws?: number;
  referenceText?: string; paletteMode?: "preset" | "reference"; paletteContractJson?: string; analysisSummaryJson?: string; sourceCount?: number;
  pdfStoredName?: string | null; pptStoredName?: string | null; coverStoredName?: string | null; error?: string | null; createdAt: string; updatedAt: string;
  slides: DeckGenerationSlide[]; sources?: DeckGenerationSource[]; pagePlans?: DeckGenerationPagePlan[];
};
export type GenerationJob = {
  id: string; prompt: string; status: string; error?: string | null; createdAt: string; provider?: string; model?: string;
  employee: { id?: string; name: string }; images: GeneratedImage[];
};
export type MaterialImage = GeneratedImage & {
  job: GenerationJob;
};
export type MaterialItem = {
  id: string; materialOrder: number; scope?: "personal" | "project"; createdAt: string;
  employee: { id: string; name: string };
  image: MaterialImage;
};
export type AiMessage = {
  id: string; role: string; content: string; provider: string; model: string; createdAt: string;
};
export type AiModelOption = {
  id: string; provider: string; model: string; label: string; available: boolean; default?: boolean;
};
export type AiServiceHealth = {
  ok: boolean; configured: boolean; serviceName: string; baseUrl: string; model: string;
  proxyConfigured: boolean; error?: string; apiMode?: string; size?: string; supportsEdits?: boolean;
};
export type OpenAiHealth = { ok: boolean; error?: string; text?: AiServiceHealth; image?: AiServiceHealth };
export type TrackedImageJob = GenerationJob & { requestedAt?: string };
export type DesignAgentReference = { id: string; source: string; label: string; isPrimary: boolean; sortOrder: number; generatedImage?: GeneratedImage | null };
export type DesignAgentEvent = { id: string; stage: string; status: string; detail: string; createdAt: string };
export type DesignAgentEvaluation = { id: string; stage: string; status: string; totalScore: number; scoresJson: string; reasonsJson: string; candidateId?: string | null; createdAt: string };
export type DesignAgentRun = {
  id: string; generationMode: "text" | "mixed"; status: string; brief: string; visionReport: string; layoutPlan: string; visualPrompt: string;
  error?: string | null; createdAt: string; appliedAt?: string | null; appliedSlideNumber?: number | null;
  workflowState?: string; qualityMode?: string; generationAttempts?: number; generationBudget?: number; selectedImageId?: string | null;
  references?: DesignAgentReference[]; events?: DesignAgentEvent[]; evaluations?: DesignAgentEvaluation[]; generatedJob?: { id: string; images: GeneratedImage[] } | null;
};
export type ImageExplodePart = { id: string; label: string; kind: string; variant: string; groupKey?: string | null; storedName?: string | null; refinedName?: string | null; textContent?: string | null; selected: boolean; confidence: number; zIndex: number; };
export type ImageExplodeTextLayer = { id: string; content: string; groupKey?: string | null; rotation: number; styleJson: string; complexity: "simple" | "complex" | string; mode: "native" | "artwork" | "skip" | string; selected: boolean; confidence: number; };
export type ImageExplodeEvent = { id: string; stage: string; status: string; detail: string; createdAt: string; };
export type ImageExplodeRun = { id: string; status: string; error?: string | null; createdAt: string; appliedAt?: string | null; appliedSlideNumber?: number | null; reconstructionName?: string | null; qaReportJson?: string; backgroundStrategy?: string; cloudCleanupUsed?: boolean; needsReview?: boolean; parts?: ImageExplodePart[]; textLayers?: ImageExplodeTextLayer[]; events?: ImageExplodeEvent[]; sourceImage?: GeneratedImage | null; };
export type WorkDocument = {
  id: string; originalName: string; updatedAt: string;
  versions: { id: string; version: number; label: string; createdAt: string }[];
};
export type ActivityItem = { id: string; action: string; detail: string; createdAt: string; employee: { name: string } };
export type Service = {
  id: string; number: string; title: string; category: string; purchasedAt: string;
  priceCents: number; status: string; progress: number; assigneeId: string | null;
  assignee: { id: string; name: string; code: string } | null;
  collaborators?: { id: string; role: string; employee: { id: string; name: string; code: string } }[];
  user: { phone: string }; workDocument: WorkDocument | null; activities: ActivityItem[];
  consultation: (Consultation & { messages: Message[] }) | null; generationJobs: GenerationJob[]; materialItems: MaterialItem[];
};
export type OrderManagementDraft = {
  title: string; category: string; phone: string; priceCents: number; status: string; progress: number; purchasedAt: string;
};
export type EmployeeData = {
  employee: Employee | null; employees: Employee[]; services: Service[]; consultations: Consultation[];
};
