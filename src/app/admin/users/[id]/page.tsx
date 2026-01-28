"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface UserDetail {
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
}

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserDetail();
  }, [userId]);

  const fetchUserDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success && data.user) {
        setUserDetail(data.user);
      } else {
        setError(data.error || "获取用户详情失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const formatCost = (cost: number) => {
    return `¥${cost.toFixed(2)}`;
  };

  const getMaxValue = (type: "images" | "tokens") => {
    if (!userDetail?.trend) return 1;
    return Math.max(...userDetail.trend.map((d) => d[type]), 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-neutral-400">加载中...</div>
      </div>
    );
  }

  if (error || !userDetail) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-red-400">{error || "加载失败"}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back Button */}
      <div>
        <Link
          href="/admin"
          className="text-sm text-neutral-400 hover:text-white transition-colors"
        >
          ← 返回管理后台
        </Link>
      </div>

      {/* User Info Card */}
      <div className="bg-neutral-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">{userDetail.username}</h2>
            <p className="text-sm text-neutral-400">{userDetail.email}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-neutral-500">角色</div>
            <span
              className={`px-2 py-0.5 rounded text-sm ${
                userDetail.role === "admin"
                  ? "bg-purple-900/50 text-purple-300"
                  : "bg-neutral-700 text-neutral-400"
              }`}
            >
              {userDetail.role === "admin" ? "管理员" : "用户"}
            </span>
          </div>
        </div>
        <div className="mt-4 flex gap-6 text-sm text-neutral-500">
          <div>
            <span className="text-neutral-400">注册时间: </span>
            {formatDateTime(userDetail.createdAt)}
          </div>
          <div>
            <span className="text-neutral-400">最后登录: </span>
            {userDetail.lastLogin ? formatDateTime(userDetail.lastLogin) : "从未登录"}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">总生成图片</div>
          <div className="text-2xl font-semibold text-white">{userDetail.totals.images}</div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">总使用 Token</div>
          <div className="text-2xl font-semibold text-white">{userDetail.totals.tokens.toLocaleString()}</div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-4">
          <div className="text-sm text-neutral-400 mb-1">总成本</div>
          <div className="text-2xl font-semibold text-white">{formatCost(userDetail.totals.cost)}</div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-neutral-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-neutral-400 mb-4">近30天趋势</h3>
        <div className="space-y-4">
          {/* Cost chart */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-500">每日成本</span>
            </div>
            <div className="flex items-end gap-1 h-24">
              {userDetail.trend.map((day, idx) => {
                const maxCost = Math.max(...userDetail.trend.map((d) => d.cost), 0.01);
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
              {userDetail.trend.map((day, idx) => {
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

      {/* Image Breakdown */}
      {userDetail.imageBreakdown.length > 0 && (
        <div className="bg-neutral-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-neutral-400 mb-3">图片生成详情</h3>
          <div className="space-y-2">
            {userDetail.imageBreakdown.map((item, idx) => (
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

      {/* LLM Breakdown */}
      {userDetail.llmBreakdown.length > 0 && (
        <div className="bg-neutral-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-neutral-400 mb-3">LLM 使用详情</h3>
          <div className="space-y-2">
            {userDetail.llmBreakdown.map((item, idx) => (
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
    </div>
  );
}
