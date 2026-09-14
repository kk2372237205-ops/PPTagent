import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";

type PageInput = {
  pageIndex?: number;
  title?: string;
  role?: string;
  purpose?: string;
  blocks?: unknown;
  mustInclude?: unknown;
  conclusion?: string;
  density?: string;
  layoutType?: string;
  constraintMode?: string;
  evidence?: unknown;
  visualEvidence?: unknown;
  directorContract?: unknown;
  warnings?: unknown;
  locked?: boolean;
};

const roles = new Set(["cover", "problem", "insight", "solution", "architecture", "feature", "scenario", "data", "roadmap", "ending"]);
const densities = new Set(["sparse", "standard", "compact"]);
const constraints = new Set(["exact", "polish", "direction"]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const body = await request.json().catch(() => ({})) as { pages?: PageInput[]; action?: "save" | "match" | "outline" };
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { pagePlans: { orderBy: { pageIndex: "asc" } }, slides: { orderBy: { slideIndex: "asc" } } }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (run.generationMode !== "advanced") return NextResponse.json({ error: "快速版不使用逐页资料编辑器" }, { status: 400 });
  if (!["outline_ready", "plan_ready"].includes(run.status)) {
    return NextResponse.json({ error: "当前阶段不能修改逐页方案" }, { status: 400 });
  }

  const sourcePages = Array.isArray(body.pages) && body.pages.length ? body.pages : run.pagePlans.map(page => ({
    pageIndex: page.pageIndex,
    title: page.title,
    role: page.role,
    purpose: page.purpose,
    blocks: parseArray(page.blocksJson),
    mustInclude: parseArray(page.mustIncludeJson),
    conclusion: page.conclusion,
    density: page.density,
    layoutType: page.layoutType,
    constraintMode: page.constraintMode,
    evidence: parseArray(page.evidenceJson),
    visualEvidence: parseArray(page.visualEvidenceJson),
    directorContract: parseObject(page.directorContractJson),
    warnings: parseArray(page.warningsJson),
    locked: page.locked
  }));
  if (sourcePages.length < 2 || sourcePages.length > 30) {
    return NextResponse.json({ error: "逐页方案必须为 2 至 30 页" }, { status: 400 });
  }
  const pages = sourcePages.map((page, index) => normalizePage(page, index, sourcePages.length));
  const action = body.action === "match" ? "match" : body.action === "outline" ? "outline" : "save";
  if (action === "save" && run.status === "plan_ready" && pages.length !== run.slides.length) {
    return NextResponse.json({ error: "完整方案阶段不能增删页面；请返回修改任务资料后重新整理" }, { status: 400 });
  }

  await db.$transaction([
    db.deckGenerationPagePlan.deleteMany({ where: { runId: run.id } }),
    db.deckGenerationPagePlan.createMany({
      data: pages.map(page => ({
        runId: run.id,
        pageIndex: page.pageIndex,
        title: page.title,
        role: page.role,
        purpose: page.purpose,
        blocksJson: JSON.stringify(page.blocks),
        mustIncludeJson: JSON.stringify(page.mustInclude),
        conclusion: page.conclusion,
        density: page.density,
        layoutType: page.layoutType,
        constraintMode: page.constraintMode,
        evidenceJson: JSON.stringify(page.evidence),
        visualEvidenceJson: JSON.stringify(page.visualEvidence),
        directorContractJson: JSON.stringify(page.directorContract),
        warningsJson: JSON.stringify(page.warnings),
        locked: page.locked
      }))
    }),
    ...(action === "match" ? [
      db.deckGenerationSlide.deleteMany({ where: { runId: run.id } }),
      db.deckGenerationRun.update({
        where: { id: run.id },
        data: {
          status: "matching_queued",
          pageCount: pages.length,
          outlineJson: "{}",
          visualIdentityJson: "{}",
          visualStoryboardJson: "{}",
          slideImageSpecsJson: "{}",
          styleFingerprintJson: "{}",
          styleStripStoredName: null,
          deckQualityStatus: "pending",
          deckQualityReportJson: "{}",
          deckQualityAttempts: 0,
          initialImageBudget: 0,
          imageCallsStarted: 0,
          imageCallsCompleted: 0,
          manualImageCalls: 0,
          automaticRedraws: 0,
          planReadyAt: null,
          error: null
        }
      })
    ] : action === "outline" ? [
      db.deckGenerationSlide.deleteMany({ where: { runId: run.id } }),
      db.deckGenerationRun.update({
        where: { id: run.id },
        data: {
          status: "outline_ready",
          pageCount: pages.length,
          outlineJson: "{}",
          visualIdentityJson: "{}",
          visualStoryboardJson: "{}",
          slideImageSpecsJson: "{}",
          styleFingerprintJson: "{}",
          styleStripStoredName: null,
          deckQualityStatus: "pending",
          deckQualityReportJson: "{}",
          deckQualityAttempts: 0,
          initialImageBudget: 0,
          imageCallsStarted: 0,
          imageCallsCompleted: 0,
          manualImageCalls: 0,
          automaticRedraws: 0,
          planReadyAt: null,
          confirmedAt: null,
          error: null
        }
      })
    ] : [
      db.deckGenerationRun.update({ where: { id: run.id }, data: { pageCount: pages.length, error: null } })
    ])
  ]);

  if (action === "save" && run.status === "plan_ready" && run.slides.length) {
    await db.$transaction(run.slides.map(slide => {
      const page = pages.find(item => item.pageIndex === slide.slideIndex);
      if (!page) return db.deckGenerationSlide.delete({ where: { id: slide.id } });
      const spec = parseObject(slide.specJson);
      const contract = parseObject(slide.renderContractJson);
      const exactText = Array.from(new Set([page.title, ...page.mustInclude, ...page.blocks.filter(block => block.constraintMode === "exact").flatMap(block => [block.subtitle, block.content]).filter(Boolean)]));
      return db.deckGenerationSlide.update({
        where: { id: slide.id },
        data: {
          title: page.title,
          role: page.role,
          specJson: JSON.stringify({
            ...spec,
            title: page.title,
            role: page.role,
            content_summary: [page.purpose, ...page.blocks.map(block => [block.subtitle, block.content || block.instruction].filter(Boolean).join("：")), page.conclusion].filter(Boolean).join("\n"),
            text_density: page.density === "compact" ? "high" : page.density === "sparse" ? "low" : "medium",
            must_include: Array.from(new Set([...page.mustInclude, ...page.blocks.filter(block => block.constraintMode === "exact").flatMap(block => [block.subtitle, block.content]).filter(Boolean)])),
            evidence: page.evidence,
            visual_evidence: page.visualEvidence,
            director_contract: page.directorContract,
            warnings: page.warnings
          }),
          renderContractJson: JSON.stringify({
            ...contract,
            project: { ...parseNestedObject(contract.project), slide_index: page.pageIndex, total_slides: pages.length, role: page.role },
            immutable_content: { ...parseNestedObject(contract.immutable_content), title: page.title, exact_visible_text: exactText, facts_and_sources: page.evidence, warnings: page.warnings },
            editable_content: { ...parseNestedObject(contract.editable_content), purpose: page.purpose, blocks: page.blocks, conclusion: page.conclusion },
            visual_evidence: page.visualEvidence,
            director_contract: page.directorContract
          }),
          qualityStatus: "not_applicable",
          qualityReportJson: "{}",
          qualityAttempts: 0,
          qualityCheckedAt: null
        }
      });
    }));
  }

  const updated = await db.deckGenerationRun.findUnique({
    where: { id: run.id },
    include: {
      slides: { orderBy: { slideIndex: "asc" } },
      sources: { orderBy: { createdAt: "asc" } },
      pagePlans: { orderBy: { pageIndex: "asc" } }
    }
  });
  return NextResponse.json({ run: updated }, { status: action === "match" ? 202 : 200 });
}

