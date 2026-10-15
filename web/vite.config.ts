import { defineConfig, type Plugin } from "vite";
import { marked } from "marked";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const BASE = "/hot-or-not-jev/";
const repoDocs = resolve(__dirname, "../docs");
const fixtureDocs = resolve(__dirname, "fixtures/docs");

type Doc = { slug: string; title: string; html: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function loadDocs(): Doc[] {
  const mdFiles = (d: string) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".md")).sort() : []);
  let dir = process.env.DOCS_DIR ? resolve(process.env.DOCS_DIR) : repoDocs;
  if (!mdFiles(dir).length) dir = fixtureDocs; // ponytail: placeholder until docs/ lands
  const files = mdFiles(dir);
  return files.map((f) => {
    const name = basename(f, ".md").toLowerCase();
    const src = readFileSync(resolve(dir, f), "utf8");
    const slug = name === "index" || name === "readme" ? "" : name;
    const title = src.match(/^#\s+(.+)$/m)?.[1].trim() ?? name;
    return { slug, title, html: marked.parse(src, { async: false }) as string };
  }).sort((a, b) => (a.slug === "" ? -1 : b.slug === "" ? 1 : 0));
}

const href = (base: string, slug: string) => `${base}docs/${slug ? slug + "/" : ""}`;

function page(docs: Doc[], cur: Doc, base: string) {
  const nav = docs.map((d) => `<a href="${href(base, d.slug)}"${d === cur ? ' aria-current="page"' : ""}>${esc(d.title)}</a>`).join("");
  // rewrite relative links like other.md -> /docs/other/
  const body = cur.html.replace(/href="(?:\.\/)?([\w-]+)\.md(#[^"]*)?"/g, (_m, n: string, h = "") => {
    const l = n.toLowerCase();
    return `href="${href(base, l === "index" || l === "readme" ? "" : l)}${h}"`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(cur.title)} · Hot or Not, Jev Edition</title><meta name="color-scheme" content="light dark">
<link rel="icon" href="${base}favicon.svg"><link href="https://fonts.googleapis.com/css2?family=Bowlby+One&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="${base}docs.css"></head><body class="docs">
<header class="bar"><a class="logo" href="${base}">Hot or Not <b>Jev Edition</b></a><a class="pill" href="${base}">Try the app</a></header>
<div class="layout"><nav class="side" aria-label="Docs">${nav}</nav><main class="doc">${body}</main></div></body></html>`;
}

function docsPlugin(): Plugin {
  let base = BASE;
  return {
    name: "docs",
    configResolved(c) { base = c.base; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.split("?")[0].match(/^\/(?:hot-or-not-jev\/)?docs\/?([\w-]*)\/?$/);
        if (!m) return next();
        const docs = loadDocs();
        const cur = docs.find((d) => d.slug === m[1]);
        if (!cur) return next();
        res.setHeader("content-type", "text/html");
        res.end(page(docs, cur, base));
      });
    },
    generateBundle() {
      const docs = loadDocs();
      for (const d of docs) this.emitFile({ type: "asset", fileName: `docs/${d.slug ? d.slug + "/" : ""}index.html`, source: page(docs, d, base) });
    },
  };
}

export default defineConfig({ base: BASE, plugins: [docsPlugin()] });
