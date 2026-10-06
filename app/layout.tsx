import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "订阅站 · RSS Reader",
  description: "私有 RSS 订阅聚合：定时抓取、未读管理、一键刷新。",
};

export const viewport: Viewport = {
  themeColor: "#0d1024",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
