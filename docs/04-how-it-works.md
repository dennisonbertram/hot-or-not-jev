# How it works

The service is a thin layer over [TypeSafe](https://docs.typesafe.ai/images)'s Jev model. Jev answers typed questions about images. Our code asks the questions, does the arithmetic, and picks the winner. Jev is not asked "which photo is best?" in free text.

Model: `jev-preview` at TypeSafe, which was `jev-1.14.0` for the audited results ([blog post](https://typesafe.ai/blog/jev-1-14)). Images and the Box primitive are "dreamer-ready" experimental features at TypeSafe, and the request sends the header `TypeSafe-Danger-Zone-Images: true` to turn images on. The server does this for you, so API users need no TypeSafe key.

## The two requests

### Request A: score every photo

One System One request carries all the photos as state, `{"photos": [...]}`. For each photo it asks:

| Question | Primitive | Becomes |
| --- | --- | --- |
| How good a lead photo is this? | Score | `lead_score` |
| How hot is this photo? | Score | `hotness` |
| Which vibe fits? | Choice | `vibe` |
| How many people are the main subjects? | Choice | `people` |
| Is the face hidden? | Noul | the `face_hidden` flag |

### The code picks the lead

Plain code ranks the photos by `lead_score`, breaking ties with `hotness`. This is the [ranking rule](02-api-reference.md#ranking-rule). The model supplies numbers. The decision is ordinary code you can read.

### Request B: check the person, box the face

A second request has state `{"lead": <the lead photo>, "photos": [the others]}`. It asks:

- For each other photo, a Noul question: is this the same person as the lead? The answer is `same_person`, and below 0.5 it sets the `not_same_person` flag.
- One Box on the lead photo: where is the face? The answer is `lead_face`.

The lead photo's own `same_person` is `null`, because it is the reference.

## Score

A Score question answers on a few levels. Here there are 4 levels, numbered 0 to 3. Jev gives a probability for each level, and the API returns the expected value: the sum of each level times its probability. A photo that is likely a 2 and possibly a 3 comes out around 2.4. This keeps close photos from tying on a coarse whole-number grade, which is why `lead_score` and `hotness` have decimals.

## Noul

A Noul question is a yes/no question answered as a probability from 0 to 1. `same_person` is that probability. Cutting it at 0.5 gives the `not_same_person` flag. Keep the raw number if you want a stricter or looser cutoff.

## Box

A Box returns the region of an image that matches a description, here the lead's face, as fractions of width and height plus a confidence. The response field is `lead_face`.

## Links

- [TypeSafe images](https://docs.typesafe.ai/images)
- [TypeSafe Box primitive](https://docs.typesafe.ai/primitives/box)
- [Jev 1.14 announcement](https://typesafe.ai/blog/jev-1-14)
- Back to the [API reference](02-api-reference.md)
