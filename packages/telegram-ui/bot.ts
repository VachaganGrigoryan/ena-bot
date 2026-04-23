import {
  conversations,
  createConversation,
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import { Bot, Context, Keyboard, session, SessionFlavor } from "grammy";

import { GlobalOutagesService } from "../application/global-outages-service";
import { env } from "../shared/env";
import {
  escapeTelegramMarkdown,
  FIND_PROMPT_TEXT,
  INFO_TEXT,
  MAIN_MENU_LABELS,
  NO_RESULTS_TEXT,
  SUBSCRIPTION_PROMPT_TEXT,
} from "../shared/text";

type SessionData = Record<string, never>;
type BaseContext = Context & SessionFlavor<SessionData>;
type AppContext = ConversationFlavor<BaseContext>;
type AppConversation = Conversation<AppContext, AppContext>;

function buildMainKeyboard() {
  return new Keyboard()
    .text(MAIN_MENU_LABELS.find)
    .row()
    .text(MAIN_MENU_LABELS.subscriptions)
    .text(MAIN_MENU_LABELS.add)
    .row()
    .text(MAIN_MENU_LABELS.edit)
    .text(MAIN_MENU_LABELS.delete)
    .row()
    .text(MAIN_MENU_LABELS.pause)
    .text(MAIN_MENU_LABELS.info)
    .resized();
}

function buildBackKeyboard() {
  return new Keyboard().text(MAIN_MENU_LABELS.cancel).resized();
}

function normalizeFollowQuery(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getUpdateType(ctx: Context) {
  return Object.keys(ctx.update).find((key) => key !== "update_id") ?? "unknown";
}

function getRequestPath(ctx: Context) {
  const text = ctx.message?.text?.trim();
  if (text) {
    if (text.startsWith("/")) {
      return text.split(/\s+/)[0] ?? "/unknown";
    }

    const menuActionMap: Record<string, string> = {
      [MAIN_MENU_LABELS.find]: "/menu/find",
      [MAIN_MENU_LABELS.subscriptions]: "/menu/subscriptions",
      [MAIN_MENU_LABELS.add]: "/menu/subscriptions/add",
      [MAIN_MENU_LABELS.edit]: "/menu/subscriptions/edit",
      [MAIN_MENU_LABELS.delete]: "/menu/subscriptions/delete",
      [MAIN_MENU_LABELS.pause]: "/menu/subscriptions/toggle",
      [MAIN_MENU_LABELS.info]: "/menu/info",
      [MAIN_MENU_LABELS.cancel]: "/menu/cancel",
    };

    return menuActionMap[text] ?? "/message";
  }

  const callbackData = ctx.callbackQuery?.data;
  if (callbackData) {
    return `/callback/${callbackData}`;
  }

  return `/${getUpdateType(ctx)}`;
}

function formatActor(ctx: Context) {
  const username = ctx.from?.username ? `@${ctx.from.username}` : "-";
  const firstName = ctx.from?.first_name ?? "-";
  const chatId = ctx.chat?.id?.toString() ?? "-";
  const userId = ctx.from?.id?.toString() ?? "-";

  return `user=${username} first_name="${firstName}" user_id=${userId} chat_id=${chatId}`;
}

function formatTelegramRequestLog(ctx: Context) {
  return `update_id=${ctx.update.update_id} path=${getRequestPath(ctx)} update_type=${getUpdateType(ctx)} ${formatActor(ctx)}`;
}

export function createTelegramBot(globalOutagesService: GlobalOutagesService) {
  if (!env.TELEGRAM_TOKEN) {
    throw new Error('"TELEGRAM_TOKEN" env var is required to run the Telegram bot.');
  }

  const bot = new Bot<AppContext>(env.TELEGRAM_TOKEN);
  bot.use(async (ctx, next) => {
    const startedAt = Date.now();
    const requestLog = formatTelegramRequestLog(ctx);

    console.info(`[telegram.request] ${requestLog}`);

    try {
      await next();
      console.info(`[telegram.response] ${requestLog} status=ok duration_ms=${Date.now() - startedAt}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[telegram.response] ${requestLog} status=error duration_ms=${Date.now() - startedAt} message="${message}"`,
      );
      throw error;
    }
  });

  const searchConversation = async (conversation: AppConversation, ctx: AppContext) => {
    await ctx.reply(FIND_PROMPT_TEXT, {
      parse_mode: "Markdown",
      reply_markup: buildBackKeyboard(),
    });

    const next = await conversation.waitFor("message:text");
    if (next.message.text === MAIN_MENU_LABELS.cancel) {
      await next.reply("Վերադարձանք հիմնական մենյու։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const messages = await globalOutagesService.searchMessages({
      providerKey: "ena",
      utilityType: "electricity",
      text: next.message.text,
    });

    if (messages.length === 0) {
      await next.reply(NO_RESULTS_TEXT, {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    for (const message of messages) {
      await next.reply(message, { parse_mode: "Markdown" });
    }

    await next.reply("Ընտրեք հաջորդ գործողությունը։", {
      reply_markup: buildMainKeyboard(),
    });
  };

  const addSubscriptionConversation = async (conversation: AppConversation, ctx: AppContext) => {
    await ctx.reply(SUBSCRIPTION_PROMPT_TEXT, {
      reply_markup: buildBackKeyboard(),
    });

    const next = await conversation.waitFor("message:text");
    if (next.message.text === MAIN_MENU_LABELS.cancel) {
      await next.reply("Վերադարձանք հիմնական մենյու։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const queryText = normalizeFollowQuery(next.message.text);
    if (!queryText) {
      await next.reply("Խնդրում եմ ուղարկել հասցե կամ մարզ։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const chatId = next.chat.id.toString();
    await globalOutagesService.addSubscription(chatId, next.from?.username, {
      providerKey: "ena",
      utilityType: "electricity",
      queryText,
      matchMode: "contains",
    });

    await next.reply(`Հետևումը պահպանվեց․ ${escapeTelegramMarkdown(queryText)}`, {
      parse_mode: "Markdown",
      reply_markup: buildMainKeyboard(),
    });
  };

  const editSubscriptionConversation = async (conversation: AppConversation, ctx: AppContext) => {
    const chatId = ctx.chat?.id?.toString();

    if (!chatId) {
      return;
    }

    const subscriptions = await globalOutagesService.listSubscriptions(chatId);
    if (subscriptions.length === 0) {
      await ctx.reply("Դուք դեռ չունեք հետևումներ։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    await ctx.reply(
      subscriptions.map((subscription) => `${subscription.id}. ${subscription.queryText}`).join("\n"),
      { reply_markup: buildBackKeyboard() },
    );
    await ctx.reply("Մուտքագրեք խմբագրման համար `id: նոր հարցում` ձևաչափով։", {
      parse_mode: "Markdown",
    });

    const next = await conversation.waitFor("message:text");
    if (next.message.text === MAIN_MENU_LABELS.cancel) {
      await next.reply("Վերադարձանք հիմնական մենյու։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const [idPart, ...queryParts] = next.message.text.split(":");
    const subscriptionId = Number.parseInt(idPart.trim(), 10);
    const queryText = normalizeFollowQuery(queryParts.join(":"));
    const target = subscriptions.find((subscription) => subscription.id === subscriptionId);

    if (!target || !queryText) {
      await next.reply("Սխալ ձևաչափ է կամ id-ը ձեր ցուցակում չկա։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    await globalOutagesService.updateSubscription(subscriptionId, queryText);
    await next.reply("Հետևումը թարմացվեց։", {
      reply_markup: buildMainKeyboard(),
    });
  };

  const deleteSubscriptionConversation = async (conversation: AppConversation, ctx: AppContext) => {
    const chatId = ctx.chat?.id?.toString();

    if (!chatId) {
      return;
    }

    const subscriptions = await globalOutagesService.listSubscriptions(chatId);
    if (subscriptions.length === 0) {
      await ctx.reply("Դուք դեռ չունեք հետևումներ։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    await ctx.reply(subscriptions.map((subscription) => `${subscription.id}. ${subscription.queryText}`).join("\n"), {
      reply_markup: buildBackKeyboard(),
    });
    await ctx.reply("Մուտքագրեք ջնջվող հետևման id-ը։");

    const next = await conversation.waitFor("message:text");
    if (next.message.text === MAIN_MENU_LABELS.cancel) {
      await next.reply("Վերադարձանք հիմնական մենյու։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const subscriptionId = Number.parseInt(next.message.text.trim(), 10);
    const target = subscriptions.find((subscription) => subscription.id === subscriptionId);
    if (!target) {
      await next.reply("Խնդրում եմ ուղարկել ձեր ցուցակի ճիշտ id։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    await globalOutagesService.deleteSubscription(subscriptionId);
    await next.reply("Հետևումը ջնջվեց։", {
      reply_markup: buildMainKeyboard(),
    });
  };

  const toggleSubscriptionConversation = async (conversation: AppConversation, ctx: AppContext) => {
    const chatId = ctx.chat?.id?.toString();

    if (!chatId) {
      return;
    }

    const subscriptions = await globalOutagesService.listSubscriptions(chatId);
    if (subscriptions.length === 0) {
      await ctx.reply("Դուք դեռ չունեք հետևումներ։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    await ctx.reply(
      subscriptions
        .map((subscription) => `${subscription.id}. ${subscription.queryText} (${subscription.isPaused ? "կասեցված" : "ակտիվ"})`)
        .join("\n"),
      { reply_markup: buildBackKeyboard() },
    );
    await ctx.reply("Մուտքագրեք id-ը՝ կասեցնելու կամ վերսկսելու համար։");

    const next = await conversation.waitFor("message:text");
    if (next.message.text === MAIN_MENU_LABELS.cancel) {
      await next.reply("Վերադարձանք հիմնական մենյու։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const subscriptionId = Number.parseInt(next.message.text.trim(), 10);
    const target = subscriptions.find((subscription) => subscription.id === subscriptionId);
    if (!target) {
      await next.reply("Խնդրում եմ ուղարկել ձեր ցուցակի ճիշտ id։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const updated = await globalOutagesService.toggleSubscription(subscriptionId);
    await next.reply(updated.isPaused ? "Հետևումը կասեցվեց։" : "Հետևումը վերսկսվեց։", {
      reply_markup: buildMainKeyboard(),
    });
  };

  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());
  bot.use(createConversation(searchConversation, "searchConversation"));
  bot.use(createConversation(addSubscriptionConversation, "addSubscriptionConversation"));
  bot.use(createConversation(editSubscriptionConversation, "editSubscriptionConversation"));
  bot.use(createConversation(deleteSubscriptionConversation, "deleteSubscriptionConversation"));
  bot.use(createConversation(toggleSubscriptionConversation, "toggleSubscriptionConversation"));

  bot.command("start", async (ctx) => {
    await globalOutagesService.ensureUser(ctx.chat.id.toString(), ctx.from?.username);
    await ctx.reply("Ընտրեք հրամանը:", {
      reply_markup: buildMainKeyboard(),
    });
  });

  bot.hears(MAIN_MENU_LABELS.find, (ctx) => ctx.conversation.enter("searchConversation"));
  bot.hears(MAIN_MENU_LABELS.add, (ctx) => ctx.conversation.enter("addSubscriptionConversation"));
  bot.hears(MAIN_MENU_LABELS.edit, (ctx) => ctx.conversation.enter("editSubscriptionConversation"));
  bot.hears(MAIN_MENU_LABELS.delete, (ctx) => ctx.conversation.enter("deleteSubscriptionConversation"));
  bot.hears(MAIN_MENU_LABELS.pause, (ctx) => ctx.conversation.enter("toggleSubscriptionConversation"));

  bot.hears(MAIN_MENU_LABELS.subscriptions, async (ctx) => {
    const subscriptions = await globalOutagesService.listSubscriptions(ctx.chat.id.toString());
    if (subscriptions.length === 0) {
      await ctx.reply("Դուք դեռ չունեք հետևումներ։", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    await ctx.reply(
      subscriptions
        .map((subscription) => `${subscription.id}. ${subscription.queryText} (${subscription.isPaused ? "կասեցված" : "ակտիվ"})`)
        .join("\n"),
      { reply_markup: buildMainKeyboard() },
    );
  });

  bot.hears(MAIN_MENU_LABELS.info, async (ctx) => {
    await ctx.reply(INFO_TEXT, {
      parse_mode: "Markdown",
      reply_markup: buildMainKeyboard(),
    });
  });

  bot.on("message:text", async (ctx) => {
    await ctx.reply("Ընտրեք հրամանը հիմնական մենյուից կամ գրեք /start։", {
      reply_markup: buildMainKeyboard(),
    });
  });

  bot.catch((error) => {
    const cause = error.error;
    const message = cause instanceof Error ? cause.stack ?? cause.message : String(cause);
    console.error(`[telegram.catch] ${formatTelegramRequestLog(error.ctx)} message="${message}"`);
  });

  return bot;
}
