import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: [["summary", "summaryText"], ["content:encoded", "contentEncoded"]],
  },
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; RSSReaderBot/1.0; +https://github.com/huqinyuan923-hue)",
  },
});

// 仅允许 http/https，拒绝内网目标（SSRF 防护）
const BLOCKED_HOST = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./,
  /^\[?::1\]?$/, /^\[?fc00:/i, /^\[?fe80:/i, /\.local$/i, /\.internal$/i,
];

export function normalizeFeedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (BLOCKED_HOST.some((re) => re.test(u.hostname))) return null;
    return u;
  } catch {
    return null;
  }
}

/** 限时抓取正文（最多 512KB），网络抖动自动重试一次 */
async function fetchBody(url: URL, timeoutMs = 10000): Promise<string> {
  try {
    return await fetchOnce(url, timeoutMs);
  } catch (e) {
    if (/HTTP 4\d\d/.test(String((e as Error).message))) throw e; // 4xx 不重试
    await new Promise((r) => setTimeout(r, 1500));
    return fetchOnce(url, timeoutMs);
  }
}

async function fetchOnce(url: URL, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RSSReaderBot/1.0)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 512 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x?([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, n.toLowerCase().startsWith("x") ? 16 : 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** 从 HTML 里发现 <link rel="alternate" type="application/rss+xml"> */
function discoverFeedUrl(html: string, base: URL): URL | null {
  const linkTag =
    html.match(/<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/i) ||
    html.match(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*rel=["']alternate["'][^>]*>/i);
  if (!linkTag) return null;
  const href = linkTag[0].match(/href=["']([^"']+)["']/i);
  if (!href) return null;
  try {
    return new URL(href[1], base);
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
  ).slice(0, 500);
}

export interface FeedMeta {
  title: string;
  siteUrl: string;
  items: {
    guid: string;
    url: string;
    title: string;
    summary: string;
    author: string;
    publishedAt: Date | null;
  }[];
}

/** 抓取并解析 RSS / Atom；传入站点首页时自动发现订阅源 */
export async function fetchFeed(rawUrl: URL): Promise<{ meta: FeedMeta; feedUrl: URL }> {
  let body: string;
  let feedUrl = rawUrl;
  try {
    body = await fetchBody(rawUrl);
  } catch (e) {
    const reason = String((e as Error).message || e);
    if (/HTTP 40[13]/.test(reason)) {
      throw new Error("目标站点拒绝了抓取（" + reason + "），请直接粘贴它的 RSS/Atom 地址");
    }
    throw e;
  }

  const looksLikeFeed = /<rss[\s>]|<feed[\s>]/i.test(body.slice(0, 2000));
  if (!looksLikeFeed) {
    const discovered = discoverFeedUrl(body, rawUrl);
    if (!discovered) throw new Error("该地址不是订阅源，也没发现 RSS/Atom 链接");
    feedUrl = discovered;
    body = await fetchBody(feedUrl);
  }

  const parsed = await parser.parseString(body);
  // rss-parser 的 Item 类型不含 Atom 字段（id/author 等），此处按宽松结构读取
  type LooseItem = { title?: string; link?: string; guid?: string; id?: string; isoDate?: string; pubDate?: string; creator?: string; author?: string; content?: string; summary?: string; contentEncoded?: string; "content:encoded"?: string };
  const items = ((parsed.items || []) as unknown as LooseItem[]).slice(0, 100).map((item, idx) => {
    const link = item.link || item.guid || "";
    let itemUrl = "";
    try {
      itemUrl = new URL(link, feedUrl).toString();
    } catch {
      itemUrl = link;
    }
    const content = item.contentEncoded || item["content:encoded"] || item.content || item.summary || "";
    return {
      guid: item.guid || item.id || itemUrl || `${feedUrl}#${idx}`,
      url: itemUrl,
      title: decodeEntities(item.title || "(无标题)").slice(0, 300),
      summary: stripHtml(content),
      author: decodeEntities(String(item.creator || item.author || "")).slice(0, 100),
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
    };
  });

  return {
    feedUrl,
    meta: {
      title: decodeEntities(parsed.title || feedUrl.hostname).slice(0, 200),
      siteUrl: parsed.link ? (() => { try { return new URL(parsed.link, feedUrl).toString(); } catch { return ""; } })() : "",
      items,
    },
  };
}
