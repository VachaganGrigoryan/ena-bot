import { eq, sql } from "drizzle-orm";

import { ProviderKey, SyncRunStatus, UtilityType } from "../../domain/types";
import { db } from "../db/client";
import { providers, syncRuns } from "../db/schema";

export class SyncRunsRepository {
  async start(providerId: number, providerKey: ProviderKey, utilityType: UtilityType) {
    const [created] = await db
      .insert(syncRuns)
      .values({
        providerId,
        providerKey,
        utilityType,
        status: "started",
      })
      .returning();

    return created;
  }

  async finish(syncRunId: number, status: SyncRunStatus, message?: string) {
    const [updated] = await db
      .update(syncRuns)
      .set({
        status,
        message,
        finishedAt: sql`now()`,
      })
      .where(eq(syncRuns.id, syncRunId))
      .returning();

    return updated;
  }

  async ensureProvider(providerKey: ProviderKey, utilityType: UtilityType, sourceUrl?: string) {
    const provider = await db.query.providers.findFirst({
      where: eq(providers.key, providerKey),
    });

    if (provider) {
      return provider;
    }

    const [created] = await db
      .insert(providers)
      .values({
        key: providerKey,
        utilityType,
        name: providerKey.toUpperCase(),
        sourceUrl,
      })
      .returning();
    return created;
  }
}
