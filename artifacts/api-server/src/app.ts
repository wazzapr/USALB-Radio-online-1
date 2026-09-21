import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getLiveBroadcastStatus, handleLiveStreamRequest } from "./lib/live-relay";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.path === "/api/live/stream" && req.method === "GET") {
    handleLiveStreamRequest(req, res);
    return;
  }
  next();
});

app.get("/api/live/status", (_req, res) => {
  res.json({ live: getLiveBroadcastStatus() });
});

app.use("/api", router);

export default app;
