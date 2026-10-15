import "./style.css";

const API = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const BASE = import.meta.env.BASE_URL;
const MIN = 2, MAX = 10, MAX_BYTES = 15 * 1024 * 1024;
const EXAMPLES = ["p1", "p2", "p4"]; // saved raw responses from the live API, see public/examples/

type Box = { top: number; bottom: number; left: number; right: number };
type Photo = { index: number; filename: string; lead_score: number; hotness: number; vibe: string; people: string; same_person: number | null; flags: string[] };
type Result = { lead: number; ranking: number[]; photos: Photo[]; lead_face: Box | null; disclaimer?: string };

const VIBES: Record<string, string> = {
  sporty_outdoorsy: "Sporty & outdoorsy", polished_glamorous: "Polished & glamorous", artsy_creative: "Artsy & creative",
  warm_approachable: "Warm & approachable", fun_social: "Fun & social", mysterious_edgy: "Mysterious & edgy",
};
const BADGES: Record<string, string> = {
  not_same_person: "Who's this? 👀", group: "Which one is you?", face_hidden: "Face hidden 🕶️", no_person: "Nobody here",
};
const LOADING = ["Jev is squinting at your photos…", "Checking the lighting…", "Looking for your best angle…", "Making sure it's you in every shot…"];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const img = (src: string, alt: string, cls = "") => Object.assign(el("img", cls), { src, alt, decoding: "async" });

/* ---------- shared result components (examples + live results) ---------- */

function meter(h: number) {
  const m = el("div", "meter");
  m.setAttribute("role", "meter");
  m.setAttribute("aria-valuemin", "0"); m.setAttribute("aria-valuemax", "3"); m.setAttribute("aria-valuenow", String(h));
  m.setAttribute("aria-label", `Hotness ${h.toFixed(2)} out of 3`);
  const track = el("span", "meter-track");
  const fill = el("span", "meter-fill");
  fill.style.setProperty("--v", String(Math.max(0, Math.min(3, h)) / 3));
  track.append(fill);
  m.append(el("span", "meter-ico", "🔥"), track, el("span", "meter-val", h.toFixed(1)));
  return m;
}

const vibe = (v: string) => el("span", "chip", VIBES[v] ?? v);

function badges(flags: string[]) {
  const b = el("div", "badges");
  b.append(...flags.map((f) => el("span", `badge badge-${f}`, BADGES[f] ?? f)));
  return b;
}

async function drawFace(canvas: HTMLCanvasElement, src: string, box: Box) {
  try {
    const im = new Image();
    im.src = src;
    await im.decode(); // fails for formats the browser can't show, e.g. HEIC outside Safari
    const W = im.naturalWidth, H = im.naturalHeight;
    const sw = (box.right - box.left) * W, sh = (box.bottom - box.top) * H;
    const side = Math.min(Math.max(sw, sh), W, H); // square crop around the box center, kept inside the image
    const cx = Math.min(Math.max((box.left * W) + sw / 2, side / 2), W - side / 2);
    const cy = Math.min(Math.max((box.top * H) + sh / 2, side / 2), H - side / 2);
    canvas.width = canvas.height = 320;
    canvas.getContext("2d")!.drawImage(im, cx - side / 2, cy - side / 2, side, side, 0, 0, 320, 320);
  } catch { canvas.closest(".face")?.remove(); }
}

