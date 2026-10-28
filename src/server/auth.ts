import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const COOKIE_NAME = "session";
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set, check your .env`);
  return value;
}

/** Fails fast at startup instead of on the first login. */
export function assertAuthEnv(): void {
  requireEnv("APP_PASSWORD");
  requireEnv("SESSION_SECRET");
}

function sign(value: string): string {
  return createHmac("sha256", requireEnv("SESSION_SECRET"))
    .update(value)
    .digest("hex");
}

// hash first so both buffers have the same length
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(input: string): boolean {
  return safeEqual(input, requireEnv("APP_PASSWORD"));
}

// token = issue time + signature, nothing is stored on the server
export function createToken(): string {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function isValidToken(token: unknown): boolean {
  if (typeof token !== "string") return false;
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;
  if (!safeEqual(signature, sign(issuedAt))) return false;
  const age = Date.now() - Number(issuedAt);
  return age >= 0 && age < SESSION_MS;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isValidToken(req.cookies?.[COOKIE_NAME])) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
}
