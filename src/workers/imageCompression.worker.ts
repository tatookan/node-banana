/**
 * Web Worker for Image Compression
 * 使用 OffscreenCanvas 在后台线程进行图片压缩
 * 避免大图片压缩时阻塞 UI
 */

export interface CompressionMessage {
  type: 'compress';
  imageData: {
    dataUrl: string;    // Base64 图片数据
    width: number;
    height: number;
    originalType: string;
  };
  options: {
    maxSizeBytes: number;
    maxWidth?: number;
    maxHeight?: number;
    initialQuality: number;
  };
}

export interface CompressionResultMessage {
  type: 'result' | 'error' | 'progress';
  result?: {
    dataUrl: string;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    wasCompressed: boolean;
    method: string;
    originalDimensions: { width: number; height: number };
    finalDimensions: { width: number; height: number };
  };
  error?: string;
  progress?: {
    step: string;
    percent: number;
  };
}

// 发送进度更新
function sendProgress(step: string, percent: number) {
  self.postMessage({ type: 'progress', progress: { step, percent } } as CompressionResultMessage);
}

// 将 Base64 转换为 Blob
function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// 计算数据 URL 大小
function getDataUrlSize(dataUrl: string): number {
  return new Blob([dataUrl]).size;
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * 使用 OffscreenCanvas 压缩图片
 */
async function compressWithOffscreenCanvas(
  imageData: ImageBitmap,
  maxSizeBytes: number,
  maxWidth: number | undefined,
  maxHeight: number | undefined,
  originalType: string,
  initialQuality: number,
  originalDimensions: { width: number; height: number }
): Promise<{
  dataUrl: string;
  compressedSize: number;
  method: string;
  finalDimensions: { width: number; height: number };
}> {
  sendProgress('开始压缩...', 10);

  const originalSize = getDataUrlSize(originalDimensions.toString()); // 估算

  // 策略1: 尝试通过质量调整压缩（保持原始分辨率）
  sendProgress('调整图片质量...', 30);

  const qualityResult = await compressByQuality(
    imageData,
    originalType,
    maxSizeBytes,
    initialQuality
  );

  if (qualityResult && qualityResult.size <= maxSizeBytes) {
    sendProgress('压缩完成', 100);
    return {
      dataUrl: qualityResult.dataUrl,
      compressedSize: qualityResult.size,
      method: qualityResult.method,
      finalDimensions: { width: imageData.width, height: imageData.height },
    };
  }

  // 策略2: 降分辨率压缩
  sendProgress('降低分辨率...', 60);

  const resolutionResult = await compressByResolution(
    imageData,
    originalType,
    maxSizeBytes,
    initialQuality,
    maxWidth,
    maxHeight
  );

  sendProgress('压缩完成', 100);
  return {
    dataUrl: resolutionResult.dataUrl,
    compressedSize: resolutionResult.size,
    method: resolutionResult.method,
    finalDimensions: resolutionResult.dimensions,
  };
}

/**
 * 通过质量调整压缩
 */
async function compressByQuality(
  imageBitmap: ImageBitmap,
  originalType: string,
  maxSizeBytes: number,
  initialQuality: number
): Promise<{ dataUrl: string; size: number; method: string } | null> {
  // 创建 OffscreenCanvas
  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('无法创建 OffscreenCanvas context');

  // 绘制图片
  ctx.drawImage(imageBitmap, 0, 0);

  // 确定输出格式
  const formats: Array<'image/webp' | 'image/jpeg'> = [
    'image/webp',
    'image/jpeg'
  ];

  // 如果原图就是 JPEG/WebP，尝试直接降低质量
  if (originalType === 'image/jpeg' || originalType === 'image/webp') {
    const result = await tryQualities(canvas, originalType, maxSizeBytes, initialQuality);
    if (result) {
      return {
        dataUrl: result.dataUrl,
        size: result.size,
        method: `降低${originalType.split('/')[1]}质量至${Math.round(result.quality * 100)}%`,
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
        method: `转换为${format.split('/')[1].toUpperCase()}，质量${Math.round(result.quality * 100)}%`,
      };
    }
  }

  return null;
}

/**
 * 通过降分辨率压缩
 */
async function compressByResolution(
  imageBitmap: ImageBitmap,
  originalType: string,
  maxSizeBytes: number,
  initialQuality: number,
  maxWidth?: number,
  maxHeight?: number
): Promise<{ dataUrl: string; size: number; method: string; dimensions: { width: number; height: number } }> {
  let scale = 1.0;
  const minScale = 0.1;
  const scaleStep = 0.8;

  // 限制最大尺寸
  const originalWidth = imageBitmap.width;
  const originalHeight = imageBitmap.height;
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (maxWidth && targetWidth > maxWidth) {
    targetWidth = maxWidth;
    targetHeight = Math.round((maxWidth / originalWidth) * originalHeight);
  }
  if (maxHeight && targetHeight > maxHeight) {
    targetHeight = maxHeight;
    targetWidth = Math.round((maxHeight / originalHeight) * originalWidth);
  }

  scale = Math.min(targetWidth / originalWidth, targetHeight / originalHeight);

  while (scale >= minScale) {
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('无法创建 OffscreenCanvas context');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(imageBitmap, 0, 0, width, height);

    // 尝试不同格式
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
          method: `分辨率缩小至${Math.round(scale * 100)}%，转换为${format.name}，质量${Math.round(result.quality * 100)}%`,
          dimensions: { width, height },
        };
      }
    }

    scale *= scaleStep;
  }

  throw new Error('无法压缩到目标大小');
}

