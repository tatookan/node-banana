/**
 * Runtime Image Storage - 运行时图片外部化工具函数
 *
 * 这个文件提供图片外部化的工具函数，与现有的 imageStorage.ts 配合使用。
 */

import { WorkflowNode, WorkflowNodeData } from "@/types";
import { useImageStore } from "@/store/imageStore";
import type { ImageMetadata } from "@/store/imageStore";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 检查是否是图片 ID（我们的 IndexedDB 格式）
 */
export function isImageRef(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("img_");
}

/**
 * 检查是否是 Base64 图片
 */
export function isBase64Image(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("data:image/");
}

// ============================================================================
// 图片管理函数
// ============================================================================

/**
 * 保存图片到 IndexedDB 并返回 ID
 */
export async function saveImage(dataUrl: string, existingId?: string): Promise<string> {
  const { saveImage: saveToStore } = useImageStore.getState();
  return saveToStore(dataUrl, existingId);
}

/**
 * 从 IndexedDB 加载图片
 */
export async function loadImage(imageId: string): Promise<string | null> {
  const { loadImage: loadFromStore } = useImageStore.getState();
  return loadFromStore(imageId);
}

/**
 * 删除图片
 */
export async function deleteImage(imageId: string): Promise<void> {
  const { deleteImage: deleteFromStore } = useImageStore.getState();
  await deleteFromStore(imageId);
}

// ============================================================================
// 导出类型
// ============================================================================
export type { ImageMetadata };
