import { eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import { users } from "../db/schema";

export class UsersRepository {
  async ensureUser(chatId: string, username?: string | null, locale = "hy-AM") {
    const existing = await db.query.users.findFirst({
      where: eq(users.chatId, chatId),
    });

    if (existing) {
      if (username && username !== existing.username) {
        const [updated] = await db
          .update(users)
          .set({
            username,
            updatedAt: sql`now()`,
          })
          .where(eq(users.id, existing.id))
          .returning();
        return updated;
      }

      return existing;
    }

    const [created] = await db
      .insert(users)
      .values({
        chatId,
        username: username ?? null,
        locale,
      })
      .returning();

    return created;
  }

  async getByChatId(chatId: string) {
    return db.query.users.findFirst({
      where: eq(users.chatId, chatId),
    });
  }
}
