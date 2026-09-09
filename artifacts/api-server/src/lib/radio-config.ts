import { db, stationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const DEFAULT_SOURCE_URL = "";

export const STABLE_STREAM_URL = "/api/live.mp3";
export const LISTENER_URL = "/";

export const sourceTypes = ["browser", "icecast", "mp3", "encoder"] as const;
export type SourceType = (typeof sourceTypes)[number];

export function isSourceType(value: string): value is SourceType {
  return sourceTypes.includes(value as SourceType);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getStationSettings() {
  const [existing] = await db
    .select()
    .from(stationSettingsTable)
    .where(eq(stationSettingsTable.id, 1))
    .limit(1);

  if (existing) {
    if (existing.sourceUrl.includes("listen2myradio.com")) {
      const [migrated] = await db
        .update(stationSettingsTable)
        .set({ sourceType: "browser", sourceUrl: "", isLive: false })
        .where(eq(stationSettingsTable.id, 1))
        .returning();

      return migrated ?? existing;
    }

    return existing;
  }

  try {
    const [created] = await db
      .insert(stationSettingsTable)
      .values({ id: 1, sourceUrl: DEFAULT_SOURCE_URL })
      .returning();

    return created;
  } catch (error) {
    // The public page loads config and status in parallel on a fresh database.
    // If both requests initialize at once, reuse the row created by the winner.
    const [raced] = await db
      .select()
      .from(stationSettingsTable)
      .where(eq(stationSettingsTable.id, 1))
      .limit(1);

    if (raced) {
      return raced;
    }

    throw error;
  }
}

export function toPublicStation(station: Awaited<ReturnType<typeof getStationSettings>>) {
  const sourceType: SourceType = isSourceType(station.sourceType)
    ? station.sourceType
    : "icecast";

  return {
    stationName: station.stationName,
    tagline: station.tagline,
    genre: station.genre,
    hostName: station.hostName,
    showName: station.showName,
    sourceType,
    streamUrl: STABLE_STREAM_URL,
    listenerUrl: LISTENER_URL,
    isLive: station.isLive,
    updatedAt: station.updatedAt.toISOString(),
  };
}

export function toAdminStation(
  station: Awaited<ReturnType<typeof getStationSettings>>,
) {
  return {
    ...toPublicStation(station),
    sourceUrl: station.sourceUrl,
  };
}