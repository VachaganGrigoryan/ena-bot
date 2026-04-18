import { and, eq, sql } from "drizzle-orm";

import { db, sql as postgresClient } from "../db/client";
import { regions, settlements } from "../db/schema";
import { ARMENIA_CAPITAL, REGIONS } from "../../data/armenia";

async function main() {
  await seedRegions();
  await seedCapitalDistricts();
  console.log("Armenia seed completed.");
  await postgresClient.end();
}

async function seedRegions() {
  for (const region of REGIONS) {
    let regionRow = await db.query.regions.findFirst({
      where: eq(regions.name, region.name),
    });

    if (!regionRow) {
      [regionRow] = await db
        .insert(regions)
        .values({
          name: region.name,
          romanizedName: region.romanized,
          metadata: region.metadata,
        })
        .returning();
    } else {
      [regionRow] = await db
        .update(regions)
        .set({
          romanizedName: region.romanized,
          metadata: region.metadata,
          updatedAt: sql`now()`,
        })
        .where(eq(regions.id, regionRow.id))
        .returning();
    }

    for (const city of region.cities) {
      await ensureSettlement(regionRow.id, city.name, city.romanized, "city");
    }

    for (const village of region.villages) {
      await ensureSettlement(regionRow.id, village.name, village.romanized, "village");
    }
  }
}

async function seedCapitalDistricts() {
  let regionRow = await db.query.regions.findFirst({
    where: eq(regions.name, ARMENIA_CAPITAL.name),
  });

  if (!regionRow) {
    [regionRow] = await db
      .insert(regions)
      .values({
        name: ARMENIA_CAPITAL.name,
        romanizedName: ARMENIA_CAPITAL.romanized,
        metadata: ARMENIA_CAPITAL.metadata,
      })
      .returning();
  }

  let capitalSettlement = await db.query.settlements.findFirst({
    where: and(eq(settlements.regionId, regionRow.id), eq(settlements.name, ARMENIA_CAPITAL.name)),
  });

  if (!capitalSettlement) {
    [capitalSettlement] = await db
      .insert(settlements)
      .values({
        regionId: regionRow.id,
        name: ARMENIA_CAPITAL.name,
        romanizedName: ARMENIA_CAPITAL.romanized,
        type: "city",
      })
      .returning();
  }

  for (const district of ARMENIA_CAPITAL.districts) {
    const existing = await db.query.settlements.findFirst({
      where: and(eq(settlements.regionId, regionRow.id), eq(settlements.name, district.name)),
    });

    if (existing) {
      await db
        .update(settlements)
        .set({
          regionId: regionRow.id,
          parentId: capitalSettlement.id,
          romanizedName: district.romanized,
          type: "district",
          updatedAt: sql`now()`,
        })
        .where(eq(settlements.id, existing.id));
      continue;
    }

    await db.insert(settlements).values({
      regionId: regionRow.id,
      parentId: capitalSettlement.id,
      name: district.name,
      romanizedName: district.romanized,
      type: "district",
    });
  }
}

async function ensureSettlement(regionId: number, name: string, romanizedName: string, type: string) {
  const existing = await db.query.settlements.findFirst({
    where: and(eq(settlements.regionId, regionId), eq(settlements.name, name)),
  });

  if (existing) {
    await db
      .update(settlements)
      .set({
        regionId,
        romanizedName,
        type,
        updatedAt: sql`now()`,
      })
      .where(eq(settlements.id, existing.id));
    return;
  }

  await db.insert(settlements).values({
    regionId,
    name,
    romanizedName,
    type,
  });
}

void main().catch(async (error) => {
  console.error("Armenia seeding failed.", error);
  await postgresClient.end();
  process.exit(1);
});
