import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let initDone = false;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'node_banana',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  // Auto-initialize database on first query
  if (!initDone) {
    await initDatabase();
    initDone = true;
  }

  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

/**
 * Execute SQL statement (INSERT, UPDATE, DELETE)
 * Returns the full result including insertId, affectedRows
 */
export async function execute(sql: string, params?: any[]): Promise<mysql.OkPacket> {
  // Auto-initialize database on first query
  if (!initDone) {
    await initDatabase();
    initDone = true;
  }

  const pool = getPool();
  const [result] = await pool.execute(sql, params);
  return result as mysql.OkPacket;
}

export async function initDatabase() {
  const pool = getPool();

  // Create users table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      invite_code VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      INDEX idx_username (username),
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Create invite_codes table
  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Create api_usage table for tracking image generation and LLM usage
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      -- Image generation fields
      images_generated INT DEFAULT 0,
      image_model VARCHAR(50) NULL,
      image_resolution VARCHAR(10) NULL,
      -- LLM usage fields
      tokens_used INT DEFAULT 0,
      llm_provider VARCHAR(20) NULL,
      llm_model VARCHAR(50) NULL,
      -- Cost tracking
      cost DECIMAL(10, 4) DEFAULT 0,
      -- Timestamp
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      -- Foreign keys and indexes
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_created (user_id, created_at),
      INDEX idx_image_model (image_model, image_resolution),
      INDEX idx_llm_model (llm_provider, llm_model)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Create user_images table for R2 cloud storage metadata
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      image_key VARCHAR(500) NOT NULL,
      image_type ENUM('input', 'generation', 'annotation', 'output') NOT NULL,
      file_size INT NOT NULL COMMENT 'File size in bytes',
      is_favorite BOOLEAN DEFAULT FALSE COMMENT 'User favorited this image',
      -- Generation metadata
      prompt TEXT NULL,
      model VARCHAR(50) NULL,
      aspect_ratio VARCHAR(10) NULL,
      resolution VARCHAR(10) NULL,
      -- Workflow context
      workflow_id VARCHAR(100) NULL,
      node_id VARCHAR(100) NULL,
      -- Timestamps
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      -- Foreign keys and indexes
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_image_key (image_key),
      INDEX idx_user_type (user_id, image_type),
      INDEX idx_created_at (created_at),
      INDEX idx_workflow (workflow_id, node_id),
      INDEX idx_favorite (user_id, is_favorite)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Migrate existing api_usage table if needed
  await migrateApiUsageTable();

  // Migrate user_images table for favorites
  await migrateUserImagesTable();

  // Migrate users table for role field
  await migrateUsersTable();

  // Migrate api_usage table for multi-currency support
  await migrateApiUsageCurrency();

  // Create workflow_folders table
  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Create workflows table
  await pool.execute(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('[Database] Tables initialized');
}

// Migration function to add missing columns to api_usage table
async function migrateApiUsageTable() {
  const pool = getPool();

  try {
    // Check if api_usage table exists and get its structure
    const [rows] = await pool.execute('SHOW TABLES LIKE "api_usage"');

    if ((rows as any[]).length === 0) {
      // Table doesn't exist yet, will be created by CREATE TABLE IF NOT EXISTS above
      return;
    }

    // Get existing columns
    const [columns] = await pool.execute('DESCRIBE api_usage');
    const existingColumns = (columns as any[]).map((row) => row.Field);
    console.log('[Database Migration] Existing api_usage columns:', existingColumns);

    // Columns that need to be added
    const migrations: Array<{ column: string; definition: string; after: string }> = [
      { column: 'image_model', definition: 'VARCHAR(50) NULL', after: 'images_generated' },
      { column: 'image_resolution', definition: 'VARCHAR(10) NULL', after: 'image_model' },
      { column: 'tokens_used', definition: 'INT DEFAULT 0', after: 'image_resolution' },
      { column: 'llm_provider', definition: 'VARCHAR(20) NULL', after: 'tokens_used' },
      { column: 'llm_model', definition: 'VARCHAR(50) NULL', after: 'llm_provider' },
      { column: 'cost', definition: 'DECIMAL(10, 4) DEFAULT 0', after: 'llm_model' },
    ];

    for (const migration of migrations) {
      if (!existingColumns.includes(migration.column)) {
        // Find the correct "after" column - use the first existing column in our order
        let afterColumn = migration.after;
        if (!existingColumns.includes(afterColumn)) {
          // Fallback to last existing column
          afterColumn = existingColumns[existingColumns.length - 1];
        }

        const alterSql = `ALTER TABLE api_usage ADD COLUMN ${migration.column} ${migration.definition} AFTER ${afterColumn}`;
        console.log(`[Database Migration] Adding column: ${migration.column}`);
        await pool.execute(alterSql);
      }
    }

    // Remove old columns that are no longer used
    const oldColumnsToRemove = ['model', 'api_type'];
    for (const column of oldColumnsToRemove) {
      if (existingColumns.includes(column)) {
        try {
          const dropSql = `ALTER TABLE api_usage DROP COLUMN ${column}`;
          console.log(`[Database Migration] Removing old column: ${column}`);
          await pool.execute(dropSql);
        } catch (err: any) {
          // If we can't drop the column, log but don't fail
          console.log(`[Database Migration] Could not drop column ${column}:`, err.message);
        }
      }
    }

    // Check and add indexes
    const [indexes] = await pool.execute('SHOW INDEX FROM api_usage');
    const existingIndexNames = (indexes as any[]).map((row) => row.Key_name);

    if (!existingIndexNames.includes('idx_image_model')) {
      console.log('[Database Migration] Adding index: idx_image_model');
      await pool.execute('ALTER TABLE api_usage ADD INDEX idx_image_model (image_model, image_resolution)');
    }

    if (!existingIndexNames.includes('idx_llm_model')) {
      console.log('[Database Migration] Adding index: idx_llm_model');
      await pool.execute('ALTER TABLE api_usage ADD INDEX idx_llm_model (llm_provider, llm_model)');
    }

    console.log('[Database Migration] api_usage table migration complete');
  } catch (error: any) {
    // If the error is about duplicate column/index, it's okay - just means it already exists
    if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_KEYNAME') {
      console.log('[Database Migration] Column or index already exists, skipping');
    } else {
      console.error('[Database Migration] Error:', error);
      // Don't throw - migration errors shouldn't prevent app startup
    }
  }
}

