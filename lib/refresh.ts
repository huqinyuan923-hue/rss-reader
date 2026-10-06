import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { articles, feeds } from "@/db/schema";
import { fetchFeed, normalizeFeedUrl } from "@/lib/fetch-feed";

const KEEP_PER_FEED = 200;

/** 抓取单个订阅源并把新文章入库（每个源最多保留 200 条） */
export async function refreshFeed(feedId: number, feedUrl: string, feedTitle: string) {
  try {
    const parsedUrl = normalizeFeedUrl(feedUrl);
    if (!parsedUrl) throw new Error("订阅源地址无效");
    const { meta } = await fetchFeed(parsedUrl);

    if (meta.items.length) {
      await db
        .insert(articles)
        .values(
          meta.items.map((it) => ({
            feedId,
            guid: it.guid.slice(0, 500),
            url: it.url.slice(0, 1000),
            title: it.title,
            summary: it.summary,
            author: it.author,
            publishedAt: it.publishedAt,
          }))
        )
        .onConflictDoNothing({ target: [articles.feedId, articles.guid] });
    }

    // 裁剪：仅保留最近 KEEP_PER_FEED 条（查询构建器实现，全部参数绑定）
    const keep = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.feedId, feedId))
      .orderBy(desc(articles.publishedAt), desc(articles.id))
      .limit(KEEP_PER_FEED);
    if (keep.length >= KEEP_PER_FEED) {
      const keepIds = keep.map((k) => k.id);
      await db
        .delete(articles)
        .where(and(eq(articles.feedId, feedId), notInArray(articles.id, keepIds)));
    }

    await db
      .update(feeds)
      .set({ lastFetchedAt: new Date(), lastError: "", title: meta.title || feedTitle })
      .where(eq(feeds.id, feedId));
    return { ok: true, count: meta.items.length };
  } catch (e) {
    await db
      .update(feeds)
      .set({ lastFetchedAt: new Date(), lastError: String((e as Error).message || e).slice(0, 300) })
      .where(eq(feeds.id, feedId));
    return { ok: false, error: String((e as Error).message || e).slice(0, 200) };
  }
}
