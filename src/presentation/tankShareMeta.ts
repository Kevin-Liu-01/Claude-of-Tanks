/**
 * A link to one tank in the Gallery (/gallery?id=<id>, /cn/gallery?id=<id>) shares that tank (og-r2, the owner
 * 2026-11-01: better share cards "for cot.kevinliu.studio and all its associatd links"): its name before the Gallery's
 * title, the link itself as og:url, and its take's card (tools/media-r5/tank-share.mjs) as the picture when the media
 * lane has filmed it. A tank card is a still, so the Gallery's clip leaves the page and og:type is website. middleware.ts
 * loads this module only for such a link; it reads its one table and imports nothing else, so the Gallery's own
 * document path stays as light as the middleware diet holds it (tools/middleware-diet.selftest.mjs).
 */
import { CANONICAL_ORIGIN } from '../../api/_lib/policy.ts';
import TABLE from './tankShare.json' with { type: 'json' };

type TankShare = { readonly id: string; readonly name: string; readonly card: string | null };

const TANKS: Readonly<Record<string, { name: string; card: string | null }>> = TABLE.tanks;

/** The tank a Gallery link names, when the table knows it. */
export function tankShareFor(id: string | null): TankShare | null {
  if (!id || !Object.hasOwn(TANKS, id)) return null;
  return { id, ...TANKS[id] };
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const metaPattern = (selector: 'property' | 'name', key: string): RegExp =>
  new RegExp(`<meta\\b[^>]*\\b${selector}\\s*=\\s*["']${key.replace(/:/g, '\\:')}["'][^>]*>`, 'i');
const contentOf = (html: string, selector: 'property' | 'name', key: string): string =>
  /\bcontent\s*=\s*"([^"]*)"/i.exec(html.match(metaPattern(selector, key))?.[0] ?? '')?.[1] ?? '';
const setMeta = (html: string, selector: 'property' | 'name', key: string, value: string): string =>
  html.replace(metaPattern(selector, key), (tag) => tag.replace(/\bcontent\s*=\s*"[^"]*"/i, `content="${escapeAttribute(value)}"`));

/** The Gallery's document as a share of one tank: its name, its link and, when filmed, its card. */
export function withTankShare(html: string, share: TankShare, url: URL): string {
  // the canonical site's own address, as every share tag names (siteMetadata.ts SITE_ORIGIN), on any deployment
  const link = `${CANONICAL_ORIGIN}${url.pathname.replace(/\.html$|\/$/, '')}?id=${encodeURIComponent(share.id)}`;
  // the Gallery's own title (it is already escaped markup) under the tank's name
  const title = (current: string): string => `${escapeAttribute(share.name)} · ${current}`;
  let out = html.replace(/<title>([^<]*)<\/title>/i, (_, current: string) => `<title>${title(current)}</title>`);
  for (const [selector, key] of [['property', 'og:title'], ['name', 'twitter:title']] as const) {
    const current = contentOf(out, selector, key);
    if (current) out = out.replace(metaPattern(selector, key), (tag) => tag.replace(/\bcontent\s*=\s*"[^"]*"/i, `content="${title(current)}"`));
  }
  out = setMeta(out, 'property', 'og:url', link);
  out = out.replace(/<meta\b[^>]*\bproperty\s*=\s*["']og:video(?::[a-z_]+)?["'][^>]*>/gi, '');
  out = setMeta(out, 'property', 'og:type', 'website');
  if (share.card) {
    const image = `${CANONICAL_ORIGIN}${share.card}`;
    out = setMeta(out, 'property', 'og:image', image);
    out = setMeta(out, 'name', 'twitter:image', image);
    out = setMeta(out, 'property', 'og:image:alt', share.name);
    out = setMeta(out, 'name', 'twitter:image:alt', share.name);
  }
  return out;
}
