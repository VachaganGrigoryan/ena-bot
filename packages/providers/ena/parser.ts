import * as cheerio from "cheerio";

import { ParsedProviderBatch, ParsedProviderEvent, RawPayload } from "../../domain/types";

const timePattern = /\d{1,2}[:։]\d{2}\s*?[-–]\s*?\d{1,2}[:։]\d{2}/;
const datePattern =
  /(?:\d{1,2}\s?(?:հունվարի|փետրվարի|մարտի|ապրիլի|մայիսի|հունիսի|հուլիսի|օգոստոսի|սեպտեմբերի|հոկտեմբերի|նոյեմբերի|դեկտեմբերի)|(?:հունվարի|փետրվարի|մարտի|ապրիլի|մայիսի|հունիսի|հուլիսի|օգոստոսի|սեպտեմբերի|հոկտեմբերի|նոյեմբերի|դեկտեմբերի)\s?\d{1,2})/i;

function cleanAddressText(value: string): string {
  return value
    .replace(/[՝`]/g, "")
    .replace("", "«")
    .replace("", "»")
    .replace(/[ ]{2,}/g, " ")
    .trim()
    .replace(/^,\s*/, "");
}

function splitAddresses(value: string): string[] {
  return value
    .split(/,(?![^«»]*»)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseEnaHtml(raw: RawPayload): ParsedProviderBatch {
  const $ = cheerio.load(raw.content);
  const powerOutagesElement = $("#ctl00_ContentPlaceHolder1_attenbody");

  const events: ParsedProviderEvent[] = [];

  if (powerOutagesElement.length === 0) {
    return {
      providerKey: "ena",
      utilityType: "electricity",
      events,
    };
  }

  const elements = powerOutagesElement.contents().toArray();
  for (const element of elements) {
    const text = $(element).text().trim();

    if (!text) {
      continue;
    }

    const dateMatch = text.match(datePattern);
    if (dateMatch) {
      events.push({
        title: "ՀՀ էլեկտրական ցանցեր Պլանային անջատումներ",
        dateText: dateMatch[0],
        regions: [],
      });
      continue;
    }

    if (events.length === 0) {
      continue;
    }

    if ((text.endsWith("՝") || text.endsWith("`")) && (text.includes("մարզ") || text.includes("քաղաք"))) {
      events.at(-1)?.regions.push({
        name: text.replace(/[՝`]/g, "").trim(),
        locations: [],
      });
      continue;
    }

    const timeMatch = text.match(timePattern);
    if (!timeMatch) {
      continue;
    }

    const timeSlot = timeMatch[0].replace(/։/g, ":");
    const addressesText = cleanAddressText(text.replace(timeMatch[0], ""));
    const currentRegion = events.at(-1)?.regions.at(-1);

    if (!currentRegion) {
      continue;
    }

    currentRegion.locations.push({
      timeSlot,
      addresses: splitAddresses(addressesText),
    });
  }

  return {
    providerKey: "ena",
    utilityType: "electricity",
    events,
  };
}

export function convertArmenianDateToUtc(armenianDate: string): Date | null {
  const monthMap: Record<string, number> = {
    հունվարի: 0,
    փետրվարի: 1,
    մարտի: 2,
    ապրիլի: 3,
    մայիսի: 4,
    հունիսի: 5,
    հուլիսի: 6,
    օգոստոսի: 7,
    սեպտեմբերի: 8,
    հոկտեմբերի: 9,
    նոյեմբերի: 10,
    դեկտեմբերի: 11,
  };

  const parts = armenianDate.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }

  const [monthName, dayValue] = parts;
  const day = Number.parseInt(dayValue, 10);
  if (!(monthName in monthMap) || Number.isNaN(day)) {
    return null;
  }

  return new Date(Date.UTC(new Date().getUTCFullYear(), monthMap[monthName], day, 12));
}

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
