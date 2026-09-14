import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json();
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...(typeof body.animationEnabled === "boolean" ? { animationEnabled: body.animationEnabled } : {}),
      ...(typeof body.notifications === "boolean" ? { notifications: body.notifications } : {})
    }
  });
  return NextResponse.json({ user: updated });
}
