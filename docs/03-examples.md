# Examples

All examples use the base URL `https://api-production-2997b.up.railway.app`. Send each photo as a part named `photos`.

## curl

```sh
curl -X POST https://api-production-2997b.up.railway.app/v1/lead \
  -F "photos=@beach.jpg" \
  -F "photos=@hiking.jpg" \
  -F "photos=@dinner.jpg"
```

Pretty-print and show just the lead and ranking:

```sh
curl -s -X POST https://api-production-2997b.up.railway.app/v1/lead \
  -F "photos=@beach.jpg" -F "photos=@hiking.jpg" -F "photos=@dinner.jpg" \
  | jq '{lead, ranking, flags: [.photos[] | {filename, flags}]}'
```

## JavaScript, browser

```js
const input = document.querySelector('input[type=file][multiple]');

const form = new FormData();
for (const file of input.files) form.append('photos', file);

const res = await fetch('https://api-production-2997b.up.railway.app/v1/lead', { method: 'POST', body: form });
const data = await res.json();

if (!res.ok) {
  if (res.status === 429) console.warn('Retry in', res.headers.get('Retry-After'), 'seconds');
  throw new Error(`${data.error.code}: ${data.error.message}`);
}

console.log('Lead photo:', data.photos[data.lead].filename);
```

Do not set the `Content-Type` header yourself. The browser adds the multipart boundary.

## JavaScript, Node 24

Node 24 has `fetch`, `FormData`, and `Blob` built in.

```js
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const files = ['beach.jpg', 'hiking.jpg', 'dinner.jpg'];

const form = new FormData();
for (const path of files) {
  form.append('photos', new Blob([await readFile(path)]), basename(path));
}

const res = await fetch('https://api-production-2997b.up.railway.app/v1/lead', { method: 'POST', body: form });
const data = await res.json();
if (!res.ok) throw new Error(`${data.error.code}: ${data.error.message}`);

console.log('Lead:', data.photos[data.lead].filename);
console.log('Ranking:', data.ranking.map((i) => data.photos[i].filename));
```

## Python (requests)

```python
import requests

paths = ["beach.jpg", "hiking.jpg", "dinner.jpg"]
files = [("photos", (p, open(p, "rb"))) for p in paths]

res = requests.post("https://api-production-2997b.up.railway.app/v1/lead", files=files, timeout=120)
data = res.json()

if not res.ok:
    if res.status_code == 429:
        print("Retry after", res.headers.get("Retry-After"), "seconds")
    raise SystemExit(f"{data['error']['code']}: {data['error']['message']}")

lead = data["photos"][data["lead"]]
print("Lead:", lead["filename"], "lead_score", lead["lead_score"])
for p in data["photos"]:
    if p["flags"]:
        print(p["filename"], "flags:", p["flags"])
```

## Draw the face crop

`lead_face` holds fractions, so multiply by the image size you are drawing on. These snippets draw the box on the lead photo and use the fields `top`, `bottom`, `left`, `right`.

### Canvas

```js
// `img` is the loaded <img> of the lead photo; `canvas` is a <canvas> element.
function drawFace(img, canvas, face) {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const x = face.left * canvas.width;
  const y = face.top * canvas.height;
  const w = (face.right - face.left) * canvas.width;
  const h = (face.bottom - face.top) * canvas.height;

  ctx.lineWidth = Math.max(2, canvas.width / 200);
  ctx.strokeStyle = '#ff3b81';
  ctx.strokeRect(x, y, w, h);
}

// drawFace(img, canvas, data.lead_face);
```

To crop instead of outline, use `ctx.drawImage(img, x, y, w, h, 0, 0, w, h)` on a canvas of size `w` by `h`.

### Pillow

```python
from PIL import Image, ImageDraw, ImageOps

def draw_face(path, face, out="lead_boxed.jpg"):
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    w, h = img.size
    box = (face["left"] * w, face["top"] * h, face["right"] * w, face["bottom"] * h)
    ImageDraw.Draw(img).rectangle(box, outline="#ff3b81", width=max(2, w // 200))
    img.save(out)

    # To crop instead: img.crop(tuple(int(v) for v in box)).save("lead_face.jpg")

# draw_face("dinner.jpg", data["lead_face"])
```
