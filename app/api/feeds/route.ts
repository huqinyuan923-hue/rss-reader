import { asc, count, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { articles, feeds } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { fetchFeed, normalizeFeedUrl } from "@/lib/fetch-feed";
import { refreshFeed } from "@/lib/refresh";

/** GET /api/feeds — 订阅列表 + 各源未读数 */
export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;

  const rows = await db.select().from(feeds).orderBy(asc(feeds.createdAt));
  const unreadRows = await db
    .select({ feedId: articles.feedId, unread: count() })
    .from(articles)
    .where(isNull(articles.readAt))
    .groupBy(articles.feedId);
  const unreadMap = new Map(unreadRows.map((r) => [r.feedId, Number(r.unread)]));

  return NextResponse.json({
    feeds: rows.map((f) => ({ ...f, unread: unreadMap.get(f.id) ?? 0 })),
  });
}

/** POST /api/feeds { url } — 添加订阅：抓取校验 + 立即拉取文章 */
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const parsed = normalizeFeedUrl(body.url || "");
  if (!parsed) {
    return NextResponse.json(
      { error: "URL 无效（仅支持 http/https，且不能是内网地址）" },
      { status: 400 }
    );
  }

  // 抓取验证：确认是可解析的订阅源（支持粘贴站点首页自动发现）
  let meta, feedUrl;
  try {
    ({ meta, feedUrl } = await fetchFeed(parsed));
  } catch (e) {
    return NextResponse.json(
      { error: String((e as Error).message || e).slice(0, 200) },
      { status: 422 }
    );
  }

  // www / 非 www 视为同一订阅源：入库前先按两种主机形式查重
  const altHref = feedUrl.hostname.startsWith("www.")
    ? feedUrl.href.replace("//www.", "//")
    : feedUrl.href.replace("//", "//www.");
  const dup = await db
    .select()
    .from(feeds)
    .where(or(eq(feeds.url, feedUrl.toString()), eq(feeds.url, altHref)))
    .limit(1);
  if (dup.length) {
    return NextResponse.json(
      { error: "该订阅源已存在（www 与非 www 视为同一来源）", duplicate: true },
      { status: 409 }
    );
  }

  const inserted = await db
    .insert(feeds)
    .values({ url: feedUrl.toString(), title: meta.title, siteUrl: meta.siteUrl })
    .onConflictDoNothing({ target: feeds.url })
    .returning();

  if (!inserted.length) {
    return NextResponse.json({ error: "该订阅源已存在", duplicate: true }, { status: 409 });
  }
  const feed = inserted[0];

  // 立即抓取首批文章（失败不阻塞添加）
  const refresh = await refreshFeed(feed.id, feed.url, feed.title);
  const [row] = await db.select().from(feeds).where(eq(feeds.id, feed.id)).limit(1);
  return NextResponse.json({ feed: row, refresh });
}

/** DELETE /api/feeds?id=1 */
export async function DELETE(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的 id" }, { status: 400 });
  }
  const deleted = await db.delete(feeds).where(eq(feeds.id, id)).returning();
  if (!deleted.length) return NextResponse.json({ error: "订阅不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
