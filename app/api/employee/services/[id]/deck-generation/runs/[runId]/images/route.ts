import JSZip from "jszip";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { imageRoot, readStoredFile } from "@/lib/workspace-storage";

function safeArchiveName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80) || "PPT预览图";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "exports");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { slides: { orderBy: { slideIndex: "asc" } } }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (!run.slides.length || run.slides.some(slide => slide.status !== "completed" || !slide.storedName)) {
    return NextResponse.json({ error: "还有页面没有生成完成，暂时不能下载完整图组" }, { status: 400 });
  }

  const archiveBaseName = safeArchiveName(run.projectName);
  const zip = new JSZip();
  const folder = zip.folder(`${archiveBaseName}-预览图`);
  if (!folder) return NextResponse.json({ error: "图组打包失败" }, { status: 500 });
  const digits = Math.max(2, String(run.slides.length).length);
  for (const slide of run.slides) {
    const file = await readStoredFile(imageRoot, slide.storedName!);
    folder.file(`${String(slide.slideIndex).padStart(digits, "0")}.png`, file);
  }
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${archiveBaseName}-预览图.zip`)}`,
      "Cache-Control": "private, no-store"
    }
  });
}
