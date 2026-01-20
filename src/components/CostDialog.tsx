"use client";

import { useEffect } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { PredictedCostResult, formatCost, PRICING } from "@/utils/costCalculator";

interface CostDialogProps {
  predictedCost: PredictedCostResult;
  incurredCost: number;
  onClose: () => void;
}

export function CostDialog({ predictedCost, incurredCost, onClose }: CostDialogProps) {
  const resetIncurredCost = useWorkflowStore((state) => state.resetIncurredCost);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleReset = () => {
    if (confirm("确定要将已产生费用重置为 $0.00 吗？")) {
      resetIncurredCost();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-neutral-800 rounded-lg p-6 w-[400px] border border-neutral-700 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-100">
            工作流费用
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Predicted Cost Section */}
          <div className="bg-neutral-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-neutral-400">预计费用</span>
              <span className="text-lg font-semibold text-neutral-100">
                {formatCost(predictedCost.totalCost)}
              </span>
            </div>

            {predictedCost.breakdown.length > 0 && (
              <div className="mt-3 pt-3 border-t border-neutral-700 space-y-2">
                {predictedCost.breakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-neutral-500">
                      {item.count}x {item.model === "nano-banana" ? "nano-banana-Flash" : "nano-banana-pro"}
                      {item.model === "nano-banana-pro" && ` (${item.resolution})`}
                    </span>
                    <span className="text-neutral-400">
                      {formatCost(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {predictedCost.nodeCount === 0 && (
              <p className="text-xs text-neutral-500 mt-2">
                工作流中没有生成节点
              </p>
            )}
          </div>

          {/* Incurred Cost Section */}
          <div className="bg-neutral-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-neutral-400">已产生费用</span>
              <span className="text-lg font-semibold text-green-400">
                {formatCost(incurredCost)}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              成功生成的实际 API 花费
            </p>

            {incurredCost > 0 && (
              <button
                onClick={handleReset}
                className="mt-3 text-xs text-neutral-400 hover:text-red-400 transition-colors"
              >
                重置为 $0.00
              </button>
            )}
          </div>

          {/* Pricing Reference */}
          <div className="text-xs text-neutral-500 space-y-1">
            <p className="font-medium text-neutral-400">价格参考：</p>
            <p>nano-banana-Flash：${PRICING["nano-banana"]["1K"]}/张</p>
            <p>nano-banana-pro 1K/2K：${PRICING["nano-banana-pro"]["1K"]}/张</p>
            <p>nano-banana-pro 4K：${PRICING["nano-banana-pro"]["4K"]}/张</p>
            <p className="text-neutral-600 mt-2">所有价格以美元计</p>
          </div>
        </div>
      </div>
    </div>
  );
}
