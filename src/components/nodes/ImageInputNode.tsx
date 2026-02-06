"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { ImageInputNodeData } from "@/types";
import { compressImage, formatFileSize, getAABaoTargetSize } from "@/utils/imageCompressor";
import { useImageCompression } from "@/hooks/useImageCompression";

type ImageInputNodeType = Node<ImageInputNodeData, "imageInput">;

export function ImageInputNode({ id, data, selected }: NodeProps<ImageInputNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const openImagePreview = useWorkflowStore((state) => state.openImagePreview);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 使用 Web Worker 进行压缩（如果支持）
  const { compressImage: compressWithWorker, isCompressing: isCompressingInWorker, progress, isWorkerSupported } = useImageCompression();

  // 降级状态：当不支持 Worker 时使用传统压缩
  const [isLegacyCompressing, setIsLegacyCompressing] = useState(false);

  // 统一的压缩状态
  const isCompressing = isCompressingInWorker || isLegacyCompressing;

  // 统一的状态设置函数
  const setIsCompressing = (value: boolean) => {
    if (!isWorkerSupported) {
      setIsLegacyCompressing(value);
    }
    // Worker 状态由 hook 自动管理
  };

  // 检测下游是否使用 AABao provider
  const hasDownstreamAABaoNode = useCallback((nodeId: string): boolean => {
    const { edges, nodes } = useWorkflowStore.getState();

    // 找到所有从这个节点出发的边
    const outgoingEdges = edges.filter(e => e.source === nodeId);

    for (const edge of outgoingEdges) {
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!targetNode) continue;

      // 如果目标节点是 nanoBanana 且使用 AABao
      if (targetNode.type === 'nanoBanana') {
        const targetData = targetNode.data as any;
        if (targetData.provider === 'aabao') {
          return true;
        }
      }

      // 递归检查下游节点
      if (hasDownstreamAABaoNode(targetNode.id)) {
        return true;
      }
    }

    return false;
  }, []);

  // 辅助函数：加载图片并获取尺寸
  const loadImageData = useCallback((file: File): Promise<{ dataUrl: string; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!e.target?.result) {
          reject(new Error("无法读取文件"));
          return;
        }

        const dataUrl = e.target.result as string;
        const img = new Image();

        img.onload = () => {
          resolve({
            dataUrl,
            width: img.width,
            height: img.height,
          });
        };

        img.onerror = () => reject(new Error("无法加载图片"));
        img.src = dataUrl;
      };

      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
        alert("不支持的格式。请使用 PNG、JPG 或 WebP 格式。");
        return;
      }

      setIsCompressing(true);

      try {
        // 检测是否需要 AABao 压缩策略
        const useAABaoStrategy = hasDownstreamAABaoNode(id);

        // 根据策略选择不同的压缩目标
        const maxSize = useAABaoStrategy
          ? getAABaoTargetSize(file.size)  // AABao 使用更激进的目标
          : 10 * 1024 * 1024;              // 默认 10MB

        console.log(`[图片压缩] ========== 开始压缩 ==========`);
        console.log(`[图片压缩] 文件名: ${file.name}`);
        console.log(`[图片压缩] 原始大小: ${formatFileSize(file.size)}`);
        console.log(`[图片压缩] 策略: ${useAABaoStrategy ? 'AABao' : '默认'} | 目标: ${formatFileSize(maxSize)}`);
        console.log(`[图片压缩] 预缩放: 最大边 2048px | 质量: 100% 起始`);

        let result;

        // 优先使用 Web Worker（如果支持）
        if (isWorkerSupported && file.size > 1024 * 1024) { // 只对大于 1MB 的文件使用 Worker
          console.log('[图片压缩] 使用 Web Worker 进行压缩...');
          // 先加载图片获取尺寸
          const { dataUrl, width, height } = await loadImageData(file);
          console.log(`[图片压缩] 原始尺寸: ${width}x${height}`);

          // 使用 Worker 压缩
          result = await compressWithWorker(
            dataUrl,
            width,
            height,
            file.type,
            {
              maxSizeBytes: maxSize,
              maxWidth: 2048,      // 全局预缩放
              maxHeight: 2048,     // 全局预缩放
              initialQuality: 1.0, // 100% 质量起始
            }
          );
        } else {
          // 不支持 Worker 或文件太小，使用主线程压缩
          if (!isWorkerSupported) {
            console.log('[ImageInput] 浏览器不支持 Worker，使用主线程压缩');
            setIsLegacyCompressing(true);
          }
          result = await compressImage(file, maxSize, 2048, 2048, 1.0);
          setIsLegacyCompressing(false);
        }

        // 检查压缩后的文件大小
        if (result.compressedSize > maxSize) {
          alert(
            `图片过大且无法压缩到 10MB 以下。\n` +
            `原始大小: ${formatFileSize(result.originalSize)}\n` +
            `压缩后大小: ${formatFileSize(result.compressedSize)}`
          );
          setIsCompressing(false);
          return;
        }

        // 显示压缩信息（如果被压缩）
        if (result.wasCompressed) {
          console.log(
            `[图片压缩] ${file.name}\n` +
            `方法: ${result.method}\n` +
            `大小: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)} (${(result.compressionRatio * 100).toFixed(0)}%)${
              result.originalDimensions && result.finalDimensions
                ? `\n分辨率: ${result.originalDimensions.width}x${result.originalDimensions.height} → ${result.finalDimensions.width}x${result.finalDimensions.height}`
                : ''
            }`
          );
        }

        // 使用压缩结果的尺寸（不再需要重新加载图片）
        const finalDimensions = result.finalDimensions || result.originalDimensions;

        updateNodeData(id, {
          image: result.dataUrl,
          filename: file.name,
          dimensions: finalDimensions,
          compressionInfo: {
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            ratio: result.compressionRatio,
            method: result.method,
            forAABao: useAABaoStrategy,
          },
        });
        setIsCompressing(false);
      } catch (error) {
        console.error("图片处理失败:", error);
        alert("图片处理失败，请重试");
        setIsCompressing(false);
        setIsLegacyCompressing(false);
      }
    },
    [id, updateNodeData, hasDownstreamAABaoNode, isWorkerSupported, compressWithWorker, loadImageData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleRemove = useCallback(() => {
    updateNodeData(id, {
      image: null,
      filename: null,
      dimensions: null,
      compressionInfo: undefined,
    });
  }, [id, updateNodeData]);

  // 处理剪贴板粘贴
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      // 只在没有图片时才响应粘贴，避免覆盖已有图片
      if (nodeData.image) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          setIsCompressing(true);

          try {
            // 检测是否需要 AABao 压缩策略
            const useAABaoStrategy = hasDownstreamAABaoNode(id);

            // 根据策略选择不同的压缩目标
            const maxSize = useAABaoStrategy
              ? getAABaoTargetSize(file.size)
              : 10 * 1024 * 1024;

            console.log(`[图片压缩] ========== 开始压缩（粘贴） ==========`);
            console.log(`[图片压缩] 原始大小: ${formatFileSize(file.size)}`);
            console.log(`[图片压缩] 策略: ${useAABaoStrategy ? 'AABao' : '默认'} | 目标: ${formatFileSize(maxSize)}`);

            let result;

            // 优先使用 Web Worker（如果支持）
            if (isWorkerSupported && file.size > 1024 * 1024) {
              console.log('[图片压缩] 使用 Web Worker 进行压缩...');
              const { dataUrl, width, height } = await loadImageData(file);
              console.log(`[图片压缩] 原始尺寸: ${width}x${height}`);

              result = await compressWithWorker(
                dataUrl,
                width,
                height,
                file.type,
                {
                  maxSizeBytes: maxSize,
                  maxWidth: 2048,      // 全局预缩放
                  maxHeight: 2048,     // 全局预缩放
                  initialQuality: 1.0, // 100% 质量起始
                }
              );
            } else {
              if (!isWorkerSupported) {
                setIsLegacyCompressing(true);
              }
              result = await compressImage(file, maxSize, 2048, 2048, 1.0);
              setIsLegacyCompressing(false);
            }

            if (result.compressedSize > maxSize) {
              alert(
                `图片过大且无法压缩到目标大小以下。\n` +
                `原始大小: ${formatFileSize(result.originalSize)}\n` +
                `压缩后大小: ${formatFileSize(result.compressedSize)}`
              );
              setIsCompressing(false);
              return;
            }

            if (result.wasCompressed) {
              console.log(
                `[图片粘贴] 剪贴板图片\n` +
                `方法: ${result.method}\n` +
                `大小: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)}`
              );
            }

            // 使用压缩结果的尺寸
            const finalDimensions = result.finalDimensions || result.originalDimensions;

            updateNodeData(id, {
              image: result.dataUrl,
              filename: `pasted-image-${Date.now()}.png`,
              dimensions: finalDimensions,
              compressionInfo: {
                originalSize: result.originalSize,
                compressedSize: result.compressedSize,
                ratio: result.compressionRatio,
                method: result.method,
                forAABao: useAABaoStrategy,
              },
            });
            setIsCompressing(false);
          } catch (error) {
            console.error("剪贴板图片处理失败:", error);
            alert("剪贴板图片处理失败，请重试");
            setIsCompressing(false);
            setIsLegacyCompressing(false);
          }

          break; // 只处理第一个图片
        }
      }
    },
    [id, nodeData.image, updateNodeData, hasDownstreamAABaoNode, isWorkerSupported, compressWithWorker, loadImageData]
  );

  // 添加/移除 paste 事件监听
  useEffect(() => {
    if (!selected) return; // 只在选中时响应粘贴

    const handlePasteEvent = (e: Event) => {
      handlePaste(e as ClipboardEvent);
    };

    document.addEventListener("paste", handlePasteEvent);
    return () => {
      document.removeEventListener("paste", handlePasteEvent);
    };
  }, [selected, handlePaste]);

  return (
    <BaseNode
      id={id}
      title="图片"
      customTitle={nodeData.customTitle}
      comment={nodeData.comment}
      onCustomTitleChange={(title) => updateNodeData(id, { customTitle: title || undefined })}
      onCommentChange={(comment) => updateNodeData(id, { comment: comment || undefined })}
      selected={selected}
    >
      {/* Reference input handle for visual links from Split Grid node */}
      <Handle
        type="target"
        position={Position.Left}
        id="reference"
        data-handletype="reference"
        className="!bg-gray-500"
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {nodeData.image ? (
        <div className="relative group flex-1 flex flex-col min-h-0">
          <img
            src={nodeData.image}
            alt={nodeData.filename || "上传的图片"}
            className="w-full flex-1 min-h-0 object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
            onDoubleClick={() => openImagePreview(nodeData.image!, nodeData.filename || "上传的图片")}
            title="双击查看大图"
          />
          <button
            onClick={handleRemove}
            className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="mt-1.5 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-neutral-400 truncate max-w-[120px]">
              {nodeData.filename}
            </span>
            {nodeData.dimensions && (
              <span className="text-[10px] text-neutral-500">
                {nodeData.dimensions.width}x{nodeData.dimensions.height}
              </span>
            )}
          </div>
          {/* 压缩信息显示 */}
          {nodeData.compressionInfo && (
            <div className="mt-1.5 pt-1.5 border-t border-neutral-700 shrink-0">
              <div className="text-[9px] text-neutral-500 space-y-0.5">
                <div className="flex justify-between">
                  <span>原始: {formatFileSize(nodeData.compressionInfo.originalSize)}</span>
                  <span>→ {formatFileSize(nodeData.compressionInfo.compressedSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span>压缩率:</span>
                  <span>{((1 - nodeData.compressionInfo.ratio) * 100).toFixed(1)}%</span>
                </div>
                {nodeData.compressionInfo.forAABao && (
                  <div className="mt-0.5 text-[9px] text-purple-400 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>AABao 优化</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => !isCompressing && fileInputRef.current?.click()}
          onDrop={isCompressing ? undefined : handleDrop}
          onDragOver={isCompressing ? undefined : handleDragOver}
          className={`w-full flex-1 min-h-[112px] border border-dashed border-neutral-600 rounded flex flex-col items-center justify-center transition-colors ${
            isCompressing
              ? "cursor-wait bg-neutral-700/30"
              : "cursor-pointer hover:border-neutral-500 hover:bg-neutral-700/50"
          }`}
        >
          {isCompressing ? (
            <>
              <svg className="w-5 h-5 text-neutral-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-[10px] text-neutral-400 mt-1">
                {progress ? `${progress.step} ${progress.percent}%` : '压缩中...'}
              </span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="text-[10px] text-neutral-400 mt-1">
                粘贴 / 拖拽 / 点击
              </span>
              {selected && (
                <span className="text-[9px] text-neutral-600 mt-0.5">
                  (选中节点后按 Ctrl+V)
                </span>
              )}
            </>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
      />
    </BaseNode>
  );
}
