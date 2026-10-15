import { randomUUID } from "node:crypto";
import { assemble, pickLead, type PhotoAnswers, type People } from "./logic.ts";

const URL = "https://api.typesafe.ai/v1/systemone";

export class UpstreamError extends Error {}

// Question set proven in blog/dating-photos/run.py in the typesafe-testing repo.
const LEAD = [
  "No single person can be identified: no person, a group where it's unclear who the profile is about, or the face is hidden.",
  "One person, but the face is hard to see: dark, blurry, far away, or partly covered.",
  "One person with a visible face, but the photo is ordinary: awkward framing, cluttered, or a mirror selfie.",
  "One person, face clearly visible and well lit, looking natural; a photo that makes it easy to picture meeting them.",
];
const ATTR = [
  "Unflattering: the photo hides or distorts how they look.",
  "Plain: they look average or the photo does little for them.",
  "Attractive: they look good, with a pleasant expression and decent presentation.",
  "Very attractive: they look their best, expressive, confident, well presented.",
];
const VIBE = {
  sporty_outdoorsy: "Active, athletic, outdoors, adventurous.",
  polished_glamorous: "Dressed up, styled, put-together, glamorous.",
  artsy_creative: "Creative, musical, or artistic.",
  warm_approachable: "Friendly, relaxed, easy to talk to.",
  fun_social: "Out with friends, partying, lively.",
  mysterious_edgy: "Moody, dark, edgy, hard to read.",
};
const PEOPLE = {
  none: "No person is the subject of the photo.",
  one: "Exactly one person is the main subject of the photo. Other people in the background, such as a crowd, do not count.",
  several: "Two or more people are the main subjects of the photo, for example a group or couple posing together.",
};

async function call(key: string, model: string, state: unknown, images: Map<string, Buffer>, questions: unknown) {
  const assets: Record<string, unknown> = {};
  const form = new FormData();
  let i = 0;
  for (const [ref, buf] of images) {
    assets[ref] = { type: "image", part: `f${i}` };
    form.append(`f${i}`, new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), `f${i}.jpg`);
    i++;
  }
  // TypeSafe requires the "request" part to come first.
  const out = new FormData();
  out.append("request", new Blob([JSON.stringify({ model, state, assets, questions })], { type: "application/json" }));
  for (const [k, v] of form) out.append(k, v);
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      body: out,
      headers: { Authorization: `Bearer ${key}`, "TypeSafe-Danger-Zone-Images": "true" },
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new UpstreamError("TypeSafe request failed");
  }
  if (!res.ok) {
    console.error(`typesafe returned HTTP ${res.status}`); // status only, never the body
    throw new UpstreamError(`TypeSafe returned ${res.status}`);
  }
  try {
    return (await res.json()) as { model: string; answers: Record<string, any>; usage?: { input_tokens: number; output_tokens: number } };
  } catch {
    throw new UpstreamError("TypeSafe returned invalid JSON");
  }
}

export async function rankPhotos(key: string, model: string, jpegs: Buffer[], filenames: string[]) {
  const n = jpegs.length;
  const refs = jpegs.map(() => randomUUID());
  const q: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) {
    q[`lead_${i}`] = { type: "score", criteria: LEAD, instructions: `How well does \`photos[${i}]\` work as the first photo of a dating profile?` };
    q[`hot_${i}`] = { type: "score", criteria: ATTR, instructions: `How attractive does the person this profile is about look in \`photos[${i}]\`?` };
    q[`vibe_${i}`] = { type: "choice", criteria: VIBE, instructions: `What kind of appeal does \`photos[${i}]\` convey?` };
    q[`people_${i}`] = { type: "choice", criteria: PEOPLE, instructions: `How many people are the main subject of \`photos[${i}]\`? A solo person in front of a crowd or in a busy venue counts as one.` };
    q[`face_hidden_${i}`] = { type: "noul", instructions: `Is the face of the main person in \`photos[${i}]\` hidden or not clearly visible (sunglasses, mask, turned away, far away)?` };
  }
  const A = await call(key, model, { photos: refs }, new Map(refs.map((r, i) => [r, jpegs[i]])), q);
  let answers: PhotoAnswers[];
  try {
    answers = jpegs.map((_, i) => ({
      lead: num(A.answers[`lead_${i}`].score),
      hotness: num(A.answers[`hot_${i}`].score),
      vibe: String(A.answers[`vibe_${i}`].choice),
      people: A.answers[`people_${i}`].choice as People,
      faceHidden: num(A.answers[`face_hidden_${i}`].noul),
    }));
  } catch {
    throw new UpstreamError("Unexpected TypeSafe answer shape");
  }

  const lead = pickLead(answers);
  const others = answers.map((_, i) => i).filter((i) => i !== lead);
  const leadRef = randomUUID();
  const otherRefs = others.map(() => randomUUID());
  const qb: Record<string, unknown> = {};
  others.forEach((_, j) => {
    qb[`same_${j}`] = { type: "noul", instructions: `Does \`photos[${j}]\` show the same person as in \`lead\`? If several people appear, answer whether that person is one of them.` };
  });
  qb.face = { type: "box", instructions: "the face of the person in `lead`" };
  const images = new Map<string, Buffer>([[leadRef, jpegs[lead]], ...others.map((o, j) => [otherRefs[j], jpegs[o]] as [string, Buffer])]);
  const B = await call(key, model, { lead: leadRef, photos: otherRefs }, images, qb);

  let same: Map<number, number>, face: any;
  try {
    same = new Map(others.map((o, j) => [o, num(B.answers[`same_${j}`].noul)]));
    const b = B.answers.face;
    face = { ...Object.fromEntries((["top", "bottom", "left", "right"] as const).map((k) => [k, num(b.box[k])])), confidence: num(b.confidence) };
  } catch {
    throw new UpstreamError("Unexpected TypeSafe answer shape");
  }
  return {
    ...assemble(answers, filenames, lead, same),
    lead_face: face,
    model: B.model ?? A.model,
    usage: {
      input_tokens: (A.usage?.input_tokens ?? 0) + (B.usage?.input_tokens ?? 0),
      output_tokens: (A.usage?.output_tokens ?? 0) + (B.usage?.output_tokens ?? 0),
    },
  };
}

function num(x: unknown): number {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("not a number");
  return x;
}
