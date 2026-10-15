import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble, pickLead, RateLimiter, validateUpload, type PhotoAnswers } from "../src/logic.ts";

const ph = (lead: number, hotness: number, o: Partial<PhotoAnswers> = {}): PhotoAnswers => ({
  lead, hotness, vibe: "warm_approachable", people: "one", faceHidden: 0.1, ...o,
});
const photos = [
  ph(1.5, 2.0), // 0 ok
  ph(2.6, 2.4), // 1 impostor: high score but not the lead's person
  ph(2.9, 2.9), // 2 lead
  ph(0.2, 0.5, { people: "none" }), // 3 no_person
  ph(2.0, 1.0, { people: "several", faceHidden: 0.9 }), // 4 group + face_hidden
  ph(1.5, 2.5), // 5 ties with 0 on lead, wins on hotness
];

test("pickLead takes the highest lead score, ignoring photos with no person", () => {
  assert.equal(pickLead(photos), 2);
  assert.equal(pickLead([ph(0.1, 0.1), ph(0.5, 0.2, { people: "none" })]), 0);
});

test("assemble: ranking puts not_same_person and no_person last; flags set", () => {
  const same = new Map([[0, 0.9], [1, 0.2], [3, 0.8], [4, 0.7], [5, 0.95]]);
  const r = assemble(photos, ["a", "b", "c", "d", "e", "f"], 2, same);
  assert.equal(r.lead, 2);
  assert.deepEqual(r.ranking, [2, 4, 5, 0, 1, 3]);
  assert.equal(r.photos[2].same_person, null);
  assert.deepEqual(r.photos[2].flags, []);
  assert.deepEqual(r.photos[1].flags, ["not_same_person"]);
  assert.deepEqual(r.photos[3].flags, ["no_person"]);
  assert.deepEqual(r.photos[4].flags, ["group", "face_hidden"]);
  assert.equal(r.photos[0].filename, "a");
});

test("rate limiter: per-IP hourly limit with Retry-After, then resets", () => {
  let t = 0;
  const l = new RateLimiter(2, 100, () => t);
  assert.equal(l.check("1.1.1.1").ok, true);
  assert.equal(l.check("1.1.1.1").ok, true);
  t = 600_000;
  const r = l.check("1.1.1.1");
  assert.deepEqual(r, { ok: false, retryAfter: 3000 });
  assert.equal(l.check("2.2.2.2").ok, true);
  t = 3_600_001;
  assert.equal(l.check("1.1.1.1").ok, true);
});

test("rate limiter: global daily cap", () => {
  let t = 0;
  const l = new RateLimiter(100, 3, () => t);
  for (const ip of ["a", "b", "c"]) assert.equal(l.check(ip).ok, true);
  assert.deepEqual(l.check("d"), { ok: false, retryAfter: 86400 });
  t = 86_400_001;
  assert.equal(l.check("d").ok, true);
});

test("validateUpload: photo count and size", () => {
  const f = (size: number) => ({ size });
  assert.deepEqual(validateUpload([f(1)]), { status: 400, code: "bad_request", message: "Send between 2 and 10 photos." });
  assert.equal(validateUpload(Array(11).fill(f(1)))?.status, 400);
  assert.equal(validateUpload([f(1), f(15 * 1024 * 1024 + 1)])?.status, 413);
  assert.equal(validateUpload([f(1), f(15 * 1024 * 1024)]), null);
});

test("rate limiter: exhausted daily cap does not insert IPs; IP map stays bounded", () => {
  const capped = new RateLimiter(5, 1, () => 0);
  capped.check("a");
  for (let i = 0; i < 50; i++) capped.check(`x${i}`);
  assert.equal(capped.size, 1);
  const l = new RateLimiter(5, 1_000_000, () => 0, 100);
  for (let i = 0; i < 500; i++) l.check(`ip${i}`);
  assert.ok(l.size <= 100);
});

test("assemble returns unrounded numbers", () => {
  const r = assemble([ph(2.123456, 1.987654), ph(1, 1)], ["a", "b"], 0, new Map([[1, 0.499]]));
  assert.equal(r.photos[0].lead_score, 2.123456);
  assert.equal(r.photos[1].same_person, 0.499);
  assert.deepEqual(r.photos[1].flags, ["not_same_person"]);
});
