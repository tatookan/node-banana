-- Database Migration Script for Admin Role Feature
-- This script adds the 'role' column to the users table
-- Run this on your production database before deploying the code

-- Add role column to users table
ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') DEFAULT 'user' AFTER password_hash;

-- Add index for role queries
CREATE INDEX idx_role ON users(role);

-- Verify the migration
SELECT id, username, email, role FROM users LIMIT 5;
