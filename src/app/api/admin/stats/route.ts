import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

interface CurrencyBreakdown {
  currency: 'CNY' | 'USD';
  cost: number;
  originalCost: number;
}

interface AdminStatsResponse {
  success: boolean;
  error?: string;
  stats?: {
    overview: {
      totalUsers: number;
      activeUsers: number;
      totalCost: number;
      totalImages: number;
      totalTokens: number;
    };
    trend: Array<{
      date: string;
      images: number;
      tokens: number;
      cost: number;
    }>;
    users: Array<{
      userId: number;
      username: string;
      email: string;
      role: string;
      images: number;
      tokens: number;
      cost: number;
      lastActivity: string | null;
    }>;
    currencyBreakdown: CurrencyBreakdown[];
  };
}

export async function GET(request: NextRequest) {
  // Permission check
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const url = new URL(request.url);
    const timeRange = url.searchParams.get('range') || 'month'; // week, month, all

    // System overview
    const overviewResult = await query<any>(`
      SELECT
        COUNT(DISTINCT u.id) as totalUsers,
        COUNT(DISTINCT a.user_id) as activeUsers,
        COALESCE(SUM(a.images_generated), 0) as totalImages,
        COALESCE(SUM(a.tokens_used), 0) as totalTokens,
        COALESCE(SUM(a.cost), 0) as totalCost
      FROM users u
      LEFT JOIN api_usage a ON u.id = a.user_id
    `);

    // Time trend
    let trendSql = '';
    if (timeRange === 'week') {
      trendSql = `WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`;
    } else if (timeRange === 'month') {
      trendSql = `WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)`;
    }

    const trendResult = await query<any>(`
      SELECT
        DATE(created_at) as date,
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens,
        COALESCE(SUM(cost), 0) as cost
      FROM api_usage
      ${trendSql}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Fill in missing dates with zeros for trend
    const trendMap = new Map(trendResult.map((r: any) => [r.date.toISOString().split('T')[0], r]));
    const filledTrend: Array<{ date: string; images: number; tokens: number; cost: number }> = [];

    if (timeRange === 'week') {
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const data = trendMap.get(dateStr);
        filledTrend.push({
          date: dateStr,
          images: data?.images || 0,
          tokens: data?.tokens || 0,
          cost: parseFloat(data?.cost || '0'),
        });
      }
    } else if (timeRange === 'month') {
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const data = trendMap.get(dateStr);
        filledTrend.push({
          date: dateStr,
          images: data?.images || 0,
          tokens: data?.tokens || 0,
          cost: parseFloat(data?.cost || '0'),
        });
      }
    } else {
      // For 'all', use the raw results
      trendResult.forEach((r: any) => {
        filledTrend.push({
          date: r.date.toISOString().split('T')[0],
          images: r.images,
          tokens: r.tokens,
          cost: parseFloat(r.cost),
        });
      });
    }

    // User statistics list (sorted by cost descending)
    const usersResult = await query<any>(`
      SELECT
        u.id as userId,
        u.username,
        u.email,
        u.role,
        COALESCE(SUM(a.images_generated), 0) as images,
        COALESCE(SUM(a.tokens_used), 0) as tokens,
        COALESCE(SUM(a.cost), 0) as cost,
        MAX(a.created_at) as lastActivity
      FROM users u
      LEFT JOIN api_usage a ON u.id = a.user_id
      GROUP BY u.id
      ORDER BY cost DESC
    `);

    const users = usersResult.map((r: any) => ({
      userId: r.userId,
      username: r.username,
      email: r.email,
      role: r.role || 'user',
      images: r.images,
      tokens: r.tokens,
      cost: parseFloat(r.cost),
      lastActivity: r.lastActivity ? r.lastActivity.toISOString() : null,
    }));

    // Currency breakdown (按货币分组统计)
    const currencyBreakdownResult = await query<any>(
      `SELECT
        currency,
        SUM(cost) as cost,
        SUM(COALESCE(original_cost, cost)) as originalCost
      FROM api_usage
      GROUP BY currency`
    );

    const currencyBreakdown = currencyBreakdownResult.map((r: any) => ({
      currency: r.currency || 'CNY',
      cost: parseFloat(r.cost),
      originalCost: parseFloat(r.originalCost),
    }));

    return NextResponse.json<AdminStatsResponse>({
      success: true,
      stats: {
        overview: {
          totalUsers: overviewResult[0].totalUsers,
          activeUsers: overviewResult[0].activeUsers,
          totalImages: overviewResult[0].totalImages,
          totalTokens: overviewResult[0].totalTokens,
          totalCost: parseFloat(overviewResult[0].totalCost),
        },
        trend: filledTrend,
        users,
        currencyBreakdown,
      },
    });
  } catch (error) {
    console.error('[API:AdminStats] Error:', error);
    return NextResponse.json<AdminStatsResponse>(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}
