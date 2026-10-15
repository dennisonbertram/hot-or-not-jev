import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import { RateLimiter } from "../src/logic.ts";

const app = createApp({
  limiter: new RateLimiter(1, 100),
  allowedOrigins: ["http://localhost:5173"],
  prepare: async (b) => b,
  maxConcurrent: 3,
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

test("503 busy when in-flight cap is full, before the body is read", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = createApp({ limiter: new RateLimiter(100, 100), allowedOrigins: [], prepare: async (b) => b, maxConcurrent: 1, rank: async () => (await gate, {}) });
  const f = () => { const x = new FormData(); x.append("photos", new File(["a"], "a.jpg")); x.append("photos", new File(["b"], "b.jpg")); return x; };
  const first = a.request("/v1/lead", { method: "POST", body: f(), headers: { "x-real-ip": "5.5.5.5" } });
  await new Promise((r) => setTimeout(r, 20));
  const busy = await a.request("/v1/lead", { method: "POST", body: f(), headers: { "x-real-ip": "5.5.5.6" } });
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get("retry-after"), "5");
  assert.equal(((await busy.json()) as any).error.code, "busy");
  release();
  assert.equal((await first).status, 200);
});

test("429 is returned before the body is read", async () => {
  const a = createApp({ limiter: new RateLimiter(0, 100), allowedOrigins: [], prepare: async (b) => b, maxConcurrent: 3, rank: async () => ({}) });
  const r = await a.request("/v1/lead", { method: "POST", body: "not multipart", headers: { "x-real-ip": "7.7.7.7" } });
  assert.equal(r.status, 429);
});

test("internal throw returns JSON 500", async () => {
  const bad = { check: () => { throw new Error("boom"); } } as unknown as RateLimiter;
  const a = createApp({ limiter: bad, allowedOrigins: [], prepare: async (b) => b, maxConcurrent: 3, rank: async () => ({}) });
  const r = await a.request("/v1/lead", { method: "POST", body: "x", headers: { "x-real-ip": "8.8.8.8" } });
  assert.equal(r.status, 500);
  assert.equal(((await r.json()) as any).error.code, "internal_error");
});
