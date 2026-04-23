import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { NormalizedOutageBatch, OutageSearchRecord, ProviderKey, UtilityType } from "../../domain/types";
import { normalizeSearchText } from "../../providers/ena/parser";
import { db } from "../db/client";
import { outageEvents, outageLocations, outageWindows, providers, regions } from "../db/schema";

export class OutagesRepository {
  async ensureProvider(providerKey: ProviderKey, utilityType: UtilityType, sourceUrl?: string) {
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
        sourceUrl,
      })
      .returning();

    return created;
  }

  async replaceProviderEvents(batch: NormalizedOutageBatch) {
    const provider = await this.ensureProvider(batch.providerKey, batch.utilityType, batch.sourceUrl);

    await db
      .update(outageEvents)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(and(eq(outageEvents.providerId, provider.id), eq(outageEvents.isActive, true)));

    for (const event of batch.events) {
      const [eventRow] = await db
        .insert(outageEvents)
        .values({
          providerId: provider.id,
          providerKey: batch.providerKey,
          utilityType: batch.utilityType,
          sourceEventKey: event.sourceEventKey,
          title: event.title,
          dateText: event.dateText,
          eventDate: event.eventDate,
          isActive: true,
          rawPayload: event.rawPayload ?? {},
        })
        .returning();

      for (const window of event.windows) {
        const regionId = await this.ensureRegion(window.regionName);
        const [windowRow] = await db
          .insert(outageWindows)
          .values({
            eventId: eventRow.id,
            regionId,
            regionName: window.regionName,
            timeSlot: window.timeSlot,
            rawAddresses: window.affectedLocations.map((location) => location.address),
          })
          .returning();

        if (window.affectedLocations.length === 0) {
          await db.insert(outageLocations).values({
            windowId: windowRow.id,
            address: window.regionName,
            normalizedSearchText: normalizeSearchText(window.regionName),
          });
          continue;
        }

        await db.insert(outageLocations).values(
          window.affectedLocations.map((location) => ({
            windowId: windowRow.id,
            address: location.address,
            normalizedSearchText: location.normalizedSearchText,
          })),
        );
      }
    }

    return provider;
  }

  async findActiveByText(providerKey: ProviderKey, utilityType: UtilityType, text: string) {
    const normalizedText = normalizeSearchText(text);
    const allQuery = normalizedText === "all";
    const filter = allQuery
      ? and(eq(outageEvents.providerKey, providerKey), eq(outageEvents.utilityType, utilityType), eq(outageEvents.isActive, true))
      : and(
          eq(outageEvents.providerKey, providerKey),
          eq(outageEvents.utilityType, utilityType),
          eq(outageEvents.isActive, true),
          or(
            ilike(outageWindows.regionName, `%${text}%`),
            ilike(outageLocations.address, `%${text}%`),
            ilike(outageLocations.normalizedSearchText, `%${normalizedText}%`),
          ),
        );

    const rows = await db
      .select({
        eventId: outageEvents.id,
        windowId: outageWindows.id,
        title: outageEvents.title,
        dateText: outageEvents.dateText,
        eventDate: outageEvents.eventDate,
        regionName: outageWindows.regionName,
        timeSlot: outageWindows.timeSlot,
        address: outageLocations.address,
      })
      .from(outageEvents)
      .innerJoin(outageWindows, eq(outageWindows.eventId, outageEvents.id))
      .leftJoin(outageLocations, eq(outageLocations.windowId, outageWindows.id))
      .where(filter)
      .orderBy(desc(outageEvents.eventDate), outageWindows.regionName, outageWindows.timeSlot);

    return groupSearchRows(rows);
  }

  private async ensureRegion(regionName: string) {
    const existing = await db.query.regions.findFirst({
      where: eq(regions.name, regionName),
    });

    if (existing) {
      return existing.id;
    }

    const [created] = await db
      .insert(regions)
      .values({
        name: regionName,
      })
      .returning();

    return created.id;
  }
}

function groupSearchRows(
  rows: Array<{
    eventId: number;
    windowId: number;
    title: string;
    dateText: string;
    eventDate: Date | null;
    regionName: string;
    timeSlot: string;
    address: string | null;
  }>,
): OutageSearchRecord[] {
  const grouped = new Map<number, OutageSearchRecord>();

  for (const row of rows) {
    const existing = grouped.get(row.windowId);
    if (existing) {
      if (row.address && !existing.addresses.includes(row.address)) {
        existing.addresses.push(row.address);
      }
      continue;
    }

    grouped.set(row.windowId, {
      eventId: row.eventId,
      windowId: row.windowId,
      title: row.title,
      dateText: row.dateText,
      eventDate: row.eventDate,
      regionName: row.regionName,
      timeSlot: row.timeSlot,
      addresses: row.address ? [row.address] : [],
    });
  }

  return Array.from(grouped.values());
}
