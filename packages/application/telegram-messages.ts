import { OutageSearchRecord } from "../domain/types";
import { escapeTelegramMarkdown } from "../shared/text";

export function formatOutagesForTelegram(
  records: OutageSearchRecord[],
  title = "⚡ GLOBAL OUTAGES ⚡",
): string[] {
  if (records.length === 0) {
    return [];
  }

  const grouped = new Map<string, OutageSearchRecord[]>();

  for (const record of records) {
    const key = `${record.dateText}::${record.regionName}`;
    const current = grouped.get(key) ?? [];
    current.push(record);
    grouped.set(key, current);
  }

  const messages = [`*${escapeTelegramMarkdown(title)}*`];

  for (const [groupKey, items] of grouped.entries()) {
    const [dateText, regionName] = groupKey.split("::");
    const lines = [`*${escapeTelegramMarkdown(regionName)}* - *${escapeTelegramMarkdown(dateText)}*`];
    for (const item of items) {
      const addresses = item.addresses.length > 0 ? item.addresses : ["Տվյալ հասցեները բացակայում են սկզբնաղբյուրից։"];
      lines.push(`*Ժամը*: ${escapeTelegramMarkdown(item.timeSlot)}`);
      lines.push(addresses.map((address) => `- ${escapeTelegramMarkdown(address)}`).join("\n"));
    }
    messages.push(lines.join("\n"));
  }

  return messages;
}
