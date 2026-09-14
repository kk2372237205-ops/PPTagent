import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { referenceRoot, saveFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

const maxReferences = 6;
const maxReferenceBytes = 10 * 1024 * 1024;
const maxReferenceTotalBytes = 40 * 1024 * 1024;
const workerHeartbeatPath = path.join(process.cwd(), ".next-dev", "design-agent-worker-heartbeat.json");

function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function designAgentWorkerHealth() {
  try {
    if (!existsSync(workerHeartbeatPath)) return { ok: false, message: "后台智能模式 Worker 未运行或尚未写入心跳" };
    const stat = statSync(workerHeartbeatPath);
    const ageMs = Date.now() - stat.mtimeMs;
    const payload = JSON.parse(readFileSync(workerHeartbeatPath, "utf8"));
    const pid = Number(payload.pid || 0);
    const pidAlive = isProcessAlive(pid);
    const ok = ageMs < 30000 || pidAlive;
    return {
      ok,
      ageMs,
      pid,
      pidAlive,
      state: String(payload.state || "unknown"),
      updatedAt: String(payload.updatedAt || stat.mtime.toISOString()),
      message: ok ? "" : "后台智能模式 Worker 已停止响应"
    };
  } catch {
    return { ok: false, message: "后台智能模式 Worker 状态读取失败" };
  }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const runs = await db.designAgentRun.findMany({
    where: { serviceId: id, employeeId: employee.id },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { references: { orderBy: { sortOrder: "asc" }, include: { generatedImage: true } }, events: { orderBy: { createdAt: "asc" } }, evaluations: { orderBy: { createdAt: "asc" } }, generatedJob: { include: { images: true } } }
  });
  return NextResponse.json({ runs, workerHealth: designAgentWorkerHealth() });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const used = await db.designAgentRun.count({
    where: { employeeId: employee.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } }
  });
  if (used >= 6) return NextResponse.json({ error: "每名员工每小时最多创建 6 次智能模式任务" }, { status: 429 });

  const form = await request.formData();
  const brief = String(form.get("brief") || "").trim();
  const generationMode = String(form.get("generationMode") || "text");
  const batchCount = Math.max(1, Math.min(4, Number(form.get("batchCount") || 1) || 1));
  // The old "quality" mode triggered an extra aesthetic retry branch that made
  // outputs less predictable. New runs now stop at high-quality PNG generation;
  // downstream editing/rebuild is intentionally handled by a later workflow.
  const qualityMode = String("standard");
  if (!brief) return NextResponse.json({ error: "请写下这一页 PPT 的生成想法" }, { status: 400 });
  if (brief.length > 3000) return NextResponse.json({ error: "生成想法不能超过 3000 字" }, { status: 400 });
  if (generationMode !== "text" && generationMode !== "mixed") return NextResponse.json({ error: "生成模式无效" }, { status: 400 });

  const workerHealth = designAgentWorkerHealth();
  if (!workerHealth.ok) return NextResponse.json({ error: workerHealth.message || "后台智能模式 Worker 未运行/已停止，请重启 npm run dev" }, { status: 503 });

  const imageIds = parseImageIds(String(form.get("generatedImageIds") || "[]"));
  const uploadFiles = form.getAll("references").filter((value): value is File => value instanceof File && value.size > 0);
  if (imageIds.length + uploadFiles.length > maxReferences) return NextResponse.json({ error: `最多选择 ${maxReferences} 张参考图` }, { status: 400 });
  if (generationMode === "mixed" && imageIds.length + uploadFiles.length === 0) return NextResponse.json({ error: "混合模式至少需要一张参考图" }, { status: 400 });

  const totalBytes = uploadFiles.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maxReferenceTotalBytes) return NextResponse.json({ error: "参考图总大小不能超过 40MB" }, { status: 400 });
  for (const file of uploadFiles) {
    if (!file.type.startsWith("image/") || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return NextResponse.json({ error: "参考图仅支持 PNG、JPEG 或 WebP" }, { status: 400 });
    if (file.size > maxReferenceBytes) return NextResponse.json({ error: "单张参考图不能超过 10MB" }, { status: 400 });
  }

  const materials = imageIds.length ? await db.materialItem.findMany({
    where: { serviceId: id, employeeId: employee.id, imageId: { in: imageIds } },
    include: { image: true }
  }) : [];
  if (materials.length !== imageIds.length) return NextResponse.json({ error: "参考素材不存在或不属于当前员工" }, { status: 403 });

  const storedUploads = await Promise.all(uploadFiles.map(async file => ({ label: file.name, storedName: await saveFile(file, referenceRoot) })));
  const primaryIndex = Math.max(0, Math.min(imageIds.length + storedUploads.length - 1, Number(form.get("primaryIndex") || 0)));
  const references = [
    ...materials.map(item => ({ source: "material", label: item.image.storedName, generatedImageId: item.imageId, sortOrder: 0 })),
    ...storedUploads.map(item => ({ source: "upload", label: item.label, storedName: item.storedName, sortOrder: 0 }))
  ].map((item, index) => ({ ...item, sortOrder: index, isPrimary: index === primaryIndex }));

  const run = await db.designAgentRun.create({
    data: {
      serviceId: id,
      employeeId: employee.id,
      generationMode,
      qualityMode,
      // New runs create complete master PNG candidates only.
      generationBudget: batchCount,
      designIntent: JSON.stringify({ workflow: "openai-smart-image-v1", batchCount }),
      brief,
      references: { create: references },
      events: { create: { stage: "queued", status: "queued", detail: `任务已进入智能模式队列，将生成 ${batchCount} 份候选` } }
    },
    include: { references: { orderBy: { sortOrder: "asc" } }, events: true, evaluations: true }
  });
  return NextResponse.json({ run }, { status: 202 });
}

function parseImageIds(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0))).slice(0, maxReferences);
  } catch {
    return [];
  }
}
