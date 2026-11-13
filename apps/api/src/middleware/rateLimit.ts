import rateLimit from "express-rate-limit";
import { env } from "../env";

const disabled = () => env.rateLimitDisabled;

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: disabled,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests, please slow down" } },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.authRateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: disabled,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many authentication attempts" },
  },
});

export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: disabled,
  message: { error: { code: "RATE_LIMITED", message: "Too many uploads" } },
});
