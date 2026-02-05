/**
 * 模板库弹窗组件
 * 显示预定义的工作流模板
 */

"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  WORKFLOW_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
  type WorkflowTemplate,
} from "@/lib/workflowTemplates";

export interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TemplateModal({ isOpen, onClose }: TemplateModalProps) {
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // 根据分类过滤模板
  const filteredTemplates = getTemplatesByCategory(selectedCategory);

  // 加载模板
  const handleLoadTemplate = useCallback(
    async (template: WorkflowTemplate) => {
      try {
        await loadWorkflow(template.workflow);
        onClose();
      } catch (error) {
        console.error('Failed to load template:', error);
        alert('加载模板失败，请重试。');
      }
    },
    [loadWorkflow, onClose]
  );

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div
        className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl w-[90vw] max-w-5xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-100">模板库</h2>
            <p className="text-sm text-neutral-400 mt-1">选择一个模板快速开始</p>
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

        {/* Category Tabs */}
        <div className="px-6 pt-4 border-b border-neutral-700">
          <div className="flex gap-2">
            {TEMPLATE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'
                }`}
              >
                <span>{category.icon}</span>
                <span>{category.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              <p className="text-lg">暂无模板</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleLoadTemplate(template)}
                  className="bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 rounded-lg p-4 text-left transition-all group"
                >
                  {/* Template Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-neutral-200 group-hover:text-white mb-1">
                        {template.name}
                      </h3>
                      <p className="text-sm text-neutral-400">{template.description}</p>
                    </div>
                  </div>

                  {/* Template Preview (placeholder) */}
                  {template.thumbnail ? (
                    <img
                      src={template.thumbnail}
                      alt={template.name}
                      className="w-full h-32 object-cover rounded mb-3"
                    />
                  ) : (
                    <div className="w-full h-32 bg-neutral-800 rounded mb-3 flex items-center justify-center">
                      <svg className="w-12 h-12 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                      </svg>
                    </div>
                  )}

                  {/* Template Info */}
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>{template.workflow.nodes.length} 个节点</span>
                    <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      点击加载 →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-700 bg-neutral-900/50 rounded-b-lg">
          <p className="text-xs text-neutral-500 text-center">
            选择模板后将覆盖当前工作流，请确保已保存重要内容
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
