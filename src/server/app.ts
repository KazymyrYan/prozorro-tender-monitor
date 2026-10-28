import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import {
  COOKIE_NAME,
  SESSION_DAYS,
  checkPassword,
  createToken,
  requireAuth,
} from "./auth.js";

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  // plain http on localhost, https on Render
  secure: process.env.NODE_ENV === "production",
};

// 5 wrong passwords per 15 minutes from one IP; successful logins don't count
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_attempts" },
});

export function createApp() {
  const app = express();
  // Render puts a proxy in front, so the real IP comes from the header
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/login", loginLimiter, (req, res) => {
    const password: unknown = req.body?.password;
    if (typeof password !== "string" || !checkPassword(password)) {
      res.status(401).json({ error: "wrong_password" });
      return;
    }
    res.cookie(COOKIE_NAME, createToken(), {
      ...cookieOptions,
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  });

  app.post("/api/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ ok: true });
  });

  app.get("/api/me", requireAuth, (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  return app;
}
