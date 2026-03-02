/**
 * Database Migration Script
 * 初始化数据库表结构，支持新环境一键运行
 *
 * Run: npx tsx --env-file=.env scripts/_run-migrations.ts
 */

import mysql from 'mysql2/promise';

async function main() {
  // 第一步：连接不带 database，确保数据库存在
  let conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  const dbName = process.env.DB_NAME || 'node_banana';
  console.log(`[Migration] Creating database "${dbName}" if not exists...`);
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await conn.end();

  // 第二步：重连到目标数据库
  conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    multipleStatements: true,
  });

  console.log(`[Migration] Connected to "${dbName}"\n`);

  // ─── 建表 ────────────────────────────────────────────────────────────────

  await run(conn, 'Create table: users', `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user', 'admin') DEFAULT 'user',
      invite_code VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      INDEX idx_username (username),
      INDEX idx_email (email),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(conn, 'Create table: invite_codes', `
    CREATE TABLE IF NOT EXISTS invite_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      used_by INT NULL,
      used_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_code (code),
      INDEX idx_is_used (is_used),
      FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(conn, 'Create table: api_usage', `
    CREATE TABLE IF NOT EXISTS api_usage (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      images_generated INT DEFAULT 0,
      image_model VARCHAR(50) NULL,
      image_resolution VARCHAR(10) NULL,
      tokens_used INT DEFAULT 0,
      llm_provider VARCHAR(20) NULL,
      llm_model VARCHAR(50) NULL,
      cost DECIMAL(10, 4) DEFAULT 0,
      original_cost DECIMAL(10, 4) DEFAULT NULL,
      currency VARCHAR(10) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_created (user_id, created_at),
      INDEX idx_image_model (image_model, image_resolution),
      INDEX idx_llm_model (llm_provider, llm_model),
      INDEX idx_currency (currency)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(conn, 'Create table: user_images', `
    CREATE TABLE IF NOT EXISTS user_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      image_key VARCHAR(500) NOT NULL,
      image_type ENUM('input', 'generation', 'annotation', 'output') NOT NULL,
      file_size INT NOT NULL COMMENT 'File size in bytes',
      is_favorite BOOLEAN DEFAULT FALSE COMMENT 'User favorited this image',
      prompt TEXT NULL,
      model VARCHAR(50) NULL,
      aspect_ratio VARCHAR(10) NULL,
      resolution VARCHAR(10) NULL,
      workflow_id VARCHAR(100) NULL,
      node_id VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_image_key (image_key),
      INDEX idx_user_type (user_id, image_type),
      INDEX idx_created_at (created_at),
      INDEX idx_workflow (workflow_id, node_id),
      INDEX idx_favorite (user_id, is_favorite)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(conn, 'Create table: user_quotas', `
    CREATE TABLE IF NOT EXISTS user_quotas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      quota_limit DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT '配额上限（人民币）',
      quota_used DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT '已用配额（人民币）',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(conn, 'Create table: rate_limits', `
    CREATE TABLE IF NOT EXISTS rate_limits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL COMMENT '用户ID',
      endpoint VARCHAR(100) NOT NULL COMMENT 'API端点',
      request_count INT DEFAULT 1 COMMENT '当前窗口请求数',
      window_start TIMESTAMP NOT NULL COMMENT '窗口开始时间',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_user_endpoint_window (user_id, endpoint, window_start),
      INDEX idx_endpoint_window (endpoint, window_start),
      INDEX idx_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(conn, 'Create table: workflow_folders', `
    CREATE TABLE IF NOT EXISTS workflow_folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(100) NOT NULL COMMENT '文件夹名称',
      icon VARCHAR(50) DEFAULT 'folder' COMMENT '图标名称',
      color VARCHAR(20) DEFAULT '#6366f1' COMMENT '颜色代码',
      sort_order INT DEFAULT 0 COMMENT '排序顺序',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_folder_name (user_id, name),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(conn, 'Create table: workflows', `
    CREATE TABLE IF NOT EXISTS workflows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      workflow_id VARCHAR(100) UNIQUE NOT NULL COMMENT 'UUID',
      name VARCHAR(200) NOT NULL COMMENT '工作流名称',
      description TEXT COMMENT '工作流描述',
      folder_id INT NULL COMMENT '所属文件夹ID',
      thumbnail VARCHAR(500) COMMENT '预览图URL',
      is_public BOOLEAN DEFAULT FALSE COMMENT '是否公开分享',
      is_favorite BOOLEAN DEFAULT FALSE COMMENT '是否收藏',
      tags JSON COMMENT '标签数组',
      workflow_data JSON NOT NULL COMMENT '完整工作流数据',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES workflow_folders(id) ON DELETE SET NULL,
      INDEX idx_user_id (user_id),
      INDEX idx_folder_id (folder_id),
      INDEX idx_is_public (is_public),
      INDEX idx_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(conn, 'Create table: workflow_templates', `
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      workflow_id VARCHAR(100) UNIQUE NOT NULL COMMENT 'UUID',
      name VARCHAR(200) NOT NULL COMMENT '模板名称',
      description TEXT COMMENT '模板描述',
      category ENUM('basic', 'product', 'portrait', 'style', 'other') DEFAULT 'other' COMMENT '模板分类',
      thumbnail VARCHAR(500) COMMENT '预览图URL',
      workflow_data JSON NOT NULL COMMENT '完整工作流数据',
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '审核状态',
      submitted_by INT NOT NULL COMMENT '提交者用户ID',
      reviewed_by INT NULL COMMENT '审核者用户ID',
      reviewed_at TIMESTAMP NULL COMMENT '审核时间',
      rejection_reason TEXT NULL COMMENT '拒绝原因',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_status (status),
      INDEX idx_category (category),
      INDEX idx_submitted_by (submitted_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ─── 完成 ────────────────────────────────────────────────────────────────

  await conn.end();
  console.log('\n[Migration] All done! ✓');
}

async function run(conn: mysql.Connection, label: string, sql: string) {
  process.stdout.write(`[Migration] ${label}... `);
  try {
    await conn.query(sql);
    console.log('OK');
  } catch (e: any) {
    if (e.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('already exists, skip');
    } else {
      console.log(`WARN: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error('[Migration] Fatal error:', e.message);
  process.exit(1);
});
