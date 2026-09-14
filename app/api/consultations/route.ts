import { NextRequest, NextResponse } from "next/server";
import { currentUser, makeNumber } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncAppointment, syncRegisteredUser } from "@/lib/supabase-postgres";

function uniqueBudgets(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function parseSelectedBudgets(value: string | null | undefined, fallback: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) {
      return uniqueBudgets([...parsed.filter((item) => typeof item === "string"), fallback]);
    }
  } catch {
    // Older records should still fall back to their single budget field.
  }
  return uniqueBudgets([fallback]);
}

const consultationInclude = {
  messages: { orderBy: { createdAt: "asc" as const }, include: { attachments: true } }
};

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { budget: rawBudget } = await request.json();
  const budget = String(rawBudget || "").trim();
  if (!budget) return NextResponse.json({ error: "请选择预算档" }, { status: 400 });

  const existing = await db.consultation.findFirst({
    where: { userId: user.id, isCustomerGroup: true },
    orderBy: { createdAt: "asc" },
    include: consultationInclude
  });

  let consultation;
  if (existing) {
    const selectedBudgets = parseSelectedBudgets(existing.selectedBudgets, existing.budget);
    const hasBudget = selectedBudgets.includes(budget);
    const nextBudgets = hasBudget ? selectedBudgets : [...selectedBudgets, budget];

    if (!hasBudget) {
      await db.consultation.update({
        where: { id: existing.id },
        data: {
          selectedBudgets: JSON.stringify(nextBudgets),
          messages: {
            create: {
              role: "system",
              content: `客户补充选择了 ${budget} 预算档。`
            }
          }
        }
      });
    }

    consultation = await db.consultation.findUniqueOrThrow({
      where: { id: existing.id },
      include: consultationInclude
    });
  } else {
    consultation = await db.consultation.create({
      data: {
        number: makeNumber("WZ"),
        budget,
        selectedBudgets: JSON.stringify([budget]),
        isCustomerGroup: true,
        userId: user.id,
        messages: {
          create: {
            role: "system",
            content: `已为你建立客户专属咨询群，当前关注预算：${budget}。人工顾问将在工作时间内回复。`
          }
        }
      },
      include: consultationInclude
    });
  }

  const userSynced = await syncRegisteredUser({
    localUserId: user.id,
    phone: user.phone,
    registeredAt: user.createdAt,
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent")
  });
  const appointmentSynced = await syncAppointment({
    localConsultationId: consultation.id,
    localUserId: user.id,
    phone: user.phone,
    budget,
    status: consultation.status,
    submittedAt: consultation.createdAt
  });
  return NextResponse.json({
    consultation,
    supabaseSynced: userSynced && appointmentSynced
  });
}

void legacyPost;

async function legacyPost(request: NextRequest) {
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
  const userSynced = await syncRegisteredUser({
    localUserId: user.id,
    phone: user.phone,
    registeredAt: user.createdAt,
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent")
  });
  const appointmentSynced = await syncAppointment({
    localConsultationId: consultation.id,
    localUserId: user.id,
    phone: user.phone,
    budget: consultation.budget,
    status: consultation.status,
    submittedAt: consultation.createdAt
  });
  return NextResponse.json({
    consultation,
    supabaseSynced: userSynced && appointmentSynced
  });
}
