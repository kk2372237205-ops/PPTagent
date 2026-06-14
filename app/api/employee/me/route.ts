import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

export async function GET() {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ employee: null });

  const [employees, services, consultations] = await Promise.all([
    db.employee.findMany({
      select: { id: true, code: true, name: true, phone: true, isAdmin: true, enabled: true, createdAt: true },
      orderBy: { code: "asc" }
    }),
    db.service.findMany({
      orderBy: { purchasedAt: "desc" },
      include: {
        user: { select: { phone: true } },
        assignee: { select: { id: true, name: true, code: true } },
        workDocument: { include: { versions: { orderBy: { version: "desc" } } } },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { employee: { select: { name: true } } }
        },
        consultation: {
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              include: {
                attachments: true,
                employee: { select: { id: true, name: true } }
              }
            }
          }
        },
        generationJobs: {
          orderBy: { createdAt: "desc" },
          include: {
            employee: { select: { name: true } },
            images: { orderBy: [{ isMaterial: "desc" }, { materialOrder: "asc" }, { createdAt: "desc" }] }
          }
        }
      }
    }),
    db.consultation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { phone: true } },
        services: { select: { id: true, number: true, title: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            attachments: true,
            employee: { select: { id: true, name: true } }
          }
        }
      }
    })
  ]);

  return NextResponse.json({ employee, employees, services, consultations });
}
