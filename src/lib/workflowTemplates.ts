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
  category: 'product' | 'portrait' | 'style' | 'basic' | 'other';
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
 * 预定义工作流模板（已清空，现从 API 加载）
 * 保留空数组以避免类型错误
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [];

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
