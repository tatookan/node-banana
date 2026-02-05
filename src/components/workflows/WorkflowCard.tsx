"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { ServerWorkflow, WorkflowFolder } from "@/types";

interface WorkflowCardProps {
  workflow: ServerWorkflow;
  folders: WorkflowFolder[];
  onOpen: (workflow: ServerWorkflow) => void;
  onRename: (workflow: ServerWorkflow) => void;
  onDelete: (id: number) => void;
  onToggleFavorite: (workflow: ServerWorkflow) => void;
  onMove: (workflowId: number, folderId: number | null) => void;
}

export function WorkflowCard({
  workflow,
  folders,
  onOpen,
  onRename,
  onDelete,
  onToggleFavorite,
  onMove,
}: WorkflowCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // 更新菜单位置
  const updateMenuPosition = () => {
    if (menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 192, // 192px = w-48
      });
    }
  };

  const handleToggleMenu = () => {
    if (!showMenu) {
      updateMenuPosition();
    }
    setShowMenu(!showMenu);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    return date.toLocaleDateString("zh-CN");
  };

  const getFolderName = () => {
    if (!workflow.folder_id) return "未分类";
    const folder = folders.find((f) => f.id === workflow.folder_id);
    return folder?.name || "未分类";
  };

  return (
    <div
      className="group relative bg-neutral-900 border border-neutral-800 rounded-lg hover:border-neutral-600 transition-all duration-200 p-4 cursor-pointer"
      onClick={() => onOpen(workflow)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* 左侧：图标和信息 */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* 工作流图标 */}
          <div className="flex-shrink-0 w-12 h-12 bg-neutral-800 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-neutral-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
              />
            </svg>
          </div>

          {/* 工作流信息 */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-neutral-200 truncate group-hover:text-white">
              {workflow.name}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
              <span>{getFolderName()}</span>
              <span>·</span>
              <span>{formatDate(workflow.updated_at)}</span>
            </div>
            {workflow.description && (
              <p className="text-xs text-neutral-400 mt-2 line-clamp-2">
                {workflow.description}
              </p>
            )}
            {workflow.tags && workflow.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {workflow.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs bg-neutral-800 text-neutral-500 rounded"
                  >
                    {tag}
                  </span>
                ))}
                {workflow.tags.length > 3 && (
                  <span className="px-2 py-0.5 text-xs bg-neutral-800 text-neutral-600 rounded">
                    +{workflow.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* 收藏按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(workflow);
            }}
            className="p-1.5 text-neutral-500 hover:text-yellow-400 rounded hover:bg-neutral-800 transition-colors"
            title={workflow.is_favorite ? "取消收藏" : "收藏"}
          >
            <svg
              className={`w-4 h-4 ${workflow.is_favorite ? "fill-yellow-400 text-yellow-400" : "fill-none"}`}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>

          {/* 更多操作菜单 */}
          <div className="relative">
            <button
              ref={menuButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMenu();
              }}
              className="p-1.5 text-neutral-500 hover:text-neutral-300 rounded hover:bg-neutral-800"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {showMenu && createPortal(
              <div
                className="fixed w-48 bg-neutral-800 border border-neutral-700 rounded shadow-lg z-50"
                style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    onRename(workflow);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  重命名
                </button>

                <div className="relative">
                  <button
                    onClick={() => {
                      setShowFolderMenu(!showFolderMenu);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-700 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      移动到
                    </span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {showFolderMenu && (
                    <div className="absolute left-full top-0 ml-1 w-48 bg-neutral-800 border border-neutral-700 rounded shadow-lg">
                      <button
                        onClick={() => {
                          onMove(workflow.id, null);
                          setShowMenu(false);
                          setShowFolderMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-700"
                      >
                        未分类
                      </button>
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => {
                            onMove(workflow.id, folder.id);
                            setShowMenu(false);
                            setShowFolderMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-700"
                        >
                          {folder.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    onDelete(workflow.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-neutral-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 011-1h-4a1 1 0 01-1 1v3M4 7h16" />
                  </svg>
                  删除
                </button>
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
