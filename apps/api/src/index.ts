import "dotenv/config";
import { app } from "./app";

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  throw new Error("JWT_SECRET and DATABASE_URL must be set in apps/api/.env");
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
