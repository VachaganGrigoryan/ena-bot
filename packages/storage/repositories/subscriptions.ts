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
    const provider = await db.query.providers.findFirst({
      where: and(eq(providers.key, input.providerKey), eq(providers.utilityType, input.utilityType)),
    });

    if (!provider) {
      throw new Error(`Provider ${input.providerKey}/${input.utilityType} not found.`);
    }

    const [created] = await db
      .insert(subscriptions)
      .values({
        userId: input.userId,
        providerId: provider.id,
        providerKey: input.providerKey,
        utilityType: input.utilityType,
        queryText: input.queryText,
        normalizedQueryText: normalizeSearchText(input.queryText),
        matchMode: input.matchMode ?? "contains",
      })
      .returning();

    return created;
  }

  async updateQuery(subscriptionId: number, queryText: string) {
    const [updated] = await db
      .update(subscriptions)
      .set({
        queryText,
        normalizedQueryText: normalizeSearchText(queryText),
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
}
