"use client";

import { useState, useEffect, useRef } from "react";
import type { ServerWorkflow } from "@/types";

interface WorkflowRenameModalProps {
  workflow: ServerWorkflow;
  onClose: () => void;
  onRename: (id: number, name: string) => void;
}

export function WorkflowRenameModal({ workflow, onClose, onRename }: WorkflowRenameModalProps) {
  const [name, setName] = useState(workflow.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== workflow.name) {
      onRename(workflow.id, name.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <h2 className="text-lg font-semibold text-neutral-200">重命名工作流</h2>
          <button
            onClick={onClose}
            className="p-1 text-neutral-500 hover:text-neutral-300 rounded hover:bg-neutral-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">名称</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入工作流名称..."
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={200}
            />
            <p className="text-xs text-neutral-600 mt-1">{name.length} / 200</p>
          </div>

          {/* 当前名称提示 */}
          {name !== workflow.name && (
            <div className="mb-4 p-2 bg-neutral-800/50 rounded border border-neutral-800">
              <p className="text-xs text-neutral-500">原名称</p>
              <p className="text-sm text-neutral-400 truncate">{workflow.name}</p>
            </div>
          )}

          {/* 按钮 */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name.trim() === workflow.name}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
