// Types for tools/media-files.mjs (where a served file ships from: public/ or a Vercel Blob path item, media-blob-279)
// where TypeScript imports it: the Field Manual's Node-only chapters (src/docs/chapters) ask it whether a still ships.
export interface MediaFile {
  readonly where: 'public' | 'blob';
  readonly path: string;
  readonly bytes: number;
  readonly file?: string;
  readonly sha256?: string;
  readonly type?: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationS?: number;
  readonly url?: string;
}
export const STAGING: string;
export function sitePath(path: string): string | null;
export function mediaFile(path: string): MediaFile | null;
export function mediaExists(path: string): boolean;
export function mediaBytes(path: string): number;
export function mediaDigest(path: string): { bytes: number; sha256: string; where: 'public' | 'blob' };
export function mediaSource(path: string): string;
