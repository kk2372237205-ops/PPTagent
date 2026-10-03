/**
 * 员工账号密码的服务端安全工具。
 *
 * 密码只以 scrypt 派生值保存；本模块不向客户端返回密码或哈希。
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const passwordFormat = "scrypt";
const loginWindowMs = 15 * 60 * 1000;
const maxAttempts = 5;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function derivePassword(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export function normalizeEmployeeUsername(value: unknown) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
    throw new Error("用户名需为 3–32 位字母、数字、点、下划线或连字符");
  }
  return username;
}

function assertPassword(value: unknown) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 128) {
    throw new Error("密码需为 10–128 个字符");
  }
  return password;
}

export async function hashEmployeePassword(value: unknown) {
  const password = assertPassword(value);
  const salt = randomBytes(16).toString("hex");
  const derived = await derivePassword(password, salt);
  return `${passwordFormat}$${salt}$${derived.toString("hex")}`;
}

export async function verifyEmployeePassword(value: unknown, storedHash: string | null) {
  if (!storedHash) return false;
  const [format, salt, digest] = storedHash.split("$");
  if (format !== passwordFormat || !salt || !digest) return false;
  try {
    const supplied = await derivePassword(String(value || ""), salt);
    const expected = Buffer.from(digest, "hex");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

export function assertEmployeeLoginAllowed(key: string) {
  const current = failedAttempts.get(key);
  if (!current) return;
  if (current.resetAt <= Date.now()) {
    failedAttempts.delete(key);
    return;
  }
  if (current.count >= maxAttempts) {
    throw new Error("尝试次数过多，请 15 分钟后再试或联系平台管理员重置密码");
  }
}

export function recordEmployeeLoginFailure(key: string) {
  const now = Date.now();
  const current = failedAttempts.get(key);
  if (!current || current.resetAt <= now) {
    failedAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
    return;
  }
  failedAttempts.set(key, { count: current.count + 1, resetAt: current.resetAt });
}

export function clearEmployeeLoginFailures(key: string) {
  failedAttempts.delete(key);
}
