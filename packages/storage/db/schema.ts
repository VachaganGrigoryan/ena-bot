import { relations, sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const providers = pgTable(
  "providers",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    utilityType: text("utility_type").notNull(),
    name: text("name").notNull(),
    sourceUrl: text("source_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerKeyIdx: uniqueIndex("providers_key_utility_idx").on(table.key, table.utilityType),
  }),
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull().unique(),
  username: text("username"),
  locale: text("locale").notNull().default("hy-AM"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: integer("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "restrict" }),
  providerKey: text("provider_key").notNull(),
  utilityType: text("utility_type").notNull(),
  queryText: text("query_text").notNull(),
  normalizedQueryText: text("normalized_query_text").notNull(),
  matchMode: text("match_mode").notNull().default("contains"),
  isPaused: boolean("is_paused").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  countryCode: text("country_code").notNull().default("AM"),
  name: text("name").notNull(),
  romanizedName: text("romanized_name"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  regionId: integer("region_id").references(() => regions.id, { onDelete: "set null" }),
  parentId: integer("parent_id"),
  name: text("name").notNull(),
  type: text("type"),
  romanizedName: text("romanized_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outageEvents = pgTable("outage_events", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  providerKey: text("provider_key").notNull(),
  utilityType: text("utility_type").notNull(),
  sourceEventKey: text("source_event_key").notNull(),
  title: text("title").notNull(),
  dateText: text("date_text").notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  rawPayload: jsonb("raw_payload").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outageWindows = pgTable("outage_windows", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => outageEvents.id, { onDelete: "cascade" }),
  regionId: integer("region_id").references(() => regions.id, { onDelete: "set null" }),
  settlementId: integer("settlement_id").references(() => settlements.id, { onDelete: "set null" }),
  regionName: text("region_name").notNull(),
  timeSlot: text("time_slot").notNull(),
  rawAddresses: jsonb("raw_addresses").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outageLocations = pgTable("outage_locations", {
  id: serial("id").primaryKey(),
  windowId: integer("window_id")
    .notNull()
    .references(() => outageWindows.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  normalizedSearchText: text("normalized_search_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  providerKey: text("provider_key").notNull(),
  utilityType: text("utility_type").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    outageWindowId: integer("outage_window_id")
      .notNull()
      .references(() => outageWindows.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    deliveryUniqueIdx: uniqueIndex("notification_delivery_unique_idx").on(table.subscriptionId, table.outageWindowId),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const providersRelations = relations(providers, ({ many }) => ({
  subscriptions: many(subscriptions),
  outageEvents: many(outageEvents),
  syncRuns: many(syncRuns),
}));
