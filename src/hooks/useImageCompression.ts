/**
 * Hook for using the image compression Web Worker
 * 自动处理 Worker 的创建、销毁和消息传递
 */

import { useCallback, useRef, useState } from 'react';
import type { CompressionMessage, CompressionResultMessage } from '@/workers/imageCompression.worker';

export interface CompressionOptions {
  maxSizeBytes: number;
  maxWidth?: number;
  maxHeight?: number;
  initialQuality?: number;
}

export interface CompressionResult {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  wasCompressed: boolean;
  method: string;
  originalDimensions: { width: number; height: number };
  finalDimensions: { width: number; height: number };
}

export interface UseImageCompressionReturn {
  compressImage: (
    dataUrl: string,
    width: number,
    height: number,
    originalType: string,
    options: CompressionOptions
  ) => Promise<CompressionResult>;
  isCompressing: boolean;
  progress: { step: string; percent: number } | null;
  error: string | null;
  isWorkerSupported: boolean;
}

/**
 * 检测浏览器是否支持 Web Worker
 */
function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/**
 * Hook 使用图片压缩 Worker
 */
export function useImageCompression(): UseImageCompressionReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState<{ step: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compressImage = useCallback(
    (
      dataUrl: string,
      width: number,
      height: number,
      originalType: string,
      options: CompressionOptions
    ): Promise<CompressionResult> => {
      return new Promise((resolve, reject) => {
        // 检查 Worker 支持
        if (!isWorkerSupported()) {
          reject(new Error('浏览器不支持 Web Worker 或 OffscreenCanvas'));
          return;
        }

        setIsCompressing(true);
        setProgress({ step: '初始化...', percent: 0 });
        setError(null);

        try {
          // 创建 Worker
          if (!workerRef.current) {
            workerRef.current = new Worker(
              new URL('../workers/imageCompression.worker.ts', import.meta.url),
              { type: 'module' }
            );
          }

          const worker = workerRef.current;

          // 设置消息处理器
          worker.onmessage = (e: MessageEvent<CompressionResultMessage>) => {
            const { type, result, error: err, progress: prog } = e.data;

            if (type === 'progress' && prog) {
              setProgress(prog);
            } else if (type === 'result' && result) {
              setIsCompressing(false);
              setProgress(null);
              resolve(result);
            } else if (type === 'error') {
              setIsCompressing(false);
              setProgress(null);
              setError(err || '压缩失败');
              reject(new Error(err || '压缩失败'));
            }
          };

          worker.onerror = (err) => {
            setIsCompressing(false);
            setProgress(null);
            setError(err.message || 'Worker 错误');
            reject(err);
          };

          // 发送压缩请求
          const message: CompressionMessage = {
            type: 'compress',
            imageData: { dataUrl, width, height, originalType },
            options: {
              maxSizeBytes: options.maxSizeBytes,
              maxWidth: options.maxWidth,
              maxHeight: options.maxHeight,
              initialQuality: options.initialQuality ?? 0.95,
            },
          };

          worker.postMessage(message);

        } catch (err) {
          setIsCompressing(false);
          setProgress(null);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          reject(new Error(errorMessage));
        }
      });
    },
    []
  );

  return {
    compressImage,
    isCompressing,
    progress,
    error,
    isWorkerSupported: isWorkerSupported(),
  };
}

/**
 * 清理 Worker
 */
export function cleanupCompressionWorker(workerRef: React.MutableRefObject<Worker | null>) {
  if (workerRef.current) {
    workerRef.current.terminate();
    workerRef.current = null;
  }
}