// Migration function to add is_favorite column to user_images table
async function migrateUserImagesTable() {
  const pool = getPool();

  try {
    // Check if user_images table exists
    const [tables] = await pool.execute('SHOW TABLES LIKE "user_images"');

    if ((tables as any[]).length === 0) {
      return;
    }

    // Get existing columns
    const [columns] = await pool.execute('DESCRIBE user_images');
    const existingColumns = (columns as any[]).map((row) => row.Field);
    console.log('[Database Migration] Existing user_images columns:', existingColumns);

    // Add is_favorite column if missing
    if (!existingColumns.includes('is_favorite')) {
      console.log('[Database Migration] Adding column: is_favorite to user_images');
      await pool.execute('ALTER TABLE user_images ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE AFTER file_size');
    }

    // Add idx_favorite index if missing
    const [indexes] = await pool.execute('SHOW INDEX FROM user_images');
    const existingIndexNames = (indexes as any[]).map((row) => row.Key_name);

    if (!existingIndexNames.includes('idx_favorite')) {
      console.log('[Database Migration] Adding index: idx_favorite');
      await pool.execute('ALTER TABLE user_images ADD INDEX idx_favorite (user_id, is_favorite)');
    }

    console.log('[Database Migration] user_images table migration complete');
  } catch (error: any) {
    if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_KEYNAME') {
      console.log('[Database Migration] Column or index already exists, skipping');
    } else {
      console.error('[Database Migration] Error:', error);
    }
  }
}

// Migration function to add role column to users table
async function migrateUsersTable() {
  const pool = getPool();

  try {
    // Get existing columns
    const [columns] = await pool.execute('DESCRIBE users');
    const existingColumns = (columns as any[]).map((row) => row.Field);
    console.log('[Database Migration] Existing users columns:', existingColumns);

    // Add role column if missing
    if (!existingColumns.includes('role')) {
      console.log('[Database Migration] Adding column: role to users');
      await pool.execute(
        'ALTER TABLE users ADD COLUMN role ENUM("user", "admin") DEFAULT "user" AFTER password_hash'
      );
    }

    // Add idx_role index if missing
    const [indexes] = await pool.execute('SHOW INDEX FROM users');
    const existingIndexNames = (indexes as any[]).map((row) => row.Key_name);

    if (!existingIndexNames.includes('idx_role')) {
      console.log('[Database Migration] Adding index: idx_role');
      await pool.execute('CREATE INDEX idx_role ON users(role)');
    }

    console.log('[Database Migration] users table migration complete');
  } catch (error: any) {
    if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_KEYNAME') {
      console.log('[Database Migration] Column or index already exists, skipping');
    } else {
      console.error('[Database Migration] Error:', error);
    }
  }
}

// Migration function to add original_cost and currency fields to api_usage table
async function migrateApiUsageCurrency() {
  const pool = getPool();

  try {
    // Check if api_usage table exists and get its structure
    const [rows] = await pool.execute('SHOW TABLES LIKE "api_usage"');

    if ((rows as any[]).length === 0) {
      return; // Table doesn't exist yet
    }

    // Get existing columns
    const [columns] = await pool.execute('DESCRIBE api_usage');
    const existingColumns = (columns as any[]).map((row) => row.Field);
    console.log('[Database Migration] Existing api_usage columns:', existingColumns);

    // Add original_cost column if missing
    if (!existingColumns.includes('original_cost')) {
      console.log('[Database Migration] Adding column: original_cost to api_usage');
      await pool.execute('ALTER TABLE api_usage ADD COLUMN original_cost DECIMAL(10, 4) DEFAULT NULL AFTER cost');
    }

    // Add currency column if missing
    if (!existingColumns.includes('currency')) {
      console.log('[Database Migration] Adding column: currency to api_usage');
      await pool.execute('ALTER TABLE api_usage ADD COLUMN currency VARCHAR(10) DEFAULT NULL AFTER original_cost');
    }

    // Add idx_currency index if missing
    const [indexes] = await pool.execute('SHOW INDEX FROM api_usage');
    const existingIndexNames = (indexes as any[]).map((row) => row.Key_name);

    if (!existingIndexNames.includes('idx_currency')) {
      console.log('[Database Migration] Adding index: idx_currency');
      await pool.execute('ALTER TABLE api_usage ADD INDEX idx_currency (currency)');
    }

    console.log('[Database Migration] api_usage currency migration complete');
  } catch (error: any) {
    if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_KEYNAME') {
      console.log('[Database Migration] Column or index already exists, skipping');
    } else {
      console.error('[Database Migration] Error:', error);
    }
  }
}
