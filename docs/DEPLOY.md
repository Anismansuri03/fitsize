# Deploying Fitsize

## Cloudflare Pages (recommended)

This is the path in the main [README](../README.md#deploy-your-own-free-on-cloudflare-pages) —
connect your fork to the Cloudflare dashboard and every push deploys automatically. Two things
worth knowing:

- **`SITE_URL`**: an environment variable read by `astro.config.mjs` and used for canonical links,
  the sitemap, and Open Graph tags. Without it, those fall back to a placeholder domain. Set it to
  your real address (your `*.pages.dev` URL, or a custom domain once you attach one) and redeploy.
- **Trailing slash**: this site builds every page as `/page-name/index.html`. In the Pages project's
  **Settings → Builds & deployments**, set **Trailing slash** to **Add trailing slash** so a link to
  `/compress-pdf` (no slash) still resolves instead of 404ing.

### Size, for reference

The build is roughly 350 files and 36 MB total; the single largest file is Ghostscript's `gs.wasm`
at ~15.4 MB. Cloudflare Pages' free plan allows up to 20,000 files and 25 MiB per file, so there's
plenty of headroom even as more tools are added.

## Cloudflare Workers (command line, alternative)

Static assets on Workers work identically to Pages and are already configured in `wrangler.jsonc`.
Useful if you'd rather not connect Git, or already have a Workers-based deploy pipeline.

```bash
npx wrangler login
npm run deploy
```

To set `SITE_URL` for this path, either bake it into the build command:

```bash
SITE_URL=https://yourdomain.com npm run build && npx wrangler deploy
```

or wire it into your own CI as a secret if you're automating this.

## Any other static host

Fitsize is a fully static site (`npm run build` → `dist/`) with no server-side code, so it will run
on Netlify, Vercel, GitHub Pages, S3+CloudFront, or a plain nginx box just as well. The only things
to carry over from `public/_headers` are the security headers and the long cache lifetimes on
`/_astro/*`, `/engine/*`, `/pdfjs/*`, and `/fonts/*` — translate that file's rules into whatever your
host uses (most support the same `_headers` file format Cloudflare popularized; others need a config
block). Everything else is automatic.

## Before you go live, either way

- Edit `src/site.ts` if you're running your own fork under a different name or repo URL.
- The `docs/screenshots/*.png` and `public/og-image.png` files are from the upstream project — swap
  them for your own if you're publishing a meaningfully different fork.
