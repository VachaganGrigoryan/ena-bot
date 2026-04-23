import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config();

if (!process.env.DATABASE_URL) {
  throw new Error('"DATABASE_URL" env var is required for Drizzle.');
}

export default defineConfig({
  schema: "./packages/storage/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
