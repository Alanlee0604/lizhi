import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "lizhi 鲜打只读验证",
  description: "Isolated Vercel Function read-only verification. No cron. No voting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
