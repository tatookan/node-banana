"use client";

import { WorkflowCard } from "./WorkflowCard";
import type { ServerWorkflow, WorkflowFolder } from "@/types";

interface WorkflowListProps {
  workflows: ServerWorkflow[];
  viewMode: "grid" | "list";
  isLoading: boolean;
  onOpenWorkflow: (workflow: ServerWorkflow) => void;
  onRenameWorkflow: (workflow: ServerWorkflow) => void;
  onDeleteWorkflow: (id: number) => void;
  onToggleFavorite: (workflow: ServerWorkflow) => void;
  onMoveWorkflow: (workflowId: number, folderId: number | null) => void;
  folders: WorkflowFolder[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  limit: number;
}

export function WorkflowList({
  workflows,
  viewMode,
  isLoading,
  onOpenWorkflow,
  onRenameWorkflow,
  onDeleteWorkflow,
  onToggleFavorite,
  onMoveWorkflow,
  folders,
  total,
  page,
  onPageChange,
  limit,
}: WorkflowListProps) {
  const totalPages = Math.ceil(total / limit);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="w-8 h-8 animate-spin text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-neutral-500 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (workflows.length === 0) {
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-neutral-500 text-lg mb-2">还没有工作流</p>
        <p className="text-neutral-600 text-sm">点击"返回编辑器"创建你的第一个工作流</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 工作流列表 */}
      <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "flex flex-col gap-3"}>
        {workflows.map((workflow) => (
          <WorkflowCard
            key={workflow.id}
            workflow={workflow}
            folders={folders}
            onOpen={onOpenWorkflow}
            onRename={onRenameWorkflow}
            onDelete={onDeleteWorkflow}
            onToggleFavorite={onToggleFavorite}
            onMove={onMoveWorkflow}
          />
        ))}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 pt-6 border-t border-neutral-800">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm bg-neutral-800 text-neutral-400 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
          >
            上一页
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1))
              .map((p, idx, arr) => {
                const prevPage = arr[idx - 1];
                const showEllipsis = prevPage && p > prevPage + 1;

                return (
                  <span key={p}>
                    {showEllipsis && (
                      <span className="px-2 text-neutral-600">...</span>
                    )}
                    <button
                      onClick={() => onPageChange(p)}
                      className={`min-w-[2rem] px-2 py-1 text-sm rounded transition-colors ${
                        p === page
                          ? "bg-blue-600 text-white"
                          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                );
              })}
          </div>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm bg-neutral-800 text-neutral-400 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
