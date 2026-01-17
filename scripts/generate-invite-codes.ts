/**
 * Invite Code Generator
 * Generates 500 random invite codes and inserts them into the database
 *
 * Run: npx ts-node scripts/generate-invite-codes.ts
 */

import mysql from 'mysql2/promise';
import crypto from 'crypto';

// Database configuration - should match your environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'node_banana',
};

// Generate a random invite code
function generateInviteCode(): string {
  const bytes = crypto.randomBytes(8); // 16 hex characters
  return bytes.toString('hex').toUpperCase();
}

// Generate multiple unique codes
function generateUniqueCodes(count: number, existing: Set<string>): string[] {
  const codes: string[] = [];
  let attempts = 0;
  const maxAttempts = count * 10; // Prevent infinite loop

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
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('[InviteCodeGen] Connected to database');

    // Get existing codes
    const [existingCodes] = await connection.execute(
      'SELECT code FROM invite_codes'
    );
    const existingSet = new Set(
      (existingCodes as any[]).map(row => row.code)
    );
    console.log(`[InviteCodeGen] Found ${existingSet.size} existing codes`);

    // Generate 500 new codes
    const CODES_TO_GENERATE = 500;
    const newCodes = generateUniqueCodes(CODES_TO_GENERATE, existingSet);
    console.log(`[InviteCodeGen] Generated ${newCodes.length} new codes`);

    // Insert into database
    if (newCodes.length > 0) {
      const values = newCodes.map(code => [code]);
      await connection.query(
        'INSERT INTO invite_codes (code) VALUES ?',
        [values]
      );
      console.log(`[InviteCodeGen] Successfully inserted ${newCodes.length} codes`);
    }

    // Print first 10 codes as examples
    console.log('\n[InviteCodeGen] Sample codes (first 10):');
    newCodes.slice(0, 10).forEach(code => console.log(`  - ${code}`));

    // Save all codes to a file for reference
    const fs = await import('fs/promises');
    await fs.writeFile(
      './invite-codes.txt',
      newCodes.join('\n'),
      'utf-8'
    );
    console.log(`\n[InviteCodeGen] All codes saved to ./invite-codes.txt`);

  } finally {
    await connection.end();
  }
}

main().catch(console.error);
