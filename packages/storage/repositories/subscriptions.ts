import { and, eq, sql } from "drizzle-orm";

import { MatchMode, ProviderKey, UtilityType } from "../../domain/types";
import { db } from "../db/client";
import { providers, subscriptions, users } from "../db/schema";
import { normalizeSearchText } from "../../providers/ena/parser";

export class SubscriptionsRepository {
  async listByChatId(chatId: string) {
    return db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        chatId: users.chatId,
        providerKey: subscriptions.providerKey,
        utilityType: subscriptions.utilityType,
        queryText: subscriptions.queryText,
        matchMode: subscriptions.matchMode,
        isPaused: subscriptions.isPaused,
      })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .where(eq(users.chatId, chatId));
  }

  async create(input: {
    userId: number;
    providerKey: ProviderKey;
    utilityType: UtilityType;
    queryText: string;
    matchMode?: MatchMode;
  }) {
    const provider = await this.ensureProvider(input.providerKey, input.utilityType);
    const queryText = cleanQueryText(input.queryText);

    const [created] = await db
      .insert(subscriptions)
      .values({
        userId: input.userId,
        providerId: provider.id,
        providerKey: input.providerKey,
        utilityType: input.utilityType,
        queryText,
        normalizedQueryText: normalizeSearchText(queryText),
        matchMode: input.matchMode ?? "contains",
      })
      .returning();

    return created;
  }

  async updateQuery(subscriptionId: number, queryText: string) {
    const cleanQuery = cleanQueryText(queryText);
    const [updated] = await db
      .update(subscriptions)
      .set({
        queryText: cleanQuery,
        normalizedQueryText: normalizeSearchText(cleanQuery),
        updatedAt: sql`now()`,
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return updated;
  }

  async togglePaused(subscriptionId: number) {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
    });

    if (!subscription) {
      throw new Error("Subscription not found.");
    }

    const [updated] = await db
      .update(subscriptions)
      .set({
        isPaused: !subscription.isPaused,
        updatedAt: sql`now()`,
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return updated;
  }

  async delete(subscriptionId: number) {
    const [deleted] = await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId)).returning();
    return deleted;
  }

  async listActive() {
    return db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        chatId: users.chatId,
        providerKey: subscriptions.providerKey,
        utilityType: subscriptions.utilityType,
        queryText: subscriptions.queryText,
        matchMode: subscriptions.matchMode,
        isPaused: subscriptions.isPaused,
      })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .where(eq(subscriptions.isPaused, false));
  }

  private async ensureProvider(providerKey: ProviderKey, utilityType: UtilityType) {
    const existing = await db.query.providers.findFirst({
      where: and(eq(providers.key, providerKey), eq(providers.utilityType, utilityType)),
    });

    if (existing) {
      return existing;
    }

    const [created] = await db
      .insert(providers)
      .values({
        key: providerKey,
        utilityType,
        name: providerKey.toUpperCase(),
      })
      .onConflictDoNothing({
        target: [providers.key, providers.utilityType],
      })
      .returning();

    if (created) {
      return created;
    }

    const provider = await db.query.providers.findFirst({
      where: and(eq(providers.key, providerKey), eq(providers.utilityType, utilityType)),
    });

    if (!provider) {
      throw new Error(`Provider ${providerKey}/${utilityType} could not be created.`);
    }

    return provider;
  }
}

function cleanQueryText(queryText: string) {
  const cleanQuery = queryText.replace(/\s+/g, " ").trim();
  if (!cleanQuery) {
    throw new Error("Subscription query text is required.");
  }

  return cleanQuery;
}
