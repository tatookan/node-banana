"use client";

import { useCallback, useState, useEffect } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { OutputNodeData } from "@/types";

type OutputNodeType = Node<OutputNodeData, "output">;

export function OutputNode({ id, data, selected }: NodeProps<OutputNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const [showLightbox, setShowLightbox] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 重置错误状态当图片改变时
  useEffect(() => {
    if (nodeData.image) {
      setImageError(false);
      setIsLoading(true);
    }
  }, [nodeData.image]);

  const handleDownload = useCallback(() => {
    if (!nodeData.image) return;

    const link = document.createElement("a");
    link.href = nodeData.image;
    link.download = `generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [nodeData.image]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setImageError(true);
    console.error("[OutputNode] Failed to load image");
  }, []);

  return (
    <>
      <BaseNode
        id={id}
        title="输出"
        customTitle={nodeData.customTitle}
        comment={nodeData.comment}
        onCustomTitleChange={(title) => updateNodeData(id, { customTitle: title || undefined })}
        onCommentChange={(comment) => updateNodeData(id, { comment: comment || undefined })}
        selected={selected}
        className="min-w-[200px]"
      >
        <Handle
          type="target"
          position={Position.Left}
          id="image"
          data-handletype="image"
        />

        {nodeData.image ? (
          <div className="flex-1 flex flex-col min-h-0 gap-2">
            <div
              className="relative cursor-pointer group flex-1 min-h-0 bg-neutral-800 rounded overflow-hidden"
              onClick={() => !imageError && setShowLightbox(true)}
            >
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
                  <svg className="w-6 h-6 text-neutral-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}
              {imageError ? (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
                  <div className="text-center">
                    <svg className="w-8 h-8 text-red-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.947 4.774a6.063 6.063 0 013.618-1.083 9.046 9.046 0 013.822 15.228c.567.647 1.378 1.062 2.287 1.062 4.155 0 3.258-2.643 5.9-5.9 5.9-1.783 0-3.388-.633-4.647-1.689" />
                    </svg>
                    <span className="text-[10px] text-red-400">加载失败</span>
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={nodeData.image}
                    alt="Output"
                    className="w-full h-full object-contain rounded"
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center rounded">
                    <span className="text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 px-2 py-1 rounded">
                      查看大图
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleDownload}
              disabled={imageError || isLoading}
              className="w-full py-1.5 bg-white hover:bg-neutral-200 text-neutral-900 text-[10px] font-medium rounded transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "加载中..." : "下载图片"}
            </button>
          </div>
        ) : (
          <div className="w-full flex-1 min-h-[144px] border border-dashed border-neutral-600 rounded flex items-center justify-center">
            <span className="text-neutral-500 text-[10px]">等待图片输入...</span>
          </div>
        )}
      </BaseNode>

      {/* Lightbox Modal */}
      {showLightbox && nodeData.image && (
        <div
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-8"
          onClick={() => setShowLightbox(false)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={nodeData.image}
              alt="Output full size"
              className="max-w-full max-h-[90vh] object-contain rounded"
            />
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-white/10 hover:bg-white/20 rounded text-white text-sm transition-colors flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
