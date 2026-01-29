import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { query } from '@/lib/db';
import type {
  StatsResponse,
  TimeStats,
  ImageStatsBreakdown,
  LLMStatsBreakdown,
  StatsData,
} from '@/types/stats';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json<StatsResponse>(
        { success: false, error: '未提供认证令牌' },
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json<StatsResponse>(
        { success: false, error: '无效或过期的令牌' },
        { status: 401 }
      );
    }

    const userId = payload.userId;

    // Parse optional date range from query params
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    // Get today's stats
    const todayResult = await query<any>(
      `SELECT
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens,
        COALESCE(SUM(cost), 0) as cost
      FROM api_usage
      WHERE user_id = ?
        AND DATE(created_at) = CURDATE()`,
      [userId]
    );

    const today: TimeStats = {
      date: new Date().toISOString().split('T')[0],
      images: todayResult[0]?.images || 0,
      tokens: todayResult[0]?.tokens || 0,
      cost: parseFloat(todayResult[0]?.cost || '0'),
    };

    // Get last 7 days stats (including today)
    const weekResult = await query<any>(
      `SELECT
        DATE(created_at) as date,
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens,
        COALESCE(SUM(cost), 0) as cost
      FROM api_usage
      WHERE user_id = ?
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [userId]
    );

    // Fill in missing days with zeros
    const weekMap = new Map(
      weekResult.map((r: any) => [r.date.toISOString().split('T')[0], r])
    );
    const week: TimeStats[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const data = weekMap.get(dateStr);
      week.push({
        date: dateStr,
        images: data?.images || 0,
        tokens: data?.tokens || 0,
        cost: parseFloat(data?.cost || '0'),
      });
    }

    // Get last 30 days stats
    const monthResult = await query<any>(
      `SELECT
        DATE(created_at) as date,
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens,
        COALESCE(SUM(cost), 0) as cost
      FROM api_usage
      WHERE user_id = ?
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [userId]
    );

    // Fill in missing days with zeros
    const monthMap = new Map(
      monthResult.map((r: any) => [r.date.toISOString().split('T')[0], r])
    );
    const month: TimeStats[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const data = monthMap.get(dateStr);
      month.push({
        date: dateStr,
        images: data?.images || 0,
        tokens: data?.tokens || 0,
        cost: parseFloat(data?.cost || '0'),
      });
    }

    // Get custom date range stats if provided
    let custom: TimeStats[] | undefined;
    if (startDate && endDate) {
      const customResult = await query<any>(
        `SELECT
          DATE(created_at) as date,
          COALESCE(SUM(images_generated), 0) as images,
          COALESCE(SUM(tokens_used), 0) as tokens,
          COALESCE(SUM(cost), 0) as cost
        FROM api_usage
        WHERE user_id = ?
          AND DATE(created_at) >= ?
          AND DATE(created_at) <= ?
        GROUP BY DATE(created_at)
        ORDER BY date ASC`,
        [userId, startDate, endDate]
      );

      // Fill in missing days
      const customMap = new Map(
        customResult.map((r: any) => [r.date.toISOString().split('T')[0], r])
      );
      custom = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const dayDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      for (let i = 0; i <= dayDiff; i++) {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const data = customMap.get(dateStr);
        custom.push({
          date: dateStr,
          images: data?.images || 0,
          tokens: data?.tokens || 0,
          cost: parseFloat(data?.cost || '0'),
        });
      }
    }

    // Get all-time totals
    const totalsResult = await query<any>(
      `SELECT
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens,
        COALESCE(SUM(cost), 0) as cost
      FROM api_usage
      WHERE user_id = ?`,
      [userId]
    );

    const totals = {
      images: totalsResult[0]?.images || 0,
      tokens: totalsResult[0]?.tokens || 0,
      cost: parseFloat(totalsResult[0]?.cost || '0'),
    };

    // Get image breakdown by model and resolution
    const imageBreakdownResult = await query<any>(
      `SELECT
        image_model as model,
        image_resolution as resolution,
        SUM(images_generated) as count,
        SUM(cost) as cost
      FROM api_usage
      WHERE user_id = ?
        AND image_model IS NOT NULL
      GROUP BY image_model, image_resolution
      ORDER BY model, resolution`,
      [userId]
    );

    const imageBreakdown: ImageStatsBreakdown[] = imageBreakdownResult.map((r: any) => ({
      model: r.model,
      resolution: r.resolution,
      count: r.count,
      cost: parseFloat(r.cost),
    }));

    // Get LLM breakdown by provider and model
    const llmBreakdownResult = await query<any>(
      `SELECT
        llm_provider as provider,
        llm_model as model,
        SUM(tokens_used) as tokens,
        SUM(cost) as cost
      FROM api_usage
      WHERE user_id = ?
        AND llm_provider IS NOT NULL
      GROUP BY llm_provider, llm_model
      ORDER BY provider, model`,
      [userId]
    );

    const llmBreakdown: LLMStatsBreakdown[] = llmBreakdownResult.map((r: any) => ({
      provider: r.provider,
      model: r.model,
      tokens: r.tokens,
      cost: parseFloat(r.cost),
    }));

    // Get currency breakdown (按货币分组统计)
    const currencyBreakdownResult = await query<any>(
      `SELECT
        currency,
        SUM(cost) as cost,
        SUM(COALESCE(original_cost, cost)) as originalCost
      FROM api_usage
      WHERE user_id = ?
      GROUP BY currency`,
      [userId]
    );

    const currencyBreakdown = currencyBreakdownResult.map((r: any) => ({
      currency: r.currency || 'CNY',
      cost: parseFloat(r.cost),
      originalCost: parseFloat(r.originalCost),
    }));

    const stats: StatsData = {
      today,
      week,
      month,
      custom,
      totals,
      breakdown: {
        images: imageBreakdown,
        llm: llmBreakdown,
      },
      currencyBreakdown,
    };

    return NextResponse.json<StatsResponse>({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[API:Stats] Error:', error);
    return NextResponse.json<StatsResponse>(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}
