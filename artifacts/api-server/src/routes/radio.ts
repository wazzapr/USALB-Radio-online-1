import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import {
  GetRadioConfigResponse,
  GetRadioStatusResponse,
  GetStreamUrlResponse,
  GetAdminStationResponse,
  UpdateAdminStationBody,
  UpdateAdminStationResponse,
  TestAdminStreamBody,
  TestAdminStreamResponse,
} from "@workspace/api-zod";
import { db, stationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  accessKeyMatches,
  clearAdminSession,
  hasAdminSession,
  isAdminAuthRequired,
  requireAdminSession,
  setAdminSession,
} from "../middlewares/adminAuth";
import {
  getStationSettings,
  isHttpUrl,
  isSourceType,
  STABLE_STREAM_URL,
  toAdminStation,
  toPublicStation,
} from "../lib/radio-config";

const router: IRouter = Router();

router.get("/radio/config", async (_req, res): Promise<void> => {
  const station = await getStationSettings();
  res.json(GetRadioConfigResponse.parse(toPublicStation(station)));
});

router.get("/radio/status", async (_req, res): Promise<void> => {
  const station = await getStationSettings();
  const publicStation = toPublicStation(station);
  res.json(
    GetRadioStatusResponse.parse({
      isLive: publicStation.isLive,
      sourceType: publicStation.sourceType,
      message: publicStation.isLive
        ? `Live now: ${publicStation.showName}`
        : "The station is currently offline",
      updatedAt: publicStation.updatedAt,
    }),
  );
});

router.get("/stream-url", (_req, res): void => {
  res.json(GetStreamUrlResponse.parse({ url: STABLE_STREAM_URL, source: "stable" }));
});

router.get("/live.mp3", async (req, res): Promise<void> => {
  const station = await getStationSettings();

  if (!station.isLive) {
    res.status(503).json({ error: "The station is currently offline" });
    return;
  }

  if (!isHttpUrl(station.sourceUrl)) {
    res.status(503).json({ error: "The station source is not configured" });
    return;
  }

  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.once("close", onClose);

  try {
    const upstream = await fetch(station.sourceUrl, {
      headers: {
        Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
        "User-Agent": "USALB-RADIO/1.0",
      },
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: "The upstream radio source is unavailable" });
      return;
    }

    res.status(200);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("icy-name", station.stationName);
    res.setHeader("icy-genre", station.genre);
    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).pipe(res);
  } catch (error) {
    if (!controller.signal.aborted && !res.headersSent) {
      req.log.warn({ error }, "Unable to connect to upstream stream");
      res.status(502).json({ error: "Unable to connect to the upstream radio source" });
    }
  } finally {
    res.off("close", onClose);
  }
});

router.get("/admin/session", (req, res): void => {
  res.json({ authenticated: hasAdminSession(req) });
});

router.post("/admin/login", (req, res): void => {
  if (!isAdminAuthRequired()) {
    res.json({ authenticated: true });
    return;
  }

  const accessKey =
    typeof req.body?.accessKey === "string" ? req.body.accessKey : "";

  if (!accessKey || !accessKeyMatches(accessKey)) {
    res.status(401).json({ error: "Invalid station access key" });
    return;
  }

  setAdminSession(res);
  res.json({ authenticated: true });
});

router.post("/admin/logout", (_req, res): void => {
  clearAdminSession(res);
  res.json({ authenticated: false });
});

router.get("/admin/station", requireAdminSession, async (_req, res): Promise<void> => {
  const station = await getStationSettings();
  res.json(GetAdminStationResponse.parse(toAdminStation(station)));
});

router.put("/admin/station", requireAdminSession, async (req, res): Promise<void> => {
  const parsed = UpdateAdminStationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isHttpUrl(parsed.data.sourceUrl) || !isSourceType(parsed.data.sourceType)) {
    res.status(400).json({ error: "Use an http:// or https:// stream source URL" });
    return;
  }

  const [station] = await db
    .update(stationSettingsTable)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(stationSettingsTable.id, 1))
    .returning();

  if (!station) {
    res.status(404).json({ error: "Station settings are not initialized" });
    return;
  }

  res.json(UpdateAdminStationResponse.parse(toAdminStation(station)));
});

router.post("/admin/stream/test", requireAdminSession, async (req, res): Promise<void> => {
  const parsed = TestAdminStreamBody.safeParse(req.body);
  if (!parsed.success || !isHttpUrl(parsed.data.sourceUrl)) {
    res.status(400).json({ error: "Use an http:// or https:// stream source URL" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const upstream = await fetch(parsed.data.sourceUrl, {
      headers: {
        Range: "bytes=0-1",
        Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
        "User-Agent": "USALB-RADIO/1.0",
      },
      signal: controller.signal,
    });
    const contentType = upstream.headers.get("content-type");
    await upstream.body?.cancel();

    res.json(
      TestAdminStreamResponse.parse({
        ok: upstream.ok,
        reachable: upstream.ok,
        contentType,
        message: upstream.ok
          ? "The source responded and is ready to use."
          : `The source responded with HTTP ${upstream.status}.`,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Stream source test failed");
    res.json(
      TestAdminStreamResponse.parse({
        ok: false,
        reachable: false,
        contentType: null,
        message: "The source could not be reached. Check the URL and encoder connection.",
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
});

export default router;