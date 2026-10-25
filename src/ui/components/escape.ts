// The component kit's escape (components.ts re-exports it): text and attribute values are escaped once, here, and a
// host's extra attributes are written by attrs(). A module of its own with no imports, so Node-run generators (tools/gallery-shell.mjs) share it. Copyright © 2026 Kevin B. Liu.
const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value: string | number): string => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);

/** Extra attributes for a host element, escaped; `true` writes a bare attribute, false/null/undefined omit it. */
export type Attrs = Readonly<Record<string, string | number | boolean | null | undefined>>;
export function attrs(extra: Attrs | undefined): string {
  if (!extra) return '';
  let out = '';
  for (const [name, value] of Object.entries(extra)) {
    if (value === false || value === null || value === undefined) continue;
    out += value === true ? ` ${name}` : ` ${name}="${esc(value)}"`;
  }
  return out;
}
