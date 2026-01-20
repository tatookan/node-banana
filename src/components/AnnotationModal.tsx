"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Ellipse, Arrow, Line, Text, Transformer } from "react-konva";
import { useAnnotationStore } from "@/store/annotationStore";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  AnnotationShape,
  RectangleShape,
  CircleShape,
  ArrowShape,
  FreehandShape,
  TextShape,
  ToolType,
} from "@/types";
import Konva from "konva";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#000000",
  "#ffffff",
];

const STROKE_WIDTHS = [2, 4, 8];

const FONT_SIZES = [16, 20, 24, 32, 40, 48, 64];

export function AnnotationModal() {
  const {
    isModalOpen,
    sourceNodeId,
    sourceImage,
    originalImage,
    annotations,
    selectedShapeId,
    currentTool,
    toolOptions,
    cropArea,
    closeModal,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    selectShape,
    setCurrentTool,
    setToolOptions,
    undo,
    redo,
    setCropArea,
    applyCrop,
    restoreOriginal,
  } = useAnnotationStore();

  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [currentShape, setCurrentShape] = useState<AnnotationShape | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingTextPosition, setPendingTextPosition] = useState<{ x: number; y: number } | null>(null);
  const textInputCreatedAt = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 裁剪相关状态
  const [cropDragStart, setCropDragStart] = useState<{ x: number; y: number } | null>(null);
  const [cropHandle, setCropHandle] = useState<string | null>(null); // 'tl', 'tr', 'bl', 'br', 'move'
  const [showCropGrid, setShowCropGrid] = useState(false);

  useEffect(() => {
    if (sourceImage) {
      const img = new window.Image();
      img.onload = () => {
        setImage(img);
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth - 100;
          const containerHeight = containerRef.current.clientHeight - 100;
          const scaleX = containerWidth / img.width;
          const scaleY = containerHeight / img.height;
          const newScale = Math.min(scaleX, scaleY, 1);
          setScale(newScale);
          setStageSize({ width: img.width, height: img.height });
          setPosition({
            x: (containerWidth - img.width * newScale) / 2 + 50,
            y: (containerHeight - img.height * newScale) / 2 + 50,
          });
        }
      };
      img.src = sourceImage;
    }
  }, [sourceImage]);

  // 初始化裁剪区域（当切换到裁剪工具时）
  useEffect(() => {
    if (currentTool === "crop" && image && !cropArea) {
      // 默认裁剪区域为图片的80%，居中
      const defaultSize = Math.min(image.width, image.height) * 0.8;
      setCropArea({
        x: (image.width - defaultSize) / 2,
        y: (image.height - defaultSize) / 2,
        width: defaultSize,
        height: defaultSize,
      });
      setShowCropGrid(true);
    } else if (currentTool !== "crop" && showCropGrid) {
      setShowCropGrid(false);
    }
  }, [currentTool, image, cropArea, setCropArea, showCropGrid]);

  // 更新 Transformer
  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      const selectedNode = stageRef.current.findOne(`#${selectedShapeId}`);
      if (selectedNode && currentTool === "select") {
        transformerRef.current.nodes([selectedNode]);
        // 配置 Transformer
        transformerRef.current.setAttrs({
          anchorSize: 10,
          borderStroke: "#3b82f6",
          anchorStroke: "#3b82f6",
          anchorFill: "#ffffff",
          borderDash: [4, 4],
        });
      } else {
        transformerRef.current.nodes([]);
      }
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedShapeId, currentTool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isModalOpen) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedShapeId && !editingTextId) {
          deleteAnnotation(selectedShapeId);
        }
      }
      if (e.key === "Escape") {
        if (editingTextId) {
          setEditingTextId(null);
          setTextInputPosition(null);
          setPendingTextPosition(null);
        } else {
          closeModal();
        }
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, selectedShapeId, editingTextId, deleteAnnotation, closeModal, undo, redo]);

  const getRelativePointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const transform = stage.getAbsoluteTransform().copy().invert();
    const pos = stage.getPointerPosition();
    if (!pos) return { x: 0, y: 0 };
    return transform.point(pos);
  }, []);

  // 获取裁剪区域的手柄位置
  const getCropHandles = useCallback(() => {
    if (!cropArea) return null;
    return {
      tl: { x: cropArea.x, y: cropArea.y },
      tr: { x: cropArea.x + cropArea.width, y: cropArea.y },
      bl: { x: cropArea.x, y: cropArea.y + cropArea.height },
      br: { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height },
    };
  }, [cropArea]);

  // 检测是否点击了裁剪手柄
  const getCropHandleAtPosition = useCallback((pos: { x: number; y: number }) => {
    if (!cropArea) return null;
    const handles = getCropHandles();
    if (!handles) return null;

    const handleSize = 15 / scale;
    const { tl, tr, bl, br } = handles;

    // 检查角手柄
    if (Math.abs(pos.x - tl.x) < handleSize && Math.abs(pos.y - tl.y) < handleSize) return "tl";
    if (Math.abs(pos.x - tr.x) < handleSize && Math.abs(pos.y - tr.y) < handleSize) return "tr";
    if (Math.abs(pos.x - bl.x) < handleSize && Math.abs(pos.y - bl.y) < handleSize) return "bl";
    if (Math.abs(pos.x - br.x) < handleSize && Math.abs(pos.y - br.y) < handleSize) return "br";

    // 检查是否在裁剪区域内（用于拖动）
    if (pos.x > cropArea.x && pos.x < cropArea.x + cropArea.width &&
        pos.y > cropArea.y && pos.y < cropArea.y + cropArea.height) {
      return "move";
    }

    return null;
  }, [cropArea, getCropHandles, scale]);

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = getRelativePointerPosition();

      // 裁剪工具的处理
      if (currentTool === "crop" && cropArea) {
        const handle = getCropHandleAtPosition(pos);
        if (handle) {
          setCropHandle(handle);
          setCropDragStart(pos);
          setIsDrawing(true);
          setDrawStart(pos);
          return;
        }
        // 点击外部，取消裁剪模式
        if (handle === null) {
          setCurrentTool("select");
          setShowCropGrid(false);
        }
        return;
      }

      if (currentTool === "select") {
        const clickedOnEmpty = e.target === e.target.getStage() || e.target.getClassName() === "Image";
        if (clickedOnEmpty) {
          selectShape(null);
        }
        return;
      }

      setIsDrawing(true);
      setDrawStart(pos);

      const id = `shape-${Date.now()}`;
      const baseShape = {
        id,
        x: pos.x,
        y: pos.y,
        stroke: toolOptions.strokeColor,
        strokeWidth: toolOptions.strokeWidth,
        opacity: toolOptions.opacity,
      };

      let newShape: AnnotationShape | null = null;

      switch (currentTool) {
        case "rectangle":
          newShape = { ...baseShape, type: "rectangle", width: 0, height: 0, fill: toolOptions.fillColor } as RectangleShape;
          break;
        case "circle":
          newShape = { ...baseShape, type: "circle", radiusX: 0, radiusY: 0, fill: toolOptions.fillColor } as CircleShape;
          break;
        case "arrow":
          newShape = { ...baseShape, type: "arrow", points: [0, 0, 0, 0] } as ArrowShape;
          break;
        case "freehand":
          newShape = { ...baseShape, type: "freehand", points: [0, 0] } as FreehandShape;
          break;
        case "text": {
          const stage = stageRef.current;
          if (stage) {
            const container = stage.container();
            const stageBox = container?.getBoundingClientRect();
            if (stageBox) {
              const screenX = stageBox.left + pos.x * scale + position.x;
              const screenY = stageBox.top + pos.y * scale + position.y;
              setTextInputPosition({ x: screenX, y: screenY });
              setPendingTextPosition({ x: pos.x, y: pos.y });
            }
          }
          textInputCreatedAt.current = Date.now();
          setEditingTextId("new");
          setIsDrawing(false);
          setTimeout(() => textInputRef.current?.focus(), 0);
          return;
        }
      }

      if (newShape) setCurrentShape(newShape);
    },
    [currentTool, toolOptions, getRelativePointerPosition, selectShape, addAnnotation, scale, position, cropArea, getCropHandleAtPosition, setCurrentTool]
  );

  const handleMouseMove = useCallback(() => {
    if (!isDrawing) return;
    const pos = getRelativePointerPosition();

    // 裁剪工具的拖动处理
    if (currentTool === "crop" && cropArea && cropDragStart && cropHandle) {
      const dx = pos.x - cropDragStart.x;
      const dy = pos.y - cropDragStart.y;

      let newArea = { ...cropArea };

      // 图片边界
      const maxX = image ? image.width : 0;
      const maxY = image ? image.height : 0;
      const minSize = 50;

      switch (cropHandle) {
        case "move":
          newArea.x += dx;
          newArea.y += dy;
          // 边界检查：确保裁剪框不超出图片
          newArea.x = Math.max(0, Math.min(newArea.x, maxX - newArea.width));
          newArea.y = Math.max(0, Math.min(newArea.y, maxY - newArea.height));
          setCropDragStart(pos);
          break;
        case "tl":
          // 左上角：同时调整 x, y, width, height
          newArea.x += dx;
          newArea.y += dy;
          newArea.width -= dx;
          newArea.height -= dy;
          // 边界检查
          if (newArea.x < 0) { newArea.width += newArea.x; newArea.x = 0; }
          if (newArea.y < 0) { newArea.height += newArea.y; newArea.y = 0; }
          if (newArea.width < minSize) newArea.width = minSize;
          if (newArea.height < minSize) newArea.height = minSize;
          // 确保不超过右下边界
          newArea.x = Math.min(newArea.x, maxX - newArea.width);
          newArea.y = Math.min(newArea.y, maxY - newArea.height);
          setCropDragStart(pos);
          break;
        case "tr":
          // 右上角：调整 y, width, height
          newArea.y += dy;
          newArea.width += dx;
          newArea.height -= dy;
          // 边界检查
          if (newArea.y < 0) { newArea.height += newArea.y; newArea.y = 0; }
          if (newArea.width < minSize) newArea.width = minSize;
          if (newArea.height < minSize) newArea.height = minSize;
          // 确保不超出边界
          newArea.width = Math.min(newArea.width, maxX - newArea.x);
          newArea.y = Math.min(newArea.y, maxY - newArea.height);
          setCropDragStart(pos);
          break;
        case "bl":
          // 左下角：调整 x, width, height
          newArea.x += dx;
          newArea.width -= dx;
          newArea.height += dy;
          // 边界检查
          if (newArea.x < 0) { newArea.width += newArea.x; newArea.x = 0; }
          if (newArea.width < minSize) newArea.width = minSize;
          if (newArea.height < minSize) newArea.height = minSize;
          // 确保不超出边界
          newArea.x = Math.min(newArea.x, maxX - newArea.width);
          newArea.height = Math.min(newArea.height, maxY - newArea.y);
          setCropDragStart(pos);
          break;
        case "br":
          // 右下角：调整 width, height
          newArea.width += dx;
          newArea.height += dy;
          // 边界检查
          if (newArea.width < minSize) newArea.width = minSize;
          if (newArea.height < minSize) newArea.height = minSize;
          // 确保不超出边界
          newArea.width = Math.min(newArea.width, maxX - newArea.x);
          newArea.height = Math.min(newArea.height, maxY - newArea.y);
          setCropDragStart(pos);
          break;
      }

      setCropArea(newArea);
      return;
    }

    if (!currentShape) return;

    switch (currentShape.type) {
      case "rectangle": {
        const width = pos.x - drawStart.x;
        const height = pos.y - drawStart.y;
        setCurrentShape({ ...currentShape, x: width < 0 ? pos.x : drawStart.x, y: height < 0 ? pos.y : drawStart.y, width: Math.abs(width), height: Math.abs(height) } as RectangleShape);
        break;
      }
      case "circle": {
        const radiusX = Math.abs(pos.x - drawStart.x) / 2;
        const radiusY = Math.abs(pos.y - drawStart.y) / 2;
        setCurrentShape({ ...currentShape, x: (drawStart.x + pos.x) / 2, y: (drawStart.y + pos.y) / 2, radiusX, radiusY } as CircleShape);
        break;
      }
      case "arrow":
        setCurrentShape({ ...currentShape, points: [0, 0, pos.x - drawStart.x, pos.y - drawStart.y] } as ArrowShape);
        break;
      case "freehand": {
        const freehand = currentShape as FreehandShape;
        setCurrentShape({ ...freehand, points: [...freehand.points, pos.x - drawStart.x, pos.y - drawStart.y] } as FreehandShape);
        break;
      }
    }
  }, [isDrawing, currentShape, drawStart, getRelativePointerPosition, currentTool, cropArea, cropDragStart, cropHandle, setCropArea, image]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    // 裁剪工具松开
    if (currentTool === "crop") {
      setCropHandle(null);
      setCropDragStart(null);
      return;
    }

    if (!currentShape) return;

    let shouldAdd = true;
    if (currentShape.type === "rectangle") {
      const rect = currentShape as RectangleShape;
      shouldAdd = rect.width > 5 && rect.height > 5;
    } else if (currentShape.type === "circle") {
      const circle = currentShape as CircleShape;
      shouldAdd = circle.radiusX > 5 && circle.radiusY > 5;
    } else if (currentShape.type === "arrow") {
      const arrow = currentShape as ArrowShape;
      const dx = arrow.points[2];
      const dy = arrow.points[3];
      shouldAdd = Math.sqrt(dx * dx + dy * dy) > 10;
    }

    if (shouldAdd) addAnnotation(currentShape);
    setCurrentShape(null);
  }, [isDrawing, currentShape, addAnnotation, currentTool, setCropHandle, setCropDragStart]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const oldScale = scale;
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    setScale(Math.min(Math.max(newScale, 0.1), 5));
  }, [scale]);

  const flattenImage = useCallback((): string => {
    const stage = stageRef.current;
    if (!stage || !image) return "";

    const tempStage = new Konva.Stage({
      container: document.createElement("div"),
      width: image.width,
      height: image.height,
    });

    const tempLayer = new Konva.Layer();
    tempStage.add(tempLayer);

    const konvaImage = new Konva.Image({ image, width: image.width, height: image.height });
    tempLayer.add(konvaImage);

    annotations.forEach((shape) => {
      let konvaShape: Konva.Shape | null = null;
      switch (shape.type) {
        case "rectangle": {
          const rect = shape as RectangleShape;
          konvaShape = new Konva.Rect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, stroke: rect.stroke, strokeWidth: rect.strokeWidth, fill: rect.fill || undefined, opacity: rect.opacity });
          break;
        }
        case "circle": {
          const circle = shape as CircleShape;
          konvaShape = new Konva.Ellipse({ x: circle.x, y: circle.y, radiusX: circle.radiusX, radiusY: circle.radiusY, stroke: circle.stroke, strokeWidth: circle.strokeWidth, fill: circle.fill || undefined, opacity: circle.opacity });
          break;
        }
        case "arrow": {
          const arrow = shape as ArrowShape;
          konvaShape = new Konva.Arrow({ x: arrow.x, y: arrow.y, points: arrow.points, stroke: arrow.stroke, strokeWidth: arrow.strokeWidth, fill: arrow.stroke, opacity: arrow.opacity });
          break;
        }
        case "freehand": {
          const freehand = shape as FreehandShape;
          konvaShape = new Konva.Line({ x: freehand.x, y: freehand.y, points: freehand.points, stroke: freehand.stroke, strokeWidth: freehand.strokeWidth, opacity: freehand.opacity, lineCap: "round", lineJoin: "round" });
          break;
        }
        case "text": {
          const text = shape as TextShape;
          konvaShape = new Konva.Text({ x: text.x, y: text.y, text: text.text, fontSize: text.fontSize, fill: text.fill, opacity: text.opacity });
          break;
        }
      }
      if (konvaShape) tempLayer.add(konvaShape);
    });

    tempLayer.draw();
    const dataUrl = tempStage.toDataURL({ pixelRatio: 1 });
    tempStage.destroy();
    return dataUrl;
  }, [image, annotations]);

  const handleDone = useCallback(() => {
    if (!sourceNodeId) return;
    const flattenedImage = flattenImage();
    updateNodeData(sourceNodeId, { annotations, outputImage: flattenedImage });
    closeModal();
  }, [sourceNodeId, annotations, flattenImage, updateNodeData, closeModal]);

  const renderShape = (shape: AnnotationShape, isPreview = false) => {
    const commonProps = {
      id: shape.id,
      opacity: shape.opacity,
      onClick: () => { if (currentTool === "select") selectShape(shape.id); },
      draggable: currentTool === "select" && !isPreview,
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => { updateAnnotation(shape.id, { x: e.target.x(), y: e.target.y() }); },
    };

    switch (shape.type) {
      case "rectangle": {
        const rect = shape as RectangleShape;
        return <Rect key={shape.id} {...commonProps} x={rect.x} y={rect.y} width={rect.width} height={rect.height} stroke={rect.stroke} strokeWidth={rect.strokeWidth} fill={rect.fill || undefined} />;
      }
      case "circle": {
        const circle = shape as CircleShape;
        return <Ellipse key={shape.id} {...commonProps} x={circle.x} y={circle.y} radiusX={circle.radiusX} radiusY={circle.radiusY} stroke={circle.stroke} strokeWidth={circle.strokeWidth} fill={circle.fill || undefined} />;
      }
      case "arrow": {
        const arrow = shape as ArrowShape;
        return <Arrow key={shape.id} {...commonProps} x={arrow.x} y={arrow.y} points={arrow.points} stroke={arrow.stroke} strokeWidth={arrow.strokeWidth} fill={arrow.stroke} />;
      }
      case "freehand": {
        const freehand = shape as FreehandShape;
        return <Line key={shape.id} {...commonProps} x={freehand.x} y={freehand.y} points={freehand.points} stroke={freehand.stroke} strokeWidth={freehand.strokeWidth} lineCap="round" lineJoin="round" />;
      }
      case "text": {
        const text = shape as TextShape;
        return (
          <Text
            key={shape.id}
            {...commonProps}
            x={text.x}
            y={text.y}
            text={text.text || " "}
            fontSize={text.fontSize}
            fill={text.fill}
            onTransformEnd={(e) => {
              const node = e.target;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              const newFontSize = Math.round(text.fontSize * Math.max(scaleX, scaleY));
              updateAnnotation(shape.id, {
                x: node.x(),
                y: node.y(),
                fontSize: newFontSize,
              });
            }}
            onDblClick={() => {
              if (currentTool === "select") {
                const stage = stageRef.current;
                if (stage) {
                  const stageBox = stage.container().getBoundingClientRect();
                  const screenX = stageBox.left + text.x * scale + position.x;
                  const screenY = stageBox.top + text.y * scale + position.y;
                  setTextInputPosition({ x: screenX, y: screenY });
                }
                setEditingTextId(shape.id);
                setTimeout(() => textInputRef.current?.focus(), 0);
              }
            }}
          />
        );
      }
    }
  };

  if (!isModalOpen) return null;

  const tools: { type: ToolType; label: string }[] = [
    { type: "select", label: "选择" },
    { type: "rectangle", label: "矩形" },
    { type: "circle", label: "圆形" },
    { type: "arrow", label: "箭头" },
    { type: "freehand", label: "画笔" },
    { type: "text", label: "文字" },
    { type: "crop", label: "裁剪" },
  ];

  // 渲染九宫格裁剪框
  const renderCropArea = () => {
    if (!cropArea || !showCropGrid) return null;

    const handles = getCropHandles();
    if (!handles) return null;

    const handleSize = 12 / scale;

    return (
      <>
        {/* 外部遮罩 */}
        <Rect x={0} y={0} width={stageSize.width} height={cropArea.y} fill="rgba(0, 0, 0, 0.6)" listening={false} />
        <Rect x={0} y={cropArea.y + cropArea.height} width={stageSize.width} height={stageSize.height - cropArea.y - cropArea.height} fill="rgba(0, 0, 0, 0.6)" listening={false} />
        <Rect x={0} y={cropArea.y} width={cropArea.x} height={cropArea.height} fill="rgba(0, 0, 0, 0.6)" listening={false} />
        <Rect x={cropArea.x + cropArea.width} y={cropArea.y} width={stageSize.width - cropArea.x - cropArea.width} height={cropArea.height} fill="rgba(0, 0, 0, 0.6)" listening={false} />

        {/* 裁剪区域边框 */}
        <Rect x={cropArea.x} y={cropArea.y} width={cropArea.width} height={cropArea.height} stroke="#3b82f6" strokeWidth={2 / scale} fill="transparent" listening={false} />

        {/* 九宫格线 */}
        <Line
          points={[cropArea.x + cropArea.width / 3, cropArea.y, cropArea.x + cropArea.width / 3, cropArea.y + cropArea.height]}
          stroke="#ffffff" strokeWidth={1 / scale} strokeDash={[4, 4]} opacity={0.5} listening={false}
        />
        <Line
          points={[cropArea.x + cropArea.width * 2 / 3, cropArea.y, cropArea.x + cropArea.width * 2 / 3, cropArea.y + cropArea.height]}
          stroke="#ffffff" strokeWidth={1 / scale} strokeDash={[4, 4]} opacity={0.5} listening={false}
        />
        <Line
          points={[cropArea.x, cropArea.y + cropArea.height / 3, cropArea.x + cropArea.width, cropArea.y + cropArea.height / 3]}
          stroke="#ffffff" strokeWidth={1 / scale} strokeDash={[4, 4]} opacity={0.5} listening={false}
        />
        <Line
          points={[cropArea.x, cropArea.y + cropArea.height * 2 / 3, cropArea.x + cropArea.width, cropArea.y + cropArea.height * 2 / 3]}
          stroke="#ffffff" strokeWidth={1 / scale} strokeDash={[4, 4]} opacity={0.5} listening={false}
        />

        {/* 四个角的手柄 */}
        <Rect x={handles.tl.x - handleSize / 2} y={handles.tl.y - handleSize / 2} width={handleSize} height={handleSize} fill="#3b82f6" stroke="#ffffff" strokeWidth={2 / scale} />
        <Rect x={handles.tr.x - handleSize / 2} y={handles.tr.y - handleSize / 2} width={handleSize} height={handleSize} fill="#3b82f6" stroke="#ffffff" strokeWidth={2 / scale} />
        <Rect x={handles.bl.x - handleSize / 2} y={handles.bl.y - handleSize / 2} width={handleSize} height={handleSize} fill="#3b82f6" stroke="#ffffff" strokeWidth={2 / scale} />
        <Rect x={handles.br.x - handleSize / 2} y={handles.br.y - handleSize / 2} width={handleSize} height={handleSize} fill="#3b82f6" stroke="#ffffff" strokeWidth={2 / scale} />
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col">
      {/* Top Bar */}
      <div className="h-14 bg-neutral-900 flex items-center justify-between px-4 border-b border-neutral-800">
        <div className="flex items-center gap-1.5">
          {tools.map((tool) => (
            <button
              key={tool.type}
              onClick={() => setCurrentTool(tool.type)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors ${
                currentTool === tool.type
                  ? "bg-white text-neutral-900"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              {tool.label}
            </button>
          ))}

          <div className="w-px h-6 bg-neutral-700 mx-3" />

          <button onClick={undo} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white">撤销</button>
          <button onClick={redo} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white">返回</button>

          <div className="w-px h-6 bg-neutral-700 mx-3" />

          <button onClick={clearAnnotations} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-red-400">清空</button>
          <button onClick={restoreOriginal} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-blue-400">恢复原图</button>
        </div>

        <div className="flex items-center gap-3">
          {/* 裁剪确认按钮 */}
          {showCropGrid && cropArea && (
            <>
              <button onClick={() => { setCurrentTool("select"); setShowCropGrid(false); }} className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white">
                取消裁剪
              </button>
              <button onClick={() => { applyCrop(); setCurrentTool("select"); setShowCropGrid(false); }} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-500">
                确认裁剪
              </button>
              <div className="w-px h-6 bg-neutral-700" />
            </>
          )}

          <button onClick={closeModal} className="px-4 py-1.5 text-xs font-medium text-neutral-400 hover:text-white">
            取消
          </button>
          <button onClick={handleDone} className="px-4 py-1.5 text-xs font-medium bg-white text-neutral-900 rounded hover:bg-neutral-200">
            完成
          </button>
        </div>
      </div>

      {/* Canvas Container */}
      <div ref={containerRef} className="flex-1 overflow-hidden bg-neutral-900">
        <Stage
          ref={stageRef}
          width={containerRef.current?.clientWidth || 800}
          height={containerRef.current?.clientHeight || 600}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          draggable={currentTool === "select"}
          onDragEnd={(e) => { if (e.target === stageRef.current) setPosition({ x: e.target.x(), y: e.target.y() }); }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <Layer>
            {image && <KonvaImage image={image} width={stageSize.width} height={stageSize.height} />}
            {renderCropArea()}
            {annotations.map((shape) => renderShape(shape))}
            {currentShape && renderShape(currentShape, true)}
            <Transformer ref={transformerRef} />
          </Layer>
        </Stage>
      </div>

      {/* Bottom Options Bar */}
      <div className="h-14 bg-neutral-900 flex items-center justify-center gap-6 px-4 border-t border-neutral-800">
        {/* Colors */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wide mr-1">颜色</span>
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setToolOptions({ strokeColor: color })}
              className={`w-6 h-6 rounded-full transition-transform ${
                toolOptions.strokeColor === color ? "ring-2 ring-white ring-offset-2 ring-offset-neutral-900 scale-110" : "hover:scale-105"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-neutral-700" />

        {/* Stroke Width */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wide mr-1">粗细</span>
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              onClick={() => setToolOptions({ strokeWidth: width })}
              className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                toolOptions.strokeWidth === width ? "bg-neutral-700" : "hover:bg-neutral-800"
              }`}
            >
              <div className="bg-white rounded-full" style={{ width: width * 1.5, height: width * 1.5 }} />
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-neutral-700" />

        {/* Font Size (仅文字工具时显示) */}
        {currentTool === "text" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wide mr-1">字号</span>
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setToolOptions({ fontSize: size })}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    toolOptions.fontSize === size ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="w-px h-6 bg-neutral-700" />
          </>
        )}

        {/* Fill Toggle */}
        <button
          onClick={() => setToolOptions({ fillColor: toolOptions.fillColor ? null : toolOptions.strokeColor })}
          className={`px-3 py-1.5 text-[10px] uppercase tracking-wide rounded transition-colors ${
            toolOptions.fillColor ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-white"
          }`}
        >
          填充
        </button>

        {/* Zoom */}
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setScale(Math.max(scale - 0.1, 0.1))} className="w-7 h-7 rounded text-neutral-400 hover:text-white text-sm">-</button>
          <span className="text-[10px] text-neutral-400 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(Math.min(scale + 0.1, 5))} className="w-7 h-7 rounded text-neutral-400 hover:text-white text-sm">+</button>
        </div>
      </div>

      {/* Inline Text Input */}
      {editingTextId && textInputPosition && (
        <input
          ref={textInputRef}
          type="text"
          autoFocus
          defaultValue={editingTextId === "new" ? "" : (annotations.find((a) => a.id === editingTextId) as TextShape)?.text || ""}
          className="fixed z-[110] bg-transparent border-none outline-none"
          style={{
            left: textInputPosition.x,
            top: textInputPosition.y,
            fontSize: `${toolOptions.fontSize * scale}px`,
            color: editingTextId === "new" ? toolOptions.strokeColor : ((annotations.find((a) => a.id === editingTextId) as TextShape)?.fill || toolOptions.strokeColor),
            minWidth: "100px",
            caretColor: "white",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const value = (e.target as HTMLInputElement).value;
              if (value.trim()) {
                if (editingTextId === "new" && pendingTextPosition) {
                  const newShape: TextShape = {
                    id: `shape-${Date.now()}`,
                    type: "text",
                    x: pendingTextPosition.x,
                    y: pendingTextPosition.y,
                    text: value,
                    fontSize: toolOptions.fontSize,
                    fill: toolOptions.strokeColor,
                    stroke: toolOptions.strokeColor,
                    strokeWidth: toolOptions.strokeWidth,
                    opacity: toolOptions.opacity,
                  };
                  addAnnotation(newShape);
                } else {
                  updateAnnotation(editingTextId, { text: value });
                }
              } else if (editingTextId !== "new") {
                deleteAnnotation(editingTextId);
              }
              setEditingTextId(null);
              setTextInputPosition(null);
              setPendingTextPosition(null);
            }
            if (e.key === "Escape") {
              if (editingTextId !== "new") {
                const currentText = (annotations.find((a) => a.id === editingTextId) as TextShape)?.text;
                if (!currentText) {
                  deleteAnnotation(editingTextId);
                }
              }
              setEditingTextId(null);
              setTextInputPosition(null);
              setPendingTextPosition(null);
            }
          }}
          onBlur={(e) => {
            if (Date.now() - textInputCreatedAt.current < 200) {
              e.target.focus();
              return;
            }

            const value = e.target.value;
            if (value.trim()) {
              if (editingTextId === "new" && pendingTextPosition) {
                const newShape: TextShape = {
                  id: `shape-${Date.now()}`,
                  type: "text",
                  x: pendingTextPosition.x,
                  y: pendingTextPosition.y,
                  text: value,
                  fontSize: toolOptions.fontSize,
                  fill: toolOptions.strokeColor,
                  stroke: toolOptions.strokeColor,
                  strokeWidth: toolOptions.strokeWidth,
                  opacity: toolOptions.opacity,
                };
                addAnnotation(newShape);
              } else {
                updateAnnotation(editingTextId, { text: value });
              }
            } else if (editingTextId !== "new") {
              deleteAnnotation(editingTextId);
            }
            setEditingTextId(null);
            setTextInputPosition(null);
            setPendingTextPosition(null);
          }}
        />
      )}
    </div>
  );
}
