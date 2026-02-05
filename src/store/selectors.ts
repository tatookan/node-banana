/**
 * Zustand Selectors for WorkflowStore
 *
 * 这些选择器 hooks 提供了高效的状态订阅，避免不必要的重渲染。
 *
 * 使用示例:
 * ```tsx
 * // 不好的做法 - 5 个独立订阅
 * const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
 * const edges = useWorkflowStore((state) => state.edges);
 * const nodes = useWorkflowStore((state) => state.nodes);
 *
 * // 好的做法 - 使用选择器 hooks
 * const nodes = useNodes();
 * const edges = useEdges();
 * const updateNodeData = useUpdateNodeData();
 * ```
 */

import type { WorkflowStore } from "./workflowStore";
import { useWorkflowStore } from "./workflowStore";

// ============================================================================
// 基础选择器函数 - 这些是用于构建其他选择器的原子函数
// ============================================================================

/**
 * 节点和边的选择器
 */
export const selectNodes = (state: WorkflowStore) => state.nodes;
export const selectEdges = (state: WorkflowStore) => state.edges;
export const selectGroups = (state: WorkflowStore) => state.groups;
export const selectEdgeStyle = (state: WorkflowStore) => state.edgeStyle;

/**
 * 节点操作选择器
 */
export const selectAddNode = (state: WorkflowStore) => state.addNode;
export const selectUpdateNodeData = (state: WorkflowStore) => state.updateNodeData;
export const selectRemoveNode = (state: WorkflowStore) => state.removeNode;
export const selectOnNodesChange = (state: WorkflowStore) => state.onNodesChange;

/**
 * 边操作选择器
 */
export const selectOnEdgesChange = (state: WorkflowStore) => state.onEdgesChange;
export const selectOnConnect = (state: WorkflowStore) => state.onConnect;
export const selectAddEdgeWithType = (state: WorkflowStore) => state.addEdgeWithType;
export const selectRemoveEdge = (state: WorkflowStore) => state.removeEdge;
export const selectToggleEdgePause = (state: WorkflowStore) => state.toggleEdgePause;

/**
 * 辅助函数选择器
 */
export const selectGetNodeById = (state: WorkflowStore) => state.getNodeById;
export const selectGetConnectedInputs = (state: WorkflowStore) => state.getConnectedInputs;
export const selectGetImageHandleCount = (state: WorkflowStore) => state.getImageHandleCount;

/**
 * 执行状态选择器
 */
export const selectIsRunning = (state: WorkflowStore) => state.isRunning;
export const selectCurrentNodeId = (state: WorkflowStore) => state.currentNodeId;
export const selectExecuteWorkflow = (state: WorkflowStore) => state.executeWorkflow;
export const selectRegenerateNode = (state: WorkflowStore) => state.regenerateNode;
export const selectStopWorkflow = (state: WorkflowStore) => state.stopWorkflow;

/**
 * UI 状态选择器
 */
export const selectOpenModalCount = (state: WorkflowStore) => state.openModalCount;
export const selectIsModalOpen = (state: WorkflowStore) => state.isModalOpen;
export const selectIncrementModalCount = (state: WorkflowStore) => state.incrementModalCount;
export const selectDecrementModalCount = (state: WorkflowStore) => state.decrementModalCount;
export const selectShowQuickstart = (state: WorkflowStore) => state.showQuickstart;
export const selectSetShowQuickstart = (state: WorkflowStore) => state.setShowQuickstart;

/**
 * 图片预览选择器
 */
export const selectImagePreviewSrc = (state: WorkflowStore) => state.imagePreviewSrc;
export const selectImagePreviewAlt = (state: WorkflowStore) => state.imagePreviewAlt;
export const selectOpenImagePreview = (state: WorkflowStore) => state.openImagePreview;
export const selectCloseImagePreview = (state: WorkflowStore) => state.closeImagePreview;

/**
 * 组合选择器 - 用于常见场景
 */

/**
 * 节点和边的组合选择器
 */
export const selectNodesAndEdges = (state: WorkflowStore) => ({
  nodes: state.nodes,
  edges: state.edges,
});

/**
 * 节点操作组合选择器
 */
export const selectNodeOperations = (state: WorkflowStore) => ({
  updateNodeData: state.updateNodeData,
  removeNode: state.removeNode,
  getNodeById: state.getNodeById,
});

