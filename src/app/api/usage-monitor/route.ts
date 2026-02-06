import { NextRequest, NextResponse } from "next/server";
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Usage monitoring endpoint
 * GET /api/usage-monitor
 *
 * Returns daily usage statistics and upgrade recommendations
 * based on Cloudflare Workers free plan limits
 */

// Cloudflare Workers Free Plan limits
const FREE_PLAN_DAILY_REQUESTS = 100_000;
const WARNING_THRESHOLD = 0.8; // 80%

interface UsageStats {
  date: string;
  totalRequests: number;
  imageGenerations: number;
  llmCalls: number;
  viduGenerations: number;
}

interface MonitorResponse {
  today: UsageStats;
  limits: {
    dailyRequests: number;
    warningThreshold: number;
    usedPercent: number;
    remaining: number;
  };
  recommendation: {
    level: 'ok' | 'warning' | 'critical';
    message: string;
    action?: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    // Get today's usage from database
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Count total requests (image + LLM + VIDU generations)
    const [imageResult]: any[] = await query(
      `SELECT COUNT(*) as count FROM api_usage
       WHERE DATE(created_at) = ? AND images_generated > 0`,
      [today]
    );

    const [llmResult]: any[] = await query(
      `SELECT COUNT(*) as count FROM api_usage
       WHERE DATE(created_at) = ? AND tokens_used > 0`,
      [today]
    );

    const [viduResult]: any[] = await query(
      `SELECT COUNT(*) as count FROM api_usage
       WHERE DATE(created_at) = ? AND image_model LIKE 'vidu%'`,
      [today]
    );

    const imageCount = imageResult?.count || 0;
    const llmCount = llmResult?.count || 0;
    const viduCount = viduResult?.count || 0;
    const totalRequests = imageCount + llmCount + viduCount;

    // Calculate usage percentage
    const usedPercent = (totalRequests / FREE_PLAN_DAILY_REQUESTS) * 100;
    const remaining = FREE_PLAN_DAILY_REQUESTS - totalRequests;

    // Determine recommendation level
    let level: 'ok' | 'warning' | 'critical' = 'ok';
    let message = '✓ 免费方案运行正常';
    let action: string | undefined;

    if (usedPercent >= 90) {
      level = 'critical';
      message = '⚠️ 请求量接近免费限额（90%+）';
      action = '建议立即升级到 Cloudflare Workers Paid Plan ($5/月)';
    } else if (usedPercent >= WARNING_THRESHOLD * 100) {
      level = 'warning';
      message = '⚠️ 请求量接近警告阈值（80%+）';
      action = '建议考虑升级到 Cloudflare Workers Paid Plan ($5/月)';
    } else if (usedPercent >= 50) {
      level = 'warning';
      message = 'ℹ️ 请求量超过免费限额的 50%';
      action = '可考虑升级以获得更好性能（Worker 解析 JSON）';
    }

    const response: MonitorResponse = {
      today: {
        date: today,
        totalRequests,
        imageGenerations: imageCount,
        llmCalls: llmCount,
        viduGenerations: viduCount,
      },
      limits: {
        dailyRequests: FREE_PLAN_DAILY_REQUESTS,
        warningThreshold: Math.floor(FREE_PLAN_DAILY_REQUESTS * WARNING_THRESHOLD),
        usedPercent: parseFloat(usedPercent.toFixed(2)),
        remaining,
      },
      recommendation: {
        level,
        message,
        action,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[UsageMonitor] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage statistics' },
      { status: 500 }
    );
  }
}
