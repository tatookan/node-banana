/**
 * 队列系统 Store
 * 用于管理批量任务队列，类似 ComfyUI 的 Queue 系统
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface QueueItem {
  id: string;
  name: string;
  nodeIds: string[];
  count: number;
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  completedCount?: number;
  error?: string;
  results?: any[];
}

interface QueueState {
  queue: QueueItem[];
  history: QueueItem[];
  isProcessing: boolean;
  currentItem: QueueItem | null;

  // Actions
  addToQueue: (name: string, nodeIds: string[], count: number) => void;
  removeFromQueue: (itemId: string) => void;
  clearQueue: () => void;
  clearHistory: () => void;
  processQueue: () => Promise<void>;
  cancelCurrent: () => void;
  moveToHistory: (item: QueueItem) => void;
}

export const useQueueStore = create<QueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      history: [],
      isProcessing: false,
      currentItem: null,

      addToQueue: (name: string, nodeIds: string[], count: number) => {
        const item: QueueItem = {
          id: crypto.randomUUID(),
          name,
          nodeIds,
          count,
          createdAt: Date.now(),
          status: 'pending',
        };

        set((state) => ({
          queue: [...state.queue, item],
        }));
      },

      removeFromQueue: (itemId: string) => {
        set((state) => ({
          queue: state.queue.filter((item) => item.id !== itemId),
        }));
      },

      clearQueue: () => {
        set({ queue: [], currentItem: null });
      },

      clearHistory: () => {
        set({ history: [] });
      },

      moveToHistory: (item: QueueItem) => {
        set((state) => ({
          history: [item, ...state.history].slice(0, 50), // Keep last 50 history items
          queue: state.queue.filter((i) => i.id !== item.id),
        }));
      },

      cancelCurrent: () => {
        const { currentItem } = get();
        if (currentItem) {
          const cancelled = { ...currentItem, status: 'cancelled' as const };
          get().moveToHistory(cancelled);
          set({ currentItem: null, isProcessing: false });
        }
      },

      processQueue: async () => {
        const { queue, isProcessing } = get();
        if (isProcessing || queue.length === 0) return;

        set({ isProcessing: true });

        const nextItem = queue[0];
        set({ currentItem: nextItem });

        try {
          // Execute the workflow from the specified nodes
          // This is a placeholder - actual implementation would call executeWorkflow
          console.log('Processing queue item:', nextItem);

          // Simulate processing
          // In real implementation, this would:
          // 1. Call executeWorkflow with startFromNodeId
          // 2. Wait for completion
          // 3. Update completedCount
          // 4. Repeat for count times

          // For now, just mark as completed after a delay
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const completed = {
            ...nextItem,
            status: 'completed' as const,
            completedCount: nextItem.count,
          };

          get().moveToHistory(completed);
        } catch (error) {
          const failed = {
            ...nextItem,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : String(error),
          };
          get().moveToHistory(failed);
        } finally {
          set({
            currentItem: null,
            isProcessing: false,
          });

          // Process next item
          const { queue } = get();
          if (queue.length > 0) {
            get().processQueue();
          }
        }
      },
    }),
    {
      name: 'node-banana-queue',
      partialize: (state) => ({
        queue: state.queue,
        history: state.history,
      }),
    }
  )
);

// Helper: Format count display
export function formatCountDisplay(item: QueueItem): string {
  if (item.status === 'completed') {
    return `${item.completedCount}/${item.count}`;
  }
  if (item.status === 'running' && item.completedCount !== undefined) {
    return `${item.completedCount}/${item.count}`;
  }
  return `x${item.count}`;
}

// Helper: Get status icon
export function getStatusIcon(item: QueueItem): string {
  switch (item.status) {
    case 'pending':
      return '⏳';
    case 'running':
      return '🔄';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    case 'cancelled':
      return '⏹️';
    default:
      return '❓';
  }
}
