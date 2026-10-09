import { NextFunction, Request, Response } from "express";
import { redis } from "../cache";

type Options = { name: string; limit: number; windowSeconds: number };

export function rateLimit({ name, limit, windowSeconds }: Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = req.user?.id ?? req.ip ?? "unknown";
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:${name}:${id}:${bucket}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      if (count > limit) {
        res.setHeader("Retry-After", String(windowSeconds));
        return res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
      }
    } catch (err) {
      console.error("Rate limiter unavailable, allowing request:", err);
    }
    next();
  };
}
