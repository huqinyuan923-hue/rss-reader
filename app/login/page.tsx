"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const next = new URLSearchParams(location.search).get("next") || "/";
        location.href = next.startsWith("/") ? next : "/";
        return;
      }
      const data = await res.json();
      setMsg("✗ " + (data.error || "登录失败"));
    } catch {
      setMsg("✗ 网络异常，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <span className="brand">📡 订阅站 <span className="gem">RSS Reader</span></span>
        </div>
      </header>
      <main className="login-main">
        <form className="login-card" onSubmit={submit}>
          <h1>登录</h1>
          <p className="sub">私有订阅库，请输入访问密码</p>
          <input
            type="password"
            placeholder="访问密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            aria-label="访问密码"
          />
          <button className="btn primary" disabled={busy}>
            {busy ? "验证中…" : "进入"}
          </button>
          <p className="msg err" role="status" aria-live="polite">{msg}</p>
        </form>
      </main>
    </>
  );
}