/**
 * 工作流执行状态选择器
 */
export const selectExecutionState = (state: WorkflowStore) => ({
  isRunning: state.isRunning,
  currentNodeId: state.currentNodeId,
  executeWorkflow: state.executeWorkflow,
  regenerateNode: state.regenerateNode,
  stopWorkflow: state.stopWorkflow,
});

/**
 * UI 状态选择器
 */
export const selectUIState = (state: WorkflowStore) => ({
  openModalCount: state.openModalCount,
  isModalOpen: state.isModalOpen,
  showQuickstart: state.showQuickstart,
  incrementModalCount: state.incrementModalCount,
  decrementModalCount: state.decrementModalCount,
});

/**
 * 图片预览状态选择器
 */
export const selectImagePreview = (state: WorkflowStore) => ({
  imagePreviewSrc: state.imagePreviewSrc,
  imagePreviewAlt: state.imagePreviewAlt,
  openImagePreview: state.openImagePreview,
  closeImagePreview: state.closeImagePreview,
});

/**
 * 自动保存相关状态选择器
 */
export const selectAutoSaveState = (state: WorkflowStore) => ({
  workflowId: state.workflowId,
  workflowName: state.workflowName,
  generationsPath: state.generationsPath,
  hasUnsavedChanges: state.hasUnsavedChanges,
  autoSaveEnabled: state.autoSaveEnabled,
  isSaving: state.isSaving,
  useExternalImageStorage: state.useExternalImageStorage,
});

/**
 * 自动保存操作选择器
 */
export const selectAutoSaveOperations = (state: WorkflowStore) => ({
  setWorkflowMetadata: state.setWorkflowMetadata,
  setWorkflowName: state.setWorkflowName,
  setGenerationsPath: state.setGenerationsPath,
  setAutoSaveEnabled: state.setAutoSaveEnabled,
  setUseExternalImageStorage: state.setUseExternalImageStorage,
  markAsUnsaved: state.markAsUnsaved,
  saveToFile: state.saveToFile,
  saveWorkflow: state.saveWorkflow,
  loadWorkflow: state.loadWorkflow,
  clearWorkflow: state.clearWorkflow,
});

/**
 * 成本跟踪状态选择器
 */
export const selectCostState = (state: WorkflowStore) => ({
  incurredCost: state.incurredCost,
  addIncurredCost: state.addIncurredCost,
  resetIncurredCost: state.resetIncurredCost,
});

/**
 * 服务器工作流状态选择器
 */
export const selectServerWorkflowState = (state: WorkflowStore) => ({
  serverWorkflowId: state.serverWorkflowId,
  serverWorkflowName: state.serverWorkflowName,
  serverWorkflowDescription: state.serverWorkflowDescription,
  serverFolderId: state.serverFolderId,
});

/**
 * 复制粘贴操作选择器
 */
export const selectClipboardOperations = (state: WorkflowStore) => ({
  copySelectedNodes: state.copySelectedNodes,
  pasteNodes: state.pasteNodes,
  clearClipboard: state.clearClipboard,
});

/**
 * 分组操作选择器
 */
export const selectGroupOperations = (state: WorkflowStore) => ({
  groups: state.groups,
  createGroup: state.createGroup,
  deleteGroup: state.deleteGroup,
  addNodesToGroup: state.addNodesToGroup,
  removeNodesFromGroup: state.removeNodesFromGroup,
  updateGroup: state.updateGroup,
  toggleGroupLock: state.toggleGroupLock,
  moveGroupNodes: state.moveGroupNodes,
  setNodeGroupId: state.setNodeGroupId,
});

// ============================================================================
// 高级选择器 - 带参数的选择器工厂函数
// ============================================================================

/**
 * 通过 ID 获取特定节点的选择器工厂
 * 注意：这返回一个函数，需要这样使用:
 * ```tsx
 * const getNodeById = useWorkflowStore(selectGetNodeById);
 * const node = getNodeById(nodeId);
 * ```
 */
export const createNodeByIdSelector = (nodeId: string) =>
  (state: WorkflowStore) => state.nodes.find((n) => n.id === nodeId);

/**
 * 通过 ID 获取特定节点数据的选择器工厂
 */
export const createNodeDataSelector = (nodeId: string) =>
  (state: WorkflowStore) => state.nodes.find((n) => n.id === nodeId)?.data;

