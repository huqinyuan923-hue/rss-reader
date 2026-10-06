import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

/** Cron 端点鉴权：Vercel Cron 自带 Bearer CRON_SECRET */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

/** API 路由的登录校验（middleware 之外的二次防线） */
export async function requireUser(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json({ error: "未登录" }, { status: 401 });
}
