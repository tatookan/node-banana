/**
 * 保存工作流弹窗组件
 * 合并保存到服务器和提交模板库的功能
 */

"use client";

import { useState, useEffect, useRef } from "react";
import type { WorkflowFolder, TemplateCategory } from "@/types";

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SaveWorkflowData) => Promise<void>;
  currentName: string | null;
  currentDescription?: string | null;
  currentFolderId?: number | null;
  folders: WorkflowFolder[];
  isLoading: boolean;
  isAdmin: boolean;
}

export interface SaveWorkflowData {
  name: string;
  description?: string;
  folderId?: number | null;
  saveAsTemplate: boolean;
  templateCategory?: TemplateCategory;
}

// 模板分类选项
const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; icon: string }[] = [
  { value: "basic", label: "基础", icon: "🔰" },
  { value: "product", label: "产品拍摄", icon: "📦" },
  { value: "portrait", label: "人像", icon: "👤" },
  { value: "style", label: "风格迁移", icon: "🎨" },
  { value: "other", label: "其他", icon: "📁" },
];

export function SaveModal({
  isOpen,
  onClose,
  onSave,
  currentName,
  currentDescription,
  currentFolderId,
  folders,
  isLoading,
  isAdmin,
}: SaveModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>("other");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName || "");
      setDescription(currentDescription || "");
      setSelectedFolderId(currentFolderId ?? null);
      setSaveAsTemplate(false);
      setTemplateCategory("other");
    }
  }, [isOpen, currentName, currentDescription, currentFolderId]);

  useEffect(() => {
    if (isOpen && !isSaving) {
      inputRef.current?.focus();
    }
  }, [isOpen, isSaving]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        folderId: selectedFolderId,
        saveAsTemplate,
        templateCategory: saveAsTemplate ? templateCategory : undefined,
      });
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
          <h2 className="text-lg font-semibold text-neutral-200">保存工作流</h2>
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
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">
              名称 <span className="text-red-500">*</span>
            </label>
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

          {/* 同时保存到模板库 */}
          <div className="border border-neutral-700 rounded-lg p-3 bg-neutral-800/50">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-neutral-300">同时保存到模板库</div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {isAdmin ? "管理员保存后直接上架到模板库" : "提交后需要管理员审核，通过后将在模板库中显示"}
                </p>
              </div>
            </label>

            {/* 模板分类 - 勾选后显示 */}
            {saveAsTemplate && (
              <div className="mt-3 pt-3 border-t border-neutral-700">
                <label className="block text-sm font-medium text-neutral-400 mb-2">模板分类</label>
                <div className="grid grid-cols-3 gap-2">
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <label
                      key={cat.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        templateCategory === cat.value
                          ? "bg-blue-600/20 border-blue-500 text-blue-400"
                          : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="templateCategory"
                        value={cat.value}
                        checked={templateCategory === cat.value}
                        onChange={(e) => setTemplateCategory(e.target.value as TemplateCategory)}
                        className="sr-only"
                      />
                      <span className="text-lg">{cat.icon}</span>
                      <span className="text-xs">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
              disabled={!name.trim() || isSaving || (saveAsTemplate && !templateCategory)}
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
