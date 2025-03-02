import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

async function formatAddresses(places: string): Promise<any[]> {
  const prompt =
    "Format the following places. Keep address groups. Do not change or translate data.\nPlaces: {}";
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Format data.",
        },
        { role: "user", content: prompt.replace("{}", places) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "AddressResponse",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              romanized: { type: "string" },
              cities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    romanized: { type: "string" },
                  },
                },
              },
              villages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    romanized: { type: "string" },
                  },
                },
              },
              metadata: {
                type: "object",
                properties: {
                  totalCities: { type: "string" },
                  totalVillages: { type: "string" },
                  totalSettlements: { type: "string" },
                },
              },
            },
          },
        },
      },
    });

    return JSON.parse(<string>response.choices[0].message.content);
  } catch (error) {
    console.error("Error formatting addresses:", error);
    return [];
  }
}

function convertArmenianDate(armenianDate: string): Date | null {
  const monthMap: { [key: string]: number } = {
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

  const parts = armenianDate.trim().split(" ");
  if (parts.length !== 2) return null;

  const monthName = parts[0];
  const day = parseInt(parts[1], 10);
  const currentYear = new Date().getFullYear();

  if (!monthMap.hasOwnProperty(monthName) || isNaN(day)) return null;

  const monthIndex = monthMap[monthName];

  // Validate day to prevent JavaScript's automatic month overflow
  const tempDate = new Date(currentYear, monthIndex + 1, 0); // Last day of the month
  const maxDaysInMonth = tempDate.getDate(); // Get valid number of days

  if (day > maxDaysInMonth) return null; // Prevent invalid days

  // Create the Date object at noon UTC to avoid timezone shift
  const date = new Date(Date.UTC(currentYear, monthIndex, day, 12, 0, 0, 0));

  return date;
}

console.log(convertArmenianDate("մարտի 32")); // null (invalid date)
console.log(convertArmenianDate("մարտի 2")); // Correct March 2nd without timezone issues
console.log(convertArmenianDate("փետրվարի 30")); // null (February 30 does not exist)
console.log(convertArmenianDate("դեկտեմբերի 31")); // ✅ 2025-12-31T12:00:00.000Z
