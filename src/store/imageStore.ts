/**
 * Image Store - 图片外部化存储系统
 *
 * 使用 IndexedDB 存储图片数据，工作流状态中只存储图片 ID。
 * 这样可以：
 * 1. 大幅减少内存占用（图片不常驻内存）
 * 2. 加快工作流保存/加载速度（只传输 ID）
 * 3. 支持按需加载图片
 * 4. 避免图片数据的重复存储
 */

import { create } from "zustand";
import { openDB, DBSchema, IDBPDatabase } from "idb";

// ============================================================================
// 类型定义
// ============================================================================

export interface ImageMetadata {
  id: string;
  createdAt: number;
  updatedAt: number;
  fileSize: number;
  width?: number;
  height?: number;
  format: string;
}

interface StoredImage {
  id: string;
  dataUrl: string;
  metadata: ImageMetadata;
}

interface ImageDBSchema extends DBSchema {
  images: {
    key: string;
    value: StoredImage;
    indexes: {
      "by-created": number;
    };
  };
}

// ============================================================================
// IndexedDB 初始化
// ============================================================================

const DB_NAME = "node-banana-images";
const DB_VERSION = 1;
const STORE_NAME = "images";
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB 内存缓存

let dbInstance: IDBPDatabase<ImageDBSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<ImageDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ImageDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 创建图片存储
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-created", "metadata.createdAt");
      }
    },
  });

  return dbInstance;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从 data URL 提取图片信息
 */
function getDataURLInfo(dataUrl: string): { format: string; size: number; width?: number; height?: number } {
  // 提取格式
  const match = dataUrl.match(/^data:image\/(\w+);base64,/);
  const format = match ? match[1] : "png";

  // 计算 Base64 大小
  const base64Length = dataUrl.split(",")[1]?.length || 0;
  const size = Math.round(base64Length * 0.75);

  // 尝试获取图片尺寸
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ format, size, width: img.width, height: img.height });
    };
    img.onerror = () => {
      resolve({ format, size });
    };
    img.src = dataUrl;
  }).then((result) => result as any) as any;
}

/**
 * 生成唯一图片 ID
 */
function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 清理内存缓存
 */
function evictLRU(
  cache: Map<string, { data: string; lastAccess: number; size: number }>,
  maxSize: number
): void {
  let totalSize = Array.from(cache.values()).reduce((sum, item) => sum + item.size, 0);

  if (totalSize <= maxSize) return;

  // 按最后访问时间排序，删除最旧的
  const sorted = Array.from(cache.entries()).sort((a, b) => a[1].lastAccess - b[1].lastAccess);

  for (const [key, item] of sorted) {
    cache.delete(key);
    totalSize -= item.size;
    if (totalSize <= maxSize * 0.7) break; // 清理到 70%
  }
}

// ============================================================================
// Store 接口定义
// ============================================================================

interface ImageStore {
  // 内存缓存（LRU）
  cache: Map<string, { data: string; lastAccess: number; size: number }>;

  // 加载图片
  loadImage: (id: string) => Promise<string | null>;

  // 保存图片
  saveImage: (dataUrl: string, existingId?: string) => Promise<string>;

  // 删除图片
  deleteImage: (id: string) => Promise<void>;

  // 批量删除图片
  deleteImages: (ids: string[]) => Promise<void>;

  // 获取图片元数据
  getImageMetadata: (id: string) => Promise<ImageMetadata | null>;

  // 清理未使用的图片
  cleanupUnusedImages: (usedIds: Set<string>) => Promise<number>;

  // 清空所有图片
  clearAll: () => Promise<void>;

  // 获取存储统计
  getStats: () => Promise<{ count: number; totalSize: number }>;
}

// ============================================================================
// Store 实现
// ============================================================================

