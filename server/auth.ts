import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ERPUser, PermissionKey } from '../src/types/erp.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'erp-users.json');

export const ALL_PERMISSIONS: PermissionKey[] = [
  'dashboard',
  'stock',
  'purchase',
  'sales',
  'account',
  'reports',
  'hr',
];

interface StoredUser extends ERPUser {
  passwordHash: string; // salt:scryptHash
}

// Session signing key from env or ephemeral in-memory random 32 bytes
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUsers(): StoredUser[] {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw) as StoredUser[];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function toPublicUser(u: StoredUser): ERPUser {
  return {
    id: u.id,
    userId: u.userId,
    fullName: u.fullName,
    role: u.role,
    permissions: u.permissions,
    active: u.active,
    createdAt: u.createdAt,
  };
}

export function isAdminSetupRequired(): boolean {
  const envPass = process.env.ADMIN_PASSCODE?.trim();
  if (envPass) return false;
  const users = loadUsers();
  const hasAdmin = users.some((u) => u.role === 'Admin' && u.passwordHash);
  return !hasAdmin;
}

export function claimInitialAdmin(input: {
  userId: string;
  fullName: string;
  password: string;
}): ERPUser {
  if (!isAdminSetupRequired()) {
    throw new Error('Admin account is already configured.');
  }
  const cleanUserId = input.userId.trim();
  if (!cleanUserId || input.password.length < 6) {
    throw new Error('User ID is required and password must be at least 6 characters.');
  }
  const users = loadUsers();
  if (users.some((u) => u.userId.toLowerCase() === cleanUserId.toLowerCase())) {
    throw new Error('User ID already exists.');
  }

  const admin: StoredUser = {
    id: `usr-${Date.now()}`,
    userId: cleanUserId,
    fullName: input.fullName.trim() || 'System Administrator',
    role: 'Admin',
    permissions: [...ALL_PERMISSIONS],
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
    passwordHash: hashPassword(input.password),
  };

  users.push(admin);
  saveUsers(users);
  return toPublicUser(admin);
}

export function authenticateUser(userId: string, password: string): ERPUser | null {
  const cleanId = userId.trim();
  if (!cleanId || !password) return null;

  const envPass = process.env.ADMIN_PASSCODE?.trim();
  const users = loadUsers();

  // Configured ADMIN_PASSCODE overrides any claimed admin fallback hash
  if (envPass && cleanId.toLowerCase() === 'admin') {
    if (!timingSafeCompareStrings(password, envPass)) return null;
    const existingAdmin = users.find((u) => u.userId.toLowerCase() === 'admin');
    if (existingAdmin) {
      return toPublicUser({ ...existingAdmin, role: 'Admin', permissions: [...ALL_PERMISSIONS], active: true });
    }
    return {
      id: 'usr-env-admin',
      userId: 'admin',
      fullName: 'System Administrator',
      role: 'Admin',
      permissions: [...ALL_PERMISSIONS],
      active: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };
  }

  const found = users.find((u) => u.userId.toLowerCase() === cleanId.toLowerCase());
  if (!found || !found.active) return null;
  if (!verifyPasswordHash(password, found.passwordHash)) return null;
  return toPublicUser(found);
}

export function listPublicUsers(): ERPUser[] {
  return loadUsers().map(toPublicUser);
}

export function createERPUser(input: {
  userId: string;
  fullName: string;
  password: string;
  role: 'Admin' | 'Staff';
  permissions: PermissionKey[];
}): ERPUser {
  const cleanId = input.userId.trim();
  if (!cleanId || cleanId.length < 3) {
    throw new Error('User ID must be at least 3 characters.');
  }
  if (!input.password || input.password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  const users = loadUsers();
  if (users.some((u) => u.userId.toLowerCase() === cleanId.toLowerCase())) {
    throw new Error(`User ID "${cleanId}" already exists.`);
  }

  const validPerms = (input.role === 'Admin' ? ALL_PERMISSIONS : input.permissions).filter((p) =>
    ALL_PERMISSIONS.includes(p)
  );

  const newUser: StoredUser = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    userId: cleanId,
    fullName: input.fullName.trim() || cleanId,
    role: input.role,
    permissions: validPerms,
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
    passwordHash: hashPassword(input.password),
  };

  users.push(newUser);
  saveUsers(users);
  return toPublicUser(newUser);
}

export function updateERPUser(
  id: string,
  patch: {
    fullName?: string;
    role?: 'Admin' | 'Staff';
    permissions?: PermissionKey[];
    active?: boolean;
    password?: string;
  }
): ERPUser {
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('User not found.');

  const current = users[idx];
  const nextRole = patch.role ?? current.role;
  const nextPerms =
    nextRole === 'Admin'
      ? [...ALL_PERMISSIONS]
      : (patch.permissions ?? current.permissions).filter((p) => ALL_PERMISSIONS.includes(p));

  const updated: StoredUser = {
    ...current,
    fullName: patch.fullName !== undefined ? patch.fullName.trim() : current.fullName,
    role: nextRole,
    permissions: nextPerms,
    active: patch.active !== undefined ? patch.active : current.active,
    passwordHash: patch.password && patch.password.length >= 6 ? hashPassword(patch.password) : current.passwordHash,
  };

  users[idx] = updated;
  saveUsers(users);
  return toPublicUser(updated);
}

export function issueSessionToken(user: ERPUser): string {
  const payload = {
    id: user.id,
    userId: user.userId,
    role: user.role,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): ERPUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    if (!timingSafeCompareStrings(sig, expectedSig)) return null;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      id: string;
      userId: string;
      role: 'Admin' | 'Staff';
      exp: number;
    };
    if (!payload.exp || payload.exp < Date.now()) return null;

    // Fetch live permissions & active state from disk (or env-admin)
    if (payload.id === 'usr-env-admin' && process.env.ADMIN_PASSCODE?.trim()) {
      return {
        id: 'usr-env-admin',
        userId: 'admin',
        fullName: 'System Administrator',
        role: 'Admin',
        permissions: [...ALL_PERMISSIONS],
        active: true,
        createdAt: new Date().toISOString().slice(0, 10),
      };
    }

    const users = loadUsers();
    const user = users.find((u) => u.id === payload.id);
    if (!user || !user.active) return null;
    return toPublicUser(user);
  } catch {
    return null;
  }
}
