import { NextFunction, Request, Response } from "express";
import { JsonStore } from "./db";
import { verifyToken } from "./security";
import { AuthUser, Role } from "./types";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function rateLimit(windowMs = 60_000, max = 120) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ message: "Too many requests. Please slow down." });
    }
    return next();
  };
}

export function requireAuth(secret: string, store: JsonStore, roles?: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const user = token ? verifyToken(token, secret) : null;
    if (!user || !store.read().users.some((candidate) => candidate.id === user.id)) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (roles && !roles.includes(user.role)) {
      return res.status(403).json({ message: "You are not allowed to perform this action" });
    }
    req.user = user;
    return next();
  };
}
