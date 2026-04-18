import axios from "axios";

import { ProviderAdapter } from "../../domain/provider";
import { NormalizedOutageBatch, ParsedProviderBatch, RawPayload, SyncRunResult } from "../../domain/types";
import { env } from "../../shared/env";
import { convertArmenianDateToUtc, normalizeSearchText, parseEnaHtml } from "./parser";

export class EnaElectricityProvider implements ProviderAdapter {
  readonly key = "ena" as const;
  readonly utilityType = "electricity" as const;

  async fetchRaw(): Promise<RawPayload> {
    const sourceUrl = `${env.ENA_BASE_URL}${env.ENA_OUTAGES_PATH}`;
    const response = await axios.get(sourceUrl);
    return {
      content: response.data,
      fetchedAt: new Date(),
      sourceUrl,
    };
  }

  parseRaw(raw: RawPayload): ParsedProviderBatch {
    return parseEnaHtml(raw);
  }

  normalize(batch: ParsedProviderBatch, raw: RawPayload): NormalizedOutageBatch {
    return {
      providerKey: this.key,
      utilityType: this.utilityType,
      fetchedAt: raw.fetchedAt,
      sourceUrl: raw.sourceUrl,
      events: batch.events.map((event) => ({
        sourceEventKey: `${this.key}:${event.dateText}`,
        title: event.title,
        dateText: event.dateText,
        eventDate: convertArmenianDateToUtc(event.dateText),
        rawPayload: event,
        windows: event.regions.flatMap((region) =>
          region.locations.map((location) => ({
            regionName: region.name,
            timeSlot: location.timeSlot,
            affectedLocations: location.addresses.map((address) => ({
              address,
              normalizedSearchText: normalizeSearchText(`${region.name} ${address}`),
            })),
          })),
        ),
      })),
    };
  }

  async sync(): Promise<SyncRunResult> {
    const raw = await this.fetchRaw();
    const parsed = this.parseRaw(raw);
    const normalized = this.normalize(parsed, raw);

    return {
      providerKey: this.key,
      utilityType: this.utilityType,
      fetchedAt: normalized.fetchedAt,
      eventCount: normalized.events.length,
      windowCount: normalized.events.reduce((sum, event) => sum + event.windows.length, 0),
      locationCount: normalized.events.reduce(
        (sum, event) =>
          sum +
          event.windows.reduce((windowSum, window) => windowSum + window.affectedLocations.length, 0),
        0,
      ),
    };
  }
}
