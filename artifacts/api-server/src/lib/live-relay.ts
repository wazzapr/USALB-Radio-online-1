import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";

const LIVE_SOCKET_PATH = "/api/live/ws";
const MP3_STREAM_PATH = "/api/live/stream";
const BROADCAST_KEY = process.env["USALB_BROADCAST_KEY"]?.trim() || process.env["ADMIN_ACCESS_KEY"]?.trim() || "";
const MAX_RECENT_MP3_BYTES = 96 * 1024;

let broadcaster: WebSocket | null = null;
let live = false;
let mimeType: string | null = null;
let initialChunk: Buffer | null = null;
let pcmSampleRate: number | null = null;
let pcmChannels: number | null = null;
let initialPcmChunk: Buffer | null = null;
let broadcastMode: "webm" | "pcm" | "mp3" | null = null;
const pcmMagic = Buffer.from([0x50, 0x43, 0x4d, 0x31]);
const listeners = new Set<{ socket: WebSocket; format: "webm" | "pcm" }>();
const mp3Listeners = new Set<ServerResponse>();
let recentMp3Chunks: Buffer[] = [];
let recentMp3Bytes = 0;

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function announceStatus(): void {
  for (const listener of listeners) {
    sendJson(listener.socket, {
      type: "status",
      live,
      audioMode: listener.format,
      mimeType: listener.format === "webm" ? mimeType : null,
      sampleRate: listener.format === "pcm" ? pcmSampleRate : null,
      channels: listener.format === "pcm" ? pcmChannels : null,
    });
  }
}

function endMp3Listeners(): void {
  for (const response of mp3Listeners) {
    try { response.end(); } catch { /* client already disconnected */ }
  }
  mp3Listeners.clear();
}

function stopBroadcast(socket?: WebSocket): void {
  if (socket && broadcaster !== socket) return;
  broadcaster = null;
  live = false;
  mimeType = null;
  initialChunk = null;
  pcmSampleRate = null;
  pcmChannels = null;
  initialPcmChunk = null;
  broadcastMode = null;
  recentMp3Chunks = [];
  recentMp3Bytes = 0;
  endMp3Listeners();
  announceStatus();
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(data);
}

function rememberMp3Chunk(chunk: Buffer): void {
  recentMp3Chunks.push(Buffer.from(chunk));
  recentMp3Bytes += chunk.length;
  while (recentMp3Bytes > MAX_RECENT_MP3_BYTES && recentMp3Chunks.length > 1) {
    const removed = recentMp3Chunks.shift();
    if (removed) recentMp3Bytes -= removed.length;
  }
}

function broadcastMp3Chunk(chunk: Buffer): void {
  rememberMp3Chunk(chunk);
  for (const response of mp3Listeners) {
    try {
      if (!response.writableEnded) response.write(chunk);
    } catch {
      mp3Listeners.delete(response);
    }
  }
}

function attachBroadcaster(socket: WebSocket, key: string | null): void {
  if (!BROADCAST_KEY || key !== BROADCAST_KEY) {
    sendJson(socket, { type: "error", message: "Broadcaster authentication failed." });
    socket.close(1008, "Broadcaster authentication failed");
    return;
  }

  if (broadcaster && broadcaster !== socket) broadcaster.close(1012, "A new broadcast replaced this connection");
  broadcaster = socket;
  live = false;
  mimeType = null;
  initialChunk = null;
  pcmSampleRate = null;
  pcmChannels = null;
  initialPcmChunk = null;
  broadcastMode = null;
  recentMp3Chunks = [];
  recentMp3Bytes = 0;
  announceStatus();

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      const chunk = rawDataToBuffer(data);
      if (broadcastMode === "mp3") {
        broadcastMp3Chunk(chunk);
      } else {
        const isPcm = chunk.subarray(0, pcmMagic.length).equals(pcmMagic);
        if (isPcm) {
          if (!initialPcmChunk) initialPcmChunk = Buffer.from(chunk);
        } else if (!initialChunk) {
          initialChunk = Buffer.from(chunk);
        }
        for (const listener of listeners) {
          if (listener.socket.readyState !== WebSocket.OPEN) continue;
          if ((listener.format === "pcm") !== isPcm) continue;
          listener.socket.send(chunk);
        }
      }
      return;
    }

    try {
      const message = JSON.parse(data.toString()) as {
        type?: string;
        mimeType?: string;
        pcmSampleRate?: number;
        pcmChannels?: number;
        codec?: string;
      };

      if (message.type === "start") {
        mimeType = message.mimeType || null;
        broadcastMode = message.mimeType === "audio/mpeg" || message.codec === "mp3"
          ? "mp3"
          : message.mimeType?.includes("pcm")
            ? "pcm"
            : "webm";
        pcmSampleRate = Number.isFinite(message.pcmSampleRate) ? message.pcmSampleRate ?? null : null;
        pcmChannels = Number.isFinite(message.pcmChannels) ? message.pcmChannels ?? null : null;
        live = true;
        announceStatus();
      } else if (message.type === "stop") {
        stopBroadcast(socket);
      }
    } catch {
      sendJson(socket, { type: "error", message: "Invalid broadcast message." });
    }
  });

  socket.once("close", () => stopBroadcast(socket));
  socket.once("error", () => stopBroadcast(socket));
}

function attachListener(socket: WebSocket, format: "webm" | "pcm"): void {
  const listener = { socket, format };
  listeners.add(listener);
  sendJson(socket, {
    type: "status",
    live,
    audioMode: format,
    mimeType: format === "webm" ? mimeType : null,
    sampleRate: format === "pcm" ? pcmSampleRate : null,
    channels: format === "pcm" ? pcmChannels : null,
  });
  const initialChunkForFormat = format === "pcm" ? initialPcmChunk : initialChunk;
  if (live && initialChunkForFormat && socket.readyState === WebSocket.OPEN) socket.send(initialChunkForFormat);
  socket.once("close", () => listeners.delete(listener));
  socket.once("error", () => listeners.delete(listener));
}

function handleConnection(socket: WebSocket, role: string | null, formatParam: string | null, key: string | null): void {
  if (role === "broadcaster") {
    attachBroadcaster(socket, key);
    return;
  }
  if (role === "listener") {
    attachListener(socket, formatParam === "pcm" ? "pcm" : "webm");
    return;
  }
  sendJson(socket, { type: "error", message: "Choose broadcaster or listener mode." });
  socket.close(1008, "Invalid broadcast role");
}

export function getLiveBroadcastStatus(): boolean {
  return live;
}

export function handleLiveStreamRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== MP3_STREAM_PATH || req.method !== "GET") return false;

  if (!live || broadcastMode !== "mp3") {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("USALB live stream is offline.");
    return true;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  mp3Listeners.add(res);
  for (const chunk of recentMp3Chunks) {
    if (!res.writableEnded) res.write(chunk);
  }

  const cleanup = () => mp3Listeners.delete(res);
  req.once("close", cleanup);
  res.once("close", cleanup);
  res.once("finish", cleanup);
  return true;
}

export function attachLiveRelay(server: Server): void {
  const socketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname !== LIVE_SOCKET_PATH) {
      socket.destroy();
      return;
    }
    socketServer.handleUpgrade(request, socket, head, (client) => {
      handleConnection(client, url.searchParams.get("role"), url.searchParams.get("format"), url.searchParams.get("key"));
    });
  });
}
