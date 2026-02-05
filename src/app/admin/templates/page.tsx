"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { WorkflowTemplateWithUser, TemplateStatus, TemplateCategory } from "@/types";

type TabType = "pending" | "approved" | "rejected" | "all";

export default function AdminTemplatesPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [templates, setTemplates] = useState<WorkflowTemplateWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [error, setError] = useState<string | null>(null);

  // 拒绝原因弹窗状态
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingTemplateId, setRejectingTemplateId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // 权限检查
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (!isAdmin) {
        router.push("/");
      }
    }
  }, [user, isAdmin, authLoading, router]);

  // 获取模板列表
  useEffect(() => {
    if (isAdmin) {
      fetchTemplates();
    }
  }, [isAdmin, activeTab]);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);

    try {
      const statusParam = activeTab === "all" ? "" : `?status=${activeTab}`;
      const response = await fetch(`/api/admin/workflow-templates${statusParam}`, {
        credentials: "include",
      });

      const data = await response.json();

      if (data.success && data.templates) {
        setTemplates(data.templates);
      } else {
        setError(data.error || "获取模板列表失败");
        setTemplates([]);
      }
    } catch {
      setError("网络错误");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  // 批准模板
  const handleApprove = async (templateId: number) => {
    if (!confirm("确定要批准这个模板吗？批准后将在模板库中显示。")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/workflow-templates/${templateId}/approve`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        alert("模板已批准！");
        fetchTemplates();
      } else {
        alert(data.error || "批准失败");
      }
    } catch {
      alert("网络错误");
    }
  };

  // 打开拒绝弹窗
  const openRejectModal = (templateId: number) => {
    setRejectingTemplateId(templateId);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  // 拒绝模板
  const handleReject = async () => {
    if (!rejectingTemplateId) return;

    if (!rejectionReason.trim()) {
      alert("请输入拒绝原因");
      return;
    }

    setIsRejecting(true);

    try {
      const response = await fetch(`/api/admin/workflow-templates/${rejectingTemplateId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });

      const data = await response.json();

      if (data.success) {
        alert("模板已拒绝！");
        setShowRejectModal(false);
        fetchTemplates();
      } else {
        alert(data.error || "拒绝失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setIsRejecting(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 状态标签
  const getStatusBadge = (status: TemplateStatus) => {
    const statusMap = {
      pending: { label: "待审核", className: "bg-yellow-900/50 text-yellow-300" },
      approved: { label: "已批准", className: "bg-green-900/50 text-green-300" },
      rejected: { label: "已拒绝", className: "bg-red-900/50 text-red-300" },
    };
    const s = statusMap[status];
    return <span className={`px-2 py-1 rounded text-xs ${s.className}`}>{s.label}</span>;
  };

  // 分类标签
  const getCategoryLabel = (category: TemplateCategory) => {
    const categoryMap: Record<TemplateCategory, { label: string; icon: string }> = {
      basic: { label: "基础", icon: "🔰" },
      product: { label: "产品拍摄", icon: "📦" },
      portrait: { label: "人像", icon: "👤" },
      style: { label: "风格迁移", icon: "🎨" },
      other: { label: "其他", icon: "📁" },
    };
    const c = categoryMap[category];
    return `${c.icon} ${c.label}`;
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-neutral-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 拒绝原因弹窗 */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-neutral-800 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">拒绝模板</h3>
              <button
                onClick={() => setShowRejectModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-neutral-400 mb-2">
                拒绝原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="请说明拒绝原因..."
                rows={4}
                className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={isRejecting}
                className="px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={isRejecting || !rejectionReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isRejecting ? "处理中..." : "确认拒绝"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back to Admin */}
      <div className="mb-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回管理后台
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">模板审核</h1>
          <p className="text-sm text-neutral-400 mt-1">审核用户提交的工作流模板</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "pending"
              ? "bg-yellow-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:text-white"
          }`}
        >
          待审核 {templates.filter((t) => t.status === "pending").length > 0 && `(${templates.filter((t) => t.status === "pending").length})`}
        </button>
        <button
          onClick={() => setActiveTab("approved")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "approved"
              ? "bg-green-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:text-white"
          }`}
        >
          已批准
        </button>
        <button
          onClick={() => setActiveTab("rejected")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "rejected"
              ? "bg-red-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:text-white"
          }`}
        >
          已拒绝
        </button>
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "all"
              ? "bg-blue-600 text-white"
              : "bg-neutral-800 text-neutral-400 hover:text-white"
          }`}
        >
          全部
        </button>
      </div>

      {/* Templates List */}
      {error ? (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400">
          {error}
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-neutral-800 rounded-lg p-12 text-center">
          <p className="text-neutral-500">暂无模板</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((template) => (
            <div key={template.id} className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-medium text-white">{template.name}</h3>
                    {getStatusBadge(template.status)}
                    <span className="text-sm text-neutral-400">{getCategoryLabel(template.category)}</span>
                  </div>

                  {/* Description */}
                  {template.description && (
                    <p className="text-sm text-neutral-400 mb-3">{template.description}</p>
                  )}

                  {/* Info */}
                  <div className="flex items-center gap-4 text-xs text-neutral-500 mb-3">
                    <span>提交者: {template.submitted_by_username}</span>
                    <span>({template.submitted_by_email})</span>
                    <span>提交时间: {formatDate(template.created_at)}</span>
                  </div>

                  {/* Rejection reason */}
                  {template.status === "rejected" && template.rejection_reason && (
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mb-3">
                      <div className="text-xs text-red-400 mb-1">拒绝原因</div>
                      <div className="text-sm text-red-300">{template.rejection_reason}</div>
                    </div>
                  )}

                  {/* Review info */}
                  {template.reviewed_by && (
                    <div className="text-xs text-neutral-500">
                      审核者: {template.reviewed_by_username}
                      {template.reviewed_at && ` · ${formatDate(template.reviewed_at)}`}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {template.status === "pending" && (
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleApprove(template.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      批准
                    </button>
                    <button
                      onClick={() => openRejectModal(template.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
