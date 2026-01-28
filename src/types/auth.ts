/**
 * Authentication and Authorization Types
 */

export type UserRole = 'user' | 'admin';

export interface DbUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  created_at: string;
  last_login: string | null;
}

export interface TokenPayload {
  userId: number;
  username: string;
  email: string;
  role: UserRole;
}
