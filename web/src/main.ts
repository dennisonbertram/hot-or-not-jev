import "./style.css";

const API = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const MIN = 2, MAX = 10, MAX_BYTES = 15 * 1024 * 1024;

type Box = { top: number; bottom: number; left: number; right: number };
type Photo = { index: number; filename: string; lead_score: number; hotness: number; vibe: string; people: string; flags: string[] };
type Result = { lead: number; ranking: number[]; photos: Photo[]; lead_face: Box | null; disclaimer?: string };

const VIBES: Record<string, string> = {
  sporty_outdoorsy: "Sporty & outdoorsy", polished_glamorous: "Polished & glamorous", artsy_creative: "Artsy & creative",
  warm_approachable: "Warm & approachable", fun_social: "Fun & social", mysterious_edgy: "Mysterious & edgy",
};
const BADGES: Record<string, string> = {
  not_same_person: "Who's this? 👀", group: "Which one is you?", face_hidden: "Face hidden 🕶️", no_person: "No person found",
};
const LOADING = ["Jev is squinting at your photos...", "Comparing smoldering looks...", "Counting flames...", "Consulting the hotness oracle..."];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const drop = $("drop"), input = $<HTMLInputElement>("file"), thumbs = $("thumbs"), msg = $("msg"), go = $<HTMLButtonElement>("go");
const sections = { picker: $("picker"), loading: $("loading"), error: $("error"), results: $("results") };

let files: { file: File; url: string }[] = [];

function show(which: keyof typeof sections) {
  for (const [k, el] of Object.entries(sections)) el.hidden = k !== which;
}

function setMsg(t: string) { msg.textContent = t; msg.hidden = !t; }

function renderThumbs() {
  thumbs.replaceChildren(...files.map((f, i) => {
    const li = document.createElement("li");
    const img = new Image();
    img.alt = f.file.name; img.src = f.url;
    img.onerror = () => { img.replaceWith(Object.assign(document.createElement("div"), { className: "alt", textContent: f.file.name })); };
    const b = document.createElement("button");
    b.type = "button"; b.textContent = "×"; b.ariaLabel = `Remove ${f.file.name}`;
    b.onclick = () => { URL.revokeObjectURL(f.url); files.splice(i, 1); renderThumbs(); };
    li.append(img, b);
    return li;
  }));
  const n = files.length;
  const big = files.find((f) => f.file.size > MAX_BYTES);
  setMsg(big ? `${big.file.name} is over 15 MB. Remove it to continue.`
    : n > MAX ? `That's ${n} photos. The limit is ${MAX}; remove ${n - MAX}.`
    : n === 1 ? "Add at least one more photo. Jev needs 2 to compare." : "");
  go.disabled = !(n >= MIN && n <= MAX && !big);
}

function addFiles(list: FileList | File[]) {
  const imgs = [...list].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
  files.push(...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })));
  renderThumbs();
  if (imgs.length < [...list].length) setMsg("Some files weren't images and were skipped. " + msg.textContent);
}

input.onchange = () => { if (input.files) addFiles(input.files); input.value = ""; };
drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); });
drop.addEventListener("drop", (e) => { if ((e as DragEvent).dataTransfer) addFiles((e as DragEvent).dataTransfer!.files); });

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
  show("loading");
  let i = 0;
  $("loadtxt").textContent = LOADING[0];
  const timer = setInterval(() => { $("loadtxt").textContent = LOADING[++i % LOADING.length]; }, 2200);
  try {
    const fd = new FormData();
    for (const f of files) fd.append("photos", f.file, f.file.name);
    let res: Response;
    try { res = await fetch(`${API}/v1/lead`, { method: "POST", body: fd }); }
    catch { return fail("Can't reach Jev", "The network or the API isn't answering. Check your connection and try again."); }
    if (res.ok) return renderResults((await res.json()) as Result);
    const err = await res.json().then((j) => j?.error?.message as string | undefined).catch(() => undefined);
    if (res.status === 429) return fail("Jev needs a breather", `Too many people want a verdict right now. Try again in ${friendlyWait(res.headers.get("Retry-After"))}.`);
    if (res.status === 413) return fail("That's a big file", "One photo is over 15 MB. Remove it or use a smaller copy.");
    if (res.status === 400) return fail("Jev can't read that", err ?? "Jev needs 2 to 10 photos he can open. Check your picks and try again.");
    if (res.status === 503) return fail("Jev is busy", "Jev is judging other people's photos right now. Try again in a few seconds.");
    if (res.status === 502) return fail("Jev fumbled it", "The judging service had a problem. It's not your photos. Try again in a moment.");
    return fail("Something went wrong", err ?? `The API answered with status ${res.status}.`);
  } finally { clearInterval(timer); }
}

