/**
 * 工作流历史记录 Store
 * 用于存储和管理最近使用的工作流，实现快速切换
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WorkflowFile } from '@/store/workflowStore';

const HISTORY_STORAGE_KEY = 'node-banana-workflow-history';
const MAX_HISTORY_SIZE = 20;

export interface WorkflowHistoryItem {
  id: string;          // workflow ID
  name: string;        // workflow name
  thumbnail?: string;  // base64 thumbnail image (optional)
  savedAt: number;     // timestamp when saved
  nodesCount: number;  // number of nodes in workflow
  source: 'recent' | 'saved'; // 来源：最近使用或已保存
  filePath?: string;   // 文件路径（如果是已保存的工作流）
}

interface WorkflowHistoryState {
  history: WorkflowHistoryItem[];

  // Actions
  addToHistory: (workflow: WorkflowFile, thumbnail?: string) => void;
  removeFromHistory: (workflowId: string) => void;
  clearHistory: () => void;
  getWorkflowById: (workflowId: string) => WorkflowHistoryItem | undefined;
  updateWorkflowSource: (workflowId: string, source: 'recent' | 'saved', filePath?: string) => void;
}

export const useWorkflowHistoryStore = create<WorkflowHistoryState>()(
  persist(
    (set, get) => ({
      history: [],

      addToHistory: (workflow: WorkflowFile, thumbnail?: string) => {
        const { history } = get();

        // Create history item
        const item: WorkflowHistoryItem = {
          id: workflow.id || crypto.randomUUID(),
          name: workflow.name,
          thumbnail,
          savedAt: Date.now(),
          nodesCount: workflow.nodes.length,
          source: 'saved', // 默认为已保存
        };

        // Remove existing entry with same ID
        const filtered = history.filter((h) => h.id !== item.id);

        // Add to beginning of history
        const newHistory = [item, ...filtered];

        // Limit history size
        set({
          history: newHistory.slice(0, MAX_HISTORY_SIZE),
        });
      },

      removeFromHistory: (workflowId: string) => {
        set((state) => ({
          history: state.history.filter((h) => h.id !== workflowId),
        }));
      },

      clearHistory: () => {
        set({ history: [] });
      },

      getWorkflowById: (workflowId: string) => {
        return get().history.find((h) => h.id === workflowId);
      },

      updateWorkflowSource: (workflowId: string, source: 'recent' | 'saved', filePath?: string) => {
        set((state) => ({
          history: state.history.map((h) =>
            h.id === workflowId ? { ...h, source, filePath } : h
          ),
        }));
      },
    }),
    {
      name: HISTORY_STORAGE_KEY,
      // Only persist the history array
      partialize: (state) => ({ history: state.history }),
    }
  )
);

// Helper: Format timestamp to relative time string
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
