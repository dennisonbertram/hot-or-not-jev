import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { rankPhotos } from "./jev.ts";
import { RateLimiter } from "./logic.ts";
import { prepare } from "./prep.ts";

const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error("TYPESAFE_API_KEY is required");
  process.exit(1);
}
const model = process.env.TYPESAFE_MODEL ?? "jev-preview";
const app = createApp({
  limiter: new RateLimiter(Number(process.env.RATE_LIMIT_PER_IP_PER_HOUR ?? 20), Number(process.env.DAILY_REQUEST_CAP ?? 500)),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "https://dennisonbertram.github.io,http://localhost:5173").split(",").map((s) => s.trim()),
  prepare,
  maxConcurrent: Number(process.env.MAX_CONCURRENT_BATCHES ?? 3),
  rank: (jpegs, names) => rankPhotos(key, model, jpegs, names),
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`listening on ${port}`));
