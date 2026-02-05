/**
 * useImageLoader - 统一的图片加载 Hook
 *
 * 这个 Hook 提供了一个智能的图片加载系统，支持：
 * 1. Base64 图片数据（直接使用）
 * 2. IndexedDB 缓存（运行时外部化）
 * 3. 服务器存储（现有的 imageRef 系统）
 * 4. 自动缓存到 IndexedDB
 *
 * 使用示例：
 * ```tsx
 * const { loadImage, isLoading } = useImageLoader();
 * const imageData = loadImage(nodeData.image, nodeData.imageRef);
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useImageStore } from "@/store/imageStore";
import { useGenerationsPath } from "@/store/selectors";

// 缓存已加载的图片，避免重复请求
const imageCache = new Map<string, string>();

/**
 * 检查是否是 Base64 图片
 */
function isBase64Image(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("data:image/");
}

/**
 * 检查是否是图片 ID（我们的 IndexedDB 格式）
 */
function isImageId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("img_");
}

/**
 * 统一的图片加载 Hook
 */
export function useImageLoader() {
  const generationsPath = useGenerationsPath();
  const { loadImage: loadFromIndexedDB, saveImage: saveToIndexedDB } = useImageStore();
  const [loadingStates, setLoadingStates] = useState<Set<string>>(new Set());

  /**
   * 从服务器加载图片（现有的 imageRef 系统）
   */
  const loadFromServer = useCallback(async (
    imageRef: string,
    workflowPath?: string
  ): Promise<string | null> => {
    try {
      const path = workflowPath || generationsPath;

      if (!path) {
        console.warn("No generations path configured, cannot load image from server");
        return null;
      }

      const response = await fetch("/api/load-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directoryPath: path,
          imageId: imageRef,
        }),
      });

      if (!response.ok) {
        console.error("Failed to load image from server:", await response.text());
        return null;
      }

      const result = await response.json();
      if (result.success && result.image) {
        // 缓存到 IndexedDB
        await saveToIndexedDB(result.image, imageRef);
        return result.image;
      }

      return null;
    } catch (error) {
      console.error("Error loading image from server:", error);
      return null;
    }
  }, [generationsPath, saveToIndexedDB]);

  /**
   * 智能加载图片
   * 1. 如果是 Base64，直接返回
   * 2. 如果是图片 ID，从 IndexedDB 加载
   * 3. 如果有 imageRef，从服务器加载并缓存
   */
  const loadImage = useCallback(async (
    imageData: string | null | undefined,
    imageRef?: string,
    workflowPath?: string
  ): Promise<string | null> => {
    // 没有图片数据
    if (!imageData && !imageRef) {
      return null;
    }

    // 1. 如果有 Base64 数据，直接使用
    if (imageData && isBase64Image(imageData)) {
      // 如果有 imageRef 但图片不在 IndexedDB 中，缓存它
      if (imageRef && isImageId(imageRef)) {
        const cached = await loadFromIndexedDB(imageRef);
        if (!cached) {
          await saveToIndexedDB(imageData, imageRef);
        }
      }
      return imageData;
    }

    // 2. 如果是图片 ID（我们的 IndexedDB 格式）
    if (imageData && isImageId(imageData)) {
      // 检查内存缓存
      if (imageCache.has(imageData)) {
        return imageCache.get(imageData)!;
      }

      // 从 IndexedDB 加载
      const fromDB = await loadFromIndexedDB(imageData);
      if (fromDB) {
        imageCache.set(imageData, fromDB);
        return fromDB;
      }

      // IndexedDB 中没有，尝试从服务器加载
      if (imageRef) {
        const fromServer = await loadFromServer(imageRef, workflowPath);
        if (fromServer) {
          imageCache.set(imageData, fromServer);
          return fromServer;
        }
      }

      return null;
    }

    // 3. 如果只有 imageRef（服务器存储）
    if (imageRef && !imageData) {
      // 检查内存缓存
      if (imageCache.has(imageRef)) {
        return imageCache.get(imageRef)!;
      }

      // 从 IndexedDB 加载
      const fromDB = await loadFromIndexedDB(imageRef);
      if (fromDB) {
        imageCache.set(imageRef, fromDB);
        return fromDB;
      }

      // 从服务器加载
      const fromServer = await loadFromServer(imageRef, workflowPath);
      if (fromServer) {
        imageCache.set(imageRef, fromServer);
        return fromServer;
      }

      return null;
    }

    return null;
  }, [loadFromIndexedDB, saveToIndexedDB, loadFromServer]);

  /**
   * 批量加载图片
   */
  const loadImages = useCallback(async (
    items: Array<{ image?: string | null; imageRef?: string }>,
    workflowPath?: string
  ): Promise<(string | null)[]> => {
    const results: (string | null)[] = [];

    for (const item of items) {
      const loaded = await loadImage(item.image, item.imageRef, workflowPath);
      results.push(loaded);
    }

    return results;
  }, [loadImage]);

  /**
   * 保存图片到 IndexedDB 并返回 ID
   */
  const saveImage = useCallback(async (dataUrl: string, existingId?: string): Promise<string> => {
    return saveToIndexedDB(dataUrl, existingId);
  }, [saveToIndexedDB]);

  /**
   * 清理缓存
   */
  const clearCache = useCallback(() => {
    imageCache.clear();
  }, []);

  return {
    loadImage,
    loadImages,
    saveImage,
    loadFromServer,
    clearCache,
    loadingStates,
  };
}

