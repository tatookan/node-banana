"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AdminStats {
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
  currencyBreakdown: Array<{
    currency: 'CNY' | 'USD';
    cost: number;
    originalCost: number;
  }>;
}

type TimeRange = "week" | "month" | "all";

export default function AdminPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [error, setError] = useState<string | null>(null);

  // Permission check
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (!isAdmin) {
        router.push("/");
      }
    }
  }, [user, isAdmin, authLoading, router]);

  // Fetch stats
  useEffect(() => {
    if (isAdmin) {
      fetchStats();
    }
  }, [isAdmin, timeRange]);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/stats?range=${timeRange}`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success && data.stats) {
        setStats(data.stats);
      } else {
        setError(data.error || "获取统计数据失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatCost = (cost: number) => {
    return `¥${cost.toFixed(2)}`;
  };

  const getMaxValue = (type: "images" | "tokens") => {
    if (!stats?.trend) return 1;
    return Math.max(...stats.trend.map((d) => d[type]), 1);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-neutral-400">加载中...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-red-400">{error || "加载失败"}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTimeRange("week")}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              timeRange === "week"
                ? "bg-white text-neutral-900"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            7天
          </button>
          <button
            onClick={() => setTimeRange("month")}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              timeRange === "month"
                ? "bg-white text-neutral-900"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            30天
          </button>
          <button
            onClick={() => setTimeRange("all")}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              timeRange === "all"
                ? "bg-white text-neutral-900"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            全部
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">总用户数</div>
          <div className="text-2xl font-semibold text-white">{stats.overview.totalUsers}</div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">活跃用户</div>
          <div className="text-2xl font-semibold text-white">{stats.overview.activeUsers}</div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">生成图片</div>
          <div className="text-2xl font-semibold text-white">{stats.overview.totalImages}</div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">使用 Token</div>
          <div className="text-2xl font-semibold text-white">{stats.overview.totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">总成本</div>
          <div className="text-2xl font-semibold text-white">{formatCost(stats.overview.totalCost)}</div>
        </div>
      </div>

      {/* Currency Breakdown */}
      {stats.currencyBreakdown && stats.currencyBreakdown.length > 0 && (
        <div className="bg-neutral-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-neutral-400 mb-3">按币种统计</h3>
          <div className="flex gap-6">
            {stats.currencyBreakdown.map((cb) => (
              <div key={cb.currency} className="flex items-center gap-3">
                <div className="text-sm text-neutral-500">
                  {cb.currency === 'CNY' ? '人民币 (CNY)' : '美元 (USD)'}
                </div>
                <div className="text-lg font-semibold text-white">
                  {cb.currency === 'CNY'
                    ? `¥${cb.cost.toFixed(2)}`
                    : `$${cb.originalCost.toFixed(2)}`}
                </div>
                {cb.currency === 'USD' && (
                  <div className="text-xs text-neutral-500">
                    (≈¥{cb.cost.toFixed(2)})
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend Charts */}
      <div className="bg-neutral-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-neutral-400 mb-4">费用趋势</h3>
        <div className="space-y-4">
          {/* Cost chart */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-500">每日成本</span>
            </div>
            <div className="flex items-end gap-1 h-24">
              {stats.trend.map((day, idx) => {
                const maxCost = Math.max(...stats.trend.map((d) => d.cost), 0.01);
                const height = maxCost > 0 ? (day.cost / maxCost) * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <div
                      className="w-full bg-blue-600 rounded-sm transition-all hover:bg-blue-500"
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${formatDate(day.date)}: ${formatCost(day.cost)}`}
                    />
                    <span className="text-[10px] text-neutral-600">
                      {formatDate(day.date)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Images chart */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-500">生成图片数</span>
            </div>
            <div className="flex items-end gap-1 h-24">
              {stats.trend.map((day, idx) => {
                const maxImages = getMaxValue("images");
                const height = maxImages > 0 ? (day.images / maxImages) * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div
                      className="w-full bg-neutral-700 rounded-sm transition-all hover:bg-neutral-600"
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${formatDate(day.date)}: ${day.images} 张`}
                    />
                    <span className="text-[10px] text-neutral-600">
                      {formatDate(day.date)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-neutral-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-neutral-400 mb-4">用户费用排行</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-700">
                <th className="pb-2 pr-4">用户</th>
                <th className="pb-2 pr-4">角色</th>
                <th className="pb-2 pr-4 text-right">图片</th>
                <th className="pb-2 pr-4 text-right">Token</th>
                <th className="pb-2 pr-4 text-right">费用</th>
                <th className="pb-2 text-right">最后活动</th>
              </tr>
            </thead>
            <tbody>
              {stats.users.map((userStats) => (
                <tr
                  key={userStats.userId}
                  className="border-b border-neutral-700/50 hover:bg-neutral-700/30"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/users/${userStats.userId}`}
                      className="text-white hover:text-blue-400 transition-colors"
                    >
                      {userStats.username}
                    </Link>
                    <div className="text-xs text-neutral-500">{userStats.email}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        userStats.role === "admin"
                          ? "bg-purple-900/50 text-purple-300"
                          : "bg-neutral-700 text-neutral-400"
                      }`}
                    >
                      {userStats.role === "admin" ? "管理员" : "用户"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right text-neutral-300">
                    {userStats.images}
                  </td>
                  <td className="py-3 pr-4 text-right text-neutral-300">
                    {userStats.tokens.toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right text-white font-medium">
                    {formatCost(userStats.cost)}
                  </td>
                  <td className="py-3 text-right text-neutral-500">
                    {userStats.lastActivity
                      ? formatDate(userStats.lastActivity)
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
