import schedule from "node-schedule";

import { ProviderAdapter } from "../domain/provider";
import { env } from "../shared/env";
import { GlobalOutagesService } from "./global-outages-service";

export class WorkerService {
  constructor(
    private readonly outagesService: GlobalOutagesService,
    private readonly provider: ProviderAdapter,
    private readonly sendMessage: (chatId: string, message: string) => Promise<void>,
  ) {}

  async runStartupSync() {
    await this.runJob("startup.sync_provider", async () => this.outagesService.syncProvider(this.provider));
    await this.runJob("startup.process_notifications", async () =>
      this.outagesService.processNotifications(this.sendMessage),
    );
  }

  scheduleRecurringWork() {
    schedule.scheduleJob(env.WORKER_SYNC_CRON, async () => {
      await this.runJob("cron.sync_provider", async () => this.outagesService.syncProvider(this.provider), {
        schedule: env.WORKER_SYNC_CRON,
      });
    });

    schedule.scheduleJob(env.WORKER_NOTIFY_CRON, async () => {
      await this.runJob("cron.process_notifications", async () =>
        this.outagesService.processNotifications(this.sendMessage), {
        schedule: env.WORKER_NOTIFY_CRON,
      });
    });
  }

  private async runJob<T>(jobName: string, task: () => Promise<T>, metadata?: Record<string, string>) {
    const startedAt = Date.now();
    const details = formatWorkerLogDetails({
      job: jobName,
      provider: `${this.provider.key}/${this.provider.utilityType}`,
      ...metadata,
    });

    console.info(`[worker.run] ${details} status=started`);

    try {
      const result = await task();
      console.info(
        `[worker.run] ${details} status=succeeded duration_ms=${Date.now() - startedAt}${formatWorkerResult(result)}`,
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[worker.run] ${details} status=failed duration_ms=${Date.now() - startedAt} message="${message}"`,
      );
      throw error;
    }
  }
}

function formatWorkerLogDetails(details: Record<string, string>) {
  return Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

function formatWorkerResult(result: unknown) {
  if (!result || typeof result !== "object") {
    return "";
  }

  const serializableEntries = Object.entries(result).flatMap(([key, value]) => {
    if (value === undefined || value instanceof Date || typeof value === "object") {
      return [];
    }

    return [`${key}=${String(value)}`];
  });

  if (serializableEntries.length === 0) {
    return "";
  }

  return ` ${serializableEntries.join(" ")}`;
}
