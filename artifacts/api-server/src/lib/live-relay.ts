import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";

const LIVE_SOCKET_PATH = "/api/live/ws";

let broadcaster: WebSocket | null = null;
let live = false;
let mimeType: string | null = null;
let initialChunk: Buffer | null = null;
const listeners = new Set<WebSocket>();

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function announceStatus(): void {
  for (const listener of listeners) {
    sendJson(listener, { type: "status", live, mimeType });
  }
}

function stopBroadcast(socket?: WebSocket): void {
  if (socket && broadcaster !== socket) return;

  broadcaster = null;
  live = false;
  mimeType = null;
  initialChunk = null;
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
  announceStatus();

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      const chunk = rawDataToBuffer(data);
      if (!initialChunk) initialChunk = Buffer.from(chunk);

      for (const listener of listeners) {
        if (listener.readyState === WebSocket.OPEN) listener.send(chunk);
      }
      return;
    }

    try {
      const message = JSON.parse(data.toString()) as {
        type?: string;
        mimeType?: string;
      };
      if (message.type === "start") {
        live = true;
        mimeType = message.mimeType || null;
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

function attachListener(socket: WebSocket): void {
  listeners.add(socket);
  sendJson(socket, { type: "status", live, mimeType });
  if (live && initialChunk && socket.readyState === WebSocket.OPEN) {
    socket.send(initialChunk);
  }

  socket.once("close", () => listeners.delete(socket));
  socket.once("error", () => listeners.delete(socket));
}

function handleConnection(socket: WebSocket, role: string | null): void {
  if (role === "broadcaster") {
    attachBroadcaster(socket);
    return;
  }

  if (role === "listener") {
    attachListener(socket);
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
      handleConnection(client, url.searchParams.get("role"));
    });
  });
}