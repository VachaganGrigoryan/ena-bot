import { Markup, Scenes, session, Telegraf } from "telegraf";
import * as dotenv from "dotenv";
import { createUser, getUserByChatId } from "./services/userService";
import {
  createSchedule,
  getSchedulesByChatId,
} from "./services/scheduleService";
import {
  ARMENIAN_REGIONS,
  FOLLOW_PROMPT_TEXT,
  INCORRECT_COMMAND_TEXT,
  INFO_TEXT,
  POWER_OUTAGES_TEXT,
} from "./constants";
import { getOutageByRegion } from "./services/outageService";
import { formatOutagesForTelegram } from "./helper";
import { ENAFetcherAI } from "./ena/ai.fetcher";

dotenv.config();

// Handler factories
const { enter, leave } = Scenes.Stage;

// Greeter scene
const followScene = new Scenes.BaseScene<Scenes.SceneContext>("follow");
followScene.enter(async (ctx) => {
  const chatId = ctx.chat?.id.toString();
  const userSchedules = await getSchedulesByChatId(chatId!);

  if (userSchedules.length > 0) {
    await ctx.reply(
      `Դուք արդեն հետևում եք։ \`${userSchedules?.map((us) => us.address)}\``,
      Markup.keyboard([
        ["🗺 Իմ Հասցեներ"],
        ["✎ Խմբագրել", "␡ Ջնջել"],
        ["🔍 Էլ․ խափանումներ"],
        ["🔙 Հետ"],
      ])
        .placeholder("Նոր հասցե ․․․")
        .resize(),
    );
  } else {
    await ctx.reply(FOLLOW_PROMPT_TEXT, { parse_mode: "Markdown" });
  }
});
followScene.leave(async (ctx) => {
  // await ctx.reply(FOLLOW_EXIT_TEXT);
  return await goToMenu(ctx);
});

followScene.hears("🔍 Էլ․ խափանումներ", enter<Scenes.SceneContext>("outages"));
followScene.hears("🔙 Հետ", leave<Scenes.SceneContext>());

followScene.hears("🗺 Իմ Հասցեներ", async (ctx) => {
  const chatId = ctx.chat?.id.toString();
  const userSchedules = await getSchedulesByChatId(chatId!);

  if (userSchedules.length > 0) {
    await ctx.reply(
      `Դուք արդեն հետևում եք։ \`${userSchedules?.map((us) => us.address)}\``,
    );
  } else {
    await ctx.reply("Դուք չունեք ընտրված հասցե(ներ)․", {
      parse_mode: "Markdown",
    });
  }
});

followScene.on("message", async (ctx) => {
  const chatId = ctx.message?.chat.id.toString();

  // @ts-ignore
  const address = ctx.update.message!.text.trim() || "";

  if (!address) {
    ctx.reply("Խնդրում ենք մուտքագրել ճիշտ ձևաչափով․․․");
    return;
  }

  const user = await getUserByChatId(chatId!);

  if (!user) {
    ctx.reply("Անհայտ սխալ!");
    return;
  }

  try {
    await createSchedule(user.id, address);
    await ctx.reply(
      `Դուք հետևում եք \`${address}\` հասցե (ին/ներին), այն կարղեք \`փոխել/ջնջել\` ցանկացած պահի։`,
      { parse_mode: "Markdown" },
    );
  } catch (error) {
    await ctx.reply("Խնդրում ենք մուտքագրել ճիշտ ձևաչափով․․․");
    return;
  }
});

// Echo scene
const outagesScene = new Scenes.BaseScene<Scenes.SceneContext>("outages");
outagesScene.enter((ctx) =>
  ctx.reply(
    POWER_OUTAGES_TEXT,
    Markup.keyboard([...ARMENIAN_REGIONS, "🔙 Հետ"], {
      wrap: (btn, index, currentRow) => {
        return currentRow.length >= (index + 2) / 3;
      },
    })
      .placeholder("Նոր հասցե ․․․")
      .resize(),
  ),
);
outagesScene.leave(async (ctx) => {
  // await ctx.reply("");
  return await goToMenu(ctx);
});
outagesScene.hears("🔙 Հետ", leave<Scenes.SceneContext>());
outagesScene.on("text", async (ctx) => {
  const outages = await getOutageByRegion(ctx.message.text);

  console.log(outages);

  if (outages && outages.length > 0) {
    const formattedOutages = formatOutagesForTelegram(outages);
    for (const outage of formattedOutages) {
      await ctx.reply(outage, { parse_mode: "Markdown" });
    }
  } else {
    await ctx.reply("Որևէ արդյունք չի գտնվել։");
  }
  return await goToMenu(ctx);
});

if (!process.env.TELEGRAM_TOKEN)
  throw new Error('"TELEGRAM_TOKEN" env var is required!');
const bot = new Telegraf<Scenes.SceneContext>(process.env.TELEGRAM_TOKEN!);

bot.use(Telegraf.log());

const stage = new Scenes.Stage<Scenes.SceneContext>(
  [followScene, outagesScene],
  {
    ttl: 10,
  },
);
bot.use(session());
bot.use(stage.middleware());

// Function to go back to the main menu
async function goToMenu(ctx: any) {
  return await ctx.reply(
    "Ընտրեք հրամանը:",
    Markup.keyboard([
      ["🔍 Էլ․ խափանումներ"], // Row1 with 2 buttons
      ["📢 Հետևել", "☸ Կարգավորումներ"], // Row2 with 2 buttons
      ["⭐️ Տեղեկություն"], // Row3 with 3 buttons
    ])
      .oneTime()
      .resize(),
  );
}

// Start command
bot.start(async (ctx) => {
  // @ts-ignore
  // ctx.session.state = MENU;

  const { chat, from } = ctx.message!;
  const chatId = chat.id.toString();
  const username = from.username;

  let user = await getUserByChatId(chatId!);

  if (!user) {
    user = await createUser(chatId!, username!);
  }

  return await goToMenu(ctx);
});

// Handle the 'power_outages' callback and transition to OUTAGES state
bot.hears("🔍 Էլ․ խափանումներ", (ctx) => ctx.scene.enter("outages"));

// Follow command
bot.hears("📢 Հետևել", (ctx) => ctx.scene.enter("follow"));

// Edit and delete follow actions
// bot.action('follow_edit', async (ctx) => {
//     await ctx.reply(FOLLOW_EDIT_TEXT, { parse_mode: 'Markdown' });
//     // return goToMenu(ctx)
// });

// bot.action('follow_delete', async (ctx) => {
//     const chatId = ctx.message!.chat.id;
//     deleteUserSchedule(chatId.toString());
//
//     await ctx.reply("Հաջողությամբ ջնջվել է։", { parse_mode: 'Markdown' });
//     return Menu;
// });

// Info command
bot.hears("⭐️ Տեղեկություն", async (ctx) => {
  await ctx.reply(INFO_TEXT, { parse_mode: "Markdown" });
});

// Incorrect command handler
bot.on("callback_query", async (ctx) => {
  const command = (ctx.callbackQuery as any).data;

  if (command === "incorrect") {
    await ctx.reply(INCORRECT_COMMAND_TEXT, { parse_mode: "Markdown" });
  }
});

bot.on("message", (ctx) => ctx.reply("Փորձեք /start կամ /follow"));

bot
  .launch(() => {
    console.log("Telegram bot started");
    // Initialize the fetcher
    const enaFetcher = new ENAFetcherAI();
    // enaFetcher.refreshData();
  })
  .then(() => {
    console.log("Telegram bot closed");
  });

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
