import path from "path";
import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { verifyFileToken } from "@/lib/office";
import { documentRoot, workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");

/**
 * Private source file endpoint for ONLYOFFICE's server-to-server converter.
 * It accepts a brief signed URL created by the local PPT polish worker, not a
 * browser session, because the converter runs in a separate container.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  if (!verifyFileToken(runId, request.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "源文稿链接无效或已过期" }, { status: 403 });
  }
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id || !run.sourceStoredName) {
    return NextResponse.json({ error: "美化任务源文稿不存在" }, { status: 404 });
  }
  try {
    const file = await readFile(path.join(documentRoot, path.basename(run.sourceStoredName)));
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(run.sourceName || "source.pptx")}`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "源 PPTX 文件不存在" }, { status: 404 });
  }
}

async function readPolishRun(runId: string) {
  try {
    return JSON.parse(await readFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), "utf8"));
  } catch {
    return null;
  }
}
