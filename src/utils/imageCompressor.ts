/**
 * 图片压缩工具 - AI模型优化版
 * 策略：优先保持分辨率和细节，通过格式转换和质量调整来减小文件大小
 */

export interface CompressionResult {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  wasCompressed: boolean;
  method: string; // 使用的压缩方法描述
  originalDimensions?: { width: number; height: number };
  finalDimensions?: { width: number; height: number };
}

export interface CompressOptions {
  maxSizeBytes: number;
  preserveResolution?: boolean; // 是否尽可能保持原始分辨率
  targetFormat?: 'jpeg' | 'webp'; // 目标格式，webp压缩率更高
}

/**
 * 将文件大小格式化为可读字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * 压缩图片到目标大小以下 - AI模型优化策略
 * 1. 首先尝试格式转换（PNG→JPEG/WebP）
 * 2. 然后降低质量参数（保持原始分辨率）
 * 3. 最后才考虑降低分辨率
 */
export async function compressImage(
  file: File,
  maxSizeBytes: number,
  maxWidth?: number,
  maxHeight?: number,
  initialQuality: number = 0.95
): Promise<CompressionResult> {
  const originalSize = file.size;

  // 如果文件已经符合要求，直接返回
  if (originalSize <= maxSizeBytes) {
    const dataUrl = await fileToDataUrl(file);
    const dimensions = await getImageDimensions(dataUrl);
    return {
      dataUrl,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      wasCompressed: false,
      method: "无需压缩",
      originalDimensions: dimensions,
      finalDimensions: dimensions,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const originalDimensions = { width: img.width, height: img.height };

      try {
        // 策略1: 尝试通过格式转换和质量调整压缩（保持原始分辨率）
        const qualityResult = await compressByQualityAndFormat(
          img,
          file.type,
          maxSizeBytes,
          initialQuality
        );

        if (qualityResult.size <= maxSizeBytes) {
          const finalDimensions = await getImageDimensions(qualityResult.dataUrl);
          resolve({
            dataUrl: qualityResult.dataUrl,
            originalSize,
            compressedSize: qualityResult.size,
            compressionRatio: qualityResult.size / originalSize,
            wasCompressed: true,
            method: qualityResult.method,
            originalDimensions,
            finalDimensions,
          });
          return;
        }

        // 策略2: 如果质量压缩仍不够，才考虑降分辨率
        // 使用渐进式降分辨率：每次缩小20%
        const resolutionResult = await compressByResolution(
          img,
          file.type,
          maxSizeBytes,
          initialQuality
        );

        const finalDimensions = await getImageDimensions(resolutionResult.dataUrl);
        resolve({
          dataUrl: resolutionResult.dataUrl,
          originalSize,
          compressedSize: resolutionResult.size,
          compressionRatio: resolutionResult.size / originalSize,
          wasCompressed: true,
          method: resolutionResult.method,
          originalDimensions,
          finalDimensions,
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error("无法加载图片"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 策略1: 通过格式转换和质量调整压缩（保持原始分辨率）
 */
async function compressByQualityAndFormat(
  img: HTMLImageElement,
  originalType: string,
  maxSizeBytes: number,
  initialQuality: number
): Promise<{ dataUrl: string; size: number; method: string }> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("无法创建 canvas context");

  // 保持原始分辨率
  canvas.width = img.width;
  canvas.height = img.height;

  // 绘制图片
  ctx.drawImage(img, 0, 0, img.width, img.height);

  // 确定最佳输出格式：WebP > JPEG > PNG
  // PNG通常文件很大，转换为WebP或JPEG可以大幅减小
  const formats: Array<'image/webp' | 'image/jpeg'> = [
    'image/webp',
    'image/jpeg'
  ];

  // 如果原图就是JPEG/WebP，尝试直接降低质量
  if (originalType === 'image/jpeg' || originalType === 'image/webp') {
    const result = await tryQualities(canvas, originalType, maxSizeBytes, initialQuality);
    if (result) {
      return {
        dataUrl: result.dataUrl,
        size: result.size,
        method: `降低${originalType.split('/')[1]}质量至${result.quality * 100}%`,
      };
    }
  }

  // 尝试格式转换
  for (const format of formats) {
    const result = await tryQualities(canvas, format, maxSizeBytes, initialQuality);
    if (result) {
      return {
        dataUrl: result.dataUrl,
        size: result.size,
        method: `转换为${format.split('/')[1].toUpperCase()}，质量${result.quality * 100}%`,
      };
    }
  }

  throw new Error("通过质量调整无法压缩到目标大小");
}

/**
 * 策略2: 通过降分辨率压缩
 * 渐进式缩小：每次缩小20%
 */
async function compressByResolution(
  img: HTMLImageElement,
  originalType: string,
  maxSizeBytes: number,
  initialQuality: number
): Promise<{ dataUrl: string; size: number; method: string }> {
  let scale = 1.0;
  const minScale = 0.1; // 最小缩小到10%
  const scaleStep = 0.8; // 每次缩小20%

  while (scale >= minScale) {
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("无法创建 canvas context");

    canvas.width = width;
    canvas.height = height;

    // 使用更好的图像质量设置
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, 0, 0, width, height);

    // 尝试WebP格式（最佳压缩率）
    const formats: Array<{ mime: string; name: string }> = [
      { mime: 'image/webp', name: 'WebP' },
      { mime: 'image/jpeg', name: 'JPEG' },
    ];

    for (const format of formats) {
      const result = await tryQualities(canvas, format.mime, maxSizeBytes, initialQuality);
      if (result && result.size <= maxSizeBytes) {
        return {
          dataUrl: result.dataUrl,
          size: result.size,
          method: `分辨率缩小至${Math.round(scale * 100)}%，转换为${format.name}，质量${result.quality * 100}%`,
        };
      }
    }

    scale *= scaleStep;
  }

  throw new Error("无法压缩到目标大小");
}

/**
 * 尝试不同的质量级别
 * 从高到低逐步尝试，找到第一个符合要求的质量级别
 */
async function tryQualities(
  canvas: HTMLCanvasElement,
  mimeType: string,
  maxSizeBytes: number,
  startQuality: number
): Promise<{ dataUrl: string; size: number; quality: number } | null> {
  const qualityStep = 0.05; // 每次降低5%
  let quality = startQuality;
  const minQuality = 0.5; // 最低质量50%（太低会严重影响视觉效果）

  while (quality >= minQuality) {
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (blob.size <= maxSizeBytes) {
      const dataUrl = await blobToDataUrl(blob);
      return { dataUrl, size: blob.size, quality };
    }
    quality -= qualityStep;
  }

  // 返回最低质量的结果（即使超过目标大小）
  const blob = await canvasToBlob(canvas, mimeType, minQuality);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, size: blob.size, quality: minQuality };
}

/**
 * Canvas转Blob
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Blob转DataURL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) resolve(e.target.result as string);
      else reject(new Error("Blob to DataURL failed"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 将 File 转换为 Data URL
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) resolve(e.target.result as string);
      else reject(new Error("无法读取文件"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 获取图片尺寸
 */
export function getImageDimensions(dataUrl: string): Promise<{
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
