# 📡 订阅站 · RSS Reader

[![Deployed on Vercel](https://img.shields.io/badge/部署-Vercel-black?logo=vercel)](#-部署)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Cron](https://img.shields.io/badge/Vercel%20Cron-每日抓取-8b7bff?logo=clock)](vercel.json)

私有部署的 RSS 订阅聚合：**Vercel Cron 每日定时抓取**、未读管理、粘贴站点首页自动发现订阅源。单密码登录，数据存自己的 Neon Postgres。

## ✨ 功能

- **订阅管理**：粘贴 RSS/Atom 地址直接订阅；粘贴博客首页也会自动发现 `<link rel="alternate">` 订阅源
- **定时抓取**：Vercel Cron 每日拉取增量文章（每源最多保留 200 条，超出自动裁剪）
- **手动刷新**：页面一键「立即刷新」，走同一个抓取管道
- **OPML 导入/导出**：标准格式迁移订阅源（导出 GET /api/feeds/opml；导入上限 50 源，自动查重）
- **未读管理**：未读徽章按源统计、只看未读过滤、单篇/全部标为已读
- **健壮性**：
  - 抓取限时 10s、正文限 512KB，网络抖动自动重试一次（4xx 不重试）
  - 失败的源记录 `lastError`，侧栏显示 ⚠，不影响其他源
  - 站点拒绝抓取（403）时给出友好提示，引导直接粘贴 RSS 地址

## 🔒 安全设计

- 所有 SQL 经 **Drizzle 参数绑定**（含批量插入与裁剪删除）
- 订阅源抓取 **SSRF 防护**：仅 http/https，拒绝 localhost / 内网段 / 链路本地地址
- 单密码登录（恒定时间比较）+ HS256 JWT 会话；Cron 请求用独立的 `CRON_SECRET` Bearer 鉴权
- 中间件统一鉴权：API 401 / 页面重定向登录页

## 🛠 技术栈

Next.js 15 (App Router) · Drizzle ORM · Neon Postgres (`@neondatabase/serverless`) · rss-parser · jose · Vercel Cron · 原生 CSS

```
db/schema.ts          feeds + articles（feed+guid 唯一索引，级联删除）
lib/fetch-feed.ts     抓取/解析/自动发现/SSRF 防护
lib/refresh.ts        单源刷新：增量入库 + 裁剪 + 错误记录
app/api/cron/fetch    定时与手动刷新入口（Bearer 或会话）
middleware.ts         边缘鉴权
vercel.json           Cron: 每日 03:00 UTC
```

## 🚀 部署

1. Neon 建 `feeds` 数据库，`npx drizzle-kit push` 建表
2. Vercel 导入仓库，环境变量：
   - `DATABASE_URL` / `ADMIN_PASSWORD` / `SESSION_SECRET`
   - `CRON_SECRET`（`openssl rand -hex 24`，供 Vercel Cron 调用）
3. `vercel.json` 已声明 Cron；若 Vercel Cron 推送过慢，可用页面「立即刷新」

> 注意：Vercel Hobby 计划的 Cron 精度为每日一次；更频繁抓取需要 Pro 或外部定时器（如 cron-job.org）带 `CRON_SECRET` 调 GET 接口。

## 📄 License

[MIT](LICENSE)
