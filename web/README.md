# Hot or Not, Jev Edition: web

Static site (Vite, vanilla TypeScript). Upload photos, get a lead photo from the API (see `../CONTRACT.md`). It also renders `../docs/*.md` as pages under `/docs/`.

```sh
npm install
npm run mock     # fake API on :8787 (dev only)
npm run dev      # http://localhost:5173/hot-or-not-jev/
npm run build    # output in dist/
```

Mock modes: `curl -X POST localhost:8787/__mode/429` (also 200, 400, 413, 502).

## Environment

- `VITE_API_URL` (build time): API base URL. Default `http://localhost:8787`. In CI it comes from the repo Actions variable `API_URL`.
- `DOCS_DIR` (build time, optional): Markdown folder. Default `../docs`; if it has no `.md` files, `fixtures/docs` is used.

The site is served under `/hot-or-not-jev/` (GitHub Pages). Docs page names come from file names; the sidebar titles come from each file's first `# heading`. `index.md` or `README.md` becomes `/docs/`.
