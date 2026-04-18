import { and, eq } from "drizzle-orm";

import { NotificationStatus } from "../../domain/types";
import { db } from "../db/client";
import { notificationDeliveries } from "../db/schema";

export class NotificationDeliveriesRepository {
  async alreadySent(subscriptionId: number, outageWindowId: number) {
    const delivery = await db.query.notificationDeliveries.findFirst({
      where: and(
        eq(notificationDeliveries.subscriptionId, subscriptionId),
        eq(notificationDeliveries.outageWindowId, outageWindowId),
      ),
    });

    return delivery?.status === "sent";
  }

  async record(
    subscriptionId: number,
    outageWindowId: number,
    status: NotificationStatus,
    errorMessage?: string,
  ) {
    const existing = await db.query.notificationDeliveries.findFirst({
      where: and(
        eq(notificationDeliveries.subscriptionId, subscriptionId),
        eq(notificationDeliveries.outageWindowId, outageWindowId),
      ),
    });

    if (existing) {
      const [updated] = await db
        .update(notificationDeliveries)
        .set({
          status,
          errorMessage,
        })
        .where(eq(notificationDeliveries.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(notificationDeliveries)
      .values({
        subscriptionId,
        outageWindowId,
        status,
        errorMessage,
      })
      .returning();

    return created;
  }
}
