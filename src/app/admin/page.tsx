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
    quotaLimit?: number;
    quotaUsed?: number;
    quotaRemaining?: number;
    hasQuota?: boolean;
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

  // Quota modal states
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaUserId, setQuotaUserId] = useState<number | null>(null);
  const [quotaUsername, setQuotaUsername] = useState<string>("");
  const [quotaLimit, setQuotaLimit] = useState<string>("");
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [quotaMode, setQuotaMode] = useState<'set' | 'adjust'>('set');
  const [adjustAmount, setAdjustAmount] = useState<string>("");
  const [adjustOperation, setAdjustOperation] = useState<'add' | 'subtract'>('add');

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

  const handleSetQuota = (userId: number, username: string) => {
    setQuotaUserId(userId);
    setQuotaUsername(username);
    // Set current quota if exists
    const user = stats?.users.find(u => u.userId === userId);
    setQuotaLimit(user?.quotaLimit ? user.quotaLimit.toString() : "");
    setAdjustAmount("");
    setQuotaMode('set');
    setShowQuotaModal(true);
  };

  const handleAdjustQuota = async () => {
    if (!quotaUserId) return;

    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("请输入有效的调整金额（正数）");
      return;
    }

    const user = stats?.users.find(u => u.userId === quotaUserId);
    const currentLimit = user?.quotaLimit || 0;
    const newLimit = adjustOperation === 'add'
      ? currentLimit + amount
      : Math.max(0, currentLimit - amount);

    setQuotaSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${quotaUserId}/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quotaLimit: newLimit }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`配额已${adjustOperation === 'add' ? '增加' : '减少'} ¥${amount.toFixed(2)}`);
        setShowQuotaModal(false);
        fetchStats();
      } else {
        alert(data.error || "调整失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleSaveQuota = async () => {
    if (!quotaUserId) return;

    const limit = parseFloat(quotaLimit);
    if (isNaN(limit) || limit < 0) {
      alert("请输入有效的配额值（非负数）");
      return;
    }

    setQuotaSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${quotaUserId}/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quotaLimit: limit }),
      });

      const data = await response.json();
      if (data.success) {
        alert("配额设置成功");
        setShowQuotaModal(false);
        fetchStats(); // Refresh list
      } else {
        alert(data.error || "设置失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleDeleteQuota = async () => {
    if (!quotaUserId) return;

    if (!confirm(`确定要移除用户 ${quotaUsername} 的配额限制吗？`)) {
      return;
    }

    setQuotaSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${quotaUserId}/quota`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();
      if (data.success) {
        alert("配额已移除");
        setShowQuotaModal(false);
        fetchStats(); // Refresh list
      } else {
        alert(data.error || "移除失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setQuotaSaving(false);
    }
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
      {/* Back to Home */}
      <div className="mb-2 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回主页
        </Link>
        <Link
          href="/admin/templates"
          className="inline-flex items-center gap-2 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          模板审核
        </Link>
      </div>

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
            {stats.currencyBreakdown.map((cb, index) => (
              <div key={`${cb.currency}-${index}`} className="flex items-center gap-3">
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
                <th className="pb-2 pr-4">配额</th>
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
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${userStats.quotaLimit ? 'text-neutral-300' : 'text-neutral-500'}`}>
                        {userStats.quotaLimit
                          ? `¥${userStats.quotaLimit.toFixed(2)}`
                          : userStats.hasQuota
                            ? `¥0.00`
                            : '无限制'}
                      </span>
                      {userStats.quotaLimit && userStats.quotaUsed !== undefined && (
                        <span className={`text-xs ${userStats.quotaRemaining! < 10 ? 'text-red-400' : 'text-neutral-500'}`}>
                          (剩 ¥{userStats.quotaRemaining!.toFixed(2)})
                        </span>
                      )}
                      <button
                        onClick={() => handleSetQuota(userStats.userId, userStats.username)}
                        className="p-1 text-neutral-400 hover:text-blue-400 transition-colors"
                        title="设置配额"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
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

      {/* Quota Modal */}
      {showQuotaModal && quotaUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-neutral-800 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">
                配额管理 - {quotaUsername}
              </h3>
              <button
                onClick={() => setShowQuotaModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Current quota info */}
            {(() => {
              const user = stats?.users.find(u => u.userId === quotaUserId);
              return (
                <div className="bg-neutral-900 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">当前配额</span>
                    <span className="text-white font-medium">
                      {user?.quotaLimit ? `¥${user.quotaLimit.toFixed(2)}` : '无限制'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-neutral-400">已用金额</span>
                    <span className="text-neutral-300">
                      ¥{(user?.quotaUsed || 0).toFixed(2)}
                    </span>
                  </div>
                  {user?.quotaLimit && user.quotaUsed !== undefined && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-neutral-400">剩余额度</span>
                      <span className={`font-medium ${user.quotaRemaining! < 10 ? 'text-red-400' : 'text-green-400'}`}>
                        ¥{user.quotaRemaining!.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Mode tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setQuotaMode('set')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  quotaMode === 'set'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                整体设置
              </button>
              <button
                onClick={() => setQuotaMode('adjust')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  quotaMode === 'adjust'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                增量调整
              </button>
            </div>

            {/* Set mode */}
            {quotaMode === 'set' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">
                    配额上限（人民币）
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quotaLimit}
                    onChange={(e) => setQuotaLimit(e.target.value)}
                    placeholder="例如: 100"
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    留空或设为 0 表示无限制
                  </p>
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowQuotaModal(false)}
                    disabled={quotaSaving}
                    className="px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  {stats?.users.find(u => u.userId === quotaUserId)?.hasQuota && (
                    <button
                      onClick={handleDeleteQuota}
                      disabled={quotaSaving}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      移除限制
                    </button>
                  )}
                  <button
                    onClick={handleSaveQuota}
                    disabled={quotaSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {quotaSaving ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            )}

            {/* Adjust mode */}
            {quotaMode === 'adjust' && (
              <div className="space-y-4">
                {/* Operation selector */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdjustOperation('add')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      adjustOperation === 'add'
                        ? 'bg-green-600 text-white'
                        : 'bg-neutral-700 text-neutral-400 hover:text-white'
                    }`}
                  >
                    + 增加
                  </button>
                  <button
                    onClick={() => setAdjustOperation('subtract')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      adjustOperation === 'subtract'
                        ? 'bg-orange-600 text-white'
                        : 'bg-neutral-700 text-neutral-400 hover:text-white'
                    }`}
                  >
                    - 减少
                  </button>
                </div>

                {/* Amount input */}
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">
                    调整金额（人民币）
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="例如: 10"
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Quick amount buttons */}
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">快捷金额</label>
                  <div className="flex gap-2 flex-wrap">
                    {[10, 50, 100].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setAdjustAmount(amount.toString())}
                        className="px-3 py-1 bg-neutral-700 text-neutral-300 rounded hover:bg-neutral-600 hover:text-white text-sm transition-colors"
                      >
                        ¥{amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                {adjustAmount && !isNaN(parseFloat(adjustAmount)) && (() => {
                  const user = stats?.users.find(u => u.userId === quotaUserId);
                  const currentLimit = user?.quotaLimit || 0;
                  const amount = parseFloat(adjustAmount);
                  const newLimit = adjustOperation === 'add'
                    ? currentLimit + amount
                    : Math.max(0, currentLimit - amount);
                  const newRemaining = newLimit > 0 ? Math.max(0, newLimit - (user?.quotaUsed || 0)) : 0;

                  return (
                    <div className="bg-neutral-900 rounded-lg p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400">调整后配额</span>
                        <span className="text-white font-medium">
                          ¥{newLimit.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-neutral-400">调整后剩余</span>
                        <span className={`font-medium ${newRemaining < 10 ? 'text-red-400' : 'text-green-400'}`}>
                          ¥{newRemaining.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowQuotaModal(false)}
                    disabled={quotaSaving}
                    className="px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAdjustQuota}
                    disabled={quotaSaving || !adjustAmount || parseFloat(adjustAmount) <= 0}
                    className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                      adjustOperation === 'add'
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-orange-600 text-white hover:bg-orange-700'
                    }`}
                  >
                    {quotaSaving ? "处理中..." : (adjustOperation === 'add' ? "增加配额" : "减少配额")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
