import { ModelType, Resolution, NanoBananaNodeData, SplitGridNodeData, WorkflowNode, ViduGenerateNodeData, ViduModelType, ViduResolution } from "@/types";

// VIDU pricing in credits (from their API)
// 1 credit = 0.03125 RMB
const VIDU_CREDIT_PRICE_RMB = 0.03125;

// Map VIDU API model names to internal types
export function mapViduModelToInternal(apiModelName: string): ViduModelType {
  // VIDU API returns names like "Vidu3.1-参考生图-20251126" or "Vidu3.1-文生图+参考生图-20251126"
  if (apiModelName.includes("参考生图") && !apiModelName.includes("文生图")) {
    return "viduq1";  // Reference image only
  }
  return "viduq2";  // Text-to-image + reference image
}

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

export function calculateViduCost(
  model: ViduModelType | string,
  resolution: ViduResolution,
  hasImages: boolean
): number {
  // Convert API model name to internal type if needed
  const internalModel: ViduModelType = typeof model === "string" && !["viduq1", "viduq2"].includes(model)
    ? mapViduModelToInternal(model)
    : model as ViduModelType;

  if (internalModel === "viduq1") {
    const credits = VIDU_PRICING[internalModel][resolution];
    return credits * VIDU_CREDIT_PRICE_RMB;
  }

  // viduq2
  const pricing = VIDU_PRICING[internalModel][resolution];
  const credits = hasImages ? pricing.imageToImage : pricing.textToImage;
  return credits * VIDU_CREDIT_PRICE_RMB;
}

// Pricing in RMB per image
// Exchange rate: 1 USD = 7 RMB
// Multi-provider pricing structure
export const PRICING = {
  "google": {
    // nano-banana-Flash (gemini-2.5-flash-preview-image-generation)
    "nano-banana": {
      "1K": 0.94,   // $0.134 × 7 (1,120 tokens)
      "2K": 0.94,   // $0.134 × 7 (1,120 tokens)
      "4K": 0.94,   // $0.134 × 7 (1,120 tokens)
    },
    // nano-banana-pro (gemini-3-pro-image-preview)
    "nano-banana-pro": {
      "1K": 0.94,   // $0.134 × 7 (1,120 image output tokens)
      "2K": 0.94,   // $0.134 × 7 (1,120 image output tokens)
      "4K": 1.68,   // $0.24 × 7 (2,000 image output tokens)
    },
  },
  "aabao": {
    "nano-banana": {
      "1K": 0.20,   // AABao API fixed price
      "2K": 0.20,   // AABao API fixed price
      "4K": 0.20,   // AABao API fixed price
    },
    "nano-banana-pro": {
      "1K": 0.20,   // AABao API fixed price
      "2K": 0.20,   // AABao API fixed price
      "4K": 0.20,   // AABao API fixed price
    },
  },
} as const;

export function calculateGenerationCost(
  model: ModelType,
  resolution: Resolution,
  provider: "google" | "aabao" = "google"
): number {
  return PRICING[provider][model][resolution];
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
      const provider = data.provider || "google";
      const unitCost = calculateGenerationCost(model, resolution, provider);
      const key = `${provider}-${model}-${resolution}`;

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
        const provider = data.generateSettings.provider || "google";
        const unitCost = calculateGenerationCost(model, resolution, provider);
        const key = `splitGrid-${provider}-${model}-${resolution}`;

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
