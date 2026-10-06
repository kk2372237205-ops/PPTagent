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
  customerInfo: string;
  priceCents: number;
  status: string;
  progress: number;
  purchasedAt: Date;
};

type ParseResult = { value: ManagedServiceInput } | { error: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** 将表单中的日期、金额和客户信息收敛为可安全存储的服务字段。 */
export function parseManagedServiceInput(body: Record<string, unknown>): ParseResult {
  const title = text(body.title);
  if (!title || title.length > 120) return { error: "订单名称需为 1–120 个字符" };

  const category = text(body.category);
  if (!category || category.length > 40) return { error: "服务类型需为 1–40 个字符" };

  const customerInfo = text(body.customerInfo);
  if (!customerInfo || customerInfo.length > 240) return { error: "客户信息需为 1–240 个字符" };

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
      customerInfo,
      priceCents,
      status,
      progress: status === "已完成" ? 100 : progress,
      purchasedAt
    }
  };
}

/**
 * 手工订单允许只记录微信、姓名或备注；现有 Service 仍要求关联一个 User。
 * 若客户信息中含中国大陆手机号就复用该客户账户，否则仅创建不对外展示的内部占位账户。
 */
export async function customerForManagedOrder(customerInfo: string, fallbackUserId?: string) {
  const normalized = customerInfo.replace(/[\s()-]/g, "");
  const phone = normalized.match(/1[3-9]\d{9}/)?.[0];
  if (phone) {
    return db.user.upsert({
      where: { phone },
      create: { phone },
      update: {}
    });
  }
  if (fallbackUserId) return { id: fallbackUserId };
  return db.user.create({
    data: { phone: `manual-order-${randomBytes(12).toString("hex")}` }
  });
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
