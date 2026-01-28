"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorkflowStore, WorkflowFile } from "@/store/workflowStore";
import { ProjectSetupModal } from "./ProjectSetupModal";
import { CostIndicator } from "./CostIndicator";
import { StatsModal } from "./StatsModal";
import ImageGallery from "./ImageGallery";
import { useAuth } from "@/contexts/AuthContext";
import { SaveToServerModal } from "@/components/workflows/SaveToServerModal";
import type { WorkflowFolder } from "@/types";

export function Header() {
  const router = useRouter();
  const { user, logout, isAdmin } = useAuth();
  const {
    workflowName,
    workflowId,
    saveDirectoryPath,
    hasUnsavedChanges,
    lastSavedAt,
    isSaving,
    setWorkflowMetadata,
    saveToFile,
    loadWorkflow,
    saveToServer,
    serverWorkflowName,
    serverWorkflowDescription,
    serverFolderId,
  } = useWorkflowStore();

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<"new" | "settings">("new");
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showCloudGallery, setShowCloudGallery] = useState(false);
  const [showSaveToServerModal, setShowSaveToServerModal] = useState(false);
  const [folders, setFolders] = useState<WorkflowFolder[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProjectConfigured = !!workflowName;
  const canSave = !!(workflowId && workflowName && saveDirectoryPath);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleNewProject = () => {
    setProjectModalMode("new");
    setShowProjectModal(true);
  };

  const handleOpenSettings = () => {
    setProjectModalMode("settings");
    setShowProjectModal(true);
  };

  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const workflow = JSON.parse(event.target?.result as string) as WorkflowFile;
        if (workflow.version && workflow.nodes && workflow.edges) {
          await loadWorkflow(workflow);
        } else {
          alert("无效的工作流文件格式");
        }
      } catch {
        alert("解析工作流文件失败");
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be loaded again
    e.target.value = "";
  };

  const handleProjectSave = async (id: string, name: string, path: string) => {
    setWorkflowMetadata(id, name, path); // generationsPath is auto-derived
    setShowProjectModal(false);
    // Small delay to let state update
    setTimeout(() => {
      saveToFile().catch((error) => {
        console.error("Failed to save project:", error);
        alert("保存项目失败，请重试。");
      });
    }, 50);
  };

  const handleOpenDirectory = async () => {
    if (!saveDirectoryPath) return;

    try {
      const response = await fetch("/api/open-directory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: saveDirectoryPath }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error("Failed to open directory:", result.error);
        alert(`打开项目文件夹失败: ${result.error || "未知错误"}`);
        return;
      }
    } catch (error) {
      console.error("Failed to open directory:", error);
      alert("打开项目文件夹失败，请重试。");
    }
  };

  // 加载文件夹列表
  const loadFolders = async () => {
    if (!user) return;
    setIsLoadingFolders(true);
    try {
      const response = await fetch("/api/workflow-folders");
      const data = await response.json();
      if (data.success) {
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error("加载文件夹失败:", error);
    } finally {
      setIsLoadingFolders(false);
    }
  };

  // 打开云端保存弹窗
  const handleOpenSaveToServerModal = async () => {
    await loadFolders();
    setShowSaveToServerModal(true);
  };

  // 保存到服务器
  const handleSaveToServer = async (name: string, description?: string, folderId?: number | null) => {
    const success = await saveToServer(name, description, folderId);
    if (success) {
      alert("保存成功！");
    } else {
      alert("保存失败，请重试。");
    }
  };

  return (
    <>
      <ProjectSetupModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        onSave={handleProjectSave}
        mode={projectModalMode}
      />
      <StatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
      />

      {/* Save to Server Modal */}
      <SaveToServerModal
        isOpen={showSaveToServerModal}
        onClose={() => setShowSaveToServerModal(false)}
        onSave={handleSaveToServer}
        currentName={serverWorkflowName || workflowName}
        currentDescription={serverWorkflowDescription}
        currentFolderId={serverFolderId}
        folders={folders}
        isLoading={isLoadingFolders}
      />

      {/* Cloud Gallery Modal */}
      {showCloudGallery && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setShowCloudGallery(false)}
        >
          <div
            className="w-[90vw] h-[80vh] rounded-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <ImageGallery />
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
      <header className="h-11 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="心视觉" className="w-6 h-6" />
          <h1 className="text-2xl font-semibold text-neutral-100 tracking-tight">
            心视觉
          </h1>

          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-neutral-700">
            {isProjectConfigured ? (
              <>
                <span className="text-sm text-neutral-300">{workflowName}</span>
                <span className="text-neutral-600">|</span>
                <CostIndicator />
                <button
                  onClick={() => canSave ? saveToFile() : handleOpenSettings()}
                  disabled={isSaving}
                  className="relative p-1 text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50"
                  title={isSaving ? "保存中..." : canSave ? "保存项目" : "配置保存位置"}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                  {hasUnsavedChanges && !isSaving && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </button>
                {/* 云端保存按钮 */}
                {user && (
                  <button
                    onClick={handleOpenSaveToServerModal}
                    className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
                    title="保存到服务器"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                      />
                    </svg>
                  </button>
                )}
                {saveDirectoryPath && (
                  <button
                    onClick={handleOpenDirectory}
                    className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
                    title="打开项目文件夹"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                      />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleOpenSettings}
                  className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
                  title="项目设置"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3 text-xs">
                <button
                  onClick={handleNewProject}
                  className="text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  保存项目
                </button>
                {/* 云端保存按钮（未配置状态） */}
                {user && (
                  <button
                    onClick={handleOpenSaveToServerModal}
                    className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
                    title="保存到服务器"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                      />
                    </svg>
                  </button>
                )}
                <span className="text-neutral-500">·</span>
                <button
                  onClick={handleOpenFile}
                  className="text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  打开
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {user && (
            <>
              <button
                onClick={() => setShowStatsModal(true)}
                className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
                title="使用统计"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </button>
              {isAdmin && (
                <button
                  onClick={() => router.push("/admin")}
                  className="p-1 text-purple-400 hover:text-purple-300 transition-colors"
                  title="管理后台"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowCloudGallery(true)}
                className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
                title="云端图片库"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 15a4 4 0 0 0 4 4h9a5 5 0 1 0-.1-9.999 5.002 5.002 0 1 0-9.78 2.096A4.001 4.001 0 0 0 3 15Z"
                  />
                </svg>
              </button>
              <button
                onClick={() => router.push("/workflows")}
                className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
                title="我的工作流"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </button>
              <span className="text-neutral-400">{user.username}</span>
              <span className="text-neutral-500">·</span>
            </>
          )}
          {isProjectConfigured && (
            <>
              <span className="text-neutral-400">
                {isSaving ? (
                  "保存中..."
                ) : lastSavedAt ? (
                  `已保存 ${formatTime(lastSavedAt)}`
                ) : (
                  "未保存"
                )}
              </span>
              <span className="text-neutral-500">·</span>
              <button
                onClick={handleOpenFile}
                className="text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                打开
              </button>
            </>
          )}
          <span className="text-neutral-500 ml-2">·</span>
          <a
            href="https://xinshijue"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            心视觉文化
          </a>
          <span className="text-neutral-500">·</span>
          <a
            href="https://xinshijue"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-neutral-200 transition-colors"
            title="微信公众号"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.812 1.932-6.348 1.703-1.456 3.882-2.229 6.258-2.229 5.43 0 9.828 3.421 9.828 7.642 0 4.22-4.398 7.642-9.828 7.642-.726 0-1.435-.07-2.115-.2l-.025-.01-1.952 1.293a.459.459 0 0 1-.237.068c-.208 0-.38-.175-.38-.386 0-.085.027-.165.075-.232l.455-1.705a.718.718 0 0 0-.246-.795C2.986 19.59 0 16.299 0 12.247c0-4.06 3.891-7.342 8.691-7.342zm14.365 7.713c0 3.485-3.025 6.308-6.76 6.308a7.17 7.17 0 0 1-2.285-.374l-.018-.007-1.675 1.11a.393.393 0 0 1-.204.058c-.18 0-.327-.151-.327-.332 0-.073.023-.142.065-.2l.39-1.467a.618.618 0 0 0-.21-.683c-1.733-1.19-2.872-3.069-2.872-5.2 0-3.485 3.025-6.307 6.76-6.307 3.736 0 6.761 2.822 6.761 6.307l-.725.036zm-2.668-2.108c.322 0 .582.266.582.593s-.26.594-.582.594a.588.588 0 0 1-.582-.594c0-.327.26-.593.582-.593zm-4.225 0c.322 0 .582.266.582.593s-.26.594-.582.594a.588.588 0 0 1-.582-.594c0-.327.26-.593.582-.593z"/>
            </svg>
          </a>
          {user && (
            <>
              <span className="text-neutral-500">·</span>
              <button
                onClick={logout}
                className="text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                退出
              </button>
            </>
          )}
        </div>
      </header>
    </>
  );
}
