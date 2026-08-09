import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { deckEvidenceRoot, readStoredFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; runId: string; evidenceId: string }> }) {
  const { id, runId, evidenceId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const evidence = await db.deckGenerationVisualEvidence.findFirst({
    where: {
      id: evidenceId,
      runId,
      run: { serviceId: id, employeeId: employee.id }
    }
  });
  if (!evidence) return NextResponse.json({ error: "视觉证据不存在" }, { status: 404 });
  const file = await readStoredFile(deckEvidenceRoot, evidence.thumbnailStoredName);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300"
    }
  });
}
