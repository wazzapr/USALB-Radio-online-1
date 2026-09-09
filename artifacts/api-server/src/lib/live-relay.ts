import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";

const LIVE_SOCKET_PATH = "/api/live/ws";

let broadcaster: WebSocket | null = null;
let live = false;
let mimeType: string | null = null;
let initialChunk: Buffer | null = null;
let pcmSampleRate: number | null = null;
let pcmChannels: number | null = null;
let initialPcmChunk: Buffer | null = null;
const pcmMagic = Buffer.from([0x50, 0x43, 0x4d, 0x31]);

type ListenerFormat = "webm" | "pcm";
type Listener = {
  socket: WebSocket;
  format: ListenerFormat;
};

const listeners = new Set<Listener>();

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
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

function stopBroadcast(socket?: WebSocket): void {
  if (socket && broadcaster !== socket) return;

  broadcaster = null;
  live = false;
  mimeType = null;
  initialChunk = null;
  pcmSampleRate = null;
  pcmChannels = null;
  initialPcmChunk = null;
  announceStatus();
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(data);
}

function attachBroadcaster(socket: WebSocket): void {
  if (broadcaster && broadcaster !== socket) {
    broadcaster.close(1012, "A new broadcast replaced this connection");
  }

  broadcaster = socket;
  live = false;
  mimeType = null;
  initialChunk = null;
  pcmSampleRate = null;
  pcmChannels = null;
  initialPcmChunk = null;
  announceStatus();

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      const chunk = rawDataToBuffer(data);
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
      return;
    }

    try {
      const message = JSON.parse(data.toString()) as {
        type?: string;
        mimeType?: string;
        pcmSampleRate?: number;
        pcmChannels?: number;
      };
      if (message.type === "start") {
        live = true;
        mimeType = message.mimeType || null;
        pcmSampleRate = Number.isFinite(message.pcmSampleRate) ? message.pcmSampleRate ?? null : null;
        pcmChannels = Number.isFinite(message.pcmChannels) ? message.pcmChannels ?? null : null;
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

function attachListener(socket: WebSocket, format: ListenerFormat): void {
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
  if (live && initialChunkForFormat && socket.readyState === WebSocket.OPEN) {
    socket.send(initialChunkForFormat);
  }

  socket.once("close", () => listeners.delete(listener));
  socket.once("error", () => listeners.delete(listener));
}

function handleConnection(socket: WebSocket, role: string | null, formatParam: string | null): void {
  if (role === "broadcaster") {
    attachBroadcaster(socket);
    return;
  }

  if (role === "listener") {
    attachListener(socket, formatParam === "pcm" ? "pcm" : "webm");
    return;
  }

  sendJson(socket, {
    type: "error",
    message: "Choose broadcaster or listener mode.",
  });
  socket.close(1008, "Invalid broadcast role");
}

export function getLiveBroadcastStatus(): boolean {
  return live;
}

export function attachLiveRelay(server: Server): void {
  const socketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(
      request.url ?? "",
      `http://${request.headers.host ?? "localhost"}`,
    );

    if (url.pathname !== LIVE_SOCKET_PATH) {
      socket.destroy();
      return;
    }

    socketServer.handleUpgrade(request, socket, head, (client) => {
      handleConnection(client, url.searchParams.get("role"), url.searchParams.get("format"));
    });
  });
}