/**
 * Initialize database and generate invite codes
 * This script creates the database, tables, and generates 500 invite codes
 *
 * Run: npx ts-node scripts/init-and-generate.ts
 */

import mysql from 'mysql2/promise';
import crypto from 'crypto';
import fs from 'fs/promises';

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

// Generate a random invite code
function generateInviteCode(): string {
  const bytes = crypto.randomBytes(8);
  return bytes.toString('hex').toUpperCase();
}

// Generate multiple unique codes
function generateUniqueCodes(count: number, existing: Set<string>): string[] {
  const codes: string[] = [];
  let attempts = 0;
  const maxAttempts = count * 10;

  while (codes.length < count && attempts < maxAttempts) {
    const code = generateInviteCode();
    if (!existing.has(code)) {
      codes.push(code);
      existing.add(code);
    }
    attempts++;
  }

  return codes;
}

async function main() {
  let connection: mysql.Connection | null = null;

  try {
    console.log('[Init] Connecting to MySQL...');

    // First connect without database to create it
    connection = await mysql.createConnection({
      ...dbConfig,
      database: undefined,
    });

    // Create database
    console.log('[Init] Creating database node_banana...');
    await connection.query(
      'CREATE DATABASE IF NOT EXISTS node_banana DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    // Close connection and reconnect to the new database
    await connection.end();
    connection = await mysql.createConnection({
      ...dbConfig,
      database: 'node_banana',
    });
    console.log('[Init] Database node_banana ready');

    // Create users table
    console.log('[Init] Creating users table...');
    await connection.execute(`
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
    console.log('[Init] Creating invite_codes table...');
    await connection.execute(`
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

    console.log('[Init] Tables created successfully');

    // Get existing codes
    const [existingCodes] = await connection.execute(
      'SELECT code FROM invite_codes'
    );
    const existingSet = new Set(
      (existingCodes as any[]).map(row => row.code)
    );
    console.log(`[Init] Found ${existingSet.size} existing codes`);

    // Generate 500 new codes
    const CODES_TO_GENERATE = 500;
    const newCodes = generateUniqueCodes(CODES_TO_GENERATE, existingSet);
    console.log(`[Init] Generated ${newCodes.length} new codes`);

    // Insert into database
    if (newCodes.length > 0) {
      const values = newCodes.map(code => [code]);
      await connection.query(
        'INSERT INTO invite_codes (code) VALUES ?',
        [values]
      );
      console.log(`[Init] Successfully inserted ${newCodes.length} codes`);
    }

    // Get total count
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM invite_codes'
    );
    const total = (countResult as any)[0].total;

    // Print first 10 codes as examples
    console.log('\n[Init] Sample codes (first 10):');
    newCodes.slice(0, 10).forEach(code => console.log(`  - ${code}`));

    // Save all NEW codes to a file for reference
    await fs.writeFile(
      './invite-codes.txt',
      newCodes.join('\n'),
      'utf-8'
    );
    console.log(`\n[Init] ${newCodes.length} NEW codes saved to ./invite-codes.txt`);

    console.log(`\n[Init] Total invite codes in database: ${total}`);
    console.log('[Init] Done!');

  } catch (error) {
    console.error('[Init] Error:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
