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
    await this.outagesService.syncProvider(this.provider);
    await this.outagesService.processNotifications(this.sendMessage);
  }

  scheduleRecurringWork() {
    schedule.scheduleJob(env.WORKER_SYNC_CRON, async () => {
      await this.outagesService.syncProvider(this.provider);
    });

    schedule.scheduleJob(env.WORKER_NOTIFY_CRON, async () => {
      await this.outagesService.processNotifications(this.sendMessage);
    });
  }
}
