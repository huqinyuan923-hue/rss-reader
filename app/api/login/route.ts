import { NextResponse } from "next/server";
import { passwordMatches, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (!body.password || typeof body.password !== "string" || body.password.length > 200) {
    return NextResponse.json({ error: "请输入密码" }, { status: 400 });
  }
  if (!passwordMatches(body.password)) {
    // 固定延迟，避免通过响应时间猜测
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  await setSessionCookie();
  return NextResponse.json({ ok: true });
}
