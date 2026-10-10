import "dotenv/config";
import { app } from "./app";

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  throw new Error("JWT_SECRET and DATABASE_URL must be set");
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API running on port ${port}`));

// On free hosting there is no separate worker service, so the same process can run it.
if (process.env.RUN_WORKER === "true") {
  require("./worker");
}
