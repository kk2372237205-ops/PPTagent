import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

export const runtime = "nodejs";

const allowedStylePacks = new Set([
  "blue-gold-tech",
  "white-green-tech",
  "black-gold-business",
  "blue-purple-ai",
  "red-white-government",
  "minimal-academic",
  "vivid-roadshow"
]);

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const runs = await db.deckGenerationRun.findMany({
    where: { serviceId: id, employeeId: employee.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { slides: { orderBy: { slideIndex: "asc" } } }
  });
  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const form = await request.formData();
  const projectName = String(form.get("projectName") || "").trim();
  const projectType = String(form.get("projectType") || "").trim();
  const brief = String(form.get("brief") || "").trim();
  const referenceText = String(form.get("referenceText") || "").trim();
  const pageCount = Math.max(2, Math.min(20, Number(form.get("pageCount") || 12) || 12));
  const stylePack = String(form.get("stylePack") || "blue-gold-tech");
  const unityOptionsJson = normalizeUnityOptions(String(form.get("unityOptions") || "{}"));
  const referenceFiles = form.getAll("references").filter((value): value is File => value instanceof File && value.size > 0);

  if (!projectName) return NextResponse.json({ error: "请填写项目名称" }, { status: 400 });
  if (!brief) return NextResponse.json({ error: "请填写项目简介" }, { status: 400 });
  if (!allowedStylePacks.has(stylePack)) return NextResponse.json({ error: "风格包无效" }, { status: 400 });
  if (referenceFiles.length > 8) return NextResponse.json({ error: "参考资料最多上传 8 个文件" }, { status: 400 });
  for (const file of referenceFiles) {
    if (file.size > 200 * 1024 * 1024) return NextResponse.json({ error: "单个参考资料不能超过 200MB" }, { status: 400 });
  }
  const fileSummary = referenceFiles.map(file => `- ${file.name} (${file.type || "unknown"}, ${Math.ceil(file.size / 1024)}KB)`).join("\n");
  const referenceSection = [referenceText && `文字摘要：\n${referenceText}`, fileSummary && `上传文件：\n${fileSummary}`].filter(Boolean).join("\n\n");
  const fullBrief = referenceSection ? `${brief}\n\n参考资料：\n${referenceSection}` : brief;
  if (fullBrief.length > 6000) return NextResponse.json({ error: "项目简介和参考资料不能超过 6000 字" }, { status: 400 });

  const run = await db.deckGenerationRun.create({
    data: {
      serviceId: id,
      employeeId: employee.id,
      projectName: projectName.slice(0, 80),
      projectType: projectType.slice(0, 80),
      brief: fullBrief,
      pageCount,
      stylePack,
      unityOptionsJson,
      status: "queued"
    },
    include: { slides: { orderBy: { slideIndex: "asc" } } }
  });
  return NextResponse.json({ run }, { status: 202 });
}

function normalizeUnityOptions(value: string) {
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify({
      mainColor: Boolean(parsed.mainColor ?? true),
      headerFooter: Boolean(parsed.headerFooter ?? true),
      backgroundTexture: Boolean(parsed.backgroundTexture ?? true),
      cardStyle: Boolean(parsed.cardStyle ?? true),
      decorativeElements: Boolean(parsed.decorativeElements ?? true)
    });
  } catch {
    return JSON.stringify({
      mainColor: true,
      headerFooter: true,
      backgroundTexture: true,
      cardStyle: true,
      decorativeElements: true
    });
  }
}
