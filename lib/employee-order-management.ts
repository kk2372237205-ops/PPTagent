/**
 * 平台管理员订单管理的共享校验。
 *
 * 职责：校验管理员新建/修改订单时允许写入的字段，并生成不会和现有订单冲突的服务编号。
 * 谁可以改：订单管理功能维护者；权限判断必须留在 API 路由中。
 * 被谁用：`app/api/employee/admin/services/**`。
 * 验证方式：npm run verify。
 */

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const manageableServiceStatuses = ["待开始", "制作中", "待客户确认", "修改中", "已完成"] as const;

export type ManagedServiceInput = {
  title: string;
  category: string;
  phone: string;
  priceCents: number;
  status: string;
  progress: number;
  purchasedAt: Date;
};

type ParseResult = { value: ManagedServiceInput } | { error: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** 将表单中的日期、金额和手机号收敛为可安全存储的服务字段。 */
export function parseManagedServiceInput(body: Record<string, unknown>): ParseResult {
  const title = text(body.title);
  if (!title || title.length > 120) return { error: "订单名称需为 1–120 个字符" };

  const category = text(body.category);
  if (!category || category.length > 40) return { error: "服务类型需为 1–40 个字符" };

  const phone = text(body.phone).replace(/[\s()-]/g, "");
  if (!/^1[3-9]\d{9}$/.test(phone)) return { error: "请输入有效的 11 位客户手机号" };

  const priceCents = Number(body.priceCents);
  if (!Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) {
    return { error: "订单金额不正确" };
  }

  const status = text(body.status);
  if (!manageableServiceStatuses.includes(status as (typeof manageableServiceStatuses)[number])) {
    return { error: "订单状态无效" };
  }

  const progress = Number(body.progress);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return { error: "订单进度需为 0–100 的整数" };
  }

  const purchasedAt = new Date(text(body.purchasedAt));
  if (Number.isNaN(purchasedAt.getTime())) return { error: "请选择有效的下单时间" };

  return {
    value: {
      title,
      category,
      phone,
      priceCents,
      status,
      progress: status === "已完成" ? 100 : progress,
      purchasedAt
    }
  };
}

/** 随机尾号避免同日并发创建时发生编号冲突。 */
export async function nextManagedServiceNumber() {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const number = `SV1-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const exists = await db.service.findUnique({ where: { number }, select: { id: true } });
    if (!exists) return number;
  }
  throw new Error("暂时无法生成唯一订单编号，请重试");
}
