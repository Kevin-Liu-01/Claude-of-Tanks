/**
 * Scene links (owner 2026-10-07: the Studio's scene export and import are "a big feature i love"). A link such as
 * `/studio?scene=/media/filming-r1/s05-barn-advance.scene.json` opens the Studio on that scene, exactly as Load JSON
 * would with the file. Only a path on this site is accepted: a link must never make the Studio fetch a file from another
 * origin, so `https://…`, protocol-relative `//host/…`, backslashes and anything that is not a `.json` path are refused.
 */
export function sceneLinkPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('..')) return null;
  if (!/^\/[\w./-]+\.json$/.test(path)) return null;
  return path;
}
