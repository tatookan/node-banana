"use client";

import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { Handle, Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore, saveNanoBananaDefaults } from "@/store/workflowStore";
import { NanoBananaNodeData, AspectRatio, Resolution, ModelType, ImageInputNodeData, AnnotationNodeData } from "@/types";
import { cacheManager } from "@/lib/cacheManager";
import { ResonanceModeToggle } from "@/components/ResonanceModeToggle";

// All 10 aspect ratios supported by both models
const ASPECT_RATIOS: AspectRatio[] = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

// Resolutions only for AI分镜画板 Pro (gemini-3-pro-image-preview)
// 4K temporarily disabled
const RESOLUTIONS: Resolution[] = ["1K", "2K"]; // ["1K", "2K", "4K"];

const MODELS: { value: ModelType; label: string }[] = [
  { value: "nano-banana", label: "nano-banana-Flash（pro 1/4价格，速度快）" },
  { value: "nano-banana-pro", label: "nano-banana-pro（满血版）" },
];

type NanoBananaNodeType = Node<NanoBananaNodeData, "nanoBanana">;

export function NanoBananaNode({ id, data, selected }: NodeProps<NanoBananaNodeType>) {
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
          image = (sourceNode.data as ImageInputNodeData).image;
        } else if (sourceNode.type === "annotation") {
          image = (sourceNode.data as AnnotationNodeData).outputImage;
        } else if (sourceNode.type === "nanoBanana") {
          image = (sourceNode.data as NanoBananaNodeData).outputImage;
        }

        if (image) {
          imageInputs.push({ nodeId: sourceNode.id, image, index: imageInputs.length });
        }
      });

    return imageInputs;
  }, [edges, nodes, id]);

  // Dynamically adjust node height when advanced settings are toggled
  useEffect(() => {
    const updateNodeHeight = () => {
      if (contentRef.current) {
        const contentHeight = contentRef.current.scrollHeight;
        const headerHeight = 28; // Approximate header height
        const padding = 16; // pb-4 = 16px
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

    // Update height after a short delay to allow DOM to update
    const timeoutId = setTimeout(updateNodeHeight, 50);
    return () => clearTimeout(timeoutId);
  }, [showAdvanced, id, setNodes]);

  const handleAspectRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const aspectRatio = e.target.value as AspectRatio;
      updateNodeData(id, { aspectRatio });
      saveNanoBananaDefaults({ aspectRatio });
    },
    [id, updateNodeData]
  );

  const handleResolutionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const resolution = e.target.value as Resolution;
      updateNodeData(id, { resolution });
      saveNanoBananaDefaults({ resolution });
    },
    [id, updateNodeData]
  );

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value as ModelType;
      updateNodeData(id, { model });
      saveNanoBananaDefaults({ model });
    },
    [id, updateNodeData]
  );

  const handleGoogleSearchToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const useGoogleSearch = e.target.checked;
      updateNodeData(id, { useGoogleSearch });
      saveNanoBananaDefaults({ useGoogleSearch });
    },
    [id, updateNodeData]
  );

  const handleSystemPromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { systemPrompt: e.target.value });
    },
    [id, updateNodeData]
  );

  const handleTopPChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { topP: parseFloat(e.target.value) });
    },
    [id, updateNodeData]
  );

  const handleClearImage = useCallback(() => {
    updateNodeData(id, { outputImage: null, status: "idle", error: null });
  }, [id, updateNodeData]);

  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  const loadImageById = useCallback(async (imageId: string) => {
    if (!generationsPath) {
      console.error("Generations path not configured");
      return null;
    }

    try {
      const response = await fetch("/api/load-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directoryPath: generationsPath,
          imageId,
        }),
      });

      if (!response.ok) {
        console.error("Failed to load image:", await response.text());
        return null;
      }

      const result = await response.json();
      return result.success ? result.image : null;
    } catch (error) {
      console.error("Error loading image:", error);
      return null;
    }
  }, [generationsPath]);

  const handleCarouselPrevious = useCallback(async () => {
    const history = nodeData.imageHistory || [];
    if (history.length === 0 || isLoadingCarouselImage) return;

    const currentIndex = nodeData.selectedHistoryIndex || 0;
    const newIndex = currentIndex === 0 ? history.length - 1 : currentIndex - 1;
    const imageItem = history[newIndex];

    setIsLoadingCarouselImage(true);
    const image = await loadImageById(imageItem.id);
    setIsLoadingCarouselImage(false);

    if (image) {
      updateNodeData(id, {
        outputImage: image,
        selectedHistoryIndex: newIndex,
      });
    }
  }, [id, nodeData.imageHistory, nodeData.selectedHistoryIndex, isLoadingCarouselImage, loadImageById, updateNodeData]);

  const handleCarouselNext = useCallback(async () => {
    const history = nodeData.imageHistory || [];
    if (history.length === 0 || isLoadingCarouselImage) return;

    const currentIndex = nodeData.selectedHistoryIndex || 0;
    const newIndex = (currentIndex + 1) % history.length;
    const imageItem = history[newIndex];

    setIsLoadingCarouselImage(true);
    const image = await loadImageById(imageItem.id);
    setIsLoadingCarouselImage(false);

    if (image) {
      updateNodeData(id, {
        outputImage: image,
        selectedHistoryIndex: newIndex,
      });
    }
  }, [id, nodeData.imageHistory, nodeData.selectedHistoryIndex, isLoadingCarouselImage, loadImageById, updateNodeData]);

  const isNanoBananaPro = nodeData.model === "nano-banana-pro";
  const hasCarouselImages = (nodeData.imageHistory || []).length > 1;

  return (
    <BaseNode
      id={id}
      title="生成"
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
                {/* Number badge */}
                <div className="absolute top-0 left-0 bg-emerald-600 text-white text-[8px] font-bold px-1 rounded-br">
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
                <div className="absolute inset-0 bg-neutral-900/70 rounded flex items-center justify-center">
                  <svg
                    className="w-6 h-6 animate-spin text-white"
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
                </div>
              )}
              {/* Loading overlay for carousel navigation */}
              {isLoadingCarouselImage && (
                <div className="absolute inset-0 bg-neutral-900/50 rounded flex items-center justify-center">
                  <svg
                    className="w-4 h-4 animate-spin text-white"
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
                  onClick={handleCarouselPrevious}
                  disabled={isLoadingCarouselImage}
                  className="w-5 h-5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
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
                  onClick={handleCarouselNext}
                  disabled={isLoadingCarouselImage}
                  className="w-5 h-5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
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
              <svg
                className="w-4 h-4 animate-spin text-neutral-400"
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
            ) : nodeData.status === "error" ? (
              <span className="text-[10px] text-red-400 text-center px-2">
                {nodeData.error || "失败"}
              </span>
            ) : (
              <span className="text-neutral-500 text-[10px]">
                运行以生成
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
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        {/* Resonance Mode Toggle */}
        <ResonanceModeToggle
          enabled={nodeData.resonanceMode ?? true}
          onToggle={(enabled) => updateNodeData(id, { resonanceMode: enabled })}
        />

        {/* Aspect ratio and resolution row */}
        <div className="flex gap-1.5 shrink-0">
          <select
            value={nodeData.aspectRatio}
            onChange={handleAspectRatioChange}
            className="nodrag flex-1 text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300"
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
          <select
            value={nodeData.resolution}
            onChange={handleResolutionChange}
            className="nodrag w-12 text-[10px] py-1 px-1.5 border border-neutral-700 rounded bg-neutral-900/50 focus:outline-none focus:ring-1 focus:ring-neutral-600 text-neutral-300"
          >
            {RESOLUTIONS.map((res) => (
              <option key={res} value={res}>
                {res}
              </option>
            ))}
          </select>
        </div>

        {/* Google Search toggle - only for nano-banana-pro */}
        {isNanoBananaPro && (
          <label className="flex items-center gap-1.5 text-[10px] text-neutral-300 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={nodeData.useGoogleSearch}
              onChange={handleGoogleSearchToggle}
              className="nodrag w-3 h-3 rounded border-neutral-700 bg-neutral-900/50 text-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:ring-offset-0"
            />
            <span>Google 搜索</span>
          </label>
        )}

        {/* Advanced Settings Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-300 transition-colors shrink-0"
        >
          <svg
            className={`w-3 h-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>高级设置</span>
        </button>

        {/* Advanced Settings */}
        {showAdvanced && (
          <div className="flex flex-col gap-2 shrink-0 border-t border-neutral-700 pt-2">
            {/* System Prompt */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-neutral-500">系统提示词</label>
              <textarea
                value={nodeData.systemPrompt || ""}
                onChange={handleSystemPromptChange}
                placeholder="指导模型如何生成图片..."
                className="nodrag nopan nowheel w-full min-h-[60px] max-h-[200px] text-[10px] p-1.5 text-neutral-300 border border-neutral-700 rounded bg-neutral-900/50 resize-y focus:outline-none focus:ring-1 focus:ring-neutral-600 placeholder:text-neutral-600 overflow-auto"
              />
            </div>

            {/* Top P */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] text-neutral-500">Top P：{(nodeData.topP || 0.95).toFixed(2)}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={nodeData.topP || 0.95}
                onChange={handleTopPChange}
                className="nodrag w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-neutral-400"
              />
            </div>
          </div>
        )}

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
              <button
                onClick={() => {
                  cacheManager.clearByNode(id).then(() => {
                    updateNodeData(id, { seedFixed: false, cached: false, lastSeed: undefined });
                  });
                }}
                className="text-[9px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 hover:bg-neutral-700 rounded transition-colors"
                title="清除缓存"
              >
                🗑
              </button>
            </div>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
