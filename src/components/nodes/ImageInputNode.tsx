"use client";

import { useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { ImageInputNodeData } from "@/types";
import { compressImage, formatFileSize } from "@/utils/imageCompressor";

type ImageInputNodeType = Node<ImageInputNodeData, "imageInput">;

export function ImageInputNode({ id, data, selected }: NodeProps<ImageInputNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const openImagePreview = useWorkflowStore((state) => state.openImagePreview);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);

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
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB

        // 如果文件过大，自动压缩
        const result = await compressImage(file, MAX_SIZE);

        // 检查压缩后的文件大小
        if (result.compressedSize > MAX_SIZE) {
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

        const img = new Image();
        img.onload = () => {
          updateNodeData(id, {
            image: result.dataUrl,
            filename: file.name,
            dimensions: { width: img.width, height: img.height },
          });
          setIsCompressing(false);
        };
        img.onerror = () => {
          alert("无法加载图片");
          setIsCompressing(false);
        };
        img.src = result.dataUrl;
      } catch (error) {
        console.error("图片处理失败:", error);
        alert("图片处理失败，请重试");
        setIsCompressing(false);
      }
    },
    [id, updateNodeData]
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
    });
  }, [id, updateNodeData]);

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
                压缩中...
              </span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="text-[10px] text-neutral-400 mt-1">
                Drop or click
              </span>
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
