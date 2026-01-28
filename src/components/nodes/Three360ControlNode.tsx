"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { Three360ControlNodeData, InitialViewAngle } from "@/types";
import { Camera3DViewer } from "@/components/Camera3DViewer";

type Three360ControlNodeType = Node<Three360ControlNodeData, "three360Control">;

// 提示词生成逻辑
const generateSpatialPrompt = (
  horizontalRotation: number,
  verticalAngle: number,
  distance: number,
  fov: number,
  targetHeight: number,
  initialViewAngle: InitialViewAngle
): { prompt: string; json: string } => {
  // 计算绝对坐标
  const offsetMap: Record<InitialViewAngle, number> = {
    "Front": 0,
    "Right": 90,
    "Back": 180,
    "Left": 270
  };
  const baseAngle = offsetMap[initialViewAngle];
  const absoluteAngle = (baseAngle + horizontalRotation) % 360;

  const targetX = 0.0;
  const targetY = targetHeight;
  const targetZ = 0.0;

  const phi = (verticalAngle * Math.PI) / 180;
  const theta = (absoluteAngle * Math.PI) / 180;

  const offsetY = distance * Math.sin(phi);
  const projectedDistanceOnXZ = distance * Math.cos(phi);
  const offsetX = projectedDistanceOnXZ * Math.sin(theta);
  const offsetZ = projectedDistanceOnXZ * Math.cos(theta);

  const posX = targetX + offsetX;
  const posY = targetY + offsetY;
  const posZ = targetZ + offsetZ;

  // 空间象限定义
  let spatialDesc: string;
  if (absoluteAngle < 22.5 || absoluteAngle >= 337.5) {
    spatialDesc = "Front Spatial Axis (0°)";
  } else if (absoluteAngle < 67.5) {
    spatialDesc = "Front-Right Spatial Quadrant";
  } else if (absoluteAngle < 112.5) {
    spatialDesc = "Right Spatial Axis (90°)";
  } else if (absoluteAngle < 157.5) {
    spatialDesc = "Back-Right Spatial Quadrant";
  } else if (absoluteAngle < 202.5) {
    spatialDesc = "Back Spatial Axis (180°)";
  } else if (absoluteAngle < 247.5) {
    spatialDesc = "Back-Left Spatial Quadrant";
  } else if (absoluteAngle < 292.5) {
    spatialDesc = "Left Spatial Axis (270°)";
  } else {
    spatialDesc = "Front-Left Spatial Quadrant";
  }

  // 俯仰角定义
  let vDesc: string;
  if (verticalAngle < -15) vDesc = "Low Elevation";
  else if (verticalAngle < 15) vDesc = "Zero Elevation";
  else if (verticalAngle < 45) vDesc = "High Elevation";
  else vDesc = "Top-Down Vertical";

  // 原图描述
  const initialDescMap: Record<InitialViewAngle, string> = {
    "Front": "Front View",
    "Right": "Right Side View",
    "Back": "Back View",
    "Left": "Left Side View"
  };
  const startViewDesc = initialDescMap[initialViewAngle];

  // 构造JSON
  const jsonContent = {
    position: { x: Math.round(posX * 100) / 100, y: Math.round(posY * 100) / 100, z: Math.round(posZ * 100) / 100 },
    target: { x: targetX, y: targetY, z: targetZ },
    zoom: 1,
    fov: fov,
    cameraType: "perspective"
  };

  // 构造提示词
  const triggerText = `Input image shows ${startViewDesc}. Action: Orbit camera ${horizontalRotation} degrees around the subject. Target Camera Location: ${spatialDesc}, ${vDesc}. Constraint: Subject remains stationary, do not rotate the subject. Spatial Coordinates: x=${Math.round(posX * 100) / 100}, y=${Math.round(posY * 100) / 100}, z=${Math.round(posZ * 100) / 100}. Simulated spatial rendering, scaling and camera type based on position information.`;

  return {
    prompt: triggerText,
    json: JSON.stringify(jsonContent)
  };
};

