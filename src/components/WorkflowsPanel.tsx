/**
 * 工作流侧边栏面板组件
 * 集成服务器工作流和本地历史记录，提供统一的工作流管理界面
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useWorkflowStore } from "@/store/workflowStore";
import { useWorkflowHistoryStore, formatRelativeTime } from "@/store/workflowHistoryStore";
import { WorkflowList } from "@/components/workflows/WorkflowList";
import { FolderSidebar } from "@/components/workflows/FolderSidebar";
import { FolderCreateModal } from "@/components/workflows/FolderCreateModal";
import { WorkflowRenameModal } from "@/components/workflows/WorkflowRenameModal";
import type { WorkflowFolder, ServerWorkflow, WorkflowsQueryParams } from "@/types";

export interface WorkflowsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type DisplayMode = "server" | "history";

export function WorkflowsPanel({ isOpen, onClose }: WorkflowsPanelProps) {
  const router = useRouter();
  const loadFromServer = useWorkflowStore((state) => state.loadFromServer);
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
  const history = useWorkflowHistoryStore((state) => state.history);
  const removeFromHistory = useWorkflowHistoryStore((state) => state.removeFromHistory);

  // 服务器工作流状态
  const [serverWorkflows, setServerWorkflows] = useState<ServerWorkflow[]>([]);
  const [folders, setFolders] = useState<WorkflowFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 12; // Sidebar shows fewer items per page

  // UI 状态
  const [searchQuery, setSearchQuery] = useState("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("server");
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // 加载状态
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(true);

  // 模态框状态
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<ServerWorkflow | null>(null);

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

  // 加载服务器工作流列表
  const loadServerWorkflows = useCallback(async () => {
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
        setServerWorkflows(data.workflows);
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
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen, loadFolders]);

  useEffect(() => {
    if (isOpen && displayMode === "server") {
      loadServerWorkflows();
    }
  }, [isOpen, displayMode, loadServerWorkflows]);

  // 重置页码当筛选条件变化时
  useEffect(() => {
    setPage(1);
  }, [selectedFolderId, searchQuery]);

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

  // 打开服务器工作流
  const handleOpenServerWorkflow = async (workflow: ServerWorkflow) => {
    const success = await loadFromServer(workflow.id);
    if (success) {
      onClose();
      router.push("/");
    } else {
      alert("加载工作流失败，请重试。");
    }
  };

  // 打开历史工作流
  const handleOpenHistoryWorkflow = useCallback(
    async (item: import("@/store/workflowHistoryStore").WorkflowHistoryItem) => {
      try {
        const storageKey = `workflow-${item.id}`;
        const stored = localStorage.getItem(storageKey);

        if (stored) {
          const workflow = JSON.parse(stored) as import("@/store/workflowStore").WorkflowFile;
          await loadWorkflow(workflow);
          onClose();
        } else {
          console.warn(`Workflow ${item.id} not found in local storage`);
        }
      } catch (error) {
        console.error('Failed to load workflow:', error);
      }
    },
    [loadWorkflow, onClose]
  );

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
        await loadServerWorkflows();
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
        await loadServerWorkflows();
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
        await loadServerWorkflows();
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
        await loadServerWorkflows();
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

  // 删除历史记录
  const handleRemoveHistory = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      e.stopPropagation();
      if (confirm('确定要移除这个工作流吗？')) {
        removeFromHistory(itemId);
      }
    },
    [removeFromHistory]
  );

  // 选择文件夹或历史
  const handleSelectFolder = (folderId: number | null) => {
    setSelectedFolderId(folderId);
    if (folderId === null) {
      // "全部工作流" 或 "最近使用"
      setDisplayMode("server");
    } else {
      setDisplayMode("server");
    }
  };

  // 选择"最近使用"
  const handleSelectRecent = () => {
    setSelectedFolderId(null);
    setDisplayMode("history");
  };

  // 过滤历史记录
  const filteredHistory = history.filter((item) => {
    if (!historySearchQuery.trim()) return true;
    return item.name.toLowerCase().includes(historySearchQuery.toLowerCase());
  });

  // 历史记录列表组件
  const HistoryList = () => {
    if (filteredHistory.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <svg
            className="w-16 h-16 text-neutral-800 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-neutral-500 text-sm">
            {historySearchQuery ? "没有找到匹配的工作流" : "暂无最近使用的工作流"}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2 p-4 overflow-y-auto">
        {filteredHistory.map((item) => (
          <div
            key={item.id}
            onClick={() => handleOpenHistoryWorkflow(item)}
            className="group relative p-3 rounded-lg bg-neutral-900 hover:bg-neutral-700 transition-colors cursor-pointer border border-neutral-700 hover:border-neutral-600"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <h3 className="text-sm font-medium text-neutral-200 truncate group-hover:text-white">
                    {item.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                  <span>{item.nodesCount} 个节点</span>
                  <span>•</span>
                  <span>{formatRelativeTime(item.savedAt)}</span>
                  {item.source === 'saved' && (
                    <>
                      <span>•</span>
                      <span className="text-green-500">已保存</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => handleRemoveHistory(e, item.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-600 transition-all text-neutral-500 hover:text-neutral-300"
                title="从历史中移除"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {item.thumbnail && (
              <div className="mt-2 rounded overflow-hidden border border-neutral-700">
                <img
                  src={item.thumbnail}
                  alt={item.name}
                  className="w-full h-20 object-cover"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!isOpen) return null;

  const panel = (
    <div className="fixed left-0 top-11 h-[calc(100vh-44px)] w-[600px] bg-neutral-800 border-r border-neutral-700 shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-neutral-700 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-neutral-200">工作流</h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
          title="关闭"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：文件夹侧边栏 */}
        <div className="w-48 border-r border-neutral-700 flex flex-col shrink-0">
          {/* 最近使用 */}
          <div className="p-3 border-b border-neutral-700">
            <button
              onClick={handleSelectRecent}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                displayMode === 'history' && selectedFolderId === null
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              }`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">最近使用</span>
            </button>
          </div>

          {/* 文件夹侧边栏 */}
          <FolderSidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            onCreateFolder={() => setShowCreateFolderModal(true)}
            onDeleteFolder={handleDeleteFolder}
            isLoading={isLoadingFolders}
          />
        </div>

        {/* 右侧：工作流列表 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 工具栏 */}
          {displayMode === "server" ? (
            <div className="p-3 border-b border-neutral-700 shrink-0">
              <input
                type="text"
                placeholder="搜索工作流..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div className="p-3 border-b border-neutral-700 shrink-0">
              <input
                type="text"
                placeholder="搜索历史..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* 列表内容 */}
          <div className="flex-1 overflow-hidden">
            {displayMode === "server" ? (
              <WorkflowList
                workflows={serverWorkflows}
                viewMode="list"
                isLoading={isLoading}
                onOpenWorkflow={handleOpenServerWorkflow}
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
            ) : (
              <HistoryList />
            )}
          </div>
        </div>
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

  // Create overlay for mobile
  return createPortal(
    <>
      {panel}
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-30 md:hidden"
        style={{ top: '44px' }}
      />
    </>,
    document.body
  );
}
