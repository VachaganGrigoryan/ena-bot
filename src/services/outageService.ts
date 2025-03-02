import supabase from "../supabase";
import { PowerOutage } from "../models";
import { ArmenianRegion } from "../constants";
import stringSimilarity from "string-similarity";

let REGION_DATA: {
  id: number;
  name: string;
}[] = [];

// Function to get region ID from the database
async function loadRegionMapping() {
  if (REGION_DATA.length === 0) {
    const { data: regions, error } = await supabase
      .from("regions")
      .select("id, name");

    if (error || !regions) {
      console.error("Error fetching regions:", error);
      return;
    }

    // 3️⃣ Create an array of region names for comparison
    REGION_DATA = regions;
  }

  return REGION_DATA;
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
  return new Date(Date.UTC(currentYear, monthIndex, day, 12, 0, 0, 0));
}

// Function to normalize Armenian region names
function normalizeRegionName(region: string): string {
  return region
    .replace(/(ի)? (քաղաք|մարզ)(ի)?$/, "") // Removes "քաղաք", "քաղաքի", "մարզ", "մարզի"
    .trim(); // Trim extra spaces
}

// Function to fetch all regions and find the best match
async function getBestMatchingRegion(
  unnormalizedRegion: string,
): Promise<{ id: number; name: string } | null> {
  // 1️⃣ Fetch all regions from Supabase
  await loadRegionMapping();

  // 2️⃣ Normalize input region name
  const normalizedInput = normalizeRegionName(unnormalizedRegion);

  const regionNames = REGION_DATA.map((region) => region.name);

  // 4️⃣ Find the closest match using `string-similarity`
  const matches = stringSimilarity.findBestMatch(normalizedInput, regionNames);
  const bestMatch = matches.bestMatch;

  // 5️⃣ Check confidence score to ensure it's a good match
  if (bestMatch.rating > 0.5) {
    // Find matching region from original data
    const matchedRegion = REGION_DATA.find(
      (region) => region.name === bestMatch.target,
    );
    return matchedRegion || null;
  } else {
    console.warn(`No strong match found for "${unnormalizedRegion}"`);
    return null;
  }
}

// Function to save outage data
export async function saveOutageData(outage: PowerOutage) {
  const outageDate = convertArmenianDate(outage.date);
  console.log(`Storing data for ${outageDate?.toISOString().split("T")[0]}`);

  // 1️⃣ Deactivate existing outages for this date
  await supabase
    .from("outages")
    .update({ is_active: false })
    .eq("outage_date", outageDate?.toISOString().split("T")[0]);

  for (const region of outage.regions) {
    console.log(`Storing data for ${region.name}`);
    const regionObj = await getBestMatchingRegion(region.name);
    if (!regionObj) {
      console.warn(`Region not found: ${region.name}`);
      continue;
    }

    for (const location of region.locations) {
      console.log(
        `Storing data for ${location.time_slot} - ${location.addresses}`,
      );
      const { error } = await supabase.from("outages").insert({
        region_id: regionObj.id,
        outage_date: outageDate,
        time_slot: location.time_slot,
        reason: `${outage.name} - ${outage.date.toUpperCase()}`,
        raw_addresses: location,
        is_active: true, // Mark new data as active
      });

      if (error) {
        console.error(
          `Error inserting data: ${outage.date}, ${region.name}, ${location}`,
          error,
        );
      }
    }
  }
}

// Function to fetch outage data by date
export async function getOutageByRegion(region: ArmenianRegion) {
  if (region.toLowerCase() === "all") {
    // If searchText is 'all', we fetch only active outages
    const { data: outages, error } = await supabase
      .from("outages")
      .select("*")
      .eq("is_active", true); // Only select active outages
    // .range(offset, offset + limit - 1); // Pagination

    if (error) {
      console.error("Error fetching active outages:", error);
      return undefined;
    }

    return outages; // Return active outages
  } else {
    console.log(`Storing data for ${region}`);
    const regionObj = await getBestMatchingRegion(region);
    if (!regionObj) {
      console.warn(`Region not found: ${region}`);
      return undefined;
    }

    console.log(regionObj);

    const { data: filteredOutages, error } = await supabase
      .from("outages")
      .select(
        `
          id,
          outage_date,
          time_slot,
          reason,
          raw_addresses,
          regions(id, name)
        `,
      )
      .eq("is_active", true)
      .eq("region_id", regionObj.id);

    // .or(`raw_addresses->>addresses.0.ilike.${searchText}`) // Use '->>' to access text values in the JSON and apply 'ilike'
    // .or(`raw_addresses->>addresses @> '[\"${region}\"]'`) // Check if 'searchText' exists in the array of 'raw_addresses'

    // .range(offset, offset + limit - 1); // Pagination

    // console.log(filteredOutages);

    if (error) {
      console.error("Error fetching filtered active outages:", error);
      return undefined;
    }

    return filteredOutages; // Return filtered active outages
  }
}
