import { NextResponse } from "next/server";
import { currentUser, makeNumber } from "@/lib/auth";
import { db } from "@/lib/db";

const REVISION_GREETING =
  "您好，了解到您需要修改PPT，麻烦告知一下具体的修改意见，我这边及时调整。";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { id } = await context.params;
  const service = await db.service.findFirst({
    where: { id, userId: user.id },
    include: { consultation: true }
  });
  if (!service?.consultationId) {
    return NextResponse.json({ error: "未找到关联咨询" }, { status: 404 });
  }

  const revision = await db.revisionRequest.create({
    data: {
      number: makeNumber("RV"),
      serviceId: service.id,
      consultationId: service.consultationId
    }
  });

  await db.message.create({
    data: {
      consultationId: service.consultationId,
      role: "assistant",
      content: REVISION_GREETING
    }
  });

  const consultation = await db.consultation.findUnique({
    where: { id: service.consultationId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { attachments: true }
      }
    }
  });

  return NextResponse.json({ revision, consultation });
}
