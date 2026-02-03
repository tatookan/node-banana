/**
 * 配额管理系统
 * 管理用户 API 调用配额，避免过度使用
 */

import { query, execute } from '@/lib/db';

/**
 * 配额检查结果
 */
export interface QuotaCheckResult {
  allowed: boolean;           // 是否允许调用
  quotaLimit: number;         // 配额上限
  quotaUsed: number;          // 已用配额
  quotaRemaining: number;     // 剩余配额
  estimatedCost?: number;     // 预估本次成本（可选）
}

/**
 * 用户配额信息
 */
export interface UserQuota {
  quotaLimit: number;
  quotaUsed: number;
  quotaRemaining: number;
}

/**
 * 获取用户配额信息
 */
export async function getUserQuota(userId: number): Promise<UserQuota | null> {
  const result = await query(
    `SELECT quota_limit, quota_used FROM user_quotas WHERE user_id = ?`,
    [userId]
  );

  if ((result as any[]).length === 0) return null;

  const row = (result as any[])[0];
  const quotaLimit = Number(row.quota_limit);
  const quotaUsed = Number(row.quota_used);

  return {
    quotaLimit,
    quotaUsed,
    quotaRemaining: Math.max(0, quotaLimit - quotaUsed),
  };
}

/**
 * 检查用户是否有足够配额进行 API 调用
 * @param userId 用户ID
 * @param estimatedCost 预估成本（人民币）
 */
export async function checkQuota(
  userId: number,
  estimatedCost: number = 0
): Promise<QuotaCheckResult> {
  // 获取配额信息
  const quota = await getUserQuota(userId);

  // 如果没有设置配额，默认允许（向后兼容）
  if (!quota) {
    return {
      allowed: true,
      quotaLimit: 0,
      quotaUsed: 0,
      quotaRemaining: 0,
      estimatedCost,
    };
  }

  // 计算剩余配额
  const quotaRemaining = quota.quotaLimit - quota.quotaUsed;
  const allowed = quotaRemaining >= estimatedCost;

  return {
    allowed,
    quotaLimit: quota.quotaLimit,
    quotaUsed: quota.quotaUsed,
    quotaRemaining: Math.max(0, quotaRemaining),
    estimatedCost,
  };
}

/**
 * 更新用户已用配额（在 API 调用成功后调用）
 * @param userId 用户ID
 * @param cost 实际成本（人民币）
 */
export async function updateQuotaUsage(
  userId: number,
  cost: number
): Promise<void> {
  // 检查用户是否有配额记录
  const existing = await query(
    'SELECT id FROM user_quotas WHERE user_id = ?',
    [userId]
  );

  if ((existing as any[]).length === 0) {
    // 没有配额记录，无需更新
    return;
  }

  // 更新已用配额
  await execute(
    `UPDATE user_quotas
     SET quota_used = quota_used + ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    [cost, userId]
  );

  console.log('[QuotaManager] Updated quota usage:', { userId, cost });
}

/**
 * 设置或更新用户配额（管理员功能）
 * @param userId 用户ID
 * @param quotaLimit 配额上限（人民币）
 * @param resetUsed 是否重置已用配额（默认 false）
 */
export async function setUserQuota(
  userId: number,
  quotaLimit: number,
  resetUsed: boolean = false
): Promise<void> {
  // 检查是否已存在
  const existing = await query(
    'SELECT id FROM user_quotas WHERE user_id = ?',
    [userId]
  );

  if ((existing as any[]).length > 0) {
    // 更新现有记录
    await execute(
      `UPDATE user_quotas
       SET quota_limit = ?${resetUsed ? ', quota_used = 0' : ''},
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [quotaLimit, userId]
    );
  } else {
    // 创建新记录
    await execute(
      `INSERT INTO user_quotas (user_id, quota_limit, quota_used)
       VALUES (?, ?, 0)`,
      [userId, quotaLimit]
    );
  }

  console.log('[QuotaManager] Set user quota:', { userId, quotaLimit, resetUsed });
}

/**
 * 重新计算用户已用配额（从 api_usage 表汇总）
 * 用于修复数据不一致
 */
export async function recalculateQuotaUsage(userId: number): Promise<void> {
  const result = await query(
    `SELECT COALESCE(SUM(cost), 0) as total_cost FROM api_usage WHERE user_id = ?`,
    [userId]
  );

  const totalCost = Number((result as any[])[0]?.total_cost || 0);

  await execute(
    `UPDATE user_quotas
     SET quota_used = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    [totalCost, userId]
  );

  console.log('[QuotaManager] Recalculated quota usage:', { userId, totalCost });
}

/**
 * 删除用户配额（管理员功能）
 */
export async function deleteUserQuota(userId: number): Promise<void> {
  await execute('DELETE FROM user_quotas WHERE user_id = ?', [userId]);
  console.log('[QuotaManager] Deleted user quota:', { userId });
}