export function Three360ControlNode({ id, data, selected }: NodeProps<Three360ControlNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const [showAdvanced, setShowAdvanced] = useState(false);

  // 生成提示词的函数
  const updatePrompt = useCallback(() => {
    const { prompt, json } = generateSpatialPrompt(
      nodeData.horizontalRotation,
      nodeData.verticalAngle,
      nodeData.distance,
      nodeData.fov,
      nodeData.targetHeight,
      nodeData.initialViewAngle
    );
    updateNodeData(id, { outputPrompt: prompt, spatialJson: json });
  }, [
    nodeData.horizontalRotation,
    nodeData.verticalAngle,
    nodeData.distance,
    nodeData.fov,
    nodeData.targetHeight,
    nodeData.initialViewAngle,
    id,
    updateNodeData
  ]);

  // 当参数变化时更新提示词
  useEffect(() => {
    updatePrompt();
  }, [updatePrompt]);

  // 3D视图角度变化回调
  const handleAngleChange = useCallback((horizontal: number, vertical: number, dist: number) => {
    updateNodeData(id, {
      horizontalRotation: horizontal,
      verticalAngle: vertical,
      distance: dist
    });
  }, [id, updateNodeData]);

  const initialViewOptions: { value: InitialViewAngle; label: string }[] = [
    { value: "Front", label: "正视图 (Front)" },
    { value: "Back", label: "背视图 (Back)" },
    { value: "Left", label: "左视图 (Left)" },
    { value: "Right", label: "右视图 (Right)" }
  ];

  return (
    <BaseNode
      id={id}
      title="360° 相机控制"
      customTitle={nodeData.customTitle}
      comment={nodeData.comment}
      onCustomTitleChange={(title) => updateNodeData(id, { customTitle: title || undefined })}
      onCommentChange={(comment) => updateNodeData(id, { comment: comment || undefined })}
      selected={selected}
      hasError={nodeData.status === "error"}
      minWidth={380}
    >
      {/* 输入Handle - 图片 */}
      <Handle type="target" position={Position.Left} id="image" className="!top-1/2" />

      {/* 输出Handle - 文本（提示词） */}
      <Handle type="source" position={Position.Right} id="text" />

      <div className="p-3 space-y-3">
        {/* 图片输入提示 */}
        {nodeData.inputImage ? (
          <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg p-2 border border-zinc-700/50">
            <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0 bg-zinc-800">
              <img
                src={nodeData.inputImage}
                alt="输入图片"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-400 truncate">输入图片</div>
              <div className="text-xs text-[#00FFD0]">已连接</div>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900/30 rounded-lg p-3 border border-dashed border-zinc-700 text-center">
            <div className="text-xs text-zinc-500 mb-1">📷 图片输入</div>
            <div className="text-xs text-zinc-600">将图片节点连接到左侧输入</div>
          </div>
        )}

        {/* 3D 可视化器 */}
        <div
          className="nodrag bg-[#18181f] rounded-lg overflow-hidden"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          style={{ touchAction: 'none' }}
        >
          <Camera3DViewer
            horizontalRotation={nodeData.horizontalRotation}
            verticalAngle={nodeData.verticalAngle}
            distance={nodeData.distance}
            image={nodeData.inputImage}
            onAngleChange={handleAngleChange}
          />
        </div>

        {/* 参数显示 */}
        <div className="grid grid-cols-3 gap-2 text-center bg-zinc-900/50 rounded-lg p-2">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">水平角度</div>
            <div className="text-sm font-semibold text-[#E93D82]">{nodeData.horizontalRotation}°</div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">垂直角度</div>
            <div className="text-sm font-semibold text-[#00FFD0]">{nodeData.verticalAngle}°</div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">视距</div>
            <div className="text-sm font-semibold text-[#FFB800]">{nodeData.distance.toFixed(1)}</div>
          </div>
        </div>

        {/* 基础控制 */}
        <div className="space-y-2">
          {/* 水平旋转 */}
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>水平旋转</span>
              <span>{nodeData.horizontalRotation}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={nodeData.horizontalRotation}
              onChange={(e) => updateNodeData(id, { horizontalRotation: parseInt(e.target.value) })}
              onMouseDown={(e) => e.stopPropagation()}
              className="nodrag w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#E93D82]"
            />
          </div>

          {/* 垂直角度 */}
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>垂直角度</span>
              <span>{nodeData.verticalAngle}°</span>
            </div>
            <input
              type="range"
              min="-90"
              max="90"
              step="1"
              value={nodeData.verticalAngle}
              onChange={(e) => updateNodeData(id, { verticalAngle: parseInt(e.target.value) })}
              onMouseDown={(e) => e.stopPropagation()}
              className="nodrag w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#00FFD0]"
            />
          </div>

          {/* 视距 */}
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>视距</span>
              <span>{nodeData.distance.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="10.0"
              step="0.1"
              value={nodeData.distance}
              onChange={(e) => updateNodeData(id, { distance: parseFloat(e.target.value) })}
              onMouseDown={(e) => e.stopPropagation()}
              className="nodrag w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[#FFB800]"
            />
          </div>
        </div>

        {/* 初始视角选择 */}
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">初始图片视角</label>
          <select
            value={nodeData.initialViewAngle}
            onChange={(e) => updateNodeData(id, { initialViewAngle: e.target.value as InitialViewAngle })}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-[#E93D82]"
          >
            {initialViewOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* 高级设置 */}
        <details open={showAdvanced} onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}>
          <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 select-none">
            高级设置 ▼
          </summary>
          <div className="mt-2 space-y-2">
            {/* 视场角 */}
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>视场角 (FOV)</span>
                <span>{nodeData.fov}°</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="1"
                value={nodeData.fov}
                onChange={(e) => updateNodeData(id, { fov: parseFloat(e.target.value) })}
                onMouseDown={(e) => e.stopPropagation()}
                className="nodrag w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-500"
              />
            </div>

            {/* 聚焦高度 */}
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>聚焦高度</span>
                <span>{nodeData.targetHeight}</span>
              </div>
              <input
                type="range"
                min="-10"
                max="20"
                step="0.01"
                value={nodeData.targetHeight}
                onChange={(e) => updateNodeData(id, { targetHeight: parseFloat(e.target.value) })}
                onMouseDown={(e) => e.stopPropagation()}
                className="nodrag w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-500"
              />
            </div>
          </div>
        </details>

        {/* 生成的提示词预览 */}
        {nodeData.outputPrompt && (
          <div className="mt-2">
            <div className="text-xs text-zinc-400 mb-1">生成的提示词预览:</div>
            <div className="bg-zinc-900/50 rounded p-2 text-xs text-[#E93D82] font-mono break-all line-clamp-3 max-h-16 overflow-hidden">
              {nodeData.outputPrompt}
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {nodeData.status === "error" && nodeData.error && (
          <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-400">
            {nodeData.error}
          </div>
        )}
      </div>
    </BaseNode>
  );
}
