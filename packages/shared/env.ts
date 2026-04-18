import { config } from "dotenv";

config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`"${name}" env var is required.`);
  }
  return value;
}

export const env = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  DATABASE_URL: requireEnv("DATABASE_URL"),
  ENA_BASE_URL: process.env.ENA_BASE_URL ?? "https://www.ena.am",
  ENA_OUTAGES_PATH: process.env.ENA_OUTAGES_PATH ?? "/Info.aspx?id=5",
  WORKER_SYNC_CRON: process.env.WORKER_SYNC_CRON ?? "0 10,15,20 * * *",
  WORKER_NOTIFY_CRON: process.env.WORKER_NOTIFY_CRON ?? "*/15 * * * *",
  TELEGRAM_DEFAULT_LOCALE: process.env.TELEGRAM_DEFAULT_LOCALE ?? "hy-AM",
  USE_OLLAMA_ADDRESS_FORMATTER: process.env.USE_OLLAMA_ADDRESS_FORMATTER === "true",
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
};
