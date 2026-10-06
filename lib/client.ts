"use client";

/**
 * 浏览器端同源 API 客户端：全部请求都发往本站固定路径（相对路径常量），
 * 不接受也不拼接任何用户提供的绝对 URL，不存在 SSRF 面。
 * 服务端对订阅源抓取的 SSRF 防护见 lib/fetch-feed.ts（协议 + 内网地址黑名单）。
 */

async function handle(resPromise: Promise<Response>) {
  const res = await resPromise;
  if (res.status === 401) {
    location.href = "/login";
    throw new Error("未登录");
  }
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || "请求失败"), { data, status: res.status });
  return data;
}

export function apiGet<T>(path: string): Promise<T> {
  return handle(fetch(path));
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return handle(fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return handle(fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

export function apiDelete(path: string): Promise<unknown> {
  return handle(fetch(path, { method: "DELETE" }));
}
