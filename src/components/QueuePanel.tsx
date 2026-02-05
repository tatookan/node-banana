/**
 * 队列面板组件
 * 显示和管理批量任务队列
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueueStore, formatCountDisplay, getStatusIcon } from "@/store/queueStore";
import { createPortal } from "react-dom";

export interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'queue' | 'history';

export function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  const queue = useQueueStore((state) => state.queue);
  const history = useQueueStore((state) => state.history);
  const isProcessing = useQueueStore((state) => state.isProcessing);
  const currentItem = useQueueStore((state) => state.currentItem);

  const removeFromQueue = useQueueStore((state) => state.removeFromQueue);
  const clearQueue = useQueueStore((state) => state.clearQueue);
  const clearHistory = useQueueStore((state) => state.clearHistory);
  const processQueue = useQueueStore((state) => state.processQueue);
  const cancelCurrent = useQueueStore((state) => state.cancelCurrent);

  const [activeTab, setActiveTab] = useState<TabType>('queue');

  // Combine queue with current item for display
  const displayQueue = useMemo(() => {
    if (currentItem) {
      return [currentItem, ...queue];
    }
    return queue;
  }, [currentItem, queue]);

  // Calculate totals
  const queueCount = queue.length + (currentItem ? 1 : 0);
  const historyCount = history.length;

  const handleProcessQueue = useCallback(async () => {
    await processQueue();
  }, [processQueue]);

  const handleCancel = useCallback(() => {
    cancelCurrent();
  }, [cancelCurrent]);

  if (!isOpen) return null;

  const panel = (
    <div className="fixed left-0 top-11 h-[calc(100vh-44px)] w-80 bg-neutral-800 border-r border-neutral-700 shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-200">队列</h2>
          {isProcessing && (
            <span className="text-xs text-blue-400 animate-pulse">处理中...</span>
          )}
        </div>
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

      {/* Tabs */}
      <div className="flex border-b border-neutral-700">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'queue'
              ? 'text-blue-400 border-b-2 border-blue-500'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          待执行 ({queueCount})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-blue-400 border-b-2 border-blue-500'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          历史 ({historyCount})
        </button>
      </div>

      {/* Queue Tab Content */}
      {activeTab === 'queue' && (
        <>
          {/* Queue Actions */}
          {displayQueue.length > 0 && (
            <div className="p-3 border-b border-neutral-700 flex gap-2">
              {isProcessing ? (
                <button
                  onClick={handleCancel}
                  className="flex-1 px-3 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                >
                  取消执行
                </button>
              ) : (
                <button
                  onClick={handleProcessQueue}
                  className="flex-1 px-3 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  执行队列
                </button>
              )}
              <button
                onClick={clearQueue}
                className="px-3 py-2 text-xs font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded transition-colors"
              >
                清空
              </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-2">
            {displayQueue.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-sm">
                {isProcessing ? '正在执行队列...' : '队列为空'}
              </div>
            ) : (
              <div className="space-y-2">
                {displayQueue.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg bg-neutral-900 border ${
                      item.status === 'running'
                        ? 'border-blue-500'
                        : item.status === 'failed'
                        ? 'border-red-500'
                        : item.status === 'completed'
                        ? 'border-green-500'
                        : 'border-neutral-700'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getStatusIcon(item)}</span>
                          <h3 className="text-sm font-medium text-neutral-200 truncate">
                            {item.name}
                          </h3>
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {formatCountDisplay(item)}
                        </div>
                      </div>

                      {/* Remove button */}
                      {item.status === 'pending' && (
                        <button
                          onClick={() => removeFromQueue(item.id)}
                          className="p-1 rounded hover:bg-neutral-700 transition-colors text-neutral-500 hover:text-neutral-300"
                          title="从队列移除"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Status message */}
                    {item.status === 'running' && (
                      <div className="mt-2 text-xs text-blue-400">
                        正在执行...
                      </div>
                    )}
                    {item.status === 'failed' && item.error && (
                      <div className="mt-2 text-xs text-red-400" title={item.error}>
                        执行失败: {item.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* History Tab Content */}
      {activeTab === 'history' && (
        <>
          {/* History Actions */}
          {history.length > 0 && (
            <div className="p-3 border-b border-neutral-700">
              <button
                onClick={clearHistory}
                className="w-full px-3 py-2 text-xs font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded transition-colors"
              >
                清空历史
              </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-2">
            {history.length === 0 ? (
              <div className="text-center py-8 text-neutral-500 text-sm">
                暂无历史记录
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg bg-neutral-900 border ${
                      item.status === 'completed'
                        ? 'border-green-500/30'
                        : item.status === 'failed'
                        ? 'border-red-500/30'
                        : item.status === 'cancelled'
                        ? 'border-neutral-600/30'
                        : 'border-neutral-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getStatusIcon(item)}</span>
                          <h3 className="text-sm font-medium text-neutral-200 truncate">
                            {item.name}
                          </h3>
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {formatCountDisplay(item)} • {new Date(item.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {item.status === 'failed' && item.error && (
                      <div className="mt-2 text-xs text-red-400" title={item.error}>
                        {item.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  return createPortal(
    <>
      {panel}
      {/* Overlay for mobile */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-30 md:hidden"
        style={{ top: '44px' }}
      />
    </>,
    document.body
  );
}
