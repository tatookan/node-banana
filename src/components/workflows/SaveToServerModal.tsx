"use client";

import { useState, useEffect } from "react";
import type { WorkflowFolder } from "@/types";

interface SaveToServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description?: string, folderId?: number | null) => Promise<void>;
  currentName: string | null;
  currentDescription?: string | null;
  currentFolderId?: number | null;
  folders: WorkflowFolder[];
  isLoading: boolean;
}

export function SaveToServerModal({
  isOpen,
  onClose,
  onSave,
  currentName,
  currentDescription,
  currentFolderId,
  folders,
  isLoading,
}: SaveToServerModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(currentName || "");
      setDescription(currentDescription || "");
      setSelectedFolderId(currentFolderId ?? null);
    }
  }, [isOpen, currentName, currentDescription, currentFolderId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSave(name.trim(), description.trim() || undefined, selectedFolderId);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <h2 className="text-lg font-semibold text-neutral-200">保存到服务器</h2>
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
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* 工作流名称 */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入工作流名称..."
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={200}
              autoFocus
            />
            <p className="text-xs text-neutral-600 mt-1">{name.length} / 200</p>
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="添加工作流描述..."
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-neutral-600 mt-1">{description.length} / 500</p>
          </div>

          {/* 文件夹选择 */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">保存到文件夹（可选）</label>
            <select
              value={selectedFolderId ?? ""}
              onChange={(e) => setSelectedFolderId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">未分类</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          {/* 按钮 */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  保存中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  保存
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
