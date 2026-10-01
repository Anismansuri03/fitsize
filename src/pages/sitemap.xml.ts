import type { APIRoute } from 'astro';
import { tools } from '../data/tools';
import { IMAGE_SIZES, PDF_SIZES } from '../data/sizes';

export const GET: APIRoute = ({ site }) => {
  const base = site!.href.replace(/\/$/, '');
  const paths = [
    '/',
    ...tools.map((t) => `/${t.slug}/`),
    ...PDF_SIZES.map((s) => `/compress-pdf-to-${s.slug}/`),
    ...IMAGE_SIZES.map((s) => `/compress-image-to-${s.slug}/`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${base}${p}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
