import { Doc } from '../storage/storage.types';

export type Role = 'customer' | 'staff' | 'admin';

export interface Customer extends Doc {
  email: string; // always lower-case
  name?: string;
  phone?: string;
  role: Role;
  authProvider: 'email' | 'google';
  passwordHash?: string;
  /** Guests are created at checkout (no password). They can claim the account by registering. */
  isGuest: boolean;
  resetTokenHash?: string;
  resetExpiresAt?: string;
  /** True once the person has proved they control the mailbox (link, Google, or password reset). */
  emailVerified?: boolean;
  verifyTokenHash?: string;
  verifyExpiresAt?: string;
  /** Set when the person deleted their account; the record stays only so old orders keep a valid owner. */
  deletedAt?: string;
}

/** What the API may return about a customer. Never include hashes or reset tokens. */
export function publicCustomer(c: Customer) {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    role: c.role,
    authProvider: c.authProvider,
    emailVerified: !!c.emailVerified,
  };
}

export interface AuthUser {
  id: string;
  role: Role;
}
