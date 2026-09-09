import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { RequestHandler } from "express";

export const ADMIN_SESSION_COOKIE = "usalb_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for admin sessions");
  }
  return secret;
}

function signature(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function keysMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function cookieValue(req: Parameters<RequestHandler>[0]): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  const cookie = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));

  return cookie?.slice(`${ADMIN_SESSION_COOKIE}=`.length);
}

export function hasAdminSession(req: Parameters<RequestHandler>[0]): boolean {
  const value = cookieValue(req);
  if (!value) return false;

  const [issuedAt, providedSignature] = value.split(".");
  const timestamp = Number(issuedAt);
  if (!issuedAt || !providedSignature || !Number.isFinite(timestamp)) {
    return false;
  }

  if (Date.now() - timestamp > SESSION_TTL_MS || timestamp > Date.now() + 60_000) {
    return false;
  }

  return keysMatch(signature(`admin:${issuedAt}`), providedSignature);
}

export const requireAdminSession: RequestHandler = (req, res, next) => {
  if (!hasAdminSession(req)) {
    res.status(401).json({ error: "Admin access key required" });
    return;
  }

  next();
};

export function accessKeyMatches(accessKey: string): boolean {
  const expected = process.env.ADMIN_ACCESS_KEY;
  if (!expected) {
    throw new Error("ADMIN_ACCESS_KEY is required for admin login");
  }

  return keysMatch(accessKey, expected);
}

export function setAdminSession(res: Parameters<RequestHandler>[1]): void {
  const issuedAt = String(Date.now());
  const value = `${issuedAt}.${signature(`admin:${issuedAt}`)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_MS / 1000}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
}

export function clearAdminSession(res: Parameters<RequestHandler>[1]): void {
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
  );
}