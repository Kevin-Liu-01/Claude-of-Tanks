/**
 * blobMediaFamily.ts — a page's URL for media whose path it builds at run time (media-blob-279; Main 2026-11-26). Most
 * media paths are written whole (markup, runtime JSON, string literals), and the build rewrites them to their Blob URLs
 * (tools/blob-media.mjs rewrite). A few families are built from an id while the page runs (a map's stills, a battle's
 * end art, a studio take's still and loop, a tutorial step's clip, the media library's packs): each has a small map,
 * src/presentation/blobMediaFamilies/<family>.json, generated from the one manifest (tools/blob-media.mjs families) and
 * imported only by the module that builds those paths, so it ships in that module's chunk and never in boot.
 *
 * A family map holds its prefix, the store's origin (null until the upload) and, for each of its moved files, the first
 * 16 hex of its SHA-256; the URL is the origin and the item's content-addressed pathname (blobMediaPath.ts). A path the
 * map does not hold is a small file still in public/ and is returned as is. The build fails when a map disagrees with
 * the manifest, or when a moved file has no URL yet. Receipts map a URL back to its path with tools/media-files.mjs.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import { idForPath, pathnameFor } from './blobMediaPath.ts';

export interface BlobMediaFamily {
  /** The site path every member starts with (`/media/maps-r1/`). */
  readonly prefix: string;
  /** The store's origin (`https://<store>.public.blob.vercel-storage.com`), or a loopback fixture's; null before upload. */
  readonly origin: string | null;
  /** A moved member's path under the prefix → the first 16 hex of its SHA-256. */
  readonly items: Readonly<Record<string, string>>;
}

/** The URL a page loads for `path`: its Blob URL when the family's map holds it, else the path (a file in public/). */
export function familyMediaUrl(family: BlobMediaFamily, path: string): string {
  if (!path.startsWith(family.prefix)) throw new Error(`blobMediaFamily: ${path} is not under ${family.prefix}`);
  const sha16 = family.items[path.slice(family.prefix.length)];
  if (sha16 === undefined) return path;
  // Before the upload the origin is null and the URL is the bare pathname, which no host serves: the build refuses to ship
  // a manifest with a path item that has no URL (tools/blob-media.mjs rewrite), so such a URL never reaches a visitor.
  return `${family.origin ?? ''}/${pathnameFor(idForPath(path), sha16, path)}`;
}
