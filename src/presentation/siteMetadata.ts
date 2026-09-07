import { PRODUCT_STATS } from '../productStats.ts';

export const SITE_ORIGIN = 'https://cot.kevinliu.studio';

export type SiteMetadata = {
  title: string;
  description: string;
  canonical: string;
  url: string;
  image: string;
  imageAlt: string;
  type: 'website' | 'article';
  robots: string;
  ogTitle?: string;
  ogDescription?: string;
};

const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const PRIVATE_ROBOTS = 'noindex, nofollow, noarchive, max-image-preview:large';

export const GAME_METADATA: SiteMetadata = {
  title: `Claude of Tanks — Free Browser Tank Game | ${PRODUCT_STATS.productionVehicles} Tanks, ${PRODUCT_STATS.battlefields} Battlefields`,
  description: `Claude of Tanks is a free browser-native armored warfare game with ${PRODUCT_STATS.productionVehicles} production vehicles, ${PRODUCT_STATS.battlefields} battlefields, bot and multiplayer battles, X-ray killcams, and a cinematic scene studio — pure Three.js, no install, no account.`,
  canonical: `${SITE_ORIGIN}/`,
  url: `${SITE_ORIGIN}/`,
  image: `${SITE_ORIGIN}/brand/og-image.png`,
  imageAlt: 'Claude of Tanks — in-engine battle still with the crest wordmark',
  type: 'website',
  robots: INDEX_ROBOTS,
  ogTitle: 'Claude of Tanks — Free Browser Tank Game',
  ogDescription: `Free-roam armored warfare in the browser — ${PRODUCT_STATS.productionVehicles} production vehicles, ${PRODUCT_STATS.battlefields} battlefields, bot and multiplayer battles, and killcam X-rays. Pure Three.js, no install.`,
};

export const STUDIO_METADATA: SiteMetadata = {
  title: 'Scene Studio — Stage Cinematic Tank Battles | Claude of Tanks',
  description: 'Open the Claude of Tanks Scene Studio to stage vehicles, maps, cameras, weather, articulation, effects, timelines, stills, GIFs, and cinematic battle videos directly in your browser.',
  canonical: `${SITE_ORIGIN}/studio`,
  url: `${SITE_ORIGIN}/studio`,
  image: `${SITE_ORIGIN}/brand/og/studio.jpg`,
  imageAlt: 'Claude of Tanks Scene Studio composing an in-engine urban tank battle',
  type: 'website',
  robots: INDEX_ROBOTS,
  ogTitle: 'Scene Studio — Claude of Tanks',
  ogDescription: 'Compose cinematic tank scenes with current vehicles, maps, cameras, weather, effects, timelines, stills, GIFs, and video.',
};

export function normalizeRoomCode(value: string | null): string {
  const ambiguousCharacters: Readonly<Record<string, string>> = {
    0: 'Q', 1: 'L', I: 'L', O: 'Q',
  };
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[01IO]/g, (character) => ambiguousCharacters[character] || character)
    .slice(0, 6);
}

