"use client";

import type { Article, Feed } from "@/db/schema";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type FeedWithUnread = Feed & { unread: number };

export default function Reader() {
  const [feeds, setFeeds] = useState<FeedWithUnread[] | null>(null);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [activeFeed, setActiveFeed] = useState<number | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeeds = useCallback(async () => {
    try {
      const data = await apiGet<{ feeds: FeedWithUnread[] }>("/api/feeds");
      setFeeds(data.feeds);
    } catch { /* 未登录时 client 已跳转 */ }
  }, []);

  const loadArticles = useCallback(async (feedId: number | null, unread: boolean) => {
    try {
      const p = new URLSearchParams();
      if (feedId) p.set("feedId", String(feedId));
      if (unread) p.set("unread", "1");
      const data = await apiGet<{ articles: Article[] }>("/api/articles?" + p.toString());
      setArticles(data.articles);
    } catch { /* 未登录时 client 已跳转 */ }
  }, []);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);
  useEffect(() => { loadArticles(activeFeed, unreadOnly); }, [activeFeed, unreadOnly, loadArticles]);

  const totalUnread = useMemo(
    () => (feeds || []).reduce((s, f) => s + f.unread, 0),
    [feeds]
  );

  async function addFeed(e: React.FormEvent) {
    e.preventDefault();
    const input = newUrl.trim();
    if (!input) return;
    setBusy(true);
    setMsg(null);
    try {
      const data = await apiPost<{ feed: Feed; refresh: { ok: boolean; count?: number } }>(
        "/api/feeds", { url: input });
      setMsg({
        text: `✓ 已订阅「${data.feed.title}」${data.refresh.ok ? `，首批拉取 ${data.refresh.count} 条` : "（首批抓取失败，稍后自动重试）"}`,
        ok: true,
      });
      setNewUrl("");
      await loadFeeds();
      setActiveFeed(data.feed.id);
    } catch (err) {
      setMsg({ text: "✗ " + (err as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function delFeed(id: number, name: string) {
    if (!confirm(`退订「${name}」？其所有文章将一并删除。`)) return;
    await apiDelete("/api/feeds?id=" + id);
    const next = activeFeed === id ? null : activeFeed;
    setActiveFeed(next);
    await Promise.all([loadFeeds(), loadArticles(next, unreadOnly)]);
  }

  async function markRead(a: Article) {
    if (a.readAt) return;
    setArticles((list) =>
      list ? list.map((x) => (x.id === a.id ? { ...x, readAt: new Date() } : x)) : list
    );
    setFeeds((fs) =>
      fs ? fs.map((f) => (f.id === a.feedId ? { ...f, unread: Math.max(0, f.unread - 1) } : f)) : fs
    );
    await apiPatch("/api/articles?id=" + a.id, { read: true });
  }

  async function readAll() {
    const data = await apiPost<{ updated: number }>("/api/articles", {
      action: "read-all", feedId: activeFeed,
    });
    await Promise.all([loadFeeds(), loadArticles(activeFeed, unreadOnly)]);
    setMsg({ text: `✓ 已标记 ${data.updated} 篇为已读`, ok: true });
  }

  async function refreshNow() {
    setRefreshing(true);
    setMsg(null);
    try {
      const data = await apiPost<{ refreshed: number; failed: number }>("/api/cron/fetch", {});
      setMsg({
        text: `✓ 已刷新 ${data.refreshed} 个订阅源${data.failed ? `，${data.failed} 个失败` : ""}`,
        ok: data.failed === 0,
      });
      await Promise.all([loadFeeds(), loadArticles(activeFeed, unreadOnly)]);
    } catch (err) {
      setMsg({ text: "✗ 刷新失败：" + (err as Error).message, ok: false });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <span className="brand">📡 订阅站 <span className="gem">RSS Reader</span></span>
          <div className="header-actions">
            <button className="btn" onClick={refreshNow} disabled={refreshing}>
              {refreshing ? "刷新中…" : "立即刷新"}
            </button>
            <button className="btn" onClick={async () => { await apiPost("/api/logout", {}); location.href = "/login"; }}>
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="reader">
        <aside className="sidebar">
          <h2>订阅源 {feeds ? `（${feeds.length}）` : ""}</h2>
          <form className="add-feed" onSubmit={addFeed}>
            <input
              type="url"
              placeholder="RSS 或站点地址"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              aria-label="订阅源地址"
            />
            <button className="btn primary" disabled={busy}>{busy ? "…" : "订阅"}</button>
          </form>
          <p className={"msg" + (msg ? (msg.ok ? " ok" : " err") : "")} role="status" aria-live="polite">
            {msg?.text || ""}
          </p>
          <div>
            <button
              className={"feed-item" + (activeFeed === null ? " on" : "")}
              onClick={() => setActiveFeed(null)}
            >
              <span className="name">全部文章</span>
              {totalUnread > 0 && <span className="unread">{totalUnread}</span>}
            </button>
            {(feeds || []).map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center" }}>
                <button
                  className={"feed-item" + (activeFeed === f.id ? " on" : "")}
                  style={{ flex: 1 }}
                  onClick={() => setActiveFeed(f.id)}
                  title={f.lastError ? `上次抓取出错：${f.lastError}` : f.title}
                >
                  <span className="name">{f.title}</span>
                  {f.lastError && <span className="err-dot" title={f.lastError}>⚠</span>}
                  {f.unread > 0 && <span className="unread">{f.unread}</span>}
                </button>
                <button className="feed-del" onClick={() => delFeed(f.id, f.title)} aria-label={`退订 ${f.title}`}>✕</button>
              </div>
            ))}
            {feeds !== null && feeds.length === 0 && (
              <p style={{ color: "var(--fg-muted)", fontSize: "0.85rem", margin: "8px 0 0" }}>
                左侧添加你的第一个订阅源 👆<br />直接粘贴博客首页地址也行，会自动发现 RSS。
              </p>
            )}
          </div>
        </aside>

        <section className="articles" aria-live="polite">
          <div className="toolbar">
            <label className="unread-toggle">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} style={{ width: "auto", margin: 0 }} />
              只看未读
            </label>
            <button className="btn mini" onClick={readAll}>全部标为已读</button>
            <span style={{ color: "var(--fg-muted)", fontSize: "0.85rem" }}>
              {articles === null ? "加载中…" : `${articles.length} 篇`}
            </span>
          </div>

          {articles === null && <p className="empty">正在加载…</p>}
          {articles !== null && articles.length === 0 && (
            <p className="empty">这里空空如也 —— 添加订阅源后点「立即刷新」。</p>
          )}

          {articles?.map((a) => (
            <article key={a.id} className={"article-card" + (a.readAt ? "" : " unread")}>
              <div className="a-body">
                <a
                  className="a-title"
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => markRead(a)}
                >
                  {a.title}
                </a>
                <p className="a-meta">
                  {(feeds || []).find((f) => f.id === a.feedId)?.title || "未知来源"}
                  {a.author ? ` · ${a.author}` : ""}
                  {a.publishedAt ? ` · ${new Date(a.publishedAt).toLocaleDateString("zh-CN")}` : ""}
                </p>
                {a.summary && <p className="a-summary">{a.summary}</p>}
              </div>
              <button className="a-read-btn" onClick={() => markRead(a)}>
                {a.readAt ? "已读" : "标为已读"}
              </button>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
