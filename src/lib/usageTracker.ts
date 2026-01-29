import { query, execute } from '@/lib/db';
import { calculateGenerationCost, calculateViduCost } from '@/utils/costCalculator';
import type { ModelType, Resolution, LLMProvider, LLMModelType, ViduModelType, ViduResolution } from '@/types';

// Exchange rate: 1 USD = 7 RMB
const USD_TO_RMB = 7;

/**
 * Get original USD cost for Gemini image generation (nano-banana)
 * The calculateGenerationCost returns RMB, so we convert back to USD
 */
function getGeminiOriginalCostUSD(model: ModelType, resolution: Resolution): number {
  const costRMB = calculateGenerationCost(model, resolution);
  return costRMB / USD_TO_RMB;
}

/**
 * Record Gemini image generation usage (nano-banana, nano-banana-pro)
 * These are USD-based services
 * @param userId User ID
 * @param model Model type (nano-banana or nano-banana-pro)
 * @param resolution Image resolution (1K, 2K, 4K)
 * @param count Number of images generated (default: 1)
 */
export async function recordImageGeneration(
  userId: number,
  model: ModelType,
  resolution: Resolution,
  count: number = 1
): Promise<void> {
  try {
    // Get cost in RMB (from price table)
    const costRMB = calculateGenerationCost(model, resolution) * count;
    // Convert to original USD
    const originalCostUSD = (costRMB / USD_TO_RMB);

    await execute(
      `INSERT INTO api_usage (
        user_id,
        images_generated,
        image_model,
        image_resolution,
        cost,
        original_cost,
        currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, count, model, resolution, costRMB, originalCostUSD, 'USD']
    );

    console.log('[UsageTracker] Recorded Gemini image generation:', {
      userId,
      model,
      resolution,
      count,
      cost: costRMB,
      originalCost: originalCostUSD,
      currency: 'USD',
    });
  } catch (error) {
    console.error('[UsageTracker] Failed to record image generation:', error);
    // Don't throw - usage tracking failure should not break the main flow
  }
}

/**
 * Record VIDU image generation usage
 * VIDU is CNY-based (1 credit = 0.03125 RMB)
 * @param userId User ID
 * @param model VIDU model type (viduq1 or viduq2)
 * @param resolution Image resolution (1080p, 2K, 4K)
 * @param hasImages Whether input images were provided (affects pricing)
 * @param count Number of images generated (default: 1)
 */
export async function recordViduGeneration(
  userId: number,
  model: ViduModelType,
  resolution: ViduResolution,
  hasImages: boolean,
  count: number = 1
): Promise<void> {
  try {
    const costRMB = calculateViduCost(model, resolution, hasImages) * count;
    // VIDU is originally in RMB, so original_cost = cost
    const originalCost = costRMB;

    await execute(
      `INSERT INTO api_usage (
        user_id,
        images_generated,
        image_model,
        image_resolution,
        cost,
        original_cost,
        currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, count, model, resolution, costRMB, originalCost, 'CNY']
    );

    console.log('[UsageTracker] Recorded VIDU generation:', {
      userId,
      model,
      resolution,
      hasImages,
      count,
      cost: costRMB,
      originalCost: originalCost,
      currency: 'CNY',
    });
  } catch (error) {
    console.error('[UsageTracker] Failed to record VIDU generation:', error);
    // Don't throw - usage tracking failure should not break the main flow
  }
}

/**
 * Record LLM token usage
 * LLM services (Gemini, OpenAI) are USD-based
 * @param userId User ID
 * @param provider LLM provider (google or openai)
 * @param model LLM model name
 * @param tokens Number of tokens used
 * @param cost Cost in USD (optional, will be calculated if not provided)
 */
export async function recordLLMUsage(
  userId: number,
  provider: LLMProvider,
  model: LLMModelType,
  tokens: number,
  cost?: number
): Promise<void> {
  try {
    // Approximate cost calculation if not provided (美元)
    // Google: ~$0.075 per 1M tokens (flash), ~$1.25 per 1M tokens (pro)
    // OpenAI: ~$0.15 per 1M tokens (gpt-4.1-mini), ~$0.15 per 1M tokens (gpt-4.1-nano)
    const originalCostUSD =
      cost ??
      (() => {
        if (provider === 'google') {
          if (model.startsWith('gemini-2.5')) return (tokens / 1_000_000) * 0.075;
          if (model.startsWith('gemini-3-flash')) return (tokens / 1_000_000) * 0.075;
          if (model.startsWith('gemini-3-pro')) return (tokens / 1_000_000) * 1.25;
        } else if (provider === 'openai') {
          if (model.startsWith('gpt-4.1-mini')) return (tokens / 1_000_000) * 0.15;
          if (model.startsWith('gpt-4.1-nano')) return (tokens / 1_000_000) * 0.15;
        }
        return 0;
      })();

    // 转换为人民币用于统一统计
    const costRMB = originalCostUSD * USD_TO_RMB;

    await execute(
      `INSERT INTO api_usage (
        user_id,
        tokens_used,
        llm_provider,
        llm_model,
        cost,
        original_cost,
        currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, tokens, provider, model, costRMB, originalCostUSD, 'USD']
    );

    console.log('[UsageTracker] Recorded LLM usage:', {
      userId,
      provider,
      model,
      tokens,
      cost: costRMB,
      originalCost: originalCostUSD,
      currency: 'USD',
    });
  } catch (error) {
    console.error('[UsageTracker] Failed to record LLM usage:', error);
    // Don't throw - usage tracking failure should not break the main flow
  }
}

/**
 * Get user ID from request token
 * Returns null if token is invalid or missing
 */
export async function getUserIdFromToken(
  token: string | undefined
): Promise<number | null> {
  if (!token) return null;

  try {
    const { verifyToken } = await import('@/lib/jwt');
    const payload = await verifyToken(token);
    return payload?.userId ?? null;
  } catch {
    return null;
  }
}