export function normalizeHostName(value: string | null): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function privateRoomMetadata(url: URL): SiteMetadata | null {
  const roomCode = normalizeRoomCode(url.searchParams.get('room'));
  if (roomCode.length !== 6) return null;

  const hostName = normalizeHostName(url.searchParams.get('host'));
  const isLan = url.searchParams.get('mode')?.toLowerCase() === 'lan';
  const battleKind = isLan ? 'LAN battle' : 'private battle';
  const invitation = hostName ? `${hostName} invited you` : 'You have been invited';
  const title = hostName
    ? `Join ${hostName}’s ${isLan ? 'LAN Battle' : 'Private Battle'} — Claude of Tanks`
    : `Join Private Battle ${roomCode} — Claude of Tanks`;
  const description = `${invitation} to join ${battleKind} room ${roomCode} in Claude of Tanks. Open the link to choose your vehicle, team, and ready state.`;

  return {
    title,
    description,
    canonical: `${SITE_ORIGIN}/`,
    url: url.href,
    image: `${SITE_ORIGIN}/brand/og/private-room.jpg`,
    imageAlt: 'Two-player Claude of Tanks multiplayer battle with the crest wordmark',
    type: 'website',
    robots: PRIVATE_ROBOTS,
    ogTitle: title.replace(' — Claude of Tanks', ''),
    ogDescription: description,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function replaceAttribute(tag: string, name: string, value: string): string {
  const escaped = escapeHtml(value);
  const pattern = new RegExp(`(${name}\\s*=\\s*["'])[^"']*(["'])`, 'i');
  return pattern.test(tag)
    ? tag.replace(pattern, `$1${escaped}$2`)
    : tag.replace(/\s*\/?>$/, ` ${name}="${escaped}" />`);
}

function replaceMeta(html: string, selector: 'name' | 'property', key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\b[^>]*\\b${selector}\\s*=\\s*["']${escapedKey}["'][^>]*>`, 'i');
  return html.replace(pattern, (tag) => replaceAttribute(tag, 'content', value));
}

/** Replace an existing page's complete social metadata without touching its app body. */
export function injectSiteMetadata(html: string, metadata: SiteMetadata): string {
  let output = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`);
  output = replaceMeta(output, 'name', 'description', metadata.description);
  output = replaceMeta(output, 'name', 'robots', metadata.robots);
  output = output.replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i,
    (tag) => replaceAttribute(tag, 'href', metadata.canonical));
  output = replaceMeta(output, 'property', 'og:title', metadata.ogTitle || metadata.title);
  output = replaceMeta(output, 'property', 'og:description', metadata.ogDescription || metadata.description);
  output = replaceMeta(output, 'property', 'og:type', metadata.type);
  output = replaceMeta(output, 'property', 'og:url', metadata.url);
  output = replaceMeta(output, 'property', 'og:image', metadata.image);
  output = replaceMeta(output, 'property', 'og:image:type', metadata.image.endsWith('.png') ? 'image/png' : 'image/jpeg');
  output = replaceMeta(output, 'property', 'og:image:alt', metadata.imageAlt);
  output = replaceMeta(output, 'name', 'twitter:title', metadata.ogTitle || metadata.title);
  output = replaceMeta(output, 'name', 'twitter:description', metadata.ogDescription || metadata.description);
  output = replaceMeta(output, 'name', 'twitter:image', metadata.image);
  output = replaceMeta(output, 'name', 'twitter:image:alt', metadata.imageAlt);
  return output;
}

/** Keep metadata correct when the single playable document changes modes. */
export function applySiteMetadataToDocument(document: Document, metadata: SiteMetadata): void {
  const setMeta = (selector: string, value: string): void => {
    document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', value);
  };
  document.title = metadata.title;
  document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', metadata.canonical);
  setMeta('meta[name="description"]', metadata.description);
  setMeta('meta[name="robots"]', metadata.robots);
  setMeta('meta[property="og:title"]', metadata.ogTitle || metadata.title);
  setMeta('meta[property="og:description"]', metadata.ogDescription || metadata.description);
  setMeta('meta[property="og:type"]', metadata.type);
  setMeta('meta[property="og:url"]', metadata.url);
  setMeta('meta[property="og:image"]', metadata.image);
  setMeta('meta[property="og:image:type"]', metadata.image.endsWith('.png') ? 'image/png' : 'image/jpeg');
  setMeta('meta[property="og:image:alt"]', metadata.imageAlt);
  setMeta('meta[name="twitter:title"]', metadata.ogTitle || metadata.title);
  setMeta('meta[name="twitter:description"]', metadata.ogDescription || metadata.description);
  setMeta('meta[name="twitter:image"]', metadata.image);
  setMeta('meta[name="twitter:image:alt"]', metadata.imageAlt);
}
