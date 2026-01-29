import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

interface UserDetailResponse {
  success: boolean;
  error?: string;
  user?: {
    id: number;
    username: string;
    email: string;
    role: string;
    createdAt: string;
    lastLogin: string | null;
    totals: {
      images: number;
      tokens: number;
      cost: number;
    };
    trend: Array<{
      date: string;
      images: number;
      tokens: number;
      cost: number;
    }>;
    imageBreakdown: Array<{
      model: string;
      resolution: string;
      count: number;
      cost: number;
    }>;
    llmBreakdown: Array<{
      provider: string;
      model: string;
      tokens: number;
      cost: number;
    }>;
    currencyBreakdown: Array<{
      currency: 'CNY' | 'USD';
      cost: number;
      originalCost: number;
    }>;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id: userIdStr } = await params;
  const userId = parseInt(userIdStr);
  if (isNaN(userId)) {
    return NextResponse.json<UserDetailResponse>(
      { success: false, error: '无效的用户ID' },
      { status: 400 }
    );
  }

  try {
    // Get user basic info
    const users = await query<any>(
      'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return NextResponse.json<UserDetailResponse>(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    const user = users[0];

    // Get user's total stats
    const totalsResult = await query<any>(
      `SELECT
        COALESCE(SUM(images_generated), 0) as images,
        COALESCE(SUM(tokens_used), 0) as tokens,
        COALESCE(SUM(cost), 0) as cost
      FROM api_usage
      WHERE user_id = ?`,
      [userId]
    );

    // Get last 30 days trend
    const trendResult = await query<any>(
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

    // Fill in missing dates
    const trendMap = new Map(trendResult.map((r: any) => [r.date.toISOString().split('T')[0], r]));
    const filledTrend: Array<{ date: string; images: number; tokens: number; cost: number }> = [];

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

    // Image breakdown by model and resolution
    const imageBreakdownResult = await query<any>(
      `SELECT
        image_model as model,
        image_resolution as resolution,
        SUM(images_generated) as count,
        SUM(cost) as cost
      FROM api_usage
      WHERE user_id = ? AND image_model IS NOT NULL
      GROUP BY image_model, image_resolution
      ORDER BY model, resolution`,
      [userId]
    );

    // LLM breakdown by provider and model
    const llmBreakdownResult = await query<any>(
      `SELECT
        llm_provider as provider,
        llm_model as model,
        SUM(tokens_used) as tokens,
        SUM(cost) as cost
      FROM api_usage
      WHERE user_id = ? AND llm_provider IS NOT NULL
      GROUP BY llm_provider, llm_model
      ORDER BY provider, model`,
      [userId]
    );

    // Currency breakdown for this user
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

    return NextResponse.json<UserDetailResponse>({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        createdAt: user.created_at?.toISOString() || '',
        lastLogin: user.last_login?.toISOString() || null,
        totals: {
          images: totalsResult[0].images,
          tokens: totalsResult[0].tokens,
          cost: parseFloat(totalsResult[0].cost),
        },
        trend: filledTrend,
        imageBreakdown: imageBreakdownResult.map((r: any) => ({
          model: r.model,
          resolution: r.resolution,
          count: r.count,
          cost: parseFloat(r.cost),
        })),
        llmBreakdown: llmBreakdownResult.map((r: any) => ({
          provider: r.provider,
          model: r.model,
          tokens: r.tokens,
          cost: parseFloat(r.cost),
        })),
        currencyBreakdown: currencyBreakdownResult.map((r: any) => ({
          currency: r.currency || 'CNY',
          cost: parseFloat(r.cost),
          originalCost: parseFloat(r.originalCost),
        })),
      },
    });
  } catch (error) {
    console.error('[API:AdminUserDetail] Error:', error);
    return NextResponse.json<UserDetailResponse>(
      { success: false, error: '获取用户详情失败' },
      { status: 500 }
    );
  }
}
