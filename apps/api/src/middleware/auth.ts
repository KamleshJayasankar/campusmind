import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type Role = "student" | "faculty" | "admin";

export type AuthUser = {
  id: string;
  role: Role;
  departmentId: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AuthUser;
    req.user = { id: payload.id, role: payload.role, departmentId: payload.departmentId };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
