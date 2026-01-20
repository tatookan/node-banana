"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkflowStore } from "@/store/workflowStore";
import { WorkflowList } from "@/components/workflows/WorkflowList";
import { FolderSidebar } from "@/components/workflows/FolderSidebar";
import { FolderCreateModal } from "@/components/workflows/FolderCreateModal";
import { WorkflowRenameModal } from "@/components/workflows/WorkflowRenameModal";
import type { WorkflowFolder, ServerWorkflow, WorkflowsQueryParams } from "@/types";

interface ViewMode {
  value: "grid" | "list";
}

export default function WorkflowsPage() {
  const router = useRouter();
  const loadFromServer = useWorkflowStore((state) => state.loadFromServer);
  const [workflows, setWorkflows] = useState<ServerWorkflow[]>([]);
  const [folders, setFolders] = useState<WorkflowFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode["value"]>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  // 模态框状态
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<ServerWorkflow | null>(null);

  // 加载状态
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(true);

  // 加载文件夹列表
  const loadFolders = useCallback(async () => {
    setIsLoadingFolders(true);
    try {
      const response = await fetch("/api/workflow-folders");
      const data = await response.json();
      if (data.success) {
        setFolders(data.folders);
      }
    } catch (error) {
      console.error("加载文件夹失败:", error);
    } finally {
      setIsLoadingFolders(false);
    }
  }, []);

  // 加载工作流列表
  const loadWorkflows = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: WorkflowsQueryParams = {
        page,
        limit,
      };

      if (selectedFolderId) {
        params.folder_id = selectedFolderId;
      }

      if (searchQuery) {
        params.search = searchQuery;
      }

      const queryString = new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = String(value);
          }
          return acc;
        }, {} as Record<string, string>)
      ).toString();

      const response = await fetch(`/api/workflows?${queryString}`);
      const data = await response.json();
      if (data.success) {
        setWorkflows(data.workflows);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("加载工作流失败:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedFolderId, searchQuery, limit]);

  // 初始化加载
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  // 创建文件夹
  const handleCreateFolder = async (name: string, icon?: string, color?: string) => {
    try {
      const response = await fetch("/api/workflow-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon, color }),
      });
      const data = await response.json();
      if (data.success) {
        await loadFolders();
        setShowCreateFolderModal(false);
      } else {
        alert(data.error || "创建文件夹失败");
      }
    } catch (error) {
      console.error("创建文件夹失败:", error);
      alert("创建文件夹失败");
    }
  };

  // 打开工作流
  const handleOpenWorkflow = async (workflow: ServerWorkflow) => {
    const success = await loadFromServer(workflow.id);
    if (success) {
      router.push("/");
    } else {
      alert("加载工作流失败，请重试。");
    }
  };

  // 重命名工作流
  const handleRenameWorkflow = async (id: number, name: string) => {
    try {
      const response = await fetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (data.success) {
        await loadWorkflows();
        setShowRenameModal(false);
        setSelectedWorkflow(null);
      } else {
        alert(data.error || "重命名失败");
      }
    } catch (error) {
      console.error("重命名失败:", error);
      alert("重命名失败");
    }
  };

  // 删除工作流
  const handleDeleteWorkflow = async (id: number) => {
    if (!confirm("确定要删除这个工作流吗？")) return;

    try {
      const response = await fetch(`/api/workflows/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        await loadWorkflows();
      } else {
        alert(data.error || "删除失败");
      }
    } catch (error) {
      console.error("删除失败:", error);
      alert("删除失败");
    }
  };

  // 切换收藏状态
  const handleToggleFavorite = async (workflow: ServerWorkflow) => {
    try {
      const response = await fetch(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: !workflow.is_favorite }),
      });
      const data = await response.json();
      if (data.success) {
        await loadWorkflows();
      }
    } catch (error) {
      console.error("切换收藏失败:", error);
    }
  };

  // 移动工作流到文件夹
  const handleMoveWorkflow = async (workflowId: number, folderId: number | null) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      const data = await response.json();
      if (data.success) {
        await loadWorkflows();
      } else {
        alert(data.error || "移动失败");
      }
    } catch (error) {
      console.error("移动失败:", error);
      alert("移动失败");
    }
  };

  // 删除文件夹
  const handleDeleteFolder = async (folderId: number) => {
    if (!confirm("确定要删除这个文件夹吗？")) return;

    try {
      const response = await fetch(`/api/workflow-folders/${folderId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        if (selectedFolderId === folderId) {
          setSelectedFolderId(null);
        }
        await loadFolders();
      } else {
        alert(data.error || "删除文件夹失败");
      }
    } catch (error) {
      console.error("删除文件夹失败:", error);
      alert("删除文件夹失败");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      {/* 顶部导航栏 */}
      <header className="h-14 border-b border-neutral-800 flex items-center justify-between px-4 bg-neutral-900/50">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-neutral-200">我的工作流</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
            >
              返回编辑器
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 搜索框 */}
          <input
            type="text"
            placeholder="搜索工作流..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {/* 视图切换 */}
          <div className="flex items-center border border-neutral-700 rounded overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 ${viewMode === "grid" ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}`}
              title="网格视图"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}`}
              title="列表视图"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 文件夹侧边栏 */}
        <FolderSidebar
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onCreateFolder={() => setShowCreateFolderModal(true)}
          onDeleteFolder={handleDeleteFolder}
          isLoading={isLoadingFolders}
        />

        {/* 工作流列表 */}
        <main className="flex-1 overflow-auto p-6">
          <WorkflowList
            workflows={workflows}
            viewMode={viewMode}
            isLoading={isLoading}
            onOpenWorkflow={handleOpenWorkflow}
            onRenameWorkflow={(workflow) => {
              setSelectedWorkflow(workflow);
              setShowRenameModal(true);
            }}
            onDeleteWorkflow={handleDeleteWorkflow}
            onToggleFavorite={handleToggleFavorite}
            onMoveWorkflow={handleMoveWorkflow}
            folders={folders}
            total={total}
            page={page}
            onPageChange={setPage}
            limit={limit}
          />
        </main>
      </div>

      {/* 模态框 */}
      {showCreateFolderModal && (
        <FolderCreateModal
          onClose={() => setShowCreateFolderModal(false)}
          onCreate={handleCreateFolder}
        />
      )}

      {showRenameModal && selectedWorkflow && (
        <WorkflowRenameModal
          workflow={selectedWorkflow}
          onClose={() => {
            setShowRenameModal(false);
            setSelectedWorkflow(null);
          }}
          onRename={handleRenameWorkflow}
        />
      )}
    </div>
  );
}
