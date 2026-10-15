# Hot or Not, Jev Edition: shared contract

Repo: github.com/dennisonbertram/hot-or-not-jev (public)

```
api/      Node 24 + TypeScript + Hono service, deployed to Railway (Dockerfile)
web/      Static site (Vite, vanilla TS) deployed to GitHub Pages by Actions
docs/     Markdown docs, also rendered on the Pages site at /docs/
```

## API

Base URL: Railway public domain (TBD at deploy), read by the site from
`VITE_API_URL` at build time.

### `GET /health`
`200 {"ok": true, "model": "jev-preview"}`

### `POST /v1/lead`
`multipart/form-data`, one or more parts named `photos` (2 to 10 files).
Accepts JPEG, PNG, WebP, HEIC if sharp can decode it; each file at most 15 MB.
The server rotates per EXIF, converts to JPEG, fits the longest side to 1024 px
and upscales the short side to at least 256 px. Nothing is written to disk or logged.

Response `200`:
```json
{
  "lead": 2,
  "ranking": [2, 0, 4, 1, 3],
  "photos": [
    {
      "index": 0,
      "filename": "beach.jpg",
      "lead_score": 2.41,
      "hotness": 2.63,
      "vibe": "sporty_outdoorsy",
      "people": "one",
      "same_person": 0.91,
      "flags": []
    }
  ],
  "lead_face": {"top": 0.08, "bottom": 0.52, "left": 0.30, "right": 0.71, "confidence": 0.31},
  "model": "jev-1.14.0",
  "usage": {"input_tokens": 41000, "output_tokens": 1100},
  "disclaimer": "For fun. Jev's opinion about photos, not about people. ..."
}
```
- `lead_score` and `hotness`: Jev Score expected value, 0 to 3 (4 levels).
- `vibe`: one of `sporty_outdoorsy`, `polished_glamorous`, `artsy_creative`,
  `warm_approachable`, `fun_social`, `mysterious_edgy`.
- `people`: `none`, `one`, `several` (people who are the main subject).
- `same_person`: probability the photo shows the lead's person; `null` for the lead.
- `flags`: any of `not_same_person` (same_person < 0.5), `no_person`, `group`
  (`people` = several), `face_hidden`.
- `lead_face`: Box on the lead photo, fractions of width/height.
- `ranking`: indices by lead_score desc, tie-break hotness; photos flagged
  `not_same_person` or `no_person` are ranked last.

Errors (JSON `{"error": {"code": "...", "message": "..."}}`):
- `400 bad_request`: fewer than 2 or more than 10 photos, unreadable image.
- `413 too_large`: file over 15 MB.
- `429 rate_limited`: per-IP limit (`RATE_LIMIT_PER_IP_PER_HOUR`, default 20)
  or global daily cap (`DAILY_REQUEST_CAP`, default 500); includes `Retry-After`.
- `503 busy`: `MAX_CONCURRENT_BATCHES` (default 3) batches already in progress;
  `Retry-After: 5`; checked before the body is read; uses no quota.
- `502 upstream_error`: TypeSafe failed.

CORS: allow `ALLOWED_ORIGINS` (comma list; default the Pages origin and localhost).

### Jev calls (server side, model `jev-preview`, header `TypeSafe-Danger-Zone-Images: true`)
1. Request A, state `{"photos": [...]}`; per photo `lead_i` Score, `hot_i` Score,
   `vibe_i` Choice, `people_i` Choice (main subjects only), `face_hidden_i` Noul.
2. Code picks the lead.
3. Request B, state `{"lead": ref, "photos": [others]}`; `same_j` Noul per other
   photo, `face` Box on the lead.

Env: `TYPESAFE_API_KEY` (required), `PORT`, `ALLOWED_ORIGINS`,
`RATE_LIMIT_PER_IP_PER_HOUR`, `DAILY_REQUEST_CAP`, `TYPESAFE_MODEL` (default `jev-preview`).
