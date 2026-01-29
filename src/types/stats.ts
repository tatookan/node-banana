// Usage Statistics Types

// API Usage Record (stored in database)
export interface ApiUsageRecord {
  id: number;
  userId: number;
  // Image generation fields
  imagesGenerated: number;
  imageModel: ImageModelType | null;
  imageResolution: ImageResolution | null;
  // LLM usage fields
  tokensUsed: number;
  llmProvider: LLMProvider | null;
  llmModel: LLMModelType | null;
  // Cost
  cost: number;
  // Timestamp
  createdAt: Date;
}

// Image model types (from costCalculator.ts)
export type ImageModelType = "nano-banana" | "nano-banana-pro";
export type ImageResolution = "1K" | "2K" | "4K";

// LLM provider and model types (from types/index.ts)
export type LLMProvider = "google" | "openai";
export type LLMModelType =
  | "gemini-2.5-flash"
  | "gemini-3-flash-preview"
  | "gemini-3-pro-preview"
  | "gpt-4.1-mini"
  | "gpt-4.1-nano";

// Time-based stats for charts
export interface TimeStats {
  date: string; // ISO date string (YYYY-MM-DD)
  images: number;
  tokens: number;
  cost: number;
}

// Detailed breakdown by model and resolution
export interface ImageStatsBreakdown {
  model: ImageModelType;
  resolution: ImageResolution;
  count: number;
  cost: number;
}

export interface LLMStatsBreakdown {
  provider: LLMProvider;
  model: LLMModelType;
  tokens: number;
  cost: number;
}

// Currency breakdown
export interface CurrencyBreakdown {
  currency: 'CNY' | 'USD';
  cost: number;
  originalCost: number; // 原币种金额
}

// Complete statistics data
export interface StatsData {
  today: TimeStats;
  week: TimeStats[];
  month: TimeStats[];
  custom?: TimeStats[]; // For custom date range
  totals: {
    images: number;
    tokens: number;
    cost: number;
  };
  breakdown: {
    images: ImageStatsBreakdown[];
    llm: LLMStatsBreakdown[];
  };
  currencyBreakdown: CurrencyBreakdown[]; // 按货币分组统计
}

// Stats API request with optional date range
export interface StatsRequest {
  startDate?: string; // ISO date string (YYYY-MM-DD)
  endDate?: string;   // ISO date string (YYYY-MM-DD)
}

// Stats API response
export interface StatsResponse {
  success: boolean;
  error?: string;
  stats?: StatsData;
}

// Export format types
export type ExportFormat = "csv" | "json";

export interface ExportRequest {
  format: ExportFormat;
  startDate?: string;
  endDate?: string;
}

export interface ExportResponse {
  success: boolean;
  error?: string;
  data?: string; // CSV or JSON string
  filename?: string;
}