function normalizePage(page: PageInput, index: number, count: number) {
  const requestedRole = roles.has(String(page.role)) ? String(page.role) : "insight";
  const role = index === 0 ? "cover" : index === count - 1 ? "ending" : ["cover", "ending"].includes(requestedRole) ? "insight" : requestedRole;
  return {
    pageIndex: index + 1,
    title: String(page.title || (index === 0 ? "封面" : index === count - 1 ? "结语" : `第 ${index + 1} 页`)).trim().slice(0, 120),
    role,
    purpose: String(page.purpose || "").trim().slice(0, 1600),
    blocks: normalizeBlocks(page.blocks),
    mustInclude: stringArray(page.mustInclude, 40),
    conclusion: String(page.conclusion || "").trim().slice(0, 1200),
    density: densities.has(String(page.density)) ? String(page.density) : (index === 0 || index === count - 1 ? "sparse" : "standard"),
    layoutType: String(page.layoutType || "auto").trim().slice(0, 80),
    constraintMode: constraints.has(String(page.constraintMode)) ? String(page.constraintMode) : "polish",
    evidence: Array.isArray(page.evidence) ? page.evidence.slice(0, 40) : [],
    visualEvidence: Array.isArray(page.visualEvidence) ? page.visualEvidence.slice(0, 4) : [],
    directorContract: page.directorContract && typeof page.directorContract === "object" && !Array.isArray(page.directorContract) ? page.directorContract : {},
    warnings: stringArray(page.warnings, 30),
    locked: Boolean(page.locked)
  };
}

function normalizeBlocks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((item, index) => {
    const block = item && typeof item === "object" ? item as Record<string, unknown> : { subtitle: String(item || "") };
    return {
      id: String(block.id || `block-${index + 1}`).slice(0, 80),
      subtitle: String(block.subtitle || block.title || "").trim().slice(0, 160),
      instruction: String(block.instruction || "").trim().slice(0, 1600),
      constraintMode: constraints.has(String(block.constraintMode)) ? String(block.constraintMode) : "polish",
      content: String(block.content || "").trim().slice(0, 3000),
      evidenceIds: stringArray(block.evidenceIds, 30)
    };
  });
}

function stringArray(value: unknown, limit: number) {
  return Array.isArray(value) ? value.map(item => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function parseArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseNestedObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
