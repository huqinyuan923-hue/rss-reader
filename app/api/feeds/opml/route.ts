import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { feeds } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { normalizeFeedUrl } from "@/lib/fetch-feed";
import { refreshFeed } from "@/lib/refresh";

export const maxDuration = 60;

const MAX_OPML_FEEDS = 50;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** GET /api/feeds/opml — 导出全部订阅为 OPML 2.0 */
export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;

  const rows = await db.select().from(feeds).orderBy(asc(feeds.createdAt));
  const outlines = rows
    .map(
      (f) =>
        `  <outline type="rss" text="${xmlEscape(f.title)}" xmlUrl="${xmlEscape(f.url)}"${
          f.siteUrl ? ` htmlUrl="${xmlEscape(f.siteUrl)}"` : ""
        } />`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>订阅站 RSS Reader</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "text/x-opml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="feeds.opml"',
    },
  });
}

/** POST /api/feeds/opml { opml: string } — 导入 OPML（上限 50 个订阅源） */
export async function POST(req: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  let body: { opml?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  if (!body.opml || typeof body.opml !== "string" || body.opml.length > 512 * 1024) {
    return NextResponse.json({ error: "缺少有效的 OPML 内容" }, { status: 400 });
  }

  // 服务端轻解析：只抓 <outline ... xmlUrl="...">，属性值允许单双引号
  const items: { title: string; xmlUrl: string; htmlUrl: string }[] = [];
  const re = /<outline\b[^>]*?\bxmlUrl\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi;
  for (const m of body.opml.matchAll(re)) {
    const xmlUrl = m[2] ?? m[3] ?? "";
    const tag = m[0];
    const textM = tag.match(/\btext\s*=\s*"([^"]*)"/i) || tag.match(/\btext\s*=\s*'([^']*)'/i);
    const titleM = tag.match(/\btitle\s*=\s*"([^"]*)"/i) || tag.match(/\btitle\s*=\s*'([^']*)'/i);
    const htmlM = tag.match(/\bhtmlUrl\s*=\s*"([^"]*)"/i) || tag.match(/\bhtmlUrl\s*=\s*'([^']*)'/i);
    items.push({
      title: (textM?.[1] || titleM?.[1] || "").trim(),
      xmlUrl,
      htmlUrl: (htmlM?.[1] || "").trim(),
    });
    if (items.length >= MAX_OPML_FEEDS) break;
  }
  if (!items.length) {
    return NextResponse.json({ error: "OPML 里没有找到带 xmlUrl 的订阅源" }, { status: 400 });
  }

  const existing = new Set(
    (await db.select({ url: feeds.url }).from(feeds)).map((f) => f.url),
  );

  let added = 0, skipped = 0, failed = 0;
  for (const item of items) {
    const parsed = normalizeFeedUrl(item.xmlUrl);
    if (!parsed) { failed++; continue; }
    const url = parsed.toString();
    if (existing.has(url)) { skipped++; continue; }
    existing.add(url);
    await db.insert(feeds).values({
      url,
      title: item.title || parsed.hostname,
      siteUrl: item.htmlUrl,
    });
    added++;
  }

  return NextResponse.json({ added, skipped, failed, total: items.length });
}
