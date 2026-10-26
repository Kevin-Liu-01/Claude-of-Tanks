// Vehicle designations, names and numeric phrases in the manual's captions and cards (T-90M, Self-propelled
// anti-aircraft, 7 v 7, 500 m): a line never breaks inside one.
// Copyright © 2026 Kevin B. Liu.
// A designation is a token with a digit that is joined by hyphens (T-90M, TOS-1A) or mixes letters and digits (2A7V); each
// sits in a nowrap span (docs.css .dm-nobr), so a caption wraps before the designation instead of after its hyphen, while
// a hyphenated word in running prose (anti-aliasing) still breaks as words do. A name (a class, a vehicle, a map, a take)
// holds every hyphenated word whole as well, so "Self-propelled anti-aircraft" breaks only at its space. A numeric phrase
// (a side count, a number and its unit) takes no-break spaces. Only the text between tags changes: markup and entities
// pass through. DOM-free, so the prerender and the pages share it.

const DESIGNATION = /(?<![\w&#-])(?:(?=[A-Za-z\d-]*\d)[A-Za-z\d]+(?:-[A-Za-z\d]+)+|(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z\d]+)(?![\w-])/g;
/** In a name: every hyphenated word (Self-propelled, anti-aircraft, KV-2) and every letters-and-digits designation (2A7V). */
const NAME_WORD = /(?<![\w&#-])(?:[A-Za-z\d]+(?:-[A-Za-z\d]+)+|(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z\d]+)(?![\w-])/g;
/** A side count: 7 v 7, 14 v 14, 5 对 20. */
const SIDES = /(\d) (v|vs\.?|对) (?=\d)/g;
/** A number and its unit: 500 m, 2.5 s, 13 m/s, 60 Hz, 10 %, 30 米 (the space before the unit). */
const UNIT = /(\d) (?=(?:m\/s|km\/h|mm|cm|km|ms|min|dB|Hz|FPS|LUFS|kg|px|m|s|h|g|%|°|毫米|厘米|千米|公里|米|毫秒|秒|分钟|小时|分贝|赫兹|帧)(?![\w/]))/g;
const NBSP = ' ';

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const textParts = (html: string, edit: (text: string) => string): string => html.split(/(<[^>]*>)/).map((part, index) => (index % 2 ? part : edit(part))).join('');

/** Markup with each designation in its text held on one line. */
export function keepDesignations(html: string): string {
  return textParts(html, (text) => text.replace(DESIGNATION, '<span class="dm-nobr">$&</span>'));
}

/** A name shown in a control (a picker card) as plain text: a hyphenated word holds whole (a word joiner after its
 *  hyphen: T-90A), a trailing numeral stays with its word (Engine review 1, Challenger 1), and a Latin name inside
 *  Chinese text holds whole (T-90A Burlak). The kit picker's search folds both marks away. */
export function holdNameText(text: string): string {
  const held = text.replace(/(?<=[A-Za-z\d])-(?=[A-Za-z\d])/g, '-\u2060').replace(/ (?=\d+(?![\w-]))/g, NBSP);
  return /[\u3400-\u9fff]/.test(held) ? held.replace(/(?<=[A-Za-z\d.-]) (?=[A-Za-z\d])/g, NBSP) : held;
}

/** Plain text as markup, its designations held on one line. */
export function designationHtml(text: string): string {
  return keepDesignations(escapeHtml(text));
}

/** A name as markup (a class, a vehicle, a map in a card): each hyphenated word and designation held whole, so the name
 *  breaks only between its words. */
export function nameHtml(text: string): string {
  return escapeHtml(text).replace(NAME_WORD, '<span class="dm-nobr">$&</span>');
}

/** Markup whose numeric phrases (7 v 7, 14 对 14, 500 m, 15 min) never break: their spaces become no-break spaces. A
 *  clock (15:00) has no break opportunity of its own. */
export function keepPhrases(html: string): string {
  return textParts(html, (text) => text.replace(SIDES, `$1${NBSP}$2${NBSP}`).replace(UNIT, `$1${NBSP}`));
}