/**
 * 创建获取连接到特定节点的输入的选择器
 */
export const createConnectedInputsSelector = (nodeId: string) =>
  (state: WorkflowStore) => state.getConnectedInputs(nodeId);

// ============================================================================
// 便捷 Hooks - 最常用的组合
//
// 注意：这些 hooks 提供了更简洁的 API，但由于 Zustand 的类型限制，
// 它们不使用 shallow 比较。对于需要 shallow 比较的场景，
// 请直接使用选择器函数。
// ============================================================================

/**
 * 获取所有节点
 */
export const useNodes = () => useWorkflowStore(selectNodes);

/**
 * 获取所有边
 */
export const useEdges = () => useWorkflowStore(selectEdges);

/**
 * 获取所有分组
 */
export const useGroups = () => useWorkflowStore(selectGroups);

/**
 * 获取边样式
 */
export const useEdgeStyle = () => useWorkflowStore(selectEdgeStyle);

/**
 * 获取是否正在运行
 */
export const useIsRunning = () => useWorkflowStore(selectIsRunning);

/**
 * 获取当前执行节点 ID
 */
export const useCurrentNodeId = () => useWorkflowStore(selectCurrentNodeId);

/**
 * 获取是否正在保存
 */
export const useIsSaving = () => useWorkflowStore((state) => state.isSaving);

/**
 * 获取是否有未保存的更改
 */
export const useHasUnsavedChanges = () => useWorkflowStore((state) => state.hasUnsavedChanges);

/**
 * 获取工作流名称
 */
export const useWorkflowName = () => useWorkflowStore((state) => state.workflowName);

/**
 * 获取 generations 路径
 */
export const useGenerationsPath = () => useWorkflowStore((state) => state.generationsPath);

/**
 * 获取当前工作流 ID
 */
export const useWorkflowId = () => useWorkflowStore((state) => state.workflowId);

// ============================================================================
// 特定节点数据 Hooks - 只在需要时使用
// ============================================================================

/**
 * 获取特定节点的数据
 * 注意：这会在每次 render 时创建新的选择器函数，更好的方式是使用 getNodeById
 */
export const useNodeData = (nodeId: string) =>
  useWorkflowStore((state) => state.nodes.find((n) => n.id === nodeId)?.data);

/**
 * 获取特定节点
 */
export const useNode = (nodeId: string) =>
  useWorkflowStore((state) => state.nodes.find((n) => n.id === nodeId));

// ============================================================================
// 操作函数 Hooks - 这些函数引用是稳定的，不需要浅比较
// ============================================================================

/**
 * 获取更新节点数据函数
 */
export const useUpdateNodeData = () => useWorkflowStore(selectUpdateNodeData);

/**
 * 获取添加节点函数
 */
export const useAddNode = () => useWorkflowStore(selectAddNode);

/**
 * 获取删除节点函数
 */
export const useRemoveNode = () => useWorkflowStore(selectRemoveNode);

/**
 * 获取获取节点函数
 */
export const useGetNodeById = () => useWorkflowStore(selectGetNodeById);

/**
 * 获取获取连接输入函数
 */
export const useGetConnectedInputs = () => useWorkflowStore(selectGetConnectedInputs);

/**
 * 获取执行工作流函数
 */
export const useExecuteWorkflow = () => useWorkflowStore(selectExecuteWorkflow);

/**
 * 获取重新生成节点函数
 */
export const useRegenerateNode = () => useWorkflowStore(selectRegenerateNode);

/**
 * 获取停止工作流函数
 */
export const useStopWorkflow = () => useWorkflowStore(selectStopWorkflow);

/**
 * 获取打开图片预览函数
 */
export const useOpenImagePreview = () => useWorkflowStore(selectOpenImagePreview);

/**
 * 获取关闭图片预览函数
 */
export const useCloseImagePreview = () => useWorkflowStore(selectCloseImagePreview);

/**
 * 获取增加模态框计数函数
 */
export const useIncrementModalCount = () => useWorkflowStore(selectIncrementModalCount);

/**
 * 获取减少模态框计数函数
 */
export const useDecrementModalCount = () => useWorkflowStore(selectDecrementModalCount);

/**
 * 获取设置显示快速开始函数
 */
export const useSetShowQuickstart = () => useWorkflowStore(selectSetShowQuickstart);