/** Renders one API result. `src(i)` gives the image URL for photo i. */
function verdict(r: Result, src: (i: number) => string) {
  const lead = r.photos[r.lead];
  const root = el("div", "verdict");

  const card = el("article", "lead-card reveal");
  const media = el("div", "lead-media");
  media.append(img(src(r.lead), `Lead photo: ${lead.filename}`, "lead-img"), el("span", "crown-chip", "👑 Your lead"));
  if (r.lead_face) {
    const face = el("figure", "face");
    const c = el("canvas");
    c.setAttribute("aria-label", "Close-up of the face Jev found in the lead photo");
    face.append(c, el("figcaption", "", "Jev's close-up"));
    media.append(face);
    drawFace(c, src(r.lead), r.lead_face);
  }
  const info = el("div", "lead-info");
  const score = el("div", "bigscore");
  score.append(el("span", "num", lead.lead_score.toFixed(2)), el("span", "of", "/ 3 lead score"));
  const row = el("div", "lead-row");
  row.append(meter(lead.hotness), vibe(lead.vibe));
  info.append(el("p", "fname", lead.filename), score, row);
  if (lead.flags.length) info.append(badges(lead.flags));
  card.append(media, info);

  const rest = el("div", "rest");
  const odd = r.photos.filter((p) => p.flags.includes("not_same_person")).length;
  const check = el("p", `check ${odd ? "check-warn" : "check-ok"} reveal`,
    odd ? `Catfish check: ${odd} photo${odd > 1 ? "s" : ""} may show someone else.` : "Catfish check passed: same person in every photo.");
  check.prepend(el("span", "check-ico", odd ? "👀" : "✓"));
  const list = el("ol", "rest-grid");
  r.ranking.filter((i) => i !== r.lead).forEach((i, n) => {
    const p = r.photos[i];
    const li = el("li", `tile reveal${p.flags.includes("not_same_person") ? " tile-odd" : ""}`);
    li.style.setProperty("--d", String(n + 1));
    const m = el("div", "tile-media");
    m.append(img(src(i), p.filename), el("span", "rank", `#${n + 2}`));
    if (p.flags.length) m.append(badges(p.flags));
    const meta = el("div", "tile-meta");
    const top = el("div", "tile-top");
    top.append(el("span", "tile-score", p.lead_score.toFixed(2)), el("span", "tile-name", p.filename));
    meta.append(top, meter(p.hotness), vibe(p.vibe));
    li.append(m, meta);
    list.append(li);
  });
  rest.append(check, el("h3", "rest-title", "The rest, ranked"), list);

  root.append(card, rest);
  if (r.disclaimer) root.append(el("p", "disc", r.disclaimer));
  return root;
}

/* ---------- examples + hero (saved live-API responses) ---------- */

const exUrl = (id: string, f: string) => `${BASE}examples/${id}/${encodeURIComponent(f)}`;

function heroArt(id: string, r: Result) {
  const art = $("hero-art");
  const lead = r.photos[r.lead];
  const grid = el("div", "ha-in");
  grid.append(...r.photos.map((p) => {
    const t = el("span", `ha-thumb${p.index === r.lead ? " is-lead" : ""}`);
    t.append(img(exUrl(id, p.filename), ""));
    return t;
  }));
  const inBox = el("div", "ha-col");
  inBox.append(el("span", "ha-label", `${r.photos.length} photos in`), grid);
  const out = el("div", "ha-out");
  const ph = el("div", "ha-photo");
  const glass = el("div", "ha-glass");
  glass.append(el("span", "ha-score", lead.lead_score.toFixed(2)), el("span", "ha-of", "lead score / 3"));
  ph.append(img(exUrl(id, lead.filename), ""), el("span", "crown-chip", "👑 Lead"), glass);
  const outBox = el("div", "ha-col");
  outBox.append(el("span", "ha-label", "1 crowned lead"), ph);
  out.append(outBox);
  const arrow = el("span", "ha-arrow");
  arrow.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  art.replaceChildren(inBox, arrow, out);
}

async function loadExamples() {
  const seg = $("seg"), slot = $("example");
  let data: [string, Result][];
  try {
    data = await Promise.all(EXAMPLES.map(async (id) => {
      const res = await fetch(`${BASE}examples/${id}.json`);
      if (!res.ok) throw new Error(String(res.status));
      return [id, (await res.json()) as Result] as [string, Result];
    }));
  } catch {
    slot.replaceChildren(el("p", "msg", "The samples didn't load. Refresh to try again."));
    return;
  }
  heroArt(...data[0]);
  const show = (k: number) => {
    const [id, r] = data[k];
    seg.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-pressed", String(j === k)));
    slot.replaceChildren(verdict(r, (i) => exUrl(id, r.photos[i].filename)));
  };
  seg.replaceChildren(...data.map(([id, r], k) => {
    const b = el("button", "seg-btn");
    b.type = "button";
    const odd = r.photos.filter((p) => p.flags.includes("not_same_person")).length;
    const av = img(exUrl(id, r.photos[r.lead].filename), "", "seg-av");
    const f = r.lead_face;
    if (f) av.style.objectPosition = `${((f.left + f.right) / 2) * 100}% ${((f.top + f.bottom) / 2) * 100}%`;
    const txt = el("span", "seg-txt");
    txt.append(el("span", "seg-name", `Sample ${"ABC"[k]}`), el("span", "seg-sub", odd ? "Catfish caught 👀" : "Clean sweep ✓"));
    b.append(av, txt);
    b.onclick = () => show(k);
    return b;
  }));
  show(0);
}

/* ---------- uploader ---------- */

