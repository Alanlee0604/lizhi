import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "安崎 / 黄灿灿 公开榜票仓",
  description: "打歌2026·X舞台第9期鲜打专区。只读共享 votes.alan0828.cloud 原库历史，不是迁库。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
