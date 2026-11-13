import pino from "pino";
import { env } from "../env";

export const logger = pino({
  level: env.nodeEnv === "test" ? "silent" : env.isProd ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers['set-cookie']",
      "password",
      "passwordHash",
    ],
    censor: "[redacted]",
  },
});
