// Round 31 (owner 2026-09-20): "make our tank specific camos into their own camos, combining ones that are
// identical or same exact pattern just diff seed" — every distinct authored paint recipe in the fleet becomes a
// selectable, reusable catalog entry (src/vehicles/authoredPaintCatalog.ts), named after its lead vehicle. Recipes
// that already exist as a named Signature or Service preset are not duplicated. Run after changing any spec's
// `visual`; the receipt `authoredPaintCatalog.selftest.mjs` fails when the generated table drifts from the fleet.
//   node tools/gen-authored-paint-catalog.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { SHARED_CAMO_PRESETS, camoNationTag } from '../src/vehicles/camoPolicy.ts';
import { tankDisplayName } from '../src/vehicles/tankLabels.ts';

const PAINT_ID_PREFIX = 'paint_';
const SCHEME_WORD = {
  solid: 'Plain', nato: 'Tri-Tone', stripes: 'Stripes', digital: 'Digital', 'russian-digital': 'Digital',
  splinter: 'Splinter', desert: 'Desert', ambush: 'Ambush', fleck: 'Fleck', woodland: 'Woodland', blotch: 'Blotch',
  amoeba: 'Amoeba', chip6: 'Chip', caunter: 'Caunter', hexfield: 'Hex',
};
// a plain (solid) coat has no pattern knobs — scale / patch / cell settings are noise there, so two solids with the
// same colours are the same paint (the "same pattern, different seed" case the owner asked to combine)
const recipeOf = (v) => {
  const scheme = v.scheme || 'solid';
  const solid = scheme === 'solid';
  return {
    scheme, base: v.base, weather: v.weather, patches: solid ? [] : [...(v.patches || [])],
    ...(!solid && v.camoScale != null ? { camoScale: v.camoScale } : {}), ...(!solid && v.patchK != null ? { patchK: v.patchK } : {}),
    ...(!solid && v.digitalCellK != null ? { digitalCellK: v.digitalCellK } : {}),
    ...(v.solidWeatheringIntensity != null ? { solidWeatheringIntensity: v.solidWeatheringIntensity } : {}),
  };
};
// identity: the visible pattern — scheme, colours and the pattern scale. The finer knobs (patchK, digitalCellK,
// weathering intensity) are the "different seed" of the same pattern and never make a separate catalog entry.
// identity: the visible paint — its scheme and its set of colours. Pattern scale, patch density, cell size and
// weathering are the "same pattern, different seed" the owner asked to combine (2026-09-21: "preventing duplicate
// camos being stored"), so they never make a second catalog entry.
const recipeKey = (r) => {
  const n = recipeOf(r);
  const colours = [...new Set([n.base, n.weather, ...(n.scheme === 'solid' ? [] : n.patches)].map((c) => String(c).toLowerCase()))].sort();
  return JSON.stringify([n.scheme, colours]);
};
function luminance(hex) { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function environmentOf(r) {
  const l = luminance(r.base); const n = parseInt(r.base.slice(1), 16); const red = (n >> 16) & 255, blue = n & 255, green = (n >> 8) & 255;
  if (l > 0.62) return 'winter';
  if (red > green + 8 && l > 0.42) return 'desert';
  if (Math.abs(red - green) < 10 && Math.abs(green - blue) < 10 && l > 0.3) return 'urban';
  return 'woodland';
}
function styleOf(r) {
  if (r.scheme === 'digital' || r.scheme === 'russian-digital' || r.scheme === 'splinter' || r.scheme === 'hexfield') return 'digital';
  if (r.scheme === 'stripes' || r.scheme === 'caunter') return 'stripes';
  if (r.scheme === 'solid') return 'geometric';
  return 'organic';
}
// dedupe against every NAMED preset (signature / service / national); the generated paint_* entries themselves are
// excluded, or a regeneration would skip its own previous output
const shared = new Set(SHARED_CAMO_PRESETS.filter((p) => !p.id.startsWith(PAINT_ID_PREFIX)).map((p) => recipeKey(p.visual)));
const COLOUR_TOLERANCE = 14; // per channel, of 255 — two coats a shade apart are one paint
const rgb = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const sameShade = (a, b) => rgb(a).every((c, i) => Math.abs(c - rgb(b)[i]) <= COLOUR_TOLERANCE);
const coloursOf = (r) => [r.base, r.weather, ...(r.scheme === 'solid' ? [] : r.patches)].map((c) => String(c).toLowerCase());
// near-identical to a named preset (same scheme, same colour count, every colour within tolerance)?
const namedRecipes = SHARED_CAMO_PRESETS.filter((p) => !p.id.startsWith(PAINT_ID_PREFIX)).map((p) => recipeOf(p.visual));
const nearNamed = (r) => namedRecipes.some((n) => n.scheme === r.scheme && coloursOf(n).length === coloursOf(r).length
  && coloursOf(n).every((c, i) => sameShade(c, coloursOf(r)[i])));
const groups = new Map();
const clusters = []; // { key, recipe, ids }
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id); const v = spec.visual || {};
  if (!v.base) continue;
  const recipe = recipeOf(v);
  if (shared.has(recipeKey(v)) || nearNamed(recipe)) continue; // already a named Signature / Service / national preset
  const colours = coloursOf(recipe);
  let cluster = clusters.find((c) => c.recipe.scheme === recipe.scheme && coloursOf(c.recipe).length === colours.length
    && coloursOf(c.recipe).every((col, i) => sameShade(col, colours[i])));
  if (!cluster) { cluster = { key: recipeKey(v), recipe, ids: [] }; clusters.push(cluster); groups.set(cluster.key, cluster); }
  cluster.ids.push(id);
}
// lead vehicle: the first non-X, non-legacy, non-variant id in fleet order; fall back to the first id
const leadOf = (ids) => ids.find((id) => !/_x$/.test(id) && !/legacy|_proto|_prototype/.test(id)) || ids[0];
const NATION_WORD = {
  USA: 'US Army', Germany: 'Bundeswehr', Russia: 'Russian', USSR: 'Soviet', 'USSR/Russia': 'Soviet', UK: 'British', France: 'French',
  China: 'PLA', Italy: 'Italian', Japan: 'JGSDF', Poland: 'Polish', 'South Korea': 'ROK', Sweden: 'Swedish', Israel: 'IDF',
  Ukraine: 'Ukrainian', Atlantis: 'Atlantean',
};
const PATTERN_WORD = {
  solid: 'Plain', nato: 'Three-Tone', stripes: 'Bands', digital: 'Digital', 'russian-digital': 'Digital', splinter: 'Splinter',
  desert: 'Desert', ambush: 'Ambush', fleck: 'Flecktarn', woodland: 'Woodland', blotch: 'Blotch', amoeba: 'Amoeba', chip6: 'Chip',
  caunter: 'Caunter', hexfield: 'Hex',
};
const ENV_WORD = { woodland: 'Woodland', desert: 'Desert', winter: 'Winter', urban: 'Urban' };
// the tone word of a plain coat, from its base colour
function toneWord(hex) {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 510; const sat = max === 0 ? 0 : (max - min) / max;
  if (l > 0.80) return 'White';
  if (sat < 0.12) return l < 0.30 ? 'Charcoal' : 'Grey';
  if (g >= r && g >= b) {
    if (l < 0.20) return 'Deep Green';
    if (l < 0.28) return r > b + 40 ? 'Olive Drab' : 'Forest Green';
    return l < 0.42 ? 'Olive' : 'Green';
  }
  if (r >= g && g >= b) return l > 0.55 ? 'Sand' : l > 0.40 ? 'Khaki' : 'Brown';
  if (r >= b && r >= g) return 'Rust';
  return 'Slate';
}
const WARTIME = new Set(['ww2', 'interwar']);
const nationWord = (nation, era) => {
  if (nation === 'Germany' && WARTIME.has(era)) return 'Wehrmacht';
  if (nation === 'USSR/Russia' || nation === 'Russia') return WARTIME.has(era) || era === 'cold-war' ? 'Soviet' : 'Russian';
  if (nation === 'USSR') return 'Soviet';
  return NATION_WORD[nation] || nation || 'Fleet';
};
const nameParts = (recipe, nation, env, era) => ({
  who: nationWord(nation, era),
  word: PATTERN_WORD[recipe.scheme] || 'Livery',
  envWord: ENV_WORD[env] || 'Woodland',
  tone: recipe.scheme === 'solid' ? toneWord(recipe.base) : null,
});
const labelEn = ({ who, word, envWord, tone }) => (tone
  ? `${who} Plain ${tone}`
  : word === envWord ? `${who} ${word}` : `${who} ${word} ${envWord}`);
