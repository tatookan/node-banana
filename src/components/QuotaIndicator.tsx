"use client";

import { useEffect, useState } from "react";

interface QuotaData {
  quotaLimit: number;
  quotaUsed: number;
  quotaRemaining: number;
  hasLimit: boolean;
}

export function QuotaIndicator() {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuota();
    // Refresh every 30 seconds
    const interval = setInterval(fetchQuota, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchQuota = async () => {
    try {
      const response = await fetch('/api/user/quota', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setQuota(data.quota);
      }
    } catch {
      // Ignore error
    } finally {
      setLoading(false);
    }
  };

  if (loading || !quota || !quota.hasLimit) {
    return null;
  }

  const percentage = quota.quotaLimit > 0
    ? (quota.quotaUsed / quota.quotaLimit) * 100
    : 0;

  const isLow = percentage >= 80;
  const isExhausted = percentage >= 100;

  return (
    <div className="flex items-center gap-2" title={`配额: ¥${quota.quotaUsed.toFixed(2)} / ¥${quota.quotaLimit.toFixed(2)}`}>
      <span className={`text-xs transition-colors ${
        isExhausted
          ? 'text-red-400'
          : isLow
            ? 'text-yellow-400'
            : 'text-neutral-400'
      }`}>
        ¥{quota.quotaRemaining.toFixed(2)}
      </span>
      <div className="w-16 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            isExhausted
              ? 'bg-red-500'
              : isLow
                ? 'bg-yellow-500'
                : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
