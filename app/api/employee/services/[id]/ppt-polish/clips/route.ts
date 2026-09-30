import path from "path";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { workspaceRoot } from "@/lib/workspace-storage";

const clipRoot = path.join(workspaceRoot, "ppt-polish-clips");
const allowedColors = new Set(["blue", "green", "gold", "rose"]);

type PolishClip = {
  id: string;
  name: string;
  prompt: string;
  color: "blue" | "green" | "gold" | "rose";
  createdAt: string;
  updatedAt: string;
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  return NextResponse.json({ clips: await readClips(authorization.access.employee.id) });
}

/**
 * 保存或编辑员工自己的美化提示词夹子。夹子与订单无关，但仍通过当前订单
 * 校验 smartPpt 权限，确保不会被未授权调用读取或写入。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const body = await request.json().catch(() => ({}));
  const name = cleanText(body?.name, 40);
  const prompt = cleanText(body?.prompt, 1200);
  const color = String(body?.color || "blue");
  if (!name || !prompt) return NextResponse.json({ error: "请填写夹子名称和提示词。" }, { status: 400 });
  if (!allowedColors.has(color)) return NextResponse.json({ error: "夹子颜色无效。" }, { status: 400 });

  const employeeId = authorization.access.employee.id;
  const clips = await readClips(employeeId);
  const existingId = cleanText(body?.id, 80);
  const now = new Date().toISOString();
  const index = existingId ? clips.findIndex(item => item.id === existingId) : -1;
  const clip: PolishClip = {
    id: index >= 0 ? clips[index].id : randomUUID(),
    name,
    prompt,
    color: color as PolishClip["color"],
    createdAt: index >= 0 ? clips[index].createdAt : now,
    updatedAt: now
  };
  const next = index >= 0
    ? clips.map(item => item.id === clip.id ? clip : item)
    : [clip, ...clips].slice(0, 40);
  await writeClips(employeeId, next);
  return NextResponse.json({ clip, clips: next });
}

async function readClips(employeeId: string): Promise<PolishClip[]> {
  await mkdir(clipRoot, { recursive: true });
  try {
    const value = JSON.parse(await readFile(clipPath(employeeId), "utf8"));
    if (!Array.isArray(value)) return [];
    return value
      .map(item => ({
        id: cleanText(item?.id, 80),
        name: cleanText(item?.name, 40),
        prompt: cleanText(item?.prompt, 1200),
        color: allowedColors.has(String(item?.color)) ? String(item.color) : "blue",
        createdAt: String(item?.createdAt || ""),
        updatedAt: String(item?.updatedAt || "")
      }))
      .filter(item => item.id && item.name && item.prompt)
      .slice(0, 40) as PolishClip[];
  } catch {
    return [];
  }
}

async function writeClips(employeeId: string, clips: PolishClip[]) {
  await mkdir(clipRoot, { recursive: true });
  await writeFile(clipPath(employeeId), JSON.stringify(clips, null, 2), "utf8");
}

function clipPath(employeeId: string) {
  return path.join(clipRoot, `${path.basename(employeeId)}.json`);
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
