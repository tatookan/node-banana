/**
 * 工作流模板定义
 * 预定义的工作流模板，用于快速加载常见的工作流配置
 */

import type { WorkflowFile } from "@/store/workflowStore";
import type { NodeType } from "@/types";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'product' | 'portrait' | 'style' | 'basic';
  thumbnail?: string;
  workflow: WorkflowFile;
}

/**
 * 基础节点工厂函数
 */
function createBaseNode(type: NodeType, id: string, position: { x: number; y: number }) {
  // 默认节点数据
  const defaultData: Record<string, any> = {
    imageInput: {
      image: null,
      filename: null,
      dimensions: null,
    },
    annotation: {
      sourceImage: null,
      annotations: [],
      outputImage: null,
    },
    prompt: {
      prompt: "",
      resonanceMode: true,
    },
    nanoBanana: {
      inputImages: [],
      inputPrompt: null,
      outputImage: null,
      provider: "google",
      aspectRatio: "1:1",
      resolution: "1024x1024",
      model: "nano-banana",
      useGoogleSearch: true,
      status: "idle" as const,
      error: null,
      imageHistory: [],
      selectedHistoryIndex: 0,
      resonanceMode: true,
      systemPrompt: "",
      topP: 0.95,
    },
    llmGenerate: {
      inputPrompt: null,
      inputImage: null,
      outputText: null,
      provider: "google",
      model: "gemini-2.5-flash",
      status: "idle" as const,
      error: null,
      responseHistory: [],
      selectedHistoryIndex: 0,
      imageInputs: [],
    },
    output: {
      image: null,
    },
  };

  return {
    id,
    type,
    position,
    data: defaultData[type] || {},
  };
}

/**
 * 预定义工作流模板
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'basic-image-gen',
    name: '基础图片生成',
    description: '最简单的图片生成工作流',
    category: 'basic',
    workflow: {
      version: 1,
      name: '基础图片生成',
      id: crypto.randomUUID(),
      edgeStyle: 'curved',
      nodes: [
        createBaseNode('prompt', 'prompt-1', { x: 100, y: 100 }),
        createBaseNode('nanoBanana', 'nano-1', { x: 450, y: 100 }),
        createBaseNode('output', 'output-1', { x: 800, y: 100 }),
      ],
      edges: [
        { id: 'e1', source: 'prompt-1', sourceHandle: 'text', target: 'nano-1', targetHandle: 'text' },
        { id: 'e2', source: 'nano-1', sourceHandle: 'image', target: 'output-1', targetHandle: 'image' },
      ],
    },
  },
  {
    id: 'product-shoot',
    name: '产品拍摄',
    description: '适合电商产品图片生成',
    category: 'product',
    workflow: {
      version: 1,
      name: '产品拍摄',
      id: crypto.randomUUID(),
      edgeStyle: 'curved',
      nodes: [
        createBaseNode('imageInput', 'image-1', { x: 50, y: 50 }),
        createBaseNode('prompt', 'prompt-1', { x: 50, y: 350 }),
        createBaseNode('nanoBanana', 'nano-1', { x: 400, y: 200 }),
        createBaseNode('output', 'output-1', { x: 750, y: 200 }),
      ],
      edges: [
        { id: 'e1', source: 'image-1', sourceHandle: 'image', target: 'nano-1', targetHandle: 'image' },
        { id: 'e2', source: 'prompt-1', sourceHandle: 'text', target: 'nano-1', targetHandle: 'text' },
        { id: 'e3', source: 'nano-1', sourceHandle: 'image', target: 'output-1', targetHandle: 'image' },
      ],
    },
  },
  {
    id: 'portrait-gen',
    name: '人像生成',
    description: '生成高质量的人像图片',
    category: 'portrait',
    workflow: {
      version: 1,
      name: '人像生成',
      id: crypto.randomUUID(),
      edgeStyle: 'curved',
      nodes: [
        createBaseNode('prompt', 'prompt-1', { x: 100, y: 100 }),
        createBaseNode('llmGenerate', 'llm-1', { x: 100, y: 350 }),
        createBaseNode('nanoBanana', 'nano-1', { x: 450, y: 200 }),
        createBaseNode('output', 'output-1', { x: 800, y: 200 }),
      ],
      edges: [
        { id: 'e1', source: 'prompt-1', sourceHandle: 'text', target: 'llm-1', targetHandle: 'text' },
        { id: 'e2', source: 'llm-1', sourceHandle: 'text', target: 'nano-1', targetHandle: 'text' },
        { id: 'e3', source: 'nano-1', sourceHandle: 'image', target: 'output-1', targetHandle: 'image' },
      ],
    },
  },
  {
    id: 'style-transfer',
    name: '风格迁移',
    description: '将图片转换为特定风格',
    category: 'style',
    workflow: {
      version: 1,
      name: '风格迁移',
      id: crypto.randomUUID(),
      edgeStyle: 'curved',
      nodes: [
        createBaseNode('imageInput', 'image-1', { x: 50, y: 50 }),
        createBaseNode('prompt', 'prompt-1', { x: 50, y: 350 }),
        createBaseNode('nanoBanana', 'nano-1', { x: 400, y: 200 }),
        createBaseNode('annotation', 'anno-1', { x: 750, y: 200 }),
      ],
      edges: [
        { id: 'e1', source: 'image-1', sourceHandle: 'image', target: 'nano-1', targetHandle: 'image' },
        { id: 'e2', source: 'prompt-1', sourceHandle: 'text', target: 'nano-1', targetHandle: 'text' },
        { id: 'e3', source: 'nano-1', sourceHandle: 'image', target: 'anno-1', targetHandle: 'image' },
      ],
    },
  },
];

/**
 * 模板分类
 */
export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: '全部', icon: '📁' },
  { id: 'basic', label: '基础', icon: '🔰' },
  { id: 'product', label: '产品拍摄', icon: '📦' },
  { id: 'portrait', label: '人像', icon: '👤' },
  { id: 'style', label: '风格迁移', icon: '🎨' },
];

/**
 * 根据分类获取模板
 */
export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  if (category === 'all') return WORKFLOW_TEMPLATES;
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

/**
 * 根据 ID 获取模板
 */
export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
