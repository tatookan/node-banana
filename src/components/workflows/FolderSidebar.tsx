"use client";

import { useState } from "react";
import type { WorkflowFolder } from "@/types";

interface FolderSidebarProps {
  folders: WorkflowFolder[];
  selectedFolderId: number | null;
  onSelectFolder: (folderId: number | null) => void;
  onCreateFolder: () => void;
  onDeleteFolder: (folderId: number) => void;
  isLoading: boolean;
}

export function FolderSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  isLoading,
}: FolderSidebarProps) {
  const [showMenu, setShowMenu] = useState<number | null>(null);

  return (
    <aside className="w-56 border-r border-neutral-800 bg-neutral-900/30 flex flex-col">
      {/* 全部工作流 */}
      <div className="p-3 border-b border-neutral-800">
        <button
          onClick={() => onSelectFolder(null)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
            selectedFolderId === null
              ? "bg-blue-600/20 text-blue-400"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          }`}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-sm font-medium">全部工作流</span>
        </button>
      </div>

      {/* 文件夹列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center justify-between mb-2 px-3">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">文件夹</span>
          <button
            onClick={onCreateFolder}
            className="p-1 text-neutral-500 hover:text-neutral-300 rounded hover:bg-neutral-800 transition-colors"
            title="新建文件夹"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="w-5 h-5 animate-spin text-neutral-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : folders.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-neutral-600">暂无文件夹</p>
          </div>
        ) : (
          <div className="space-y-1">
            {folders.map((folder) => (
              <div key={folder.id} className="relative group">
                <button
                  onClick={() => onSelectFolder(folder.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    selectedFolderId === folder.id
                      ? "bg-blue-600/20 text-blue-400"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                  }`}
                >
                  {/* 文件夹图标 */}
                  <svg
                    className="w-5 h-5 flex-shrink-0"
                    style={{ color: folder.color }}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>

                  {/* 文件夹名称和计数 */}
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{folder.name}</p>
                    {folder.workflow_count !== undefined && (
                      <p className="text-xs text-neutral-600">{folder.workflow_count} 个工作流</p>
                    )}
                  </div>
                </button>

                {/* 文件夹操作菜单 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(showMenu === folder.id ? null : folder.id);
                  }}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    showMenu === folder.id ? "opacity-100" : ""
                  } ${selectedFolderId === folder.id ? "hover:bg-blue-600/30" : "hover:bg-neutral-700"}`}
                >
                  <svg className="w-3 h-3 text-neutral-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>

                {/* 删除确认 */}
                {showMenu === folder.id && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确定要删除文件夹"${folder.name}"吗？`)) {
                          onDeleteFolder(folder.id);
                        }
                        setShowMenu(null);
                      }}
                      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      删除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="p-3 border-t border-neutral-800">
        <div className="text-xs text-neutral-600">
          {folders.length} 个文件夹
        </div>
      </div>
    </aside>
  );
}
