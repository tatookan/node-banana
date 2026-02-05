/**
 * 工作流面板组件
 * 显示最近使用和已保存的工作流
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useWorkflowHistoryStore, formatRelativeTime } from "@/store/workflowHistoryStore";
import { useWorkflowStore } from "@/store/workflowStore";
import { createPortal } from "react-dom";

export interface WorkflowPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'all' | 'recent' | 'saved';

export function WorkflowPanel({ isOpen, onClose }: WorkflowPanelProps) {
  const history = useWorkflowHistoryStore((state) => state.history);
  const removeFromHistory = useWorkflowHistoryStore((state) => state.removeFromHistory);
  const clearHistory = useWorkflowHistoryStore((state) => state.clearHistory);
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load workflow from history
  const handleLoadWorkflow = useCallback(
    async (item: import("@/store/workflowHistoryStore").WorkflowHistoryItem) => {
      try {
        // Try to load from local storage first
        const storageKey = `workflow-${item.id}`;
        const stored = localStorage.getItem(storageKey);

        if (stored) {
          const workflow = JSON.parse(stored) as import("@/store/workflowStore").WorkflowFile;
          await loadWorkflow(workflow);
          onClose();
        } else if (item.filePath) {
          // TODO: Implement loading from file path
          console.warn('Loading from file path not yet implemented:', item.filePath);
        } else {
          console.warn(`Workflow ${item.id} not found in local storage`);
        }
      } catch (error) {
        console.error('Failed to load workflow:', error);
      }
    },
    [loadWorkflow, onClose]
  );

  // Handle remove workflow from history
  const handleRemove = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      e.stopPropagation();
      if (confirm('确定要移除这个工作流吗？')) {
        removeFromHistory(itemId);
      }
    },
    [removeFromHistory]
  );

  // Filter workflows based on tab and search query
  const filteredWorkflows = useMemo(() => {
    let filtered = history;

    // Filter by tab
    if (activeTab !== 'all') {
      filtered = filtered.filter((item) => item.source === activeTab);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [history, activeTab, searchQuery]);

  if (!isOpen) return null;

  const panel = (
    <div className="fixed left-0 top-11 h-[calc(100vh-44px)] w-72 bg-neutral-800 border-r border-neutral-700 shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">工作流</h2>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-neutral-700 transition-colors text-neutral-400 hover:text-neutral-200"
          title="关闭"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-neutral-700">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索工作流..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-700">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'all'
              ? 'text-blue-400 border-b-2 border-blue-500'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          全部 ({history.length})
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'saved'
              ? 'text-blue-400 border-b-2 border-blue-500'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          已保存 ({history.filter(h => h.source === 'saved').length})
        </button>
        <button
          onClick={() => setActiveTab('recent')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'recent'
              ? 'text-blue-400 border-b-2 border-blue-500'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          最近 ({history.filter(h => h.source === 'recent').length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredWorkflows.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 text-sm">
            {searchQuery ? '没有找到匹配的工作流' : '暂无工作流'}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredWorkflows.map((item) => (
              <div
                key={item.id}
                onClick={() => handleLoadWorkflow(item)}
                className="group relative p-3 rounded-lg bg-neutral-900 hover:bg-neutral-700 transition-colors cursor-pointer border border-neutral-700 hover:border-neutral-600"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📄</span>
                      <h3 className="text-sm font-medium text-neutral-200 truncate group-hover:text-white">
                        {item.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                      <span>{item.nodesCount} 个节点</span>
                      <span>•</span>
                      <span>{formatRelativeTime(item.savedAt)}</span>
                      {item.source === 'saved' && (
                        <>
                          <span>•</span>
                          <span className="text-green-500">已保存</span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={(e) => handleRemove(e, item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-600 transition-all text-neutral-500 hover:text-neutral-300"
                    title="从历史中移除"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Thumbnail (optional) */}
                {item.thumbnail && (
                  <div className="mt-2 rounded overflow-hidden border border-neutral-700">
                    <img
                      src={item.thumbnail}
                      alt={item.name}
                      className="w-full h-20 object-cover"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {history.length > 0 && (
        <div className="p-3 border-t border-neutral-700">
          <button
            onClick={() => {
              if (confirm('确定要清空所有工作流历史吗？')) {
                clearHistory();
              }
            }}
            className="w-full px-3 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700 rounded transition-colors"
          >
            清空历史
          </button>
        </div>
      )}
    </div>
  );

  // Create overlay for mobile
  return createPortal(
    <>
      {panel}
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-30 md:hidden"
        style={{ top: '44px' }}
      />
    </>,
    document.body
  );
}
