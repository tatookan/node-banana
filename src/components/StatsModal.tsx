"use client";

import { useEffect, useState } from "react";

interface TimeStats {
  date: string;
  images: number;
  tokens: number;
}

interface StatsData {
  today: TimeStats;
  week: TimeStats[];
  month: TimeStats[];
  totals: {
    images: number;
    tokens: number;
  };
}

interface StatsResponse {
  success: boolean;
  error?: string;
  stats?: StatsData;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function StatsModal({ isOpen, onClose }: Props) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"week" | "month">("week");

  useEffect(() => {
    if (isOpen) {
      fetchStats();
    }
  }, [isOpen]);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stats", {
        credentials: "include",
      });
      const data: StatsResponse = await response.json();
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

  const getMaxValue = (data: TimeStats[], type: "images" | "tokens") => {
    return Math.max(...data.map((d) => d[type]), 1);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-neutral-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">使用统计</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-neutral-400">加载中...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-400">{error}</div>
        ) : stats ? (
          <div className="space-y-6">
            {/* Today's stats */}
            <div className="bg-neutral-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">今日</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-semibold text-white">{stats.today.images}</div>
                  <div className="text-xs text-neutral-500">生成图片</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-white">{stats.today.tokens.toLocaleString()}</div>
                  <div className="text-xs text-neutral-500">使用 Token</div>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-neutral-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">总计</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-semibold text-white">{stats.totals.images}</div>
                  <div className="text-xs text-neutral-500">生成图片</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-white">{stats.totals.tokens.toLocaleString()}</div>
                  <div className="text-xs text-neutral-500">使用 Token</div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-neutral-400">趋势</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setView("week")}
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      view === "week"
                        ? "bg-white text-neutral-900"
                        : "bg-neutral-700 text-neutral-400 hover:text-white"
                    }`}
                  >
                    7天
                  </button>
                  <button
                    onClick={() => setView("month")}
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      view === "month"
                        ? "bg-white text-neutral-900"
                        : "bg-neutral-700 text-neutral-400 hover:text-white"
                    }`}
                  >
                    30天
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Images chart */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-neutral-500">生成图片</span>
                  </div>
                  <div className="flex items-end gap-1 h-24">
                    {(view === "week" ? stats.week : stats.month).map((day) => {
                      const maxImages = getMaxValue(view === "week" ? stats.week : stats.month, "images");
                      const height = maxImages > 0 ? (day.images / maxImages) * 100 : 0;
                      return (
                        <div
                          key={day.date}
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

                {/* Tokens chart */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-neutral-500">使用 Token</span>
                  </div>
                  <div className="flex items-end gap-1 h-24">
                    {(view === "week" ? stats.week : stats.month).map((day) => {
                      const maxTokens = getMaxValue(view === "week" ? stats.week : stats.month, "tokens");
                      const height = maxTokens > 0 ? (day.tokens / maxTokens) * 100 : 0;
                      return (
                        <div
                          key={day.date}
                          className="flex-1 flex flex-col items-center gap-1"
                        >
                          <div
                            className="w-full bg-neutral-700 rounded-sm transition-all hover:bg-neutral-600"
                            style={{ height: `${Math.max(height, 4)}%` }}
                            title={`${formatDate(day.date)}: ${day.tokens.toLocaleString()} tokens`}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
