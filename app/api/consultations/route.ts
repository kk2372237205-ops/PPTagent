import { NextRequest, NextResponse } from "next/server";
import { currentUser, makeNumber } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { budget } = await request.json();
  const consultation = await db.consultation.create({
    data: {
      number: makeNumber("WZ"),
      budget,
      userId: user.id,
      messages: {
        create: {
          role: "system",
          content: `已为你建立 ${budget} 预算档的专属咨询。人工顾问将在工作时间内回复。`
        }
      }
    },
    include: { messages: true }
  });
  return NextResponse.json({ consultation });
}
