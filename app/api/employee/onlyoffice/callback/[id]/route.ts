import path from "path";
import { writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyJwt } from "@/lib/office";
import { documentRoot, ensureWorkspaceDirectories } from "@/lib/workspace-storage";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = body.token || auth;
  if (process.env.ONLYOFFICE_JWT_SECRET && (!token || !verifyJwt(token))) {
    return NextResponse.json({ error: 1 });
  }

  if ([2, 6].includes(body.status) && body.url) {
    const document = await db.workDocument.findUnique({ where: { id } });
    if (!document) return NextResponse.json({ error: 1 });
    if (!matchesDocumentVersion(body.key, document.documentKey)) {
      return NextResponse.json({ error: 0 });
    }
    const response = await fetch(body.url);
    if (!response.ok) return NextResponse.json({ error: 1 });
    const latestDocument = await db.workDocument.findUnique({ where: { id } });
    if (!latestDocument || !matchesDocumentVersion(body.key, latestDocument.documentKey)) {
      return NextResponse.json({ error: 0 });
    }
    await ensureWorkspaceDirectories();
    await writeFile(
      path.join(documentRoot, path.basename(latestDocument.storedName)),
      Buffer.from(await response.arrayBuffer())
    );
  }
  return NextResponse.json({ error: 0 });
}

function matchesDocumentVersion(callbackKey: unknown, documentKey: string) {
  if (typeof callbackKey !== "string") return false;
  return callbackKey === documentKey || callbackKey.startsWith(`${documentKey}-`);
}
