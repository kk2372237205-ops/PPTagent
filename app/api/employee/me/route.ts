import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  currentEmployeeAccess,
  hasEmployeeFeature,
  resolveEmployeePermissions
} from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ employee: null });

  const employee = {
    ...access.employee,
    membership: {
      ...access.membership,
      organization: access.organization
    },
    permissions: access.permissions
  };
  if (access.membership.status !== "active") {
    return NextResponse.json({ employee, employees: [], services: [], consultations: [] });
  }

  const isPlatformAdmin = access.employee.isAdmin || access.membership.role === "platform_admin";
  const canManageOrganization =
    access.membership.role === "org_admin" || access.membership.role === "manager";
  const serviceWhere = isPlatformAdmin
    ? {}
    : canManageOrganization
      ? { organizationId: access.organization.id }
      : { organizationId: access.organization.id, assigneeId: access.employee.id };

  const services = hasEmployeeFeature(access, "orders")
    ? await db.service.findMany({
      where: serviceWhere,
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
            employee: { select: { id: true, name: true } },
            images: { orderBy: [{ isMaterial: "desc" }, { materialOrder: "asc" }, { createdAt: "desc" }] }
          }
        },
        materialItems: {
          orderBy: [{ materialOrder: "asc" }, { createdAt: "desc" }],
          include: {
            employee: { select: { id: true, name: true } },
            image: {
              include: {
                job: {
                  include: { employee: { select: { id: true, name: true } } }
                }
              }
            }
          }
        }
      }
    })
    : [];

  const organizationMemberships =
    hasEmployeeFeature(access, "team") || isPlatformAdmin || access.membership.role === "org_admin"
      ? await db.employeeMembership.findMany({
        where: isPlatformAdmin ? {} : { organizationId: access.organization.id },
        include: {
          employee: true,
          organization: true
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
      })
      : [];
  const employees = organizationMemberships.map((membership) => ({
    ...membership.employee,
    membership: {
      ...membership,
      employee: undefined,
      organization: membership.organization
    },
    permissions: resolveEmployeePermissions(membership, membership.employee.isAdmin)
  }));

  let consultations: Awaited<ReturnType<typeof db.consultation.findMany>> = [];
  if (hasEmployeeFeature(access, "customerMessages")) {
    const visibleConsultationIds = services
      .map((service) => service.consultationId)
      .filter((id): id is string => Boolean(id));
    consultations = await db.consultation.findMany({
      where: isPlatformAdmin ? {} : { id: { in: visibleConsultationIds } },
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
    });
  }

  return NextResponse.json({ employee, employees, services, consultations });
}