const drop = $("drop"), input = $<HTMLInputElement>("file"), thumbs = $("thumbs"), msg = $("msg"), go = $<HTMLButtonElement>("go");
const states = { picker: $("picker"), loading: $("loading"), error: $("error"), results: $("results") };
let files: { file: File; url: string }[] = [];

function show(which: keyof typeof states) {
  for (const [k, e] of Object.entries(states)) e.hidden = k !== which;
}
function setMsg(t: string) { msg.textContent = t; msg.hidden = !t; }

function thumb(f: { file: File; url: string }) {
  const li = el("li", "thumb");
  const im = img(f.url, f.file.name);
  im.onerror = () => im.replaceWith(el("span", "alt", f.file.name));
  li.append(im);
  return li;
}

function renderThumbs() {
  thumbs.replaceChildren(...files.map((f, i) => {
    const li = thumb(f);
    const b = el("button", "x", "×");
    b.type = "button"; b.ariaLabel = `Remove ${f.file.name}`;
    b.onclick = () => { URL.revokeObjectURL(f.url); files.splice(i, 1); renderThumbs(); };
    li.append(b);
    return li;
  }));
  const n = files.length;
  const big = files.find((f) => f.file.size > MAX_BYTES);
  setMsg(big ? `${big.file.name} is over 15 MB. Remove it to continue.`
    : n > MAX ? `That's ${n} photos. The limit is ${MAX}; remove ${n - MAX}.`
    : n === 1 ? "Add at least one more photo. Jev needs 2 to compare." : "");
  go.disabled = !(n >= MIN && n <= MAX && !big);
  drop.classList.toggle("has-files", n > 0);
}

function addFiles(list: FileList | File[]) {
  const all = [...list];
  const imgs = all.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
  files.push(...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })));
  renderThumbs();
  if (imgs.length < all.length) setMsg("Some files weren't images and were skipped. " + msg.textContent);
}

input.onchange = () => { if (input.files) addFiles(input.files); input.value = ""; };
drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); });
drop.addEventListener("drop", (e) => { const dt = (e as DragEvent).dataTransfer; if (dt) addFiles(dt.files); });

function friendlyWait(header: string | null): string {
  const s = Number(header);
  if (!header || !Number.isFinite(s) || s <= 0) return "a little while";
  if (s < 90) return `about ${Math.ceil(s)} seconds`;
  if (s < 5400) return `about ${Math.round(s / 60)} minutes`;
  return `about ${Math.round(s / 3600)} hours`;
}

function fail(title: string, text: string) {
  $("errtitle").textContent = title; $("errtext").textContent = text; show("error");
}

async function judge() {
  $("scan").replaceChildren(...files.map(thumb));
  show("loading");
  let i = 0;
  const txt = $("loadtxt");
  txt.textContent = LOADING[0];
  const timer = setInterval(() => { txt.textContent = LOADING[++i % LOADING.length]; }, 2200);
  try {
    const fd = new FormData();
    for (const f of files) fd.append("photos", f.file, f.file.name);
    let res: Response;
    try { res = await fetch(`${API}/v1/lead`, { method: "POST", body: fd }); }
    catch { return fail("Can't reach Jev", "The network or the API isn't answering. Check your connection and try again."); }
    if (res.ok) return renderResults((await res.json()) as Result);
    const err = await res.json().then((j) => j?.error?.message as string | undefined).catch(() => undefined);
    if (res.status === 429) return fail("Jev needs a breather", `Too many verdicts for now. Try again in ${friendlyWait(res.headers.get("Retry-After"))}.`);
    if (res.status === 413) return fail("That's a big file", "One photo is over 15 MB. Remove it or use a smaller copy.");
    if (res.status === 400) return fail("Jev can't read that", err ?? "Jev needs 2 to 10 photos he can open. Check your picks and try again.");
    if (res.status === 503) return fail("Jev is busy", "Jev is judging other people's photos right now. Try again in a few seconds.");
    if (res.status === 502) return fail("Jev fumbled it", "The judging service had a problem. It's not your photos. Try again in a moment.");
    return fail("Something went wrong", err ?? `The API answered with status ${res.status}.`);
  } finally { clearInterval(timer); }
}

function renderResults(r: Result) {
  const again = el("button", "btn btn-ghost again", "Judge another batch");
  again.onclick = reset;
  states.results.replaceChildren(verdict(r, (i) => files[i]?.url ?? ""), again);
  show("results");
  $("try").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function reset() { show("picker"); $("try").focus({ preventScroll: false }); }

go.onclick = judge;
$("retry").onclick = reset;
renderThumbs();
loadExamples();
