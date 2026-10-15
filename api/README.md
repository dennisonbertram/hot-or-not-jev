# Hot or Not, Jev Edition: API

Hono service that takes 2 to 10 photos of one person and asks TypeSafe's Jev model which one is the best dating-profile lead photo. The request and response format is in the repo's `CONTRACT.md`.

Photos stay in memory only. Nothing is written to disk, and the server logs no image bytes or filenames.

## Run locally

Needs Node 24 (it runs the TypeScript files directly, so there is no build step).

```sh
cd api
npm install
TYPESAFE_API_KEY=... npm start        # listens on :8787 (or $PORT)
curl -F photos=@a.jpg -F photos=@b.jpg -F photos=@c.jpg localhost:8787/v1/lead
```

```sh
npm test            # node:test, no network
npm run typecheck
```

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | required | TypeSafe API key. Never logged or returned. |
| `PORT` | `8787` | Railway sets this automatically. |
| `ALLOWED_ORIGINS` | `https://dennisonbertram.github.io,http://localhost:5173` | Comma-separated CORS origins. |
| `RATE_LIMIT_PER_IP_PER_HOUR` | `20` | Requests per client IP per hour. |
| `DAILY_REQUEST_CAP` | `500` | Total requests per 24 hours across all clients. |
| `TYPESAFE_MODEL` | `jev-preview` | Model name sent to TypeSafe (Box questions need Jev 1.14). |

Rate-limited requests get `429` with a `Retry-After` header. The limiter is in memory, so it works for a single instance and resets when the service restarts.

## Deploy to Railway

1. Create a Railway service from this repo and set its root directory to `api/`. Railway reads `api/railway.json` and builds `api/Dockerfile`.
2. Set `TYPESAFE_API_KEY` (and `ALLOWED_ORIGINS` if the site is on another origin).
3. Keep one replica. The rate limiter is per process.

Railway's edge proxy passes the client address in `X-Real-IP` (it does not send `X-Forwarded-For`), and the service uses that for per-IP limits. Outside Railway it falls back to the socket address.
