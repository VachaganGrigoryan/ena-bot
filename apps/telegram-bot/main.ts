import { createTelegramBot } from "../../packages/telegram-ui/bot";
import { GlobalOutagesService } from "../../packages/application/global-outages-service";

async function main() {
  const outagesService = new GlobalOutagesService();
  const bot = createTelegramBot(outagesService);

  console.log("Global Outages Telegram bot started with long polling.");
  await bot.start();
}

void main();
