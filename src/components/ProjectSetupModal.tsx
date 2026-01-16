"use client";

import { useState, useEffect } from "react";
import { generateWorkflowId, useWorkflowStore } from "@/store/workflowStore";

interface ProjectSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, name: string, directoryPath: string) => void;
  mode: "new" | "settings";
}

export function ProjectSetupModal({
  isOpen,
  onClose,
  onSave,
  mode,
}: ProjectSetupModalProps) {
  const { workflowName, saveDirectoryPath, useExternalImageStorage, setUseExternalImageStorage } = useWorkflowStore();

  const [name, setName] = useState("");
  const [directoryPath, setDirectoryPath] = useState("");
  const [externalStorage, setExternalStorage] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill when opening in settings mode
  useEffect(() => {
    if (isOpen && mode === "settings") {
      setName(workflowName || "");
      setDirectoryPath(saveDirectoryPath || "");
      setExternalStorage(useExternalImageStorage);
    } else if (isOpen && mode === "new") {
      setName("");
      setDirectoryPath("");
      setExternalStorage(true);
    }
  }, [isOpen, mode, workflowName, saveDirectoryPath, useExternalImageStorage]);

  const handleBrowse = async () => {
    setIsBrowsing(true);
    setError(null);

    try {
      const response = await fetch("/api/browse-directory");
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "无法打开目录选择器");
        return;
      }

      if (result.cancelled) {
        return;
      }

      if (result.path) {
        setDirectoryPath(result.path);
      }
    } catch (err) {
      setError(
        `无法打开目录选择器: ${err instanceof Error ? err.message : "未知错误"}`
      );
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("请输入项目名称");
      return;
    }

    if (!directoryPath.trim()) {
      setError("请输入项目目录");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Validate project directory exists
      const response = await fetch(
        `/api/workflow?path=${encodeURIComponent(directoryPath.trim())}`
      );
      const result = await response.json();

      if (!result.exists) {
        setError("项目目录不存在");
        setIsValidating(false);
        return;
      }

      if (!result.isDirectory) {
        setError("项目路径不是目录");
        setIsValidating(false);
        return;
      }

      const id = mode === "new" ? generateWorkflowId() : useWorkflowStore.getState().workflowId || generateWorkflowId();
      // Update external storage setting
      setUseExternalImageStorage(externalStorage);
      onSave(id, name.trim(), directoryPath.trim());
      setIsValidating(false);
    } catch (err) {
      setError(
        `验证目录失败: ${err instanceof Error ? err.message : "未知错误"}`
      );
      setIsValidating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isValidating && !isBrowsing) {
      handleSave();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div
        className="bg-neutral-800 rounded-lg p-6 w-[480px] border border-neutral-700 shadow-xl"
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-lg font-semibold text-neutral-100 mb-4">
          {mode === "new" ? "新建项目" : "项目设置"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              项目名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="我的项目"
              autoFocus
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded text-neutral-100 text-sm focus:outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              项目目录
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={directoryPath}
                onChange={(e) => setDirectoryPath(e.target.value)}
                placeholder="/Users/username/projects/my-project"
                className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded text-neutral-100 text-sm focus:outline-none focus:border-neutral-500"
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={isBrowsing}
                className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-sm rounded transition-colors"
              >
                {isBrowsing ? "..." : "浏览"}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              工作流文件和图片将保存在此目录下。将自动创建输入和生成子文件夹。
            </p>
          </div>

          <div className="pt-2 border-t border-neutral-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!externalStorage}
                onChange={(e) => setExternalStorage(!e.target.checked)}
                className="w-4 h-4 rounded border-neutral-600 bg-neutral-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-800"
              />
              <div>
                <span className="text-sm text-neutral-200">将图片嵌入为 base64</span>
                <p className="text-xs text-neutral-500">
                  将所有图片嵌入到工作流中，工作流文件更大。大型工作流可能会达到内存限制。
                </p>
              </div>
            </label>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isValidating || isBrowsing}
            className="px-4 py-2 text-sm bg-white text-neutral-900 rounded hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isValidating ? "验证中..." : mode === "new" ? "创建" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
