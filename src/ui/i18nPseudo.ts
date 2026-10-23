/**
 * i18nPseudo.ts — the pseudo-locale (BUI-F8, SPEC 15): English made about 40 % longer and accented, so a layout
 * that only fits English, or a string that never went through the catalog, shows up in a probe.
 *
 * "Deploy" becomes "Ðéþlöý ··": letters with a Latin-1 accented twin take it (the brand faces' Latin subsets carry
 * Latin-1, so glyph widths stay the shipped faces' widths) and middle-dot padding brings each run of copy to at least
 * 1.4x its length. Placeholders (`{name}`), the ICU structure (`{n, plural, one {…} other {…}}`: only the
 * messages inside are converted), HTML tags and entities, and product-stat tokens (`{{COT_*}}`) pass through
 * untouched, so formatting and markup behave exactly as in English.
 *
 * Development only: i18n.ts swaps the resident English dictionary for this one when a dev-server document carries
 * `?pseudo=1` (the layout probes and fixtures); production builds compile that branch out and never ship this module.
 */

/** Expansion target: pseudo text is at least this many times the English length. */
export const PSEUDO_EXPANSION = 1.4;

// Latin-1 twins only (the brand faces' Latin subsets carry Latin-1, so a fallback face never changes the metrics).
const ACCENT_MAP: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  [...'acdeinopuyACDEINOPUY'].map((letter, i) => [letter, [...'åçðéïñöþüýÅÇÐÉÏÑÖÞÜÝ'][i]]),
));

function accent(text: string): string {
  let out = '';
  for (const ch of text) out += ACCENT_MAP[ch] ?? ch;
  return out;
}

/** The padded, accented form of one run of plain copy (no braces, tags or entities inside). */
function pseudoRun(text: string): string {
  if (!/[A-Za-z]/.test(text)) return text;
  const pad = Math.max(1, Math.ceil(text.trim().length * (PSEUDO_EXPANSION - 1)));
  const lead = /^\s*/.exec(text)![0], trail = /\s*$/.exec(text)![0];
  return `${lead}${accent(text.trim())} ${'·'.repeat(Math.max(0, pad - 1))}${trail}`;
}

function closing(source: string, open: number): number {
  for (let depth = 0, at = open; at < source.length; at++) {
    if (source[at] === '{') depth++;
    else if (source[at] === '}' && !--depth) return at;
  }
  return -1;
}

/** Convert a catalog message: copy runs expand, structure (placeholders, ICU heads, tags, entities) stays byte-equal. */
export function pseudoMessage(source: string): string {
  let out = '', run = '';
  const flush = (): void => { out += pseudoRun(run); run = ''; };
  for (let at = 0; at < source.length;) {
    const ch = source[at];
    if (ch === '{') {
      const end = closing(source, at);
      if (end < 0) { run += source.slice(at); break; }
      flush();
      const raw = source.slice(at, end + 1);
      const icu = /^\{\s*\w+\s*,\s*(plural|select)\s*,/.exec(raw);
      if (!icu) out += raw;
      else {
        // keep the head and each option key, convert each option message
        const body = raw.slice(icu[0].length, -1);
        let rebuilt = icu[0];
        for (let i = 0, m; (m = /^(\s*=?[\w-]+\s*)\{/.exec(body.slice(i)));) {
          const open = i + m[0].length - 1, close = closing(body, open);
          if (close < 0) break;
          rebuilt += `${m[1]}{${pseudoMessage(body.slice(open + 1, close))}}`;
          i = close + 1;
        }
        out += `${rebuilt}}`;
      }
      at = end + 1;
    } else if (ch === '<' || ch === '&') {
      const end = source.indexOf(ch === '<' ? '>' : ';', at);
      if (end < 0 || (ch === '&' && !/^&[#\w]+;$/.test(source.slice(at, end + 1)))) { run += ch; at++; continue; }
      flush();
      out += source.slice(at, end + 1);
      at = end + 1;
    } else {
      run += ch;
      at++;
    }
  }
  flush();
  return out;
}

/** A whole dictionary in pseudo form (the same keys). */
export function pseudoDictionary(dictionary: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dictionary)) out[key] = pseudoMessage(value);
  return out;
}
