"use client";

import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { Handle, Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { ViduGenerateNodeData, ViduAspectRatio, ViduResolution, ViduModelType, ViduTaskState } from "@/types";

// VIDU Aspect Ratios - viduq2 supports all
const VIDU_ASPECT_RATIOS: ViduAspectRatio[] = ["16:9", "9:16", "1:1", "3:4", "4:3", "21:9", "2:3", "3:2"];

// VIDU Resolutions
const VIDU_RESOLUTIONS: ViduResolution[] = ["1080p", "2K", "4K"];

// VIDU Models
const VIDU_MODELS: { value: ViduModelType; label: string }[] = [
  { value: "viduq2", label: "VIDU Q2（文生图+参考生图）" },
  { value: "viduq1", label: "VIDU Q1（仅参考生图）" },
];

type ViduGenerateNodeType = Node<ViduGenerateNodeData, "viduGenerate">;

export function ViduGenerateNode({ id, data, selected }: NodeProps<ViduGenerateNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const generationsPath = useWorkflowStore((state) => state.generationsPath);
  const openImagePreview = useWorkflowStore((state) => state.openImagePreview);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const [isLoadingCarouselImage, setIsLoadingCarouselImage] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { setNodes } = useReactFlow();
  const contentRef = useRef<HTMLDivElement>(null);

  // Get connected source nodes with their images
  const connectedInputImages = useMemo(() => {
    const imageInputs: Array<{ nodeId: string; image: string; index: number }> = [];

    edges
      .filter((edge) => edge.target === id && edge.targetHandle === "image")
      .forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (!sourceNode) return;

        let image: string | null = null;

        if (sourceNode.type === "imageInput") {
          image = (sourceNode.data as any).image;
        } else if (sourceNode.type === "annotation") {
          image = (sourceNode.data as any).outputImage;
        } else if (sourceNode.type === "nanoBanana" || sourceNode.type === "viduGenerate") {
          image = (sourceNode.data as any).outputImage;
        }

        if (image) {
          imageInputs.push({ nodeId: sourceNode.id, image, index: imageInputs.length });
        }
      });

    return imageInputs;
  }, [edges, nodes, id]);

  // Dynamically adjust node height
  useEffect(() => {
    const updateNodeHeight = () => {
      if (contentRef.current) {
        const contentHeight = contentRef.current.scrollHeight;
        const headerHeight = 28;
        const padding = 16;
        const newHeight = contentHeight + headerHeight + padding;

        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === id
              ? {
                  ...node,
                  style: {
                    ...node.style,
                    height: newHeight,
                  },
                }
              : node
          )
        );
      }
    };

    const timeoutId = setTimeout(updateNodeHeight, 50);
    return () => clearTimeout(timeoutId);
  }, [showAdvanced, id, setNodes]);

  const handleAspectRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const aspectRatio = e.target.value as ViduAspectRatio;
      updateNodeData(id, { aspectRatio });
    },
    [id, updateNodeData]
  );

  const handleResolutionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const resolution = e.target.value as ViduResolution;
      updateNodeData(id, { resolution });
    },
    [id, updateNodeData]
  );

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value as ViduModelType;
      updateNodeData(id, { model });
    },
    [id, updateNodeData]
  );

  const handleClearImage = useCallback(() => {
    updateNodeData(id, {
      outputImage: null,
      status: "idle",
      error: null,
      taskId: null,
      taskState: null,
    });
  }, [id, updateNodeData]);

  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  const isViduQ2 = nodeData.model === "viduq2";
  const hasCarouselImages = (nodeData.imageHistory || []).length > 1;

  // Get status display text
  const getStatusText = () => {
    if (nodeData.status === "loading") {
      switch (nodeData.taskState) {
        case "created":
        case "queueing":
          return "队列中...";
        case "processing":
          return "处理中...";
        default:
          return "处理中...";
      }
    }
    if (nodeData.status === "error") {
      return nodeData.error || "失败";
    }
    return "运行以生成";
  };

  return (
    <BaseNode
      id={id}
      title="VIDU 生图"
      customTitle={nodeData.customTitle}
      comment={nodeData.comment}
      onCustomTitleChange={(title) => updateNodeData(id, { customTitle: title || undefined })}
      onCommentChange={(comment) => updateNodeData(id, { comment: comment || undefined })}
      onRun={handleRegenerate}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
    >
      {/* Image input - accepts multiple connections */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        style={{ top: "35%" }}
        data-handletype="image"
        isConnectable={true}
      />
      {/* Text input - single connection */}
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        style={{ top: "65%" }}
        data-handletype="text"
      />
      {/* Image output */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
      />

      <div ref={contentRef} className="flex-1 flex flex-col min-h-0 gap-2">
        {/* Connected input images thumbnails */}
        {connectedInputImages.length > 0 && (
          <div className="flex gap-1 shrink-0 overflow-x-auto pb-1">
            {connectedInputImages.map((item) => (
              <div
                key={item.nodeId}
                className="relative shrink-0 w-10 h-10 rounded border border-neutral-700 overflow-hidden cursor-pointer hover:border-neutral-500 transition-colors group"
                onClick={() => openImagePreview(item.image, `输入图片 ${item.index + 1}`)}
                title={`输入图片 ${item.index + 1} - 双击查看大图`}
              >
                <img
                  src={item.image}
                  alt={`输入 ${item.index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-0 left-0 bg-blue-600 text-white text-[8px] font-bold px-1 rounded-br">
                  {item.index + 1}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Preview area */}
        {nodeData.outputImage ? (
          <>
            <div className="relative w-full flex-1 min-h-0">
              <img
                src={nodeData.outputImage}
                alt="Generated"
                className="w-full h-full object-contain rounded cursor-pointer hover:opacity-90 transition-opacity"
                onDoubleClick={() => openImagePreview(nodeData.outputImage!, "生成的图片")}
                title="双击查看大图"
              />
              {/* Loading overlay for generation */}
              {nodeData.status === "loading" && (
                <div className="absolute inset-0 bg-neutral-900/85 rounded flex flex-col items-center justify-center gap-3 px-6">
                  <svg
                    className="w-8 h-8 animate-spin text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {/* Show progress percentage */}
                  {nodeData.taskProgress !== null && nodeData.taskProgress !== undefined && (
                    <span className="text-white text-lg font-bold">
                      {Math.round(nodeData.taskProgress)}%
                    </span>
                  )}
                  {/* Progress bar */}
                  {nodeData.taskProgress !== null && nodeData.taskProgress !== undefined && (
                    <div className="w-32 h-2 bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300 ease-out"
                        style={{ width: `${nodeData.taskProgress}%` }}
                      />
                    </div>
                  )}
                  {/* Status text */}
                  <span className="text-neutral-300 text-xs">{getStatusText()}</span>
                </div>
              )}
              <div className="absolute top-1 right-1">
                <button
                  onClick={handleClearImage}
                  className="w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  title="清除图片"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Carousel controls - only show if there are multiple images */}
            {hasCarouselImages && (
              <div className="flex items-center justify-center gap-2 shrink-0">
                <button
                  onClick={() => {/* TODO: Implement carousel navigation */}}
                  className="w-5 h-5 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  title="上一张图片"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-[10px] text-neutral-400 min-w-[32px] text-center">
                  {(nodeData.selectedHistoryIndex || 0) + 1} / {(nodeData.imageHistory || []).length}
                </span>
                <button
                  onClick={() => {/* TODO: Implement carousel navigation */}}
                  className="w-5 h-5 rounded bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  title="下一张图片"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full flex-1 min-h-[112px] border border-dashed border-neutral-600 rounded flex flex-col items-center justify-center">
            {nodeData.status === "loading" ? (
              <div className="flex flex-col items-center gap-2 w-full px-2">
                <div className="flex items-center gap-2 w-full">
                  <svg
                    className="w-4 h-4 animate-spin text-neutral-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {nodeData.taskProgress !== null && nodeData.taskProgress !== undefined && (
                    <span className="text-[10px] text-neutral-400">
                      {Math.round(nodeData.taskProgress)}%
                    </span>
                  )}
                </div>
                {/* Progress bar */}
                {nodeData.taskProgress !== null && nodeData.taskProgress !== undefined && (
                  <div className="w-full h-1 bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300 ease-out"
                      style={{ width: `${nodeData.taskProgress}%` }}
                    />
                  </div>
                )}
                <span className="text-[10px] text-neutral-400">{getStatusText()}</span>
              </div>
            ) : nodeData.status === "error" ? (
              <span className="text-[10px] text-red-400 text-center px-2">
                {nodeData.error || "失败"}
              </span>
            ) : (
              <span className="text-neutral-500 text-[10px]">
                {isViduQ2 ? "运行以生成" : "需要输入图片"}
              </span>
            )}
          </div>
        )}

        {/* Model selector */}
        <select
          value={nodeData.model}
          onChange={handleModelChange}
          className="nodrag w-full text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300 shrink-0"
        >
          {VIDU_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        {/* Aspect ratio and resolution row */}
        <div className="flex gap-1.5 shrink-0">
          <select
            value={nodeData.aspectRatio}
            onChange={handleAspectRatioChange}
            className="nodrag flex-1 text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300"
          >
            {VIDU_ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
          <select
            value={nodeData.resolution}
            onChange={handleResolutionChange}
            className="nodrag w-16 text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300"
          >
            {VIDU_RESOLUTIONS.map((res) => (
              <option key={res} value={res}>
                {res}
              </option>
            ))}
          </select>
        </div>

        {/* Off-peak mode toggle */}
        <button
          onClick={() => {
            updateNodeData(id, { offPeak: !nodeData.offPeak });
          }}
          className={`nodrag w-full text-[9px] px-2 py-1 rounded transition-colors flex items-center justify-center gap-1 ${
            nodeData.offPeak
              ? "bg-green-600/20 text-green-400 border border-green-600/30"
              : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700"
          }`}
          title={nodeData.offPeak ? "错峰模式开启（成本更低）" : "错峰模式关闭（处理更快）"}
        >
          <span>{nodeData.offPeak ? "🌙" : "⚡"}</span>
          <span>{nodeData.offPeak ? "错峰模式（省钱）" : "标准模式（快速）"}</span>
        </button>

        {/* Seed controls */}
        {nodeData.lastSeed && (
          <div className="flex flex-col gap-1 shrink-0 border-t border-neutral-700 pt-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-neutral-500">
                Seed: {nodeData.lastSeed}
              </span>
              {nodeData.seedFixed && nodeData.cached && (
                <span className="text-[9px] text-green-400">💾 缓存</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  updateNodeData(id, { seedFixed: !nodeData.seedFixed, cached: false });
                }}
                className={`flex-1 text-[9px] px-2 py-0.5 rounded transition-colors ${
                  nodeData.seedFixed
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {nodeData.seedFixed ? "📌 固定" : "🎲 随机"}
              </button>
            </div>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
