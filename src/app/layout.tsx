import type { Metadata } from "next";
import "./globals.css";
import { Toast } from "@/components/Toast";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "心视觉 - AI 分镜画板",
  description: "基于节点的 AI 图像涂鸦和生成工作流，使用 AI分镜画板 Pro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>
          {children}
          <Toast />
        </AuthProvider>
      </body>
    </html>
  );
}
