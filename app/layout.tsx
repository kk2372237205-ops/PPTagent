import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WZLCF | 让每一次表达更有说服力",
  description: "高品质 PPT 定制、设计与长期资产管理服务"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
