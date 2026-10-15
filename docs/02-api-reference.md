# API reference

Base URL: `https://api-production-2997b.up.railway.app`

No authentication. The server holds the TypeSafe key.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| POST | `/v1/lead` | Pick the lead photo from 2 to 10 photos |

### GET /health

```json
{"ok": true, "model": "jev-preview"}
```

## POST /v1/lead

Content type: `multipart/form-data`. Send one part named `photos` per file.

### Request rules

- 2 to 10 files. Anything else returns `400 bad_request`.
- Formats: JPEG, PNG, WebP, and HEIC when the server's image library (sharp) can decode it.
- Each file is at most 15 MB. A larger file returns `413 too_large`.
- The server prepares each image before Jev sees it: it rotates by EXIF orientation, converts to JPEG, fits the longest side to 1024 px, and upscales the short side to at least 256 px.
- All photos should show the same person. That is the point of the same-person check.
- Nothing is written to disk or logged.

### Response (200)

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

### Top-level fields

| Field | Type | Meaning |
| --- | --- | --- |
| `lead` | integer | Index of the chosen lead photo. Indices follow upload order, starting at 0. |
| `ranking` | integer[] | All photo indices, best lead first. See [ranking rule](#ranking-rule). |
| `photos` | object[] | One entry per uploaded photo, in upload order. |
| `lead_face` | object | Box around the face in the lead photo. |
| `model` | string | Jev version that produced the result, for example `jev-1.14.0`. |
| `usage` | object | `input_tokens` and `output_tokens` the request used at TypeSafe. |
| `disclaimer` | string | A short notice to show to your users. See [fair play](05-fair-play.md). |

### Photo fields (`photos[]`)

| Field | Type | Meaning |
| --- | --- | --- |
| `index` | integer | Position in your upload, starting at 0. |
| `filename` | string | The filename you uploaded. |
| `lead_score` | number | How good a dating-profile lead photo this is. Score expected value from 0 to 3 (4 levels). |
| `hotness` | number | Jev's "hotness" score for the photo. Score expected value from 0 to 3 (4 levels). |
| `vibe` | string | One of `sporty_outdoorsy`, `polished_glamorous`, `artsy_creative`, `warm_approachable`, `fun_social`, `mysterious_edgy`. |
| `people` | string | `none`, `one`, or `several`: how many people are the main subject. |
| `same_person` | number or null | Probability (0 to 1) that the photo shows the same person as the lead. `null` for the lead photo itself. |
| `flags` | string[] | Problems with the photo. See [flags](#flags). |

A Score expected value is a probability-weighted average over the score levels, so values land between the levels (for example 2.41). See [how it works](04-how-it-works.md#score).

### lead_face

A box on the lead photo. Values are fractions of the image height (`top`, `bottom`) and width (`left`, `right`), from 0 to 1, measured from the top-left corner.

| Field | Type | Meaning |
| --- | --- | --- |
| `top`, `bottom` | number | Vertical edges as a fraction of image height. |
| `left`, `right` | number | Horizontal edges as a fraction of image width. |
| `confidence` | number | Confidence value returned by Jev for the box. |

The fractions apply to the image as the server prepared it (rotated, and resized with its aspect ratio kept). They map onto your original image as long as you display it upright, which is what EXIF-aware browsers and Pillow's `ImageOps.exif_transpose` do. See [examples](03-examples.md#draw-the-face-crop).

### Flags

| Flag | Set when |
| --- | --- |
| `not_same_person` | `same_person` is below 0.5. |
| `no_person` | `people` is `none`. |
| `group` | `people` is `several`. |
| `face_hidden` | Jev judges the face is hidden (a Noul probability). Flagged when that probability is above 0.5. |

### Ranking rule

`ranking` sorts photos by `lead_score`, highest first. Ties are broken by `hotness`. Photos flagged `not_same_person` or `no_person` always go last. `lead` is the first entry of `ranking`.

## Errors

Every error uses this shape:

```json
{"error": {"code": "bad_request", "message": "Send between 2 and 10 photos."}}
```

| Status | Code | Cause |
| --- | --- | --- |
| 400 | `bad_request` | Fewer than 2 or more than 10 photos, or a file that cannot be read as an image. |
| 413 | `too_large` | A file is over 15 MB. |
| 429 | `rate_limited` | Per-IP hourly limit or global daily cap reached. Includes `Retry-After`. |
| 503 | `busy` | Jev is already judging 3 batches. Includes `Retry-After: 5`; does not use your quota. |
| 502 | `upstream_error` | The TypeSafe call failed. Try again later. |

The `message` text above is an example. Branch on `code`, not on `message`.

Example 429:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 1800
Content-Type: application/json

{"error": {"code": "rate_limited", "message": "Too many requests. Try again later."}}
```

## Rate limits

- Per IP: 20 requests per hour by default.
- Global: 500 requests per day across all users by default.
- Both are deployment settings (`RATE_LIMIT_PER_IP_PER_HOUR`, `DAILY_REQUEST_CAP`), so they can change. The live service currently uses 20 per IP per hour and 500 per day. Requests that are rejected for bad input still count.
- A `429` carries a `Retry-After` header. Wait that long before you retry. It is sent in seconds, as HTTP specifies.

## CORS

Browsers can call the API only from allowed origins. By default these are the project's GitHub Pages site and `localhost`. Calls from `curl`, Node, and Python are not affected by CORS.
