/**
 * 节点分类定义
 * 用于节点搜索和分类展示
 */

import type { Node } from '@xyflow/react';

export interface NodeCategory {
  id: string;
  label: string;
  icon: string;
  nodes: NodeInfo[];
}

export interface NodeInfo {
  type: string;
  label: string;
  description: string;
  keywords: string[];
}

/**
 * 所有节点分类
 */
export const NODE_CATEGORIES: NodeCategory[] = [
  {
    id: 'image',
    label: '图片节点',
    icon: '📷',
    nodes: [
      {
        type: 'imageInput',
        label: '图片输入',
        description: '上传或输入图片',
        keywords: ['图片', '输入', '上传', 'image', 'input', 'upload'],
      },
      {
        type: 'annotation',
        label: '裁剪和涂鸦',
        description: '在图片上绘制或裁剪',
        keywords: ['裁剪', '涂鸦', '绘制', 'annotation', 'crop', 'draw'],
      },
      {
        type: 'output',
        label: '输出图片',
        description: '显示最终输出结果',
        keywords: ['输出', '结果', '显示', 'output', 'result', 'display'],
      },
      {
        type: 'splitGrid',
        label: '网格分割',
        description: '将图片分割成网格',
        keywords: ['网格', '分割', 'split', 'grid'],
      },
    ],
  },
  {
    id: 'text',
    label: '文本节点',
    icon: '📝',
    nodes: [
      {
        type: 'prompt',
        label: '提示词',
        description: '输入文本提示词',
        keywords: ['提示词', '文本', 'prompt', 'text'],
      },
      {
        type: 'llmGenerate',
        label: 'LLM 文本生成',
        description: '使用大语言模型生成文本',
        keywords: ['llm', '文本生成', '语言模型', 'gpt', 'gemini'],
      },
    ],
  },
  {
    id: 'generate',
    label: '生成节点',
    icon: '🎨',
    nodes: [
      {
        type: 'nanoBanana',
        label: 'NanoBanana 生图',
        description: '使用 Gemini 模型生成图片',
        keywords: ['nano', 'banana', '生图', '生成', 'gemini', '图片'],
      },
      {
        type: 'viduGenerate',
        label: 'VIDU 生图',
        description: '使用 VIDU 模型生成图片',
        keywords: ['vidu', '生图', '生成', '图片'],
      },
      {
        type: 'fluentlyGenerate',
        label: 'Fluently 生图',
        description: '使用 Fluently 模型生成图片',
        keywords: ['fluently', '生图', '生成', '图片'],
      },
    ],
  },
];

/**
 * 所有节点列表（扁平化）
 */
export const ALL_NODES: NodeInfo[] = NODE_CATEGORIES.flatMap((category) =>
  category.nodes.map((node) => ({
    ...node,
    categoryLabel: category.label,
  }))
);

/**
 * 搜索节点
 */
export function searchNodes(query: string): NodeInfo[] {
  if (!query.trim()) return ALL_NODES;

  const lowerQuery = query.toLowerCase();
  return ALL_NODES.filter(
    (node) =>
      node.label.toLowerCase().includes(lowerQuery) ||
      node.description.toLowerCase().includes(lowerQuery) ||
      node.keywords.some((keyword) => keyword.toLowerCase().includes(lowerQuery))
  );
}

/**
 * 获取节点信息
 */
export function getNodeInfo(type: string): NodeInfo | undefined {
  return ALL_NODES.find((node) => node.type === type);
}

/**
 * 获取节点的分类
 */
export function getNodeCategory(type: string): NodeCategory | undefined {
  for (const category of NODE_CATEGORIES) {
    if (category.nodes.some((node) => node.type === type)) {
      return category;
    }
  }
  return undefined;
}
