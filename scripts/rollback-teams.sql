-- ============================================
-- 数据库回退脚本 - 移除团队管理功能
-- ============================================

-- 禁用外键检查
SET FOREIGN_KEY_CHECKS = 0;

-- 删除 users 表的外键约束
ALTER TABLE users DROP FOREIGN KEY users_ibfk_1;

-- 删除 users 表中的 current_team_id 字段
ALTER TABLE users DROP COLUMN current_team_id;

-- 删除 api_usage 表中的 team_id 字段
ALTER TABLE api_usage DROP COLUMN team_id;

-- 删除新增的表（按依赖关系顺序）
DROP TABLE IF EXISTS quota_alerts;
DROP TABLE IF EXISTS credit_transactions;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS credit_packages;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;

-- 重新启用外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 验证回退完成
SELECT 'Database rollback completed!' AS status;
SHOW TABLES;
