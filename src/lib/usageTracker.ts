import { query, execute } from '@/lib/db';
import { calculateGenerationCost } from '@/utils/costCalculator';
import type { ModelType, Resolution, LLMProvider, LLMModelType } from '@/types';

/**
 * Record image generation usage
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
    const cost = calculateGenerationCost(model, resolution) * count;

    await execute(
      `INSERT INTO api_usage (
        user_id,
        images_generated,
        image_model,
        image_resolution,
        cost
      ) VALUES (?, ?, ?, ?, ?)`,
      [userId, count, model, resolution, cost]
    );

    console.log('[UsageTracker] Recorded image generation:', {
      userId,
      model,
      resolution,
      count,
      cost,
    });
  } catch (error) {
    console.error('[UsageTracker] Failed to record image generation:', error);
    // Don't throw - usage tracking failure should not break the main flow
  }
}

/**
 * Record LLM token usage
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
    // Approximate cost calculation if not provided
    // Google: ~$0.075 per 1M tokens (flash), ~$1.25 per 1M tokens (pro)
    // OpenAI: ~$0.15 per 1M tokens (gpt-4.1-mini), ~$0.15 per 1M tokens (gpt-4.1-nano)
    const calculatedCost =
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

    await execute(
      `INSERT INTO api_usage (
        user_id,
        tokens_used,
        llm_provider,
        llm_model,
        cost
      ) VALUES (?, ?, ?, ?, ?)`,
      [userId, tokens, provider, model, calculatedCost]
    );

    console.log('[UsageTracker] Recorded LLM usage:', {
      userId,
      provider,
      model,
      tokens,
      cost: calculatedCost,
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
