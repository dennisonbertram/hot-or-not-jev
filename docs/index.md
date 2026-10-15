# Hot or Not, Jev Edition

Upload 2 to 10 photos of one person. TypeSafe Jev picks the best dating-profile lead photo, scores how "hot" each photo is, flags photos that do not show the same person, and draws a box around the lead's face.

It is a public, free API with no key. It is a demo of [TypeSafe's Jev model](https://typesafe.ai/blog/jev-1-14) judging images. Read the [fair play page](05-fair-play.md) before you build anything serious on it.

## 30-second quickstart

```sh
curl -X POST https://api-production-2997b.up.railway.app/v1/lead \
  -F "photos=@beach.jpg" \
  -F "photos=@hiking.jpg" \
  -F "photos=@dinner.jpg"
```

Send every file as a part named `photos`. You need at least 2 and at most 10.

## What you get back

```json
{
  "lead": 2,
  "ranking": [2, 0, 1],
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

(The `photos` array is shortened here. The real response has one entry per uploaded file.)

- `lead` is the index (0-based, in upload order) of the recommended lead photo.
- `ranking` lists all indices from best to worst lead.
- Each photo gets a lead score, a hotness score, a vibe, a head count, a same-person probability, and flags.
- `lead_face` is a box around the lead's face, as fractions of the image size.

## Where to go next

1. [API reference](02-api-reference.md): endpoints, limits, every response field, errors.
2. [Examples](03-examples.md): curl, JavaScript, Python, and how to draw the face box.
3. [How it works](04-how-it-works.md): how Jev is called.
4. [Fair play](05-fair-play.md): privacy, disclaimers, and the bias audit.
