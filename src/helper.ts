type Outage = {
  id: number;
  regions: {
    id: number;
    name: string;
  };
  outage_date: string;
  time_slot: string;
  reason: string;
  raw_addresses: { addresses: string[]; time_slot: string };
  is_active: boolean;
};

export function formatOutagesForTelegram(
  outages: Outage[],
  title: string = "⚡ ՀՀ ԷԼԵԿՏՐԱԿԱՆ ՑԱՆՑԵՐ ՊԼԱՆԱՅԻՆ ԱՆՋԱՏՈՒՄՆԵՐ ⚡",
): string[] {
  const responses: string[] = [`*${title}*`];

  outages.forEach((outage) => {
    const messageParts: string[] = [
      `*${outage.regions.name}* - *${outage.outage_date}*`,
    ];

    messageParts.push(
      `  *Ժամը*: ${outage.time_slot}\n    - ${outage.raw_addresses.addresses.join("\n    - ")}\n`,
    );

    responses.push(messageParts.join("\n"));
  });

  return responses;
}