export const useImageStore = create<ImageStore>((set, get) => ({
  cache: new Map(),

  /**
   * 加载图片
   * 1. 先检查内存缓存
   * 2. 缓存未命中则从 IndexedDB 加载
   */
  loadImage: async (id: string) => {
    const { cache } = get();

    // 检查内存缓存
    const cached = cache.get(id);
    if (cached) {
      cached.lastAccess = Date.now();
      return cached.data;
    }

    // 从 IndexedDB 加载
    try {
      const db = await getDB();
      const stored = await db.get(STORE_NAME, id);

      if (!stored) return null;

      // 计算大小并加入缓存
      const size = stored.dataUrl.length * 2; // UTF-16 字符串，每个字符 2 字节

      // 检查缓存大小限制
      evictLRU(cache, MAX_CACHE_SIZE);

      // 加入缓存
      cache.set(id, {
        data: stored.dataUrl,
        lastAccess: Date.now(),
        size,
      });

      return stored.dataUrl;
    } catch (error) {
      console.error("Failed to load image from IndexedDB:", error);
      return null;
    }
  },

  /**
   * 保存图片
   * 如果提供了 existingId，则更新该图片
   * 否则创建新图片并返回新 ID
   */
  saveImage: async (dataUrl: string, existingId?: string) => {
    const id = existingId || generateImageId();
    const now = Date.now();

    try {
      // 获取图片信息
      const info = await getDataURLInfo(dataUrl);

      const metadata: ImageMetadata = {
        id,
        createdAt: now,
        updatedAt: now,
        fileSize: info.size,
        width: info.width,
        height: info.height,
        format: info.format,
      };

      const stored: StoredImage = {
        id,
        dataUrl,
        metadata,
      };

      // 保存到 IndexedDB
      const db = await getDB();
      await db.put(STORE_NAME, stored);

      // 更新内存缓存
      const { cache } = get();
      const size = dataUrl.length * 2;

      evictLRU(cache, MAX_CACHE_SIZE);
      cache.set(id, {
        data: dataUrl,
        lastAccess: now,
        size,
      });

      return id;
    } catch (error) {
      console.error("Failed to save image to IndexedDB:", error);
      throw error;
    }
  },

  /**
   * 删除单个图片
   */
  deleteImage: async (id: string) => {
    try {
      const db = await getDB();
      await db.delete(STORE_NAME, id);

      // 从缓存中移除
      const { cache } = get();
      cache.delete(id);
    } catch (error) {
      console.error("Failed to delete image:", error);
    }
  },

  /**
   * 批量删除图片
   */
  deleteImages: async (ids: string[]) => {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, "readwrite");

      await Promise.all([
        ...ids.map((id) => tx.store.delete(id)),
        tx.done,
      ]);

      // 从缓存中移除
      const { cache } = get();
      for (const id of ids) {
        cache.delete(id);
      }
    } catch (error) {
      console.error("Failed to delete images:", error);
    }
  },

  /**
   * 获取图片元数据
   */
  getImageMetadata: async (id: string) => {
    try {
      const db = await getDB();
      const stored = await db.get(STORE_NAME, id);
      return stored?.metadata || null;
    } catch (error) {
      console.error("Failed to get image metadata:", error);
      return null;
    }
  },

  /**
   * 清理未使用的图片
   * 返回清理的图片数量
   */
  cleanupUnusedImages: async (usedIds: Set<string>) => {
    try {
      const db = await getDB();
      const allImages = await db.getAll(STORE_NAME);

      const unusedIds = allImages
        .map((img) => img.id)
        .filter((id) => !usedIds.has(id));

      if (unusedIds.length > 0) {
        await get().deleteImages(unusedIds);
      }

      return unusedIds.length;
    } catch (error) {
      console.error("Failed to cleanup unused images:", error);
      return 0;
    }
  },

  /**
   * 清空所有图片
   */
  clearAll: async () => {
    try {
      const db = await getDB();
      await db.clear(STORE_NAME);

      // 清空缓存
      const { cache } = get();
      cache.clear();
    } catch (error) {
      console.error("Failed to clear all images:", error);
    }
  },

  /**
   * 获取存储统计
   */
  getStats: async () => {
    try {
      const db = await getDB();
      const allImages = await db.getAll(STORE_NAME);

      const totalSize = allImages.reduce(
        (sum, img) => sum + img.metadata.fileSize,
        0
      );

      return {
        count: allImages.length,
        totalSize,
      };
    } catch (error) {
      console.error("Failed to get stats:", error);
      return { count: 0, totalSize: 0 };
    }
  },
}));

// ============================================================================
// 便捷 Hooks
// ============================================================================

/**
 * 加载图片 Hook
 */
export const useLoadImage = () => useImageStore((state) => state.loadImage);

/**
 * 保存图片 Hook
 */
export const useSaveImage = () => useImageStore((state) => state.saveImage);

/**
 * 删除图片 Hook
 */
export const useDeleteImage = () => useImageStore((state) => state.deleteImage);

/**
 * 获取图片统计 Hook
 */
export const useImageStats = () => useImageStore((state) => state.getStats);