/**
 * 尝试不同的质量级别
 */
async function tryQualities(
  canvas: OffscreenCanvas,
  mimeType: string,
  maxSizeBytes: number,
  startQuality: number
): Promise<{ dataUrl: string; size: number; quality: number } | null> {
  const qualityStep = 0.05;
  let quality = startQuality;
  const minQuality = 0.5;

  while (quality >= minQuality) {
    const blob = await canvas.convertToBlob({ type: mimeType, quality });
    if (blob.size <= maxSizeBytes) {
      const dataUrl = await blobToDataUrl(blob);
      return { dataUrl, size: blob.size, quality };
    }
    quality -= qualityStep;
  }

  // 返回最低质量的结果
  const blob = await canvas.convertToBlob({ type: mimeType, quality: minQuality });
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, size: blob.size, quality: minQuality };
}

/**
 * Blob 转 DataURL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) resolve(e.target.result as string);
      else reject(new Error('Blob to DataURL failed'));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 计算原始数据 URL 大小
 */
function estimateOriginalSize(dataUrl: string): number {
  // Base64 编码大约比原始数据大 33%
  const base64Length = dataUrl.split(',')[1]?.length || 0;
  return Math.round(base64Length * 0.75);
}

// 主消息处理
self.onmessage = async (e: MessageEvent<CompressionMessage>) => {
  const { type, imageData, options } = e.data;

  if (type !== 'compress') {
    self.postMessage({ type: 'error', error: '未知消息类型' } as CompressionResultMessage);
    return;
  }

  try {
    sendProgress('加载图片...', 5);

    // 将 dataUrl 转换为 Blob
    const blob = dataUrlToBlob(imageData.dataUrl);

    // 创建 ImageBitmap
    const imageBitmap = await createImageBitmap(blob);

    const originalSize = blob.size;
    const originalDimensions = { width: imageData.width, height: imageData.height };

    // 如果文件已经符合要求，直接返回
    if (originalSize <= options.maxSizeBytes) {
      imageBitmap.close();
      self.postMessage({
        type: 'result',
        result: {
          dataUrl: imageData.dataUrl,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1,
          wasCompressed: false,
          method: '无需压缩',
          originalDimensions,
          finalDimensions: originalDimensions,
        },
      } as CompressionResultMessage);
      return;
    }

    // 执行压缩
    const result = await compressWithOffscreenCanvas(
      imageBitmap,
      options.maxSizeBytes,
      options.maxWidth,
      options.maxHeight,
      imageData.originalType,
      options.initialQuality,
      originalDimensions
    );

    imageBitmap.close();

    self.postMessage({
      type: 'result',
      result: {
        dataUrl: result.dataUrl,
        originalSize,
        compressedSize: result.compressedSize,
        compressionRatio: result.compressedSize / originalSize,
        wasCompressed: true,
        method: result.method,
        originalDimensions,
        finalDimensions: result.finalDimensions,
      },
    } as CompressionResultMessage);

  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    } as CompressionResultMessage);
  }
};
