/**
 * blobMedia.ts — the site's large media on Vercel Blob instead of in the repository (docs-refresh-279; Kevin 2026-11-26:
 * "use a vercel blob for all this big media"). The one manifest for it, src/presentation/blobMedia.json, maps a media id
 * to its Blob URL, bytes, SHA-256 and type, plus a film's or picture's size, a film's or sound's length, and a poster (a
 * small still that does live in public/). Every page that shows Blob media reads it here; tools/blob-media.mjs is the
 * one writer (add, stage, upload, fixture, check: its header says how).
 *
 * An item's store pathname is content-addressed (`media/<id>-<sha256 first 16>.<ext>`), so a re-upload of the same bytes
 * is a no-op and a changed file gets a new URL no cache holds. `blobMediaItem` answers null until an item has a URL on
 * the store's host: nothing on a page points at media that is not there yet. The CSP (vercel.json) sets no default-src,
 * media-src, img-src or connect-src limit, so the host loads as any other; tools/blob-media.selftest.mjs fails if a
 * directive is added that would block it. Pure data and checks: Node and the browser both import it.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import manifest from './blobMedia.json' with { type: 'json' };

export interface BlobMediaItem {
  /** The local file the item was staged from (the encode's name; tools/blob-media.mjs --dir finds it). */
  readonly file: string;
  /** The pathname in the store: `<prefix>/<id>-<sha256 first 16>.<ext>`. */
  readonly pathname: string;
  /** The public URL, once uploaded; null before. */
  readonly url: string | null;
  readonly bytes: number;
  readonly sha256: string;
  /** The MIME type the store serves it with (tools/blob-media.mjs TYPES, by extension). */
  readonly type: string;
  /** A film's or picture's pixel size. */
  readonly width?: number;
  readonly height?: number;
  /** A film's or sound's length. */
  readonly durationS?: number;
  /** A still in public/ (site-relative), shown before a film loads; every film has one. */
  readonly poster?: string;
}

export interface BlobMediaManifest {
  /** The store's public host suffix: every uploaded URL is https on a subdomain of it. */
  readonly host: string;
  readonly items: Readonly<Record<string, BlobMediaItem>>;
}

export const BLOB_MEDIA: BlobMediaManifest = manifest as BlobMediaManifest;

/** A local test fixture's host (tools/blob-media.mjs fixture): plain http, on this machine only. The committed manifest's
 *  host is the store's (blob-media.selftest.mjs). */
const LOOPBACK = new Set(['127.0.0.1', 'localhost']);

/** A Blob URL the site may embed: https on the store's public host (or http on a loopback fixture host). */
export function isBlobMediaUrl(url: string, host = BLOB_MEDIA.host): boolean {
  try {
    const parsed = new URL(url);
    const secure = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && LOOPBACK.has(host));
    return secure && (parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** An item a page can show (uploaded, with a URL on the store's host), or null. */
export function blobMediaItem(id: string, from: BlobMediaManifest = BLOB_MEDIA): (BlobMediaItem & { readonly url: string }) | null {
  const item = from.items[id];
  if (!item?.url || !isBlobMediaUrl(item.url, from.host)) return null;
  return item as BlobMediaItem & { readonly url: string };
}
