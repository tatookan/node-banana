import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { query } from '@/lib/db';
import type { ExportResponse } from '@/types/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json<ExportResponse>(
        { success: false, error: '未提供认证令牌' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json<ExportResponse>(
        { success: false, error: '无效或过期的令牌' },
        { status: 401 }
      );
    }

    const userId = payload.userId;

    // Parse query params
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'csv') as 'csv' | 'json';
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    // Build WHERE clause for date range
    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (startDate && endDate) {
      whereClause += ' AND DATE(created_at) >= ? AND DATE(created_at) <= ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      whereClause += ' AND DATE(created_at) >= ?';
      params.push(startDate);
    } else if (endDate) {
      whereClause += ' AND DATE(created_at) <= ?';
      params.push(endDate);
    }

    // Get raw usage data
    const usageData = await query<any>(
      `SELECT
        DATE(created_at) as date,
        images_generated,
        image_model,
        image_resolution,
        tokens_used,
        llm_provider,
        llm_model,
        cost
      FROM api_usage
      ${whereClause}
      ORDER BY created_at DESC`,
      params
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'json') {
      // Export as JSON
      const json = JSON.stringify(usageData, null, 2);
      return new NextResponse(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="usage-stats-${timestamp}.json"`,
        },
      });
    }

    // Export as CSV
    const headers = [
      'Date',
      'Images Generated',
      'Image Model',
      'Image Resolution',
      'Tokens Used',
      'LLM Provider',
      'LLM Model',
      'Cost (USD)',
    ];

    const rows = usageData.map((row: any) => [
      row.date,
      row.images_generated || 0,
      row.image_model || '',
      row.image_resolution || '',
      row.tokens_used || 0,
      row.llm_provider || '',
      row.llm_model || '',
      row.cost || 0,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((v) => `"${v}"`).join(',')),
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="usage-stats-${timestamp}.csv"`,
      },
    });
  } catch (error) {
    console.error('[API:Export] Error:', error);
    return NextResponse.json<ExportResponse>(
      { success: false, error: '导出统计数据失败' },
      { status: 500 }
    );
  }
}
