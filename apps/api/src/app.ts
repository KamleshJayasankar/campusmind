import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes";
import { documentsRouter } from "./modules/documents/documents.routes";
import { chatRouter } from "./modules/chat/chat.routes";
import { departmentsRouter } from "./modules/departments/departments.routes";

export const app = express();

// Behind a hosting proxy (Render, Vercel...) the real client IP arrives in X-Forwarded-For.
// Without this, every user would share the proxy's IP and the login rate limit.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) : true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/documents", documentsRouter);
app.use("/chat", chatRouter);
app.use("/departments", departmentsRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
