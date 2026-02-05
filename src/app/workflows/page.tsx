"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 工作流页面 - 重定向到首页并打开侧边栏
 * 此页面保留用于向后兼容，所有功能已集成到首页左侧栏
 */
export default function WorkflowsPage() {
  const router = useRouter();

  useEffect(() => {
    // 设置标志以在首页打开工作流面板
    sessionStorage.setItem('openWorkflowsPanel', 'true');
    // 重定向到首页
    router.replace('/');
  }, [router]);

  // 显示加载状态（重定向期间短暂显示）
  return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-neutral-500 text-sm">正在跳转...</div>
    </div>
  );
}
