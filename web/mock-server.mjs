// Dev-only mock of POST /v1/lead. Switch behaviour at runtime:
//   curl -X POST localhost:8787/__mode/429   (also 200, 400, 413, 502)
import { createServer } from "node:http";

let mode = 200;
const VIBES = ["sporty_outdoorsy", "polished_glamorous", "artsy_creative", "warm_approachable", "fun_social", "mysterious_edgy"];
const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "Retry-After", "access-control-allow-headers": "*" };
const json = (res, code, body, extra = {}) => { res.writeHead(code, { "content-type": "application/json", ...cors, ...extra }); res.end(JSON.stringify(body)); };

createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const m = req.url.match(/^\/__mode\/(\d+)/);
  if (m) { mode = +m[1]; return json(res, 200, { mode }); }
  if (req.url === "/health") return json(res, 200, { ok: true, model: "mock" });
  if (req.url !== "/v1/lead" || req.method !== "POST") return json(res, 404, { error: { code: "not_found", message: "nope" } });
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const errs = { 400: ["bad_request", "Need 2 to 10 readable photos."], 413: ["too_large", "A file is over 15 MB."], 429: ["rate_limited", "Slow down."], 502: ["upstream_error", "TypeSafe failed."] };
    if (errs[mode]) return json(res, mode, { error: { code: errs[mode][0], message: errs[mode][1] } }, mode === 429 ? { "Retry-After": "1800" } : {});
    const names = [...Buffer.concat(chunks).toString("latin1").matchAll(/filename="([^"]*)"/g)].map((x) => x[1]);
    const n = names.length;
    const lead = Math.min(2, n - 1);
    const photos = names.map((filename, index) => {
      const score = index === lead ? 2.41 : +(2.2 - (index * 0.3)).toFixed(2);
      const flags = index === 4 ? ["not_same_person"] : index === 1 ? ["group"] : index === 5 ? ["face_hidden"] : [];
      return { index, filename, lead_score: score, hotness: +Math.min(3, score + 0.2).toFixed(2), vibe: VIBES[index % 6], people: flags.includes("group") ? "several" : "one", same_person: index === lead ? null : flags.includes("not_same_person") ? 0.12 : 0.9, flags };
    });
    const last = (p) => (p.flags.includes("not_same_person") ? 1 : 0);
    const ranking = photos.slice().sort((a, b) => last(a) - last(b) || b.lead_score - a.lead_score).map((p) => p.index);
    setTimeout(() => json(res, 200, { lead, ranking, photos, lead_face: { top: 0.08, bottom: 0.52, left: 0.3, right: 0.71, confidence: 0.31 }, model: "mock", usage: { input_tokens: 1, output_tokens: 1 }, disclaimer: "For fun. Jev's opinion about photos, not about people. (mock)" }), 1500);
  });
}).listen(8787, () => console.log("mock on :8787"));
