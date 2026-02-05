-- 模板库功能 - 创建 workflow_templates 表
-- 执行前请备份数据库！

USE node_banana;

-- 创建模板表
CREATE TABLE IF NOT EXISTS workflow_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id VARCHAR(36) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  category ENUM('basic', 'product', 'portrait', 'style', 'other') DEFAULT 'other',
  thumbnail TEXT NULL,
  workflow_data JSON NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  submitted_by INT NOT NULL,
  reviewed_by INT NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workflow_id (workflow_id),
  INDEX idx_status (status),
  INDEX idx_category (category),
  INDEX idx_submitted_by (submitted_by),
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 验证表是否创建成功
SELECT 'workflow_templates table created successfully' AS status;
