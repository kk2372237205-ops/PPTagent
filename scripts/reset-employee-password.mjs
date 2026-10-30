/**
 * 重置员工账号密码（运维脚本，仅在本机运行）。
 *
 * 用途：平台管理员忘记密码、或给还没设密码的账号开通登录时使用。
 * 密码按项目规则用 scrypt 派生存储，与员工工作台的账号密码登录完全一致。
 *
 * 用法（在项目根目录执行）：
 *   node scripts/reset-employee-password.mjs <用户名> <新密码>
 *   node scripts/reset-employee-password.mjs --list           # 列出所有账号及是否已设密码
 *
 * 密码规则：10–128 个字符（项目 lib/employee-password.ts 的规定）。
 * 用户名规则：3–32 位字母、数字、点、下划线或连字符。
 *
 * 安全提醒：密码会出现在命令历史里。重置后请让本人登录并在管理台自行修改。
 */
import { PrismaClient } from "@prisma/client";
import { hashEmployeePassword, normalizeEmployeeUsername } from "../lib/employee-password.ts";

const [, , rawUsername, rawPassword] = process.argv;

const db = new PrismaClient();

async function listAccounts() {
  const employees = await db.employee.findMany({
    select: { username: true, name: true, isAdmin: true, enabled: true, memberships: { select: { role: true, status: true } } },
    orderBy: { createdAt: "asc" }
  });
  console.log(`员工账号共 ${employees.length} 个：`);
  for (const item of employees) {
    const membership = item.memberships[0];
    console.log(
      [
        `  用户名=${item.username || "(未设置)"}`,
        `姓名=${item.name}`,
        `管理员=${item.isAdmin ? "是" : "否"}`,
        `启用=${item.enabled ? "是" : "否"}`,
        `角色=${membership ? `${membership.role}/${membership.status}` : "无成员关系"}`,
        `可密码登录=${item.username ? "是" : "否"}`
      ].join("  ")
    );
  }
}

if (!rawUsername || rawUsername === "--list") {
  await listAccounts();
  await db.$disconnect();
  process.exit(0);
}

if (!rawPassword) {
  console.error("缺少新密码。用法：node scripts/reset-employee-password.mjs <用户名> <新密码>");
  process.exit(1);
}

const username = normalizeEmployeeUsername(rawUsername);
const employee = await db.employee.findUnique({ where: { username }, select: { id: true, name: true, isAdmin: true } });
if (!employee) {
  console.error(`找不到用户名为 ${username} 的账号。用 --list 查看现有账号。`);
  await db.$disconnect();
  process.exit(1);
}

const passwordHash = await hashEmployeePassword(rawPassword);
await db.employee.update({ where: { id: employee.id }, data: { passwordHash, passwordChangedAt: new Date() } });

// 改密码后作废该账号的既有登录会话，避免旧会话继续可用。
const revoked = await db.employeeSession.deleteMany({ where: { employeeId: employee.id } });

console.log(`已重置 ${username}（${employee.name}${employee.isAdmin ? "，平台管理员" : ""}）的密码。`);
console.log(`已作废该账号的 ${revoked.count} 个历史登录会话。`);
console.log("请立即用它登录员工工作台，并在管理台改成你自己的密码。");

await db.$disconnect();
