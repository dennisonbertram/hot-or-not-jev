import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getConnInfo } from "@hono/node-server/conninfo";
import { MAX_FILE_BYTES, MAX_PHOTOS, RateLimiter, validateUpload } from "./logic.ts";
import { UpstreamError } from "./jev.ts";

export const DISCLAIMER =
  "For fun. Jev rates photos, not people. Our own bias test found Jev's hotness score ignores skin tone but docks about a quarter point for looking older or heavier.";

export interface Deps {
  limiter: RateLimiter;
  allowedOrigins: string[];
  prepare: (b: Buffer) => Promise<Buffer>;
  rank: (jpegs: Buffer[], filenames: string[]) => Promise<object>;
}

const err = (c: any, status: number, code: string, message: string) => c.json({ error: { code, message } }, status);

export function createApp(d: Deps) {
  const app = new Hono();
  app.use("*", cors({ origin: d.allowedOrigins, allowMethods: ["GET", "POST", "OPTIONS"], exposeHeaders: ["Retry-After"] }));

  app.get("/health", (c) => c.json({ ok: true, model: "jev-preview" }));

  app.post(
    "/v1/lead",
    bodyLimit({ maxSize: MAX_PHOTOS * MAX_FILE_BYTES + 1024 * 1024, onError: (c) => err(c, 413, "too_large", "Request is too large.") }),
    async (c) => {
      // Railway's edge sets X-Real-IP; fall back to the socket address for local runs.
      const ip = c.req.header("x-real-ip") ?? getConnInfo(c).remote.address ?? "unknown";
      const rl = d.limiter.check(ip);
      if (!rl.ok) {
        c.header("Retry-After", String(rl.retryAfter));
        return err(c, 429, "rate_limited", "Jev needs a break. Try again later.");
      }
      let files: File[];
      try {
        files = (await c.req.formData()).getAll("photos").filter((v): v is File => typeof v !== "string");
      } catch {
        return err(c, 400, "bad_request", "Send multipart/form-data with parts named photos.");
      }
      const bad = validateUpload(files);
      if (bad) return err(c, bad.status, bad.code, bad.message);

      let jpegs: Buffer[];
      try {
        jpegs = await Promise.all(files.map(async (f) => d.prepare(Buffer.from(await f.arrayBuffer()))));
      } catch {
        return err(c, 400, "bad_request", "One of the photos could not be read as an image.");
      }
      try {
        const result = await d.rank(jpegs, files.map((f) => f.name));
        return c.json({ ...result, disclaimer: DISCLAIMER });
      } catch (e) {
        if (!(e instanceof UpstreamError)) console.error("unexpected error", e instanceof Error ? e.name : "unknown");
        return err(c, 502, "upstream_error", "Jev could not be reached. Try again.");
      }
    },
  );

  app.notFound((c) => err(c, 404, "not_found", "Not found."));
  app.onError((c) => err(c, 500, "internal_error", "Something went wrong."));
  return app;
}
