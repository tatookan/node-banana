import { ModelType, Resolution, NanoBananaNodeData, SplitGridNodeData, WorkflowNode, ViduGenerateNodeData, ViduModelType, ViduResolution } from "@/types";

// VIDU pricing in credits (from their API)
// 1 credit = 0.03125 RMB
const VIDU_CREDIT_PRICE_RMB = 0.03125;

const VIDU_PRICING = {
  "viduq2": {
    // Text-to-image (no reference images)
    "1080p": { textToImage: 6, imageToImage: 8 },
    "2K": { textToImage: 8, imageToImage: 12 },
    "4K": { textToImage: 10, imageToImage: 15 },
  },
  "viduq1": {
    // Reference image generation only (requires at least 1 image)
    "1080p": 8,
    "2K": 12,
    "4K": 18,
  },
} as const;

function calculateViduCost(model: ViduModelType, resolution: ViduResolution, hasImages: boolean): number {
  if (model === "viduq1") {
    const credits = VIDU_PRICING[model][resolution];
    return credits * VIDU_CREDIT_PRICE_RMB;
  }

  // viduq2
  const pricing = VIDU_PRICING[model][resolution];
  const credits = hasImages ? pricing.imageToImage : pricing.textToImage;
  return credits * VIDU_CREDIT_PRICE_RMB;
}

// Pricing in RMB per image (Gemini API)
// Converted from USD at approximately 1 USD = 7 RMB
export const PRICING = {
  "nano-banana": {
    "1K": 0.27,
    "2K": 0.27,
    "4K": 0.27,
  },
  "nano-banana-pro": {
    "1K": 0.94,
    "2K": 0.94,
    "4K": 1.68,
  },
} as const;

export function calculateGenerationCost(model: ModelType, resolution: Resolution): number {
  return PRICING[model][resolution];
}

export interface CostBreakdownItem {
  model: ModelType | string;
  resolution: Resolution | string;
  count: number;
  unitCost: number;
  subtotal: number;
}

export interface PredictedCostResult {
  totalCost: number;
  breakdown: CostBreakdownItem[];
  nodeCount: number;
}

export function calculatePredictedCost(nodes: WorkflowNode[]): PredictedCostResult {
  const breakdown: Map<string, { model: ModelType | string; resolution: Resolution | string; count: number; unitCost: number }> = new Map();

  let nodeCount = 0;

  nodes.forEach((node) => {
    if (node.type === "nanoBanana") {
      const data = node.data as NanoBananaNodeData;
      const model = data.model;
      const resolution = data.resolution;
      const unitCost = calculateGenerationCost(model, resolution);
      const key = `${model}-${resolution}`;

      const existing = breakdown.get(key);
      if (existing) {
        existing.count++;
      } else {
        breakdown.set(key, { model, resolution, count: 1, unitCost });
      }
      nodeCount++;
    }

    if (node.type === "viduGenerate") {
      const data = node.data as ViduGenerateNodeData;
      const model = data.model;
      const resolution = data.resolution;
      const hasImages = (data.inputImages || []).length > 0;
      const unitCost = calculateViduCost(model, resolution, hasImages);
      const key = `vidu-${model}-${resolution}-${hasImages ? "img2img" : "txt2img"}`;

      const existing = breakdown.get(key);
      if (existing) {
        existing.count++;
      } else {
        breakdown.set(key, { model: `VIDU ${model}`, resolution, count: 1, unitCost });
      }
      nodeCount++;
    }

    // SplitGrid nodes create child nanoBanana nodes - count those from settings
    // Note: child nodes are in the nodes array, but we count from splitGrid settings
    // to show what WILL be generated when the grid runs
    if (node.type === "splitGrid") {
      const data = node.data as SplitGridNodeData;
      if (data.isConfigured && data.targetCount > 0) {
        const model = data.generateSettings.model;
        const resolution = data.generateSettings.resolution;
        const unitCost = calculateGenerationCost(model, resolution);
        const key = `splitGrid-${model}-${resolution}`;

        const count = data.targetCount;
        const existing = breakdown.get(key);
        if (existing) {
          existing.count += count;
        } else {
          breakdown.set(key, { model, resolution, count, unitCost });
        }
        nodeCount += count;
      }
    }
  });

  const breakdownArray = Array.from(breakdown.values()).map((item) => ({
    ...item,
    subtotal: item.count * item.unitCost,
  }));

  const totalCost = breakdownArray.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    totalCost,
    breakdown: breakdownArray,
    nodeCount,
  };
}

export function formatCost(cost: number): string {
  if (cost === 0) return "¥0.00";
  if (cost < 0.01) return "<¥0.01";
  return `¥${cost.toFixed(2)}`;
}
