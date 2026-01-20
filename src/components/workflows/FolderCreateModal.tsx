"use client";

import { useState, useEffect, useRef } from "react";

interface FolderCreateModalProps {
  onClose: () => void;
  onCreate: (name: string, icon?: string, color?: string) => void;
}

const ICON_OPTIONS = [
  { value: "folder", label: "文件夹", icon: "📁" },
  { value: "image", label: "图片", icon: "🖼️" },
  { value: "video", label: "视频", icon: "🎬" },
  { value: "text", label: "文本", icon: "📝" },
  { value: "star", label: "收藏", icon: "⭐" },
  { value: "heart", label: "喜欢", icon: "❤️" },
];

const COLOR_OPTIONS = [
  { value: "#6366f1", label: "靛蓝" },
  { value: "#8b5cf6", label: "紫色" },
  { value: "#ec4899", label: "粉色" },
  { value: "#ef4444", label: "红色" },
  { value: "#f97316", label: "橙色" },
  { value: "#eab308", label: "黄色" },
  { value: "#22c55e", label: "绿色" },
  { value: "#06b6d4", label: "青色" },
  { value: "#64748b", label: "灰色" },
];

export function FolderCreateModal({ onClose, onCreate }: FolderCreateModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [color, setColor] = useState("#6366f1");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), icon, color);
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
          <h2 className="text-lg font-semibold text-neutral-200">新建文件夹</h2>
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
          {/* 文件夹名称 */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">名称</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入文件夹名称..."
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={50}
            />
          </div>

          {/* 图标选择 */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">图标</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setIcon(option.value)}
                  className={`w-12 h-12 flex items-center justify-center rounded-lg border-2 transition-all ${
                    icon === option.value
                      ? "border-blue-500 bg-blue-500/20"
                      : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                  }`}
                  title={option.label}
                >
                  <span className="text-xl">{option.icon}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 颜色选择 */}
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1.5">颜色</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setColor(option.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === option.value
                      ? "border-white scale-110"
                      : "border-neutral-700 hover:scale-105"
                  }`}
                  style={{ backgroundColor: option.value }}
                  title={option.label}
                />
              ))}
            </div>
          </div>

          {/* 预览 */}
          {name && (
            <div className="p-3 bg-neutral-800/50 rounded border border-neutral-800">
              <p className="text-xs text-neutral-500 mb-2">预览</p>
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  style={{ color }}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-sm text-neutral-300">{name}</span>
              </div>
            </div>
          )}

          {/* 按钮 */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