// the Simplified-Chinese garage label is built from the same parts; the i18n catalogs carry one key per paint
const NATION_ZH = {
  'US Army': '美国陆军', Bundeswehr: '联邦国防军', Russian: '俄罗斯', Soviet: '苏联', British: '英国', French: '法国', PLA: '解放军',
  Italian: '意大利', JGSDF: '陆上自卫队', Polish: '波兰', ROK: '韩国', Swedish: '瑞典', IDF: '以色列国防军', Ukrainian: '乌克兰',
  Atlantean: '亚特兰蒂斯', Fleet: '联合', Wehrmacht: '德国国防军',
};
const PATTERN_ZH = {
  Plain: '单色', 'Three-Tone': '三色', Bands: '条带', Digital: '数码', Splinter: '碎片', Desert: '沙漠', Ambush: '伏击', Flecktarn: '斑点',
  Woodland: '林地', Blotch: '斑块', Amoeba: '变形虫', Chip: '碎块', Caunter: '考恩特', Hex: '六角', Livery: '涂装',
};
const ENV_ZH = { Woodland: '林地', Desert: '沙漠', Winter: '冬季', Urban: '城市' };
const TONE_ZH = {
  White: '白', Charcoal: '炭黑', Grey: '灰', 'Deep Green': '深绿', 'Olive Drab': '橄榄褐', 'Forest Green': '森林绿', Olive: '橄榄绿', Green: '绿', Sand: '沙色', Khaki: '卡其',
  Brown: '棕', Rust: '锈红', Slate: '石板灰',
};
const labelZh = ({ who, word, envWord, tone }) => {
  const nation = NATION_ZH[who] || who;
  if (tone) return `${nation}${TONE_ZH[tone] || tone}涂装`;
  return `${nation}${ENV_ZH[envWord] || envWord}${word === envWord ? '' : PATTERN_ZH[word] || word}迷彩`;
};
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
const entries = [...groups.values()].map(({ recipe, ids }) => {
  const lead = leadOf(ids); const spec = getSpec(lead);
  const nationTag = camoNationTag(spec.nation) || null;
  const env = environmentOf(recipe), style = styleOf(recipe);
  const tags = [nationTag, env, style, 'signature'].filter(Boolean);
  const parts = nameParts(recipe, spec.nation, env, spec.era);
  return { id: `${PAINT_ID_PREFIX}${lead}`, lead, sourceTankIds: ids, nation: spec.nation || null, label: labelEn(parts), labelZh: labelZh(parts), tags, visual: recipe };
}).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
// two paints of one nation with the same words: the paint worn by the most hulls keeps the bare name, the others
// take numerals (ties in id order), so a one-off concept never displaces a fleet-wide coat's name
const seen = new Map();
for (const e of entries) { const k = e.label; seen.set(k, (seen.get(k) || 0) + 1); }
const counters = new Map();
const byFamily = entries.slice().sort((a, b) => (b.sourceTankIds.length - a.sourceTankIds.length) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
for (const e of byFamily) {
  if ((seen.get(e.label) || 0) > 1) {
    const n = (counters.get(e.label) || 0) + 1; counters.set(e.label, n);
    const suffix = ROMAN[n - 1] ?? ` ${n}`; e.label = `${e.label}${suffix}`; e.labelZh = `${e.labelZh}${suffix}`;
  }
}
const ids = entries.map((e) => e.id);
if (new Set(ids).size !== ids.length) throw new Error('duplicate paint ids');
const header = `// GENERATED by tools/gen-authored-paint-catalog.mjs — do not edit by hand.
// Round 31/32 (owner 2026-09-20/21): every distinct authored paint in the fleet as a reusable catalog entry, named for
// its nation and pattern (never a vehicle); recipes that already exist as a named Signature / Service / national preset
// are not repeated, and scale / patch / cell knobs never split one paint into two.
// ${entries.length} entries over ${entries.reduce((n, e) => n + e.sourceTankIds.length, 0)} vehicles.
`;
const body = `export const AUTHORED_PAINT_IDS = Object.freeze([\n${ids.map((id) => `  '${id}',`).join('\n')}\n] as const);

export type AuthoredPaintId = typeof AUTHORED_PAINT_IDS[number];

export interface AuthoredPaintEntry {
  readonly id: AuthoredPaintId;
  readonly lead: string;
  readonly sourceTankIds: readonly string[];
  readonly nation: string | null;
  readonly label: string;
  readonly tags: readonly string[];
  readonly visual: {
    readonly scheme: string; readonly base: string; readonly weather: string; readonly patches: readonly string[];
    readonly camoScale?: number; readonly patchK?: number; readonly digitalCellK?: number; readonly solidWeatheringIntensity?: number;
  };
}

export const AUTHORED_PAINT_ENTRIES: readonly AuthoredPaintEntry[] = Object.freeze([
${entries.map(({ labelZh: _zh, ...e }) => `  ${JSON.stringify(e).replace(/"([a-zA-Z]+)":/g, '$1: ').replace(/"/g, "'")},`).join('\n')}
]);
`;
const out = header + '\n' + body;
const target = fileURLToPath(new URL('../src/vehicles/authoredPaintCatalog.ts', import.meta.url));
// i18n: the garage reads labels through t('camoPattern.<id>'); every paint carries one key per language, kept as a
// block after the national colours, and stale paint_* keys from an earlier fleet are dropped on regeneration
const PAINT_KEY_LINE = /^[ \t]*"camoPattern\.paint_[a-z0-9_]+": .*\n/gm;
const NATIONAL_KEY_LINE = /^[ \t]*"camoPattern\.national_[a-z]+": .*\n/gm;
function i18nWithPaints(current, lang) {
  const stripped = current.replace(PAINT_KEY_LINE, '');
  let anchorEnd = -1;
  for (const m of stripped.matchAll(NATIONAL_KEY_LINE)) anchorEnd = m.index + m[0].length;
  if (anchorEnd < 0) { const i = stripped.indexOf('"camoPattern.factory"'); anchorEnd = stripped.indexOf('\n', i) + 1; }
  const lines = entries.map((e) => `  "camoPattern.${e.id}": ${JSON.stringify(lang === 'en' ? e.label : e.labelZh)},`).join('\n') + '\n';
  const next = stripped.slice(0, anchorEnd) + lines + stripped.slice(anchorEnd);
  JSON.parse(next);
  return next;
}
const i18nTargets = [
  [fileURLToPath(new URL('../src/ui/i18nCatalog.en-US.json', import.meta.url)), 'en'],
  [fileURLToPath(new URL('../src/ui/i18nCatalog.zh-CN.json', import.meta.url)), 'zh'],
];
if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current !== out) { console.error('authoredPaintCatalog.ts is stale — run node tools/gen-authored-paint-catalog.mjs'); process.exit(1); }
  for (const [file, lang] of i18nTargets) {
    const text = readFileSync(file, 'utf8');
    if (i18nWithPaints(text, lang) !== text) { console.error(`${file} paint labels are stale — run node tools/gen-authored-paint-catalog.mjs`); process.exit(1); }
  }
  console.log(`authoredPaintCatalog.ts and its i18n labels are current (${entries.length} entries)`);
} else {
  writeFileSync(target, out);
  for (const [file, lang] of i18nTargets) writeFileSync(file, i18nWithPaints(readFileSync(file, 'utf8'), lang));
  console.log(`wrote ${entries.length} authored paint entries (${entries.reduce((n, e) => n + e.sourceTankIds.length, 0)} vehicles) to src/vehicles/authoredPaintCatalog.ts + i18n labels`);
  const byNation = new Map(); for (const e of entries) byNation.set(e.nation, (byNation.get(e.nation) || 0) + 1);
  console.log([...byNation.entries()].map(([n, c]) => `${n}:${c}`).join(' '));
}
