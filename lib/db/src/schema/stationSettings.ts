import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stationSettingsTable = pgTable("station_settings", {
  id: serial("id").primaryKey(),
  stationName: text("station_name").notNull().default("USALB RADIO"),
  tagline: text("tagline").notNull().default("Your sound. Your story."),
  genre: text("genre").notNull().default("Albanian hits"),
  hostName: text("host_name").notNull().default("USALB RADIO"),
  showName: text("show_name").notNull().default("Live from the studio"),
  sourceType: text("source_type").notNull().default("icecast"),
  sourceUrl: text("source_url").notNull(),
  isLive: boolean("is_live").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStationSettingsSchema = createInsertSchema(
  stationSettingsTable,
).omit({ id: true, updatedAt: true });

export type InsertStationSettings = z.infer<typeof insertStationSettingsSchema>;
export type StationSettings = typeof stationSettingsTable.$inferSelect;