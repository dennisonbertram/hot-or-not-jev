# Fair play

## Privacy

- Photos are judged in memory. They are not saved to disk and not logged.
- The server resizes each photo, sends it to TypeSafe for judging, returns the result, and drops it.
- What TypeSafe does with requests on its side is governed by TypeSafe's own terms. We have not documented that here: TBD.

## Disclaimers

Every response carries a `disclaimer` string. These are the plain-language versions.

- **It is for fun.** Jev has opinions about photos. It does not know anyone's worth, charm, or kindness. Your match did not swipe right because of a decimal.
- **Opinions, not facts.** "Hotness" is a score from a model's taste, not a measurement. A 2.4 and a 2.6 are a coin flip.
- **Do not use it on people who did not agree.** Upload your own photos or photos of someone who said yes.
- **Do not use it to make decisions about people.** No hiring, lending, housing, or anything with consequences. It is a demo of a dating-photo picker.
- **It is a preview model.** Jev 1.14 is `jev-preview`, and images and Box are experimental at TypeSafe. Results can change or break.
- **Same-person is a probability.** It can miss a lookalike or flag a genuine photo. Treat it as a hint.

These notes explain the tool. They do not change what it does.

## Bias audit

We checked whether Jev's attractiveness score moves when one attribute of a face changes. The test was pre-registered (the analysis was written down before the data came in) and run on 2026-10-15 against `jev-1.14.0`.

### Method

- 48 synthetic faces: 6 ethnicity groups, 2 genders, 2 age bands, 2 faces each.
- Each face was edited 8 ways, changing one attribute per edit.
- Each image was scored twice. The score is attractiveness on a 0 to 4 scale, averaged over three question wordings.
- Each edit was compared against a "no change" re-render of the same face, so that re-rendering alone is not counted as an effect.

### Results

The number is the average change in score versus the "no change" re-render, with a 95% confidence interval.

| Edit | Change | 95% CI | Reading |
| --- | --- | --- | --- |
| Skin tone darker | +0.01 | -0.02 to +0.04 | No effect |
| Skin tone lighter | -0.00 | -0.03 to +0.02 | No effect |
| About 20 years older | -0.26 | -0.31 to -0.20 | Effect |
| Heavier | -0.24 | -0.30 to -0.18 | Effect |
| Glasses | -0.07 | n/a | Below noise threshold |
| Religious headwear (hijab, turban) | +0.05 | n/a | Below noise threshold |
| Neck tattoos | -0.03 | n/a | Below noise threshold |

- The noise threshold is 0.087. Run-to-run noise (the same image scored twice) is 0.015.
- The "heavier" row uses the 15 images that passed the manipulation check (the edit visibly did what it should). In an exploratory analysis over all 48 edits, the change was -0.23 (CI -0.27 to -0.20), and the score went down for every one of the 48. That all-48 number was not pre-registered.

In short: skin tone did not move the score. Looking about 20 years older and looking heavier lowered it by about a quarter of a point on the 0 to 4 scale. In this test, the score fell for both edits. Keep that in mind when you read the scores.

### Limits

- Faces are synthetic and came from one image generator.
- An edit can change more than the one attribute it targets.
- One model version (`jev-1.14.0`), one date.
- This audit covers the attractiveness score. It does not cover `lead_score`, `vibe`, or `same_person` directly.

## Earlier checks

These were small tests, so treat them as smoke tests and not as accuracy figures.

- Lead-photo pick: matched a human reviewer on 5 of 5 synthetic profiles.
- Same-person check: caught 2 of 2 impostors (one at 0.43, against the 0.5 cutoff) and flagged 0 of 23 genuine photos.

## Where to read more

- [How it works](04-how-it-works.md)
- [API reference](02-api-reference.md)
