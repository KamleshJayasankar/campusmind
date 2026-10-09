import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes";
import { documentsRouter } from "./modules/documents/documents.routes";
import { chatRouter } from "./modules/chat/chat.routes";
import { departmentsRouter } from "./modules/departments/departments.routes";

export const app = express();

app.use(cors());
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
