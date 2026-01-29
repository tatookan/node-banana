"use client";

import { useEffect, useState } from "react";
import type {
  StatsData,
  StatsResponse,
  ImageStatsBreakdown,
  LLMStatsBreakdown,
  TimeStats,
} from "@/types/stats";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type TimeRange = "today" | "week" | "month" | "custom";

export function StatsModal({ isOpen, onClose }: Props) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"week" | "month" | "custom">("week");
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");

  // Custom date range
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchStats();
    }
  }, [isOpen, view, startDate, endDate]);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (view === "custom" && startDate && endDate) {
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      const response = await fetch(`/api/stats?${params.toString()}`, {
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

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.append("format", exportFormat);

      // If custom date range is selected and has dates, use those
      // Otherwise use the current view's date range
      if (view === "custom" && startDate && endDate) {
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      } else if (view === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 6);
        params.append("startDate", weekAgo.toISOString().split("T")[0]);
        params.append("endDate", new Date().toISOString().split("T")[0]);
      } else if (view === "month") {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 29);
        params.append("startDate", monthAgo.toISOString().split("T")[0]);
        params.append("endDate", new Date().toISOString().split("T")[0]);
      }

      const response = await fetch(`/api/export?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("导出失败");
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `usage-stats.${exportFormat}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download file
      const blob = exportFormat === "csv"
        ? new Blob([await response.text()], { type: "text/csv" })
        : new Blob([await response.text()], { type: "application/json" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("导出失败，请重试");
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(2)}`;
  };

  const getMaxValue = (data: TimeStats[], type: "images" | "tokens") => {
    return Math.max(...data.map((d) => d[type]), 1);
  };

  const getCurrentData = (): TimeStats[] => {
    if (!stats) return [];
    if (view === "custom" && stats.custom) return stats.custom;
    return view === "week" ? stats.week : stats.month;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 rounded-lg p-6 w-full max-w-4xl max-h-[85vh] overflow-y-auto border border-neutral-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
            {/* Today's quick stats */}
            <div className="bg-neutral-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">今日概览</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-semibold text-white">{stats.today.images}</div>
                  <div className="text-xs text-neutral-500">生成图片</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-white">{stats.today.tokens.toLocaleString()}</div>
                  <div className="text-xs text-neutral-500">使用 Token</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-white">{formatCost(stats.today.cost)}</div>
                  <div className="text-xs text-neutral-500">今日成本</div>
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-neutral-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-400 mb-3">总计</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-semibold text-white">{stats.totals.images}</div>
                  <div className="text-xs text-neutral-500">生成图片</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-white">{stats.totals.tokens.toLocaleString()}</div>
                  <div className="text-xs text-neutral-500">使用 Token</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-white">{formatCost(stats.totals.cost)}</div>
                  <div className="text-xs text-neutral-500">总成本</div>
                </div>
              </div>
            </div>

            {/* Currency breakdown */}
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

            {/* Image breakdown */}
            {stats.breakdown.images.length > 0 && (
              <div className="bg-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-400 mb-3">图片生成详情</h3>
                <div className="space-y-2">
                  {stats.breakdown.images.map((item: ImageStatsBreakdown, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-neutral-300">
                        {item.model} ({item.resolution})
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-white font-medium">{item.count} 张</span>
                        <span className="text-neutral-500">{formatCost(item.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LLM breakdown */}
            {stats.breakdown.llm.length > 0 && (
              <div className="bg-neutral-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-neutral-400 mb-3">LLM 使用详情</h3>
                <div className="space-y-2">
                  {stats.breakdown.llm.map((item: LLMStatsBreakdown, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-neutral-300">
                        {item.provider} - {item.model}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-white font-medium">{item.tokens.toLocaleString()} tokens</span>
                        <span className="text-neutral-500">{formatCost(item.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chart with time range selector */}
            <div className="bg-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-neutral-400">趋势</h3>
                <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-1 ml-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setView("custom");
                      }}
                      className="bg-neutral-700 text-neutral-300 text-xs px-2 py-1 rounded border border-neutral-600 focus:outline-none focus:border-neutral-500"
                    />
                    <span className="text-neutral-500">-</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setView("custom");
                      }}
                      className="bg-neutral-700 text-neutral-300 text-xs px-2 py-1 rounded border border-neutral-600 focus:outline-none focus:border-neutral-500"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Cost chart */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-neutral-500">每日成本</span>
                  </div>
                  <div className="flex items-end gap-1 h-24">
                    {getCurrentData().map((day) => {
                      const maxCost = Math.max(...getCurrentData().map((d) => d.cost), 0.01);
                      const height = maxCost > 0 ? (day.cost / maxCost) * 100 : 0;
                      return (
                        <div
                          key={day.date}
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
                    <span className="text-xs text-neutral-500">生成图片</span>
                  </div>
                  <div className="flex items-end gap-1 h-24">
                    {getCurrentData().map((day) => {
                      const maxImages = getMaxValue(getCurrentData(), "images");
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
                    {getCurrentData().map((day) => {
                      const maxTokens = getMaxValue(getCurrentData(), "tokens");
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

            {/* Export section */}
            <div className="bg-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-neutral-400">导出数据</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as "csv" | "json")}
                    className="bg-neutral-700 text-neutral-300 text-xs px-2 py-1 rounded border border-neutral-600 focus:outline-none focus:border-neutral-500"
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                  <button
                    onClick={handleExport}
                    className="text-xs px-3 py-1 bg-neutral-700 text-neutral-300 rounded hover:bg-neutral-600 hover:text-white transition-colors"
                  >
                    导出
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
