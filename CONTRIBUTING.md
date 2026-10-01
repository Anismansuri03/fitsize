# Contributing to Fitsize

Thanks for considering it. Fitsize has no server, so the whole product is this codebase — every
improvement here is a real improvement for everyone using it.

## Before you write code

For anything beyond a small fix, open an issue first (or comment on an existing one) so we can
agree on the approach before you spend time on it. For typos, broken links, or a clear bug with an
obvious fix, just send the PR.

## Ground rules

- **Nothing gets uploaded, ever.** No feature that sends a file, or any part of a file, anywhere.
  If a feature genuinely needs a server (real-time collaboration, say), it doesn't belong in this
  repo. This is the one rule that isn't up for debate.
- **New tools should actually work**, not just look like they do. If you're not sure your PDF output
  is correct, check it with a second tool (`pdftotext`, `pdfinfo`, `qpdf --check` are all free and
  used throughout the existing tests) instead of only looking at the screen.
- **Keep it usable by someone non-technical.** Plain language in the UI, no jargon in error
  messages, a sensible default before an "Advanced settings" toggle.

## Local setup

```bash
git clone https://github.com/Anismansuri03/fitsize.git
cd fitsize
npm install
npm run dev
```

Open http://localhost:4321. `npm run dev` also copies the WebAssembly engines (Ghostscript, qpdf)
and fonts out of `node_modules` into `public/`, so the first run takes a few extra seconds.

## Before opening a PR

```bash
npm run typecheck
npm test          # unit tests, a few seconds
npm run build
```

All three run automatically on every PR via GitHub Actions, so you'll see it either way, but
running them locally first saves a round trip.

There's also a full end-to-end suite in `tests/e2e/` that drives a real Chromium browser and checks
the actual output files with independent tools (not just "did a button appear"). It's slower and
needs Playwright, so it's not part of CI, but it's the most thorough check there is:

```bash
npx playwright install chromium
tests/e2e/run_all.sh
```

If you're adding a new tool, a matching test in `tests/e2e/` (even a short one) is the best way to
prove it actually works, and it'll keep working as the codebase changes.

## Where things live

- `src/lib/fit/` — the "under this size, guaranteed" search algorithm (images and PDFs)
- `src/lib/pdf/`, `src/lib/pdfops/`, `src/lib/editor/` — the PDF engines (Ghostscript, qpdf, pdf.js,
  pdf-lib) and the logic that drives them
- `src/components/` — the UI; `src/components/editor/` is the PDF editor, `src/components/pdftools/`
  is the shared "upload → options → download" pattern most simple tools use
- `src/data/tools.ts` — every tool's name, category, copy and FAQ, in one place
- `public/engine/*-worker.js` — hand-written Web Workers that run the WASM engines off the main
  thread; these are plain JS on purpose (not bundled), see the comments at the top of each file

## Adding a new tool

Most simple tools (merge, split, rotate, page numbers, ...) are built on the shared `Workbench`
component in `src/components/pdftools/Workbench.tsx` — look at an existing one like
`SplitPdfTool.tsx` as a template rather than starting from a blank page. Then:

1. Add the tool's copy (name, description, steps, FAQ) to `src/data/tools.ts`.
2. Add a page in `src/pages/your-tool.astro` following the pattern of an existing one.
3. It'll show up automatically in the homepage's category grid, the header menu, and the sitemap.

## Reporting a bug

The bug report template asks for the file that triggers it, if you're comfortable sharing it (that's
optional — GitHub attachments aren't covered by Fitsize's own "nothing uploaded" promise, since
that's about the running app, not a bug report). A repro file makes bugs enormously faster to fix.
