-- Set Admin User Script
-- Usage: Replace 'your_admin_username' with the actual username you want to make admin
-- Then run: mysql -u root -p node_banana < scripts/set-admin.sql

-- Replace 'your_admin_username' with the actual username
UPDATE users SET role = 'admin' WHERE username = 'your_admin_username';

-- Verify the change
SELECT id, username, email, role, created_at FROM users WHERE role = 'admin';