/**
 * 在组件中使用图片加载的 Hook
 * 自动处理加载状态
 */
export function useImage(
  imageData: string | null | undefined,
  imageRef?: string,
  workflowPath?: string
): { image: string | null; isLoading: boolean; error: string | null } {
  const { loadImage } = useImageLoader();
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 生成唯一的加载 key
    const loadKey = imageData || imageRef || "null";

    // 如果已经在加载这个图片，跳过
    if (loadingRef.current === loadKey) {
      return;
    }

    // 如果是 Base64，直接设置
    if (imageData && isBase64Image(imageData)) {
      setImage(imageData);
      setError(null);
      return;
    }

    // 否则异步加载
    loadingRef.current = loadKey;
    setIsLoading(true);
    setError(null);

    loadImage(imageData, imageRef, workflowPath)
      .then((loadedImage) => {
        if (!cancelled) {
          setImage(loadedImage);
          if (!loadedImage && (imageData || imageRef)) {
            setError("Failed to load image");
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Error loading image:", err);
          setError(err.message || "Failed to load image");
          setImage(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          loadingRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      loadingRef.current = null;
    };
  }, [imageData, imageRef, workflowPath, loadImage]);

  return { image, isLoading, error };
}

/**
 * 批量加载图片的 Hook
 */
export function useImages(
  items: Array<{ image?: string | null; imageRef?: string }>,
  workflowPath?: string
): { images: (string | null)[]; isLoading: boolean; errors: (string | null)[] } {
  const { loadImages } = useImageLoader();
  const [images, setImages] = useState<(string | null)[]>(
    new Array(items.length).fill(null)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<(string | null)[]>(
    new Array(items.length).fill(null)
  );

  useEffect(() => {
    let cancelled = false;

    // 检查是否都是 Base64（可以直接使用）
    const allBase64 = items.every(
      (item) => item.image && isBase64Image(item.image)
    );

    if (allBase64) {
      setImages(items.map((item) => item.image || null));
      return;
    }

    // 否则异步加载
    setIsLoading(true);

    loadImages(items, workflowPath)
      .then((loadedImages) => {
        if (!cancelled) {
          setImages(loadedImages);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Error loading images:", err);
          setErrors(
            items.map((_, i) =>
              err.message || `Failed to load image ${i + 1}`
            )
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [items, workflowPath, loadImages]);

  return { images, isLoading, errors };
}
