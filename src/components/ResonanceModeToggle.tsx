"use client";

import { useCallback } from "react";

interface ResonanceModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  size?: "sm" | "md";
}

/**
 * 共鸣模式开关组件
 * 用于控制提示词是否重复3次以增强AI模型效果
 */
export function ResonanceModeToggle({ enabled, onToggle, size = "sm" }: ResonanceModeToggleProps) {
  const handleClick = useCallback(() => {
    onToggle(!enabled);
  }, [enabled, onToggle]);

  const sizeClasses = size === "sm"
    ? "w-8 h-4 after:w-3 after:h-3"
    : "w-10 h-5 after:w-4 after:h-4";

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 group relative`}
      title={enabled ? "共鸣模式已开启（提示词重复3次）" : "共鸣模式已关闭"}
    >
      {/* Toggle Switch */}
      <div
        className={`
          relative inline-flex flex-shrink-0 cursor-pointer rounded-full
          transition-colors duration-200 ease-in-out
          ${sizeClasses}
          ${enabled ? "bg-purple-600" : "bg-neutral-600"}
          group-hover:opacity-90
        `}
      >
        <span
          className={`
            pointer-events-none inline-block rounded-full bg-white shadow
            transform transition-transform duration-200 ease-in-out
            ${size === "sm" ? "after:top-0.5 after:left-0.5" : "after:top-0.5 after:left-0.5"}
            ${enabled ? "translate-x-4" : "translate-x-0.5"}
            ${size === "sm" ? "h-3 w-3" : "h-4 w-4"}
            ${enabled ? "translate-x-4" : "translate-x-0.5"}
          `}
        />
      </div>

      {/* Label */}
      <span
        className={`
          text-xs font-medium select-none transition-colors
          ${enabled ? "text-purple-400" : "text-neutral-500"}
        `}
      >
        共鸣模式
      </span>

      {/* Icon */}
      <svg
        className={`w-3.5 h-3.5 transition-colors ${enabled ? "text-purple-400" : "text-neutral-600"}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"
        />
      </svg>
    </button>
  );
}
