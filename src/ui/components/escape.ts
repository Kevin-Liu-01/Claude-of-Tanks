// The component kit's escape (components.ts re-exports it): text and attribute values are escaped once, here. A module
// of its own with no imports, so Node-run generators (tools/gallery-shell.mjs) share it. Copyright © 2026 Kevin B. Liu.
const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value: string | number): string => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);
