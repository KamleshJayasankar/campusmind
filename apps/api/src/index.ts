import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes";

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  throw new Error("JWT_SECRET and DATABASE_URL must be set in apps/api/.env");
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
