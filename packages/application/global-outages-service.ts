import { ProviderAdapter } from "../domain/provider";
import { AddressFormatter, ProviderKey, SearchQuery, SubscriptionTarget, UtilityType } from "../domain/types";
import { env } from "../shared/env";
import { DeterministicAddressFormatter } from "../ai/deterministic-address-formatter";
import { OllamaAddressFormatter } from "../ai/ollama-address-formatter";
import { formatOutagesForTelegram } from "./telegram-messages";
import { NotificationDeliveriesRepository } from "../storage/repositories/notification-deliveries";
import { OutagesRepository } from "../storage/repositories/outages";
import { SubscriptionsRepository } from "../storage/repositories/subscriptions";
import { SyncRunsRepository } from "../storage/repositories/sync-runs";
import { UsersRepository } from "../storage/repositories/users";

export class GlobalOutagesService {
  constructor(
    private readonly usersRepository = new UsersRepository(),
    private readonly subscriptionsRepository = new SubscriptionsRepository(),
    private readonly outagesRepository = new OutagesRepository(),
    private readonly syncRunsRepository = new SyncRunsRepository(),
    private readonly notificationDeliveriesRepository = new NotificationDeliveriesRepository(),
    private readonly addressFormatter: AddressFormatter = env.USE_OLLAMA_ADDRESS_FORMATTER
      ? new OllamaAddressFormatter()
      : new DeterministicAddressFormatter(),
  ) {}

  async ensureUser(chatId: string, username?: string | null) {
    return this.usersRepository.ensureUser(chatId, username, env.TELEGRAM_DEFAULT_LOCALE);
  }

  async addSubscription(chatId: string, username: string | null | undefined, target: SubscriptionTarget) {
    const user = await this.ensureUser(chatId, username);
    return this.subscriptionsRepository.create({
      userId: user.id,
      providerKey: target.providerKey,
      utilityType: target.utilityType,
      queryText: target.queryText,
      matchMode: target.matchMode,
    });
  }

  async listSubscriptions(chatId: string) {
    return this.subscriptionsRepository.listByChatId(chatId);
  }

  async updateSubscription(subscriptionId: number, queryText: string) {
    return this.subscriptionsRepository.updateQuery(subscriptionId, queryText);
  }

  async toggleSubscription(subscriptionId: number) {
    return this.subscriptionsRepository.togglePaused(subscriptionId);
  }

  async deleteSubscription(subscriptionId: number) {
    return this.subscriptionsRepository.delete(subscriptionId);
  }

  async search(query: SearchQuery) {
    return this.outagesRepository.findActiveByText(query.providerKey, query.utilityType, query.text);
  }

  async searchMessages(query: SearchQuery) {
    const records = await this.search(query);
    return formatOutagesForTelegram(records);
  }

  async syncProvider(provider: ProviderAdapter) {
    const raw = await provider.fetchRaw();
    const parsed = provider.parseRaw(raw);
    const normalized = await this.refineBatchAddresses(provider.normalize(parsed, raw));
    const providerRow = await this.outagesRepository.ensureProvider(provider.key, provider.utilityType, raw.sourceUrl);
    const syncRun = await this.syncRunsRepository.start(providerRow.id, provider.key, provider.utilityType);

    try {
      await this.outagesRepository.replaceProviderEvents(normalized);
      const eventCount = normalized.events.length;
      const windowCount = normalized.events.reduce((sum, event) => sum + event.windows.length, 0);
      const locationCount = normalized.events.reduce(
        (sum, event) =>
          sum +
          event.windows.reduce((windowSum, window) => windowSum + window.affectedLocations.length, 0),
        0,
      );

      await this.syncRunsRepository.finish(
        syncRun.id,
        "succeeded",
        `Synced ${eventCount} events, ${windowCount} windows, ${locationCount} locations.`,
      );

      return {
        providerKey: provider.key,
        utilityType: provider.utilityType,
        fetchedAt: normalized.fetchedAt,
        eventCount,
        windowCount,
        locationCount,
      };
    } catch (error) {
      await this.syncRunsRepository.finish(
        syncRun.id,
        "failed",
        error instanceof Error ? error.message : "Unknown sync error.",
      );
      throw error;
    }
  }

  async processNotifications(sendMessage: (chatId: string, message: string) => Promise<void>) {
    const subscriptions = await this.subscriptionsRepository.listActive();

    for (const subscription of subscriptions) {
      const matches = await this.outagesRepository.findActiveByText(
        subscription.providerKey as ProviderKey,
        subscription.utilityType as UtilityType,
        subscription.queryText,
      );

      if (matches.length === 0) {
        continue;
      }

      const unsentMatches: typeof matches = [];
      for (const match of matches) {
        const alreadySent = await this.notificationDeliveriesRepository.alreadySent(subscription.id, match.windowId);
        if (!alreadySent) {
          unsentMatches.push(match);
        }
      }

      if (unsentMatches.length === 0) {
        continue;
      }

      const messages = formatOutagesForTelegram(unsentMatches);

      try {
        for (const message of messages) {
          await sendMessage(subscription.chatId, message);
        }

        for (const match of unsentMatches) {
          await this.notificationDeliveriesRepository.record(subscription.id, match.windowId, "sent");
        }
      } catch (error) {
        for (const match of unsentMatches) {
          await this.notificationDeliveriesRepository.record(
            subscription.id,
            match.windowId,
            "failed",
            error instanceof Error ? error.message : "Unknown notification error.",
          );
        }
      }
    }
  }

  private async refineBatchAddresses(batch: Awaited<ReturnType<ProviderAdapter["normalize"]>>) {
    for (const event of batch.events) {
      for (const window of event.windows) {
        if (!shouldUseFormatter(window.affectedLocations.map((location) => location.address))) {
          continue;
        }

        const refined = await this.addressFormatter.refine({
          regionName: window.regionName,
          timeSlot: window.timeSlot,
          addresses: window.affectedLocations.map((location) => location.address),
        });

        if (refined.length === 0) {
          continue;
        }

        window.affectedLocations = refined.map((address) => ({
          address,
          normalizedSearchText: address.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim(),
        }));
      }
    }

    return batch;
  }
}

function shouldUseFormatter(addresses: string[]) {
  if (addresses.length !== 1) {
    return false;
  }

  const [onlyAddress] = addresses;
  return Boolean(onlyAddress) && onlyAddress.length > 120 && /[;,]|(?:\s-\s)|(?:\d+\))/u.test(onlyAddress);
}
