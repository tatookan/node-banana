"use client";

import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Header } from "@/components/Header";
import { WorkflowCanvas } from "@/components/WorkflowCanvas";
import { FloatingActionBar } from "@/components/FloatingActionBar";
import { AnnotationModal } from "@/components/AnnotationModal";
import { QueuePanel } from "@/components/QueuePanel";
import { WorkflowsPanel } from "@/components/WorkflowsPanel";
import { TemplateModal } from "@/components/TemplateModal";
import { SettingsModal } from "@/components/SettingsModal";
import { useWorkflowStore } from "@/store/workflowStore";

// 侧边栏状态类型
type SidebarPanel = 'workflows' | 'queue' | null;

export default function Home() {
  const initializeAutoSave = useWorkflowStore(
    (state) => state.initializeAutoSave
  );
  const cleanupAutoSave = useWorkflowStore((state) => state.cleanupAutoSave);

  // 侧边栏和弹窗状态
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  useEffect(() => {
    initializeAutoSave();
    return () => cleanupAutoSave();
  }, [initializeAutoSave, cleanupAutoSave]);

  // 检查是否需要打开工作流面板（从 /workflows 重定向）
  useEffect(() => {
    const shouldOpenPanel = sessionStorage.getItem('openWorkflowsPanel');
    if (shouldOpenPanel === 'true') {
      setSidebarPanel('workflows');
      sessionStorage.removeItem('openWorkflowsPanel');
    }
  }, []);

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col">
        <Header
          sidebarPanel={sidebarPanel}
          setSidebarPanel={setSidebarPanel}
          showTemplateModal={showTemplateModal}
          setShowTemplateModal={setShowTemplateModal}
          showSettingsModal={showSettingsModal}
          setShowSettingsModal={setShowSettingsModal}
        />
        <WorkflowCanvas />
        <FloatingActionBar />
        <AnnotationModal />

        {/* 左侧工作流面板 */}
        <WorkflowsPanel
          isOpen={sidebarPanel === 'workflows'}
          onClose={() => setSidebarPanel(null)}
        />

        {/* 左侧队列面板 */}
        <QueuePanel
          isOpen={sidebarPanel === 'queue'}
          onClose={() => setSidebarPanel(null)}
        />

        {/* 模板库弹窗 */}
        <TemplateModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
        />

        {/* 设置弹窗 */}
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />
      </div>
    </ReactFlowProvider>
  );
}
