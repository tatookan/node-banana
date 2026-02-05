/**
 * 设置弹窗组件
 * 用于基本应用设置
 */

"use client";

import { createPortal } from "react-dom";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div
        className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl w-[90vw] max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-100">设置</h2>
            <p className="text-sm text-neutral-400 mt-1">配置应用选项</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
            title="关闭"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* 信息 */}
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-neutral-200 mb-2">关于</h3>
              <p className="text-sm text-neutral-400">
                Node Banana 是一个基于节点的可视化工作流编辑器，用于 AI 图片生成。
              </p>
            </div>

            {/* 快捷键 */}
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-neutral-200 mb-3">键盘快捷键</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-400">运行工作流</span>
                  <span className="text-neutral-200">Ctrl/Cmd + Enter</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">复制节点</span>
                  <span className="text-neutral-200">Ctrl/Cmd + C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">粘贴节点</span>
                  <span className="text-neutral-200">Ctrl/Cmd + V</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">添加提示词节点</span>
                  <span className="text-neutral-200">Shift + P</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">添加图片输入节点</span>
                  <span className="text-neutral-200">Shift + I</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">添加生成节点</span>
                  <span className="text-neutral-200">Shift + G</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">添加 LLM 节点</span>
                  <span className="text-neutral-200">Shift + L</span>
                </div>
              </div>
            </div>

            {/* 提示 */}
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-300 mb-2">💡 提示</h3>
              <ul className="text-sm text-blue-200/80 space-y-1">
                <li>• 右键点击画布空白处可以快速添加节点</li>
                <li>• 拖拽图片到画布可以创建图片输入节点</li>
                <li>• 使用 Ctrl/Cmd + 拖拽可以缩放画布</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-700 bg-neutral-900/50 rounded-b-lg flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
