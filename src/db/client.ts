import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("Missing DATABASE_URL in the environment");
}

export const db = new Pool({
  connectionString,
});

db.on("error", (error) => {
  console.error("Unexpected database pool error", error);
});
