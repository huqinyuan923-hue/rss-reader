import { NextResponse } from "next/server";
import { db } from "@/db";
import { feeds } from "@/db/schema";
import { cronAuthorized, requireUser } from "@/lib/guards";
import { refreshFeed } from "@/lib/refresh";

export const maxDuration = 60;

async function refreshAll() {
  const allFeeds = await db.select().from(feeds);
  // 并发抓取（个人订阅量级下 10s 超时内可完成）
  const results = await Promise.allSettled(
    allFeeds.map((f) => refreshFeed(f.id, f.url, f.title))
  );
  const summary = results.map((r, i) => ({
    feed: allFeeds[i].title,
    ok: r.status === "fulfilled" ? r.value.ok : false,
    error: r.status === "fulfilled" ? r.value.error : String(r.reason).slice(0, 100),
  }));
  return NextResponse.json({
    refreshed: allFeeds.length,
    failed: summary.filter((s) => !s.ok).length,
    summary,
  });
}

/** GET /api/cron/fetch — Vercel Cron 调用（Bearer CRON_SECRET） */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  return refreshAll();
}

/** POST /api/cron/fetch — 登录用户手动「立即刷新」 */
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;
  return refreshAll();
}
