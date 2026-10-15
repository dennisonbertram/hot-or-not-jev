import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import { RateLimiter } from "../src/logic.ts";

const app = createApp({
  limiter: new RateLimiter(1, 100),
  allowedOrigins: ["http://localhost:5173"],
  prepare: async (b) => b,
  rank: async () => ({ lead: 0 }),
});
const post = (n: number, size = 10, ip = "9.9.9.9") => {
  const f = new FormData();
  for (let i = 0; i < n; i++) f.append("photos", new File([new Uint8Array(size)], `p${i}.jpg`));
  return app.request("/v1/lead", { method: "POST", body: f, headers: { "x-real-ip": ip } });
};

test("400 for 1 and 11 photos, 413 for oversize, 200 with disclaimer, 429 with Retry-After", async () => {
  assert.equal((await post(1, 10, "1.1.1.1")).status, 400);
  assert.equal((await post(11, 10, "1.1.1.2")).status, 400);
  const big = await post(2, 15 * 1024 * 1024 + 1, "1.1.1.3");
  assert.equal(big.status, 413);
  assert.equal((await big.json() as any).error.code, "too_large");
  const ok = await post(2, 10, "1.1.1.4");
  assert.equal(ok.status, 200);
  assert.ok(((await ok.json()) as any).disclaimer.startsWith("For fun."));
  const limited = await post(2, 10, "1.1.1.4");
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});
