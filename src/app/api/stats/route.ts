import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

interface TimeStats {
  date: string;
  images: number;
  tokens: number;
}

interface StatsResponse {
  success: boolean;
  error?: string;
  stats?: {
    today: TimeStats;
    week: TimeStats[];
    month: TimeStats[];
    totals: {
      images: number;
      tokens: number;
    };
  };
}

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

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json<StatsResponse>(
        { success: false, error: '无效或过期的令牌' },
        { status: 401 }
      );
    }

    const userId = payload.userId;

    // Get today's stats
    const todayResult = await query<any>(
      `SELECT
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens
      FROM api_usage
      WHERE user_id = ?
        AND DATE(created_at) = CURDATE()`,
      [userId]
    );

    const today = todayResult[0] || { images: 0, tokens: 0 };

    // Get last 7 days stats (including today)
    const weekResult = await query<any>(
      `SELECT
        DATE(created_at) as date,
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens
      FROM api_usage
      WHERE user_id = ?
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [userId]
    );

    // Fill in missing days with zeros
    const weekMap = new Map(weekResult.map((r: any) => [r.date.toISOString().split('T')[0], r]));
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
      });
    }

    // Get last 30 days stats
    const monthResult = await query<any>(
      `SELECT
        DATE(created_at) as date,
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens
      FROM api_usage
      WHERE user_id = ?
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [userId]
    );

    // Fill in missing days with zeros
    const monthMap = new Map(monthResult.map((r: any) => [r.date.toISOString().split('T')[0], r]));
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
      });
    }

    // Get all-time totals
    const totalsResult = await query<any>(
      `SELECT
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens
      FROM api_usage
      WHERE user_id = ?`,
      [userId]
    );

    const totals = totalsResult[0] || { images: 0, tokens: 0 };

    return NextResponse.json<StatsResponse>({
      success: true,
      stats: {
        today: {
          date: new Date().toISOString().split('T')[0],
          images: today.images,
          tokens: today.tokens,
        },
        week,
        month,
        totals,
      },
    });

  } catch (error) {
    console.error('[API:Stats] Error:', error);
    return NextResponse.json<StatsResponse>(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}
