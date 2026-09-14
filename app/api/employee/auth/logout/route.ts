import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hash } from "@/lib/auth";
import { EMPLOYEE_SESSION_COOKIE } from "@/lib/employee-auth";

export async function POST() {
  const token = (await cookies()).get(EMPLOYEE_SESSION_COOKIE)?.value;
  if (token) await db.employeeSession.deleteMany({ where: { tokenHash: hash(token) } });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(EMPLOYEE_SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