function meter(h: number) {
  const pct = Math.max(0, Math.min(3, h)) / 3 * 100;
  const s = document.createElement("span");
  s.className = "meter"; s.title = `Hotness ${h.toFixed(1)} out of 3`; s.setAttribute("role", "img"); s.ariaLabel = s.title;
  s.innerHTML = `<span class="base">🔥🔥🔥</span><span class="fill" style="width:${pct}%">🔥🔥🔥</span>`;
  return s;
}

function stats(p: Photo) {
  const d = document.createElement("div");
  d.className = "stats";
  const score = Object.assign(document.createElement("span"), { className: "score", textContent: `Lead score ${p.lead_score.toFixed(2)}` });
  const vibe = Object.assign(document.createElement("span"), { className: "vibe", textContent: VIBES[p.vibe] ?? p.vibe });
  d.append(meter(p.hotness), score, vibe);
  const wrap = document.createElement("div");
  wrap.append(d);
  if (p.flags.length) {
    const b = document.createElement("div");
    b.className = "badges";
    b.append(...p.flags.map((f) => Object.assign(document.createElement("span"), { className: "badge", textContent: BADGES[f] ?? f })));
    wrap.append(b);
  }
  return wrap;
}

async function drawFace(canvas: HTMLCanvasElement, file: File, box: Box) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const sx = box.left * bmp.width, sy = box.top * bmp.height;
    const sw = (box.right - box.left) * bmp.width, sh = (box.bottom - box.top) * bmp.height;
    const side = Math.max(sw, sh); // square crop around the box center
    const cx = sx + sw / 2, cy = sy + sh / 2;
    canvas.width = canvas.height = 240;
    canvas.getContext("2d")!.drawImage(bmp, cx - side / 2, cy - side / 2, side, side, 0, 0, 240, 240);
  } catch { canvas.closest(".face")?.remove(); } // e.g. browser can't decode HEIC
}

function renderResults(r: Result) {
  const root = sections.results;
  const lead = r.photos[r.lead];
  const url = (i: number) => files[i]?.url ?? "";
  const crown = document.createElement("article");
  crown.className = "crown";
  crown.innerHTML = `<div class="tag">👑 YOUR LEAD PHOTO</div><h2></h2><div class="crown-body"><img class="big" alt="Your lead photo"><div class="face"><canvas></canvas>Jev's close-up</div></div>`;
  crown.querySelector("h2")!.textContent = lead.filename;
  crown.querySelector<HTMLImageElement>("img")!.src = url(r.lead);
  crown.append(stats(lead));
  if (r.lead_face && files[r.lead]) drawFace(crown.querySelector("canvas")!, files[r.lead].file, r.lead_face);
  else crown.querySelector(".face")!.remove();

  const rest = document.createElement("div");
  rest.className = "rest";
  rest.innerHTML = "<h3>The rest, ranked</h3>";
  r.ranking.filter((i) => i !== r.lead).forEach((i, n) => {
    const p = r.photos[i];
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="rank">#${n + 2}</div><img alt="">`;
    row.querySelector("img")!.src = url(i);
    row.append(stats(p));
    rest.append(row);
  });

  const disc = Object.assign(document.createElement("p"), { className: "disc", textContent: r.disclaimer ?? "For fun. Jev rates photos, not people." });
  const again = Object.assign(document.createElement("button"), { className: "go again", textContent: "Judge another batch" });
  again.onclick = reset;
  root.replaceChildren(crown, rest, disc, again);
  show("results"); document.body.classList.add("done");
  root.scrollIntoView({ behavior: "smooth" });
}

function reset() { document.body.classList.remove("done"); show("picker"); window.scrollTo({ top: 0 }); }

go.onclick = judge;
$("retry").onclick = reset;
renderThumbs();
