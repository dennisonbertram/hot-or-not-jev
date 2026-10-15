// Pure logic: lead pick, ranking, flags, rate limiting, upload validation.

export const VIBES = ["sporty_outdoorsy", "polished_glamorous", "artsy_creative", "warm_approachable", "fun_social", "mysterious_edgy"] as const;
export type People = "none" | "one" | "several";
export type Flag = "not_same_person" | "no_person" | "group" | "face_hidden";

export interface PhotoAnswers {
  lead: number; // lead Score expected value, 0..3
  hotness: number; // "attractive" Score expected value, 0..3
  vibe: string;
  people: People;
  faceHidden: number; // Noul probability
}

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const byScore = (p: PhotoAnswers[]) => (a: number, b: number) =>
  p[b].lead - p[a].lead || p[b].hotness - p[a].hotness || a - b;

/** Best lead photo: highest lead score (tie: hotness), skipping photos with no person if any show one. */
export function pickLead(photos: PhotoAnswers[]): number {
  const all = photos.map((_, i) => i);
  const withPerson = all.filter((i) => photos[i].people !== "none");
  return (withPerson.length ? withPerson : all).sort(byScore(photos))[0];
}

/** `same` maps photo index to the same-person probability; the lead has no entry. */
export function assemble(photos: PhotoAnswers[], filenames: string[], lead: number, same: Map<number, number>) {
  const out = photos.map((p, index) => {
    const sp = index === lead ? null : (same.get(index) ?? null);
    const flags: Flag[] = [];
    if (sp !== null && sp < 0.5) flags.push("not_same_person");
    if (p.people === "none") flags.push("no_person");
    if (p.people === "several") flags.push("group");
    if (p.faceHidden > 0.5) flags.push("face_hidden");
    return { index, filename: filenames[index], lead_score: p.lead, hotness: p.hotness, vibe: p.vibe, people: p.people, same_person: sp, flags };
  });
  const demoted = (i: number) => out[i].flags.includes("not_same_person") || out[i].flags.includes("no_person");
  const cmp = byScore(photos);
  const ranking = photos.map((_, i) => i).sort((a, b) => Number(demoted(a)) - Number(demoted(b)) || cmp(a, b));
  return { lead, ranking, photos: out };
}

// ponytail: in-memory, one Railway instance only; counters reset on restart/redeploy.
// Upgrade path: Redis (INCR + EXPIRE) or Railway's Redis plugin if we ever scale out.
export class RateLimiter {
  private ips = new Map<string, { start: number; n: number }>();
  private day = { start: 0, n: 0 };
  private perIpPerHour: number;
  private dailyCap: number;
  private now: () => number;
  private maxIps: number;
  constructor(perIpPerHour: number, dailyCap: number, now: () => number = Date.now, maxIps = 10_000) {
    this.maxIps = maxIps;
    this.perIpPerHour = perIpPerHour;
    this.dailyCap = dailyCap;
    this.now = now;
  }

  get size() {
    return this.ips.size;
  }

  check(ip: string): { ok: true } | { ok: false; retryAfter: number } {
    const t = this.now();
    if (t - this.day.start >= 86_400_000) this.day = { start: t, n: 0 };
    if (this.day.n >= this.dailyCap) return { ok: false, retryAfter: Math.ceil((this.day.start + 86_400_000 - t) / 1000) };
    if (this.ips.size >= this.maxIps) {
      for (const [k, v] of this.ips) if (t - v.start >= 3_600_000) this.ips.delete(k);
      // Still full: drop the oldest entries (Map keeps insertion order).
      for (const k of this.ips.keys()) {
        if (this.ips.size < this.maxIps) break;
        this.ips.delete(k);
      }
    }
    let e = this.ips.get(ip);
    if (!e || t - e.start >= 3_600_000) {
      this.ips.delete(ip); // re-insert so the Map stays ordered by window start
      this.ips.set(ip, (e = { start: t, n: 0 }));
    }
    if (e.n >= this.perIpPerHour) return { ok: false, retryAfter: Math.ceil((e.start + 3_600_000 - t) / 1000) };
    e.n++;
    this.day.n++;
    return { ok: true };
  }
}

export interface ApiError { status: 400 | 413; code: "bad_request" | "too_large"; message: string }

export function validateUpload(files: { size: number }[]): ApiError | null {
  if (files.length < MIN_PHOTOS || files.length > MAX_PHOTOS)
    return { status: 400, code: "bad_request", message: `Send between ${MIN_PHOTOS} and ${MAX_PHOTOS} photos.` };
  if (files.some((f) => f.size > MAX_FILE_BYTES))
    return { status: 413, code: "too_large", message: "Each photo must be 15 MB or smaller." };
  return null;
}
