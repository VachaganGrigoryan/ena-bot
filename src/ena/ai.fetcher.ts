import axios from "axios";
import * as cheerio from "cheerio";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import { PowerOutage } from "../models";
import { saveOutageData } from "../services/outageService";
import { scheduleJob } from "node-schedule";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class ENAFetcherAI {
  private static BASE_URL = "https://www.ena.am";
  private client: OpenAI;

  private timePattern = /\d{1,2}[:։]\d{2}\s*?[-–]\s*?\d{1,2}[:։]\d{2}/;
  private datePattern =
    /(?:\d{1,2}\s?(?:հունվարի|փետրվարի|մարտի|ապրիլի|մայիսի|հունիսի|հուլիսի|օգոստոսի|սեպտեմբերի|հոկտեմբերի|նոյեմբերի|դեկտեմբերի)|(?:հունվարի|փետրվարի|մարտի|ապրիլի|մայիսի|հունիսի|հուլիսի|օգոստոսի|սեպտեմբերի|հոկտեմբերի|նոյեմբերի|դեկտեմբերի)\s?\d{1,2})/;

  private prompt =
    "Format the following addresses. Keep address groups. Do not change or translate addresses.\nAddresses: {}";

  constructor() {
    this.client = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log(`Initialized ENAFetcherAI with OpenAI API`);
    // Schedule data refresh every day at 20:00
    // scheduleJob("23 20 * * *", () => {
    //   this.refreshData();
    // });
    scheduleJob("0 10,15,20 * * *", () => {
      console.log("Running task at 10:00 AM, 15:00 PM and 20:00 PM");
      this.refreshData();
    });

    console.log(`Scheduled task to run at 10:00 AM, 15:00 PM and 20:00 PM`);
  }

  async refreshData() {
    console.log("Refreshing outages data...");
    try {
      const htmlData = await this.scrapePowerOutages();
      console.log("Fetched data from ENA website");

      const outages = await this.extractPowerOutages(htmlData);
      console.log(`Extracted ${outages.length} addresses`);

      // console.log(JSON.stringify(outages, null, 2));

      await this.storeData(outages);
      console.log("Stored data in Supabase DB");
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  }

  private async scrapePowerOutages(): Promise<string> {
    const response = await axios.get(`${ENAFetcherAI.BASE_URL}/Info.aspx?id=5`);
    return response.data;
  }

  private async formatAddresses(addresses: string): Promise<string[]> {
    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Format the power outage addresses in Armenian.",
          },
          { role: "user", content: this.prompt.replace("{}", addresses) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "AddressResponse",
            schema: {
              type: "object",
              properties: {
                addresses: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
      });

      return JSON.parse(<string>response.choices[0].message.content).addresses;
    } catch (error) {
      console.error("Error formatting addresses:", error);
      return [addresses];
    }
  }

  private async extractPowerOutages(htmlData: string): Promise<PowerOutage[]> {
    const $ = cheerio.load(htmlData);
    const powerOutagesElement = $("#ctl00_ContentPlaceHolder1_attenbody");

    const result: PowerOutage[] = [];
    let currentDate: string | null = null;
    let currentRegion: string | null = null;

    const elements = powerOutagesElement.contents();
    for (const element of elements) {
      const text = $(element).text().trim();

      if (!text) continue;

      // Check for a date
      const dateMatch = this.datePattern.exec(text);
      if (dateMatch) {
        currentDate = dateMatch[0];
        result.push({
          name: "ՀՀ էլեկտրական ցանցեր Պլանային անջատումներ",
          date: currentDate,
          regions: [],
        });
        continue;
      }

      // Check if it's a region (e.g., "Երևան քաղաք՝")
      if (text.endsWith("՝") || text.endsWith("`")) {
        if (text.includes("մարզ") || text.includes("քաղաք")) {
          currentRegion = text.replace(/[՝`]/g, "");
          result[result.length - 1].regions.push({
            name: currentRegion,
            locations: [],
          });
        }
        continue;
      }

      // Check for time slots and affected addresses
      const timeMatch = this.timePattern.exec(text);
      if (timeMatch) {
        const timeSlot = timeMatch[0];
        const affectedAddresses = text
          .replace(timeSlot, "")
          .replace(/[՝`]/g, "")
          .replace("․", ".")
          .replace("ա", "ա")
          .replace("", "«")
          .replace("", "»")
          .trim();

        // const formattedAddresses =
        //   await this.formatAddresses(affectedAddresses);

        const lastRegion = result[result.length - 1]?.regions.at(-1);

        // console.log(lastRegion);

        if (lastRegion) {
          lastRegion.locations.push({
            time_slot: timeSlot.replace(/։/g, ":"),
            addresses: [affectedAddresses],
          });
        }
      }
    }

    return result;
  }

  private async storeData(outages: PowerOutage[]) {
    for (const outage of outages) {
      await saveOutageData(outage);
    }
    console.log("Data stored successfully.");
  }
}

// Initialize the fetcher
// const enaFetcher = new ENAFetcherAI();
// enaFetcher.refreshData().then(() => {});
