import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { storage, type User } from "./storage";

const SESSION_COOKIE = "tp_session";

type Session = {
  userId: string;
  expiresAt: number;
};

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, 64)
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

export function getSession(token: string | undefined): Session | undefined {
  if (!token) return undefined;
  const s = sessions.get(token);
  if (!s) return undefined;
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return s;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionToken(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}

export interface AuthRequest extends Request {
  user?: User;
}

export async function attachUser(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getSessionToken(req);
  const session = getSession(token);
  if (session) {
    const user = await storage.findUserById(session.userId);
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(role?: "seller" | "buyer" | "admin") {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (role && req.user.role !== role) {
      res.status(403).json({ error: `Requires ${role} role` });
      return;
    }
    next();
  };
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    company: user.company,
    description: user.description,
  };
}
