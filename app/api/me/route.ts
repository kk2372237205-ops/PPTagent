import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null });

  const details = await db.user.findUnique({
    where: { id: user.id },
    include: {
      sessions: { orderBy: { createdAt: "desc" } },
      services: {
        orderBy: { purchasedAt: "desc" },
        include: { versions: { orderBy: { version: "desc" } }, asset: true }
      },
      assets: {
        orderBy: { createdAt: "desc" },
        include: { service: { include: { versions: { orderBy: { version: "desc" } } } } }
      },
      consultations: {
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } } }
      }
    }
  });
  return NextResponse.json({ user: details });
}
