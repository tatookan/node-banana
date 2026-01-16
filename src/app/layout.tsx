import type { Metadata } from "next";
import "./globals.css";
import { Toast } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Node Banana - AI 分镜画板",
  description: "基于节点的 AI 图像标注和生成工作流，使用 AI分镜画板 Pro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <Toast />
      </body>
    </html>
  );
}
