import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { requireUser } from "@/lib/guards";

/** GET /api/articles?feedId=1&unread=1&limit=100 */
export async function GET(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  const feedId = Number(params.get("feedId"));
  const unreadOnly = params.get("unread") === "1";
  const limit = Math.min(Number(params.get("limit")) || 100, 200);

  const filters = [];
  if (Number.isInteger(feedId) && feedId > 0) filters.push(eq(articles.feedId, feedId));
  if (unreadOnly) filters.push(isNull(articles.readAt));

  const rows = await db
    .select()
    .from(articles)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`))
    .limit(limit);
  return NextResponse.json({ articles: rows });
}

/** PATCH /api/articles?id=1 { read: true|false } */
export async function PATCH(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的 id" }, { status: 400 });
  }
  let body: { read?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const [row] = await db
    .update(articles)
    .set({ readAt: body.read ? new Date() : null })
    .where(eq(articles.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  return NextResponse.json({ article: row });
}

/** POST /api/articles { action: "read-all", feedId?: number } */
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  let body: { action?: string; feedId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (body.action !== "read-all") {
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  }
  const filters = [isNull(articles.readAt)];
  if (Number.isInteger(body.feedId) && body.feedId! > 0) {
    filters.push(eq(articles.feedId, body.feedId!));
  }
  const updated = await db
    .update(articles)
    .set({ readAt: new Date() })
    .where(and(...filters))
    .returning({ id: articles.id });
  return NextResponse.json({ updated: updated.length });
}
