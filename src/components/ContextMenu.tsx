/**
 * 右键菜单组件
 * 用于节点搜索和添加
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkflowStore } from "@/store/workflowStore";
import { NODE_CATEGORIES, searchNodes, type NodeInfo } from "@/lib/nodeCategories";
import type { XYPosition } from "@xyflow/react";

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  position?: XYPosition; // 在画布上的位置（用于放置新节点）
}

export function ContextMenu({ x, y, onClose, position }: ContextMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NodeInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const addNode = useWorkflowStore((state) => state.addNode);

  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 使用传入的位置参数（必需）
  const flowPosition = position!;

  // 搜索节点
  useEffect(() => {
    if (searchQuery.trim()) {
      const results = searchNodes(searchQuery);
      setSearchResults(results);
      setSelectedCategory(null);
      setSelectedIndex(0);
    } else {
      setSearchResults([]);
      setSelectedIndex(0);
    }
  }, [searchQuery]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const maxIndex = searchQuery.trim() ? searchResults.length - 1 : NODE_CATEGORIES.length - 1;
        setSelectedIndex((prev) => (prev + 1) % (maxIndex + 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const maxIndex = searchQuery.trim() ? searchResults.length - 1 : NODE_CATEGORIES.length - 1;
        setSelectedIndex((prev) => (prev - 1 + maxIndex + 1) % (maxIndex + 1));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchQuery.trim() && searchResults.length > 0) {
          handleAddNode(searchResults[selectedIndex]);
        } else if (!searchQuery.trim() && selectedCategory) {
          setSelectedCategory(null);
        }
        return;
      }

      // 数字键选择分类
      if (!searchQuery.trim() && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < NODE_CATEGORIES.length) {
          setSelectedCategory(NODE_CATEGORIES[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, searchResults, selectedIndex, selectedCategory, onClose]);

  // 自动聚焦搜索框
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // 添加节点
  const handleAddNode = useCallback(
    (nodeInfo: NodeInfo) => {
      addNode(nodeInfo.type as any, flowPosition);
      onClose();
    },
    [addNode, flowPosition, onClose]
  );

  // 获取当前显示的节点列表
  const displayNodes = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults;
    }
    if (selectedCategory) {
      return NODE_CATEGORIES.find((c) => c.id === selectedCategory)?.nodes || [];
    }
    return [];
  }, [searchQuery, searchResults, selectedCategory]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // 调整位置防止超出屏幕
  const adjustedStyle = useMemo(() => {
    const menuWidth = 300;
    const menuHeight = 400;

    let adjustedX = x;
    let adjustedY = y;

    if (x + menuWidth > window.innerWidth) {
      adjustedX = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      adjustedY = window.innerHeight - menuHeight - 10;
    }

    return { left: adjustedX, top: adjustedY };
  }, [x, y]);

  const menu = (
    <div
      ref={menuRef}
      className="fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl z-50 w-72 max-h-96 overflow-hidden flex flex-col"
      style={adjustedStyle}
    >
      {/* Search Input */}
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
            ref={searchInputRef}
            type="text"
            placeholder="搜索节点..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* 搜索结果 */}
        {searchQuery.trim() && searchResults.length > 0 && (
          <div className="space-y-1">
            {searchResults.map((node, index) => (
              <button
                key={node.type}
                onClick={() => handleAddNode(node)}
                className={`w-full text-left p-2 rounded-lg transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-900 hover:bg-neutral-700 text-neutral-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{node.label}</span>
                  <span className="text-xs text-neutral-400 truncate">{node.description}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 无搜索结果 */}
        {searchQuery.trim() && searchResults.length === 0 && (
          <div className="text-center py-4 text-neutral-500 text-sm">
            没有找到匹配的节点
          </div>
        )}

        {/* 分类列表（无搜索时） */}
        {!searchQuery.trim() && !selectedCategory && (
          <div className="space-y-1">
            {NODE_CATEGORIES.map((category, index) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-900 hover:bg-neutral-700 text-neutral-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{category.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{category.label}</div>
                    <div className="text-xs text-neutral-400">{category.nodes.length} 个节点</div>
                  </div>
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 分类节点列表 */}
        {selectedCategory && !searchQuery.trim() && (
          <div className="space-y-1">
            {/* 返回按钮 */}
            <button
              onClick={() => setSelectedCategory(null)}
              className="w-full text-left p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">返回</span>
            </button>

            {/* 节点列表 */}
            {displayNodes.map((node, index) => (
              <button
                key={node.type}
                onClick={() => handleAddNode(node)}
                className={`w-full text-left p-2 rounded-lg transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-900 hover:bg-neutral-700 text-neutral-200'
                }`}
              >
                <div className="text-sm font-medium">{node.label}</div>
                <div className="text-xs text-neutral-400 truncate">{node.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-neutral-700 text-xs text-neutral-500">
        使用 ↑↓ 选择，Enter 确认，Esc 关闭
      </div>
    </div>
  );

  return createPortal(menu, document.body);
}
