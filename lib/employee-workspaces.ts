import { db } from "@/lib/db";

export type EmployeeWorkspaceConfig = {
  slug: string;
  name: string;
};

function normalizeSlug(value: unknown, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function singleWorkspace(): EmployeeWorkspaceConfig {
  return {
    slug: normalizeSlug(
      process.env.EMPLOYEE_ORG_SLUG || process.env.WECOM_ORG_SLUG,
      "school"
    ),
    name:
      process.env.EMPLOYEE_ORG_NAME?.trim() ||
      process.env.WECOM_ORG_NAME?.trim() ||
      "学校工作区"
  };
}

export function getEmployeeWorkspaceConfigs() {
  const raw =
    process.env.EMPLOYEE_ORGANIZATIONS_JSON?.trim() ||
    process.env.WECOM_ORGANIZATIONS_JSON?.trim();
  if (!raw) return [singleWorkspace()];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return [singleWorkspace()];
    return parsed.map((item, index) => {
      const record = item && typeof item === "object"
        ? item as Record<string, unknown>
        : {};
      return {
        slug: normalizeSlug(record.slug, `school-${index + 1}`),
        name: String(record.name || `学校 ${index + 1}`).trim()
      };
    });
  } catch {
    return [singleWorkspace()];
  }
}

export async function syncEmployeeWorkspaces() {
  const configs = getEmployeeWorkspaceConfigs();
  const organizations = [];
  for (const config of configs) {
    const organization = await db.organization.upsert({
      where: { slug: config.slug },
      update: {
        name: config.name,
        enabled: true
      },
      create: {
        slug: config.slug,
        name: config.name,
        corpId: `workspace:${config.slug}`
      }
    });
    organizations.push(organization);
  }
  if (organizations.length > 0) {
    await db.service.updateMany({
      where: { organizationId: null },
      data: { organizationId: organizations[0].id }
    });
  }
  return organizations;
}
