import { Bot } from "grammy";

import { GlobalOutagesService } from "../../packages/application/global-outages-service";
import { WorkerService } from "../../packages/application/worker-service";
import { EnaElectricityProvider } from "../../packages/providers/ena/provider";
import { env } from "../../packages/shared/env";

async function main() {
  if (!env.TELEGRAM_TOKEN) {
    throw new Error('"TELEGRAM_TOKEN" env var is required to run the worker notification pipeline.');
  }

  const bot = new Bot(env.TELEGRAM_TOKEN);
  const outagesService = new GlobalOutagesService();
  const provider = new EnaElectricityProvider();
  const worker = new WorkerService(outagesService, provider, async (chatId, message) => {
    await bot.api.sendMessage(chatId, message, {
      parse_mode: "Markdown",
    });
  });

  await worker.runStartupSync();
  worker.scheduleRecurringWork();

  console.log("Global Outages worker started.");
}

void main();
