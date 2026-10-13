// The tank id rename table (SSOT 2.19, ID.01).
//
// The owner, 2026-10-12: "fix all tank ids and make them match their actual
// names in game" (leo2a6m shows as "Leopard 2A4 OTCO" while the Leopard 2A6M
// is leo2a6m_x). This tool prints, for every saved spec id, the in-game display
// name, whether the id matches it, the proposed id (a slug of the display name
// in the existing id style) and every tracked place the id is used.
//
// It changes nothing. The mass rename (ID.04/05) consumes its JSON.
//
// Usage:
//   node tools/tank-id-rename-table.mjs                 # markdown to stdout
//   node tools/tank-id-rename-table.mjs --json          # JSON to stdout
//   node tools/tank-id-rename-table.mjs --out=<dir>     # rename-table.{json,md} into <dir>
//   node tools/tank-id-rename-table.mjs --scan-root=<worktree>   # also scan another checkout (repeatable)
//   node tools/tank-id-rename-table.mjs --no-usage      # names and proposals only (fast)
//
// Slug rules (the existing id style):
//   - lowercase ASCII, diacritics folded, words joined by "_";
//   - a prefix and its number join when the name hyphenates them (T-90M -> t90m,
//     BMP-3 -> bmp3) or when a family word precedes a number (Leopard 2A6M -> leo2a6m);
//   - the house abbreviations: Leopard -> leo, Stridsvagn -> strv, Schuetzenpanzer -> spz,
//     Jagdpanzer -> jpz; "Mk 3" -> mk3 (or 3 glued to the family word: merkava3c);
//   - "obr. 2004" -> 2004; a nation in parentheses ("(Ukraine)", "(ROK)") becomes a
//     ua_/rok prefix or suffix; "(Concept)" is a tag and may be dropped freely;
//   - descriptive words without digits (Abrams, Patton, IFV, Prototype ...) may be
//     dropped, but only when no other vehicle could claim the shorter id as well
//     (fewer dropped words wins; a tie means nobody may use it).
// An id matches when it is one of its name's acceptable slugs. A mismatched id is
// proposed the acceptable slug closest to its current spelling. A proposal may
// reuse an id another vehicle gives up ("swap"); those need the versioned alias
// layer (src/vehicles/tankIdAliases.ts), and the table marks every one.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));

// ---------------------------------------------------------------------------
// Slug engine (pure; exported for the selftest)

const FOLD = { 'ł': 'l', 'ø': 'o', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'đ': 'd' };
const ABBREVIATIONS = Object.freeze({
  leopard: ['leo', 'leopard'],
  stridsvagn: ['strv', 'stridsvagn'],
  schutzenpanzer: ['spz', 'schutzenpanzer'],
  jagdpanzer: ['jpz', 'jagdpanzer'],
  prototype: ['prototype', 'proto'],
});
const NATION_PARENS = Object.freeze({ ukraine: 'ua', rok: 'rok', poland: 'pl', china: 'cn', russia: 'ru' });
const NATION_CODES = new Set(['ua', 'pl', 'cn', 'ru', 'rok']);
const FREE_TAGS = new Set(['concept']);

export function foldText(text) {
  return String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[łøßæœđ]/g, (c) => FOLD[c] || c);
}

const ROMAN = /^(i|ii|iii|iv|vi|vii|viii|ix)$/;

function wordsOf(text) {
  let s = foldText(text);
  s = s.replace(/\bobr\.\s*(\d{4})\b/g, ' §$1');            // model year: droppable
  s = s.replace(/\bmk\.?\s*(\d)/g, 'mk$1');                   // Mk 3 -> mk3
  s = s.replace(/(\d)\s*mm\b/g, '$1mm');                      // 50 mm -> 50mm
  s = s.replace(/([a-z])-(\d)/g, '$1$2');                     // T-90 -> t90, MV-1 -> mv1
  s = s.replace(/([a-z0-9])-(?=[a-z])/g, '$1_');              // Oplot-M, KF51-U, ZTZ-85-III: one word
  s = s.replace(/[^a-z0-9§_]+/g, ' ');
  const raw = s.split(' ').filter(Boolean);
  const out = [];
  for (const word of raw) {
    const prev = out[out.length - 1];
    // A family word followed by its number is one designation (Type 90, Leopard 2A6M).
    if (prev && /^[a-z]+$/.test(prev.text) && /^\d/.test(word) && !prev.year) {
      prev.glueAt = prev.text.length;
      prev.text += word;
      continue;
    }
    // A roman numeral belongs to the word before it (Hetman II, Zubr II).
    if (prev && ROMAN.test(word) && /^[a-z_]+$/.test(prev.text) && !prev.glueAt) {
      prev.text += `_${word}`;
      continue;
    }
    if (word.startsWith('§')) out.push({ text: word.slice(1), year: true });
    else out.push({ text: word });
  }
  return out;
}

/**
 * Parse a display name into slug units. Each unit has spelling variants
 * (variants[0] is the canonical one; a variant marked bare is a number that
 * must glue to the family word before it), a drop cost (0 = free, 1 = one
 * dropped word, Infinity = never dropped) and a role.
 */
export function parseDisplayName(name) {
  const parens = [];
  const main = String(name || '').replace(/\(([^)]*)\)/g, (_, inner) => { parens.push(inner.trim()); return ' '; });
  const units = [];
  for (const word of wordsOf(main)) {
    const t = word.text;
    const digits = /\d/.test(t);
    const variants = [];
    const addVariant = (v, bare = false) => { if (!variants.some((x) => x.v === v)) variants.push({ v, bare }); };
    if (word.glueAt) {
      const head = t.slice(0, word.glueAt), tail = t.slice(word.glueAt);
      for (const h of ABBREVIATIONS[head] || [head]) { addVariant(h + tail); addVariant(`${h}_${tail}`); }
    } else if (/^mk\d/.test(t)) {
      addVariant(t); addVariant(t.slice(2), true); // mk3c, or 3c glued to the family word (merkava3c)
    } else {
      for (const v of ABBREVIATIONS[t] || [t]) addVariant(v);
    }
    const nation = !digits && NATION_CODES.has(t);
    units.push({
      variants, role: word.year ? 'year' : digits ? 'designation' : nation ? 'nation' : 'word',
      cost: word.year ? 1 : digits ? Infinity : 1,
    });
  }
  for (const inner of parens) {
    const folded = foldText(inner).trim();
    if (NATION_PARENS[folded]) { units.push({ variants: [{ v: NATION_PARENS[folded] }], role: 'nation', cost: 1 }); continue; }
    if (FREE_TAGS.has(folded)) { units.push({ variants: [{ v: folded }], role: 'tag', cost: 0 }); continue; }
    const slug = wordsOf(inner).map((w) => w.text).join('_');
    if (slug) units.push({ variants: [{ v: slug }], role: 'paren', cost: 1 });
  }
  // A name without any designation keeps its first word (Dardo, Griffin Viper).
  if (!units.some((u) => u.role === 'designation') && units[0]) units[0].cost = Infinity;
  return units;
}

function* cartesian(lists, i = 0, acc = []) {
  if (i === lists.length) { yield acc.slice(); return; }
  for (const item of lists[i]) { acc.push(item); yield* cartesian(lists, i + 1, acc); acc.pop(); }
}

/**
 * Glue variants with their deviation from the canonical spelling: a family
 * word glues to its number (leo2a6m, canonical) and a designation keeps an
 * underscore before a short suffix (m1a1_ha, canonical; m1a1ha also accepted).
 */
function glueForms(parts, years = [], bare = []) {
  const forms = new Map();
  const n = parts.length;
  const joints = [];
  if (bare[0]) return forms;
  for (let i = 0; i < n - 1; i += 1) {
    const a = parts[i], b = parts[i + 1];
    if (bare[i + 1] && !/[a-z]$/.test(a)) return forms; // a bare number needs a family word
    if (bare[i + 1]) joints.push('forced');
    else if (years[i + 1]) joints.push('fixed'); // a model year always stands apart: t72b3m_2022
    else if (/[a-z]$/.test(a) && /^\d/.test(b)) joints.push('glue');
    else if (/\d$/.test(a) && /^[a-z]{1,3}$/.test(b) && !NATION_CODES.has(b)) joints.push('split');
    else joints.push('fixed');
  }
  const choices = joints.map((j) => (j === 'fixed' ? [false] : j === 'forced' ? [true] : [true, false]));
  for (const pick of cartesian(choices)) {
    let s = parts[0];
    let penalty = 0;
    for (let i = 1; i < n; i += 1) {
      const glued = pick[i - 1];
      s += (glued ? '' : '_') + parts[i];
      if (joints[i - 1] === 'glue' && !glued) penalty += 1;
      if (joints[i - 1] === 'split' && glued) penalty += 1;
    }
    if (!forms.has(s) || penalty < forms.get(s)) forms.set(s, penalty);
  }
  return forms;
}

/**
 * Every acceptable slug candidate of a display name with its drop cost and a
 * canonical-ness penalty (0 = the canonical spelling).
 */
export function slugCandidates(name) {
  const units = parseDisplayName(name);
  const out = new Map(); // slug -> { cost, penalty }
  const add = (slug, cost, penalty) => {
    if (!/^[a-z][a-z0-9_]*$/.test(slug) || slug.includes('__') || slug.endsWith('_')) return;
    const prev = out.get(slug);
    if (!prev || cost < prev.cost || (cost === prev.cost && penalty < prev.penalty)) out.set(slug, { cost, penalty });
  };
  const droppable = units.map((u, i) => (Number.isFinite(u.cost) ? i : -1)).filter((i) => i >= 0);
  if (droppable.length > 12) throw new Error(`name too long to enumerate: ${name}`);
  for (let mask = 0; mask < (1 << droppable.length); mask += 1) {
    const dropped = new Set(droppable.filter((_, k) => mask & (1 << k)));
    const kept = units.filter((_, i) => !dropped.has(i));
    if (!kept.length) continue;
    const cost = [...dropped].reduce((sum, i) => sum + units[i].cost, 0);
    const nationUnits = kept.filter((u) => u.role === 'nation');
    const body = kept.filter((u) => u.role !== 'nation');
    if (!body.length) continue;
    const bodyLists = body.map((u) => u.variants.map((variant, vi) => ({ ...variant, vi })));
    const years = body.map((u) => u.role === 'year');
    for (const choice of cartesian(bodyLists)) {
      const variantPenalty = choice.reduce((sum, c) => sum + (c.vi ? 1 : 0), 0);
      const parts = choice.map((c) => c.v);
      const bare = choice.map((c) => Boolean(c.bare));
      if (/^\d|^mk\d/.test(parts[0])) continue; // "mk3" never stands without its family word
      for (const [glued, gluePenalty] of glueForms(parts, years, bare)) {
        const penalty = variantPenalty + gluePenalty;
        if (!nationUnits.length) { add(glued, cost, penalty); continue; }
        const codes = nationUnits.map((u) => u.variants[0].v).join('_');
        add(`${codes}_${glued}`, cost, penalty);
        add(`${glued}_${codes}`, cost, penalty);
      }
    }
  }
  return out;
}

/** The canonical (no drops, canonical spelling) slug of a display name. */
export function canonicalSlug(name) {
  let best = null;
  for (const [slug, { cost, penalty }] of slugCandidates(name)) {
    const freeOnly = cost === 0;
    if (!freeOnly) continue;
    // Free tags such as "(Concept)" stay out of the canonical spelling.
    if (!best || penalty < best.penalty || (penalty === best.penalty && slug.length < best.slug.length)) best = { slug, penalty };
  }
  return best?.slug ?? '';
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * Decide matches and proposals for a fleet of { id, displayName } records.
 * Returns one row per vehicle in input order.
 */
export function planRenames(vehicles, { forcedIds = {} } = {}) {
  const candidates = vehicles.map((v) => slugCandidates(v.displayName));
  // Claimants: slug -> lowest drop cost per vehicle.
  const claims = new Map();
  vehicles.forEach((v, i) => {
    for (const [slug, { cost }] of candidates[i]) {
      if (!claims.has(slug)) claims.set(slug, []);
      claims.get(slug).push({ i, cost });
    }
  });
  const acceptable = vehicles.map((v, i) => {
    const ok = new Map();
    for (const [slug, info] of candidates[i]) {
      const rivals = claims.get(slug).filter((c) => c.i !== i);
      if (rivals.every((c) => c.cost > info.cost)) ok.set(slug, info);
    }
    return ok;
  });
  const oldIds = new Map(vehicles.map((v, i) => [v.id, i]));
  const rows = vehicles.map((v, i) => ({
    id: v.id,
    displayName: v.displayName,
    canonical: canonicalSlug(v.displayName),
    matches: forcedIds[v.id] ? forcedIds[v.id] === v.id : acceptable[i].has(v.id),
    ...(forcedIds[v.id] ? { ruledId: forcedIds[v.id] } : {}),
  }));
  // Ids that stay and ruled ids are reserved first; proposals never take them.
  const taken = new Set(rows.filter((r) => r.matches).map((r) => r.id));
  for (const forced of Object.values(forcedIds)) {
    if (taken.has(forced) && !rows.some((r) => r.id === forced && forcedIds[r.id] === forced)) {
      throw new Error(`ruled id ${forced} is an id that stays`);
    }
    taken.add(forced);
  }
  const order = rows.map((r, i) => i).filter((i) => !rows[i].matches && !rows[i].ruledId);
  const ranked = new Map();
  for (const i of order) {
    const id = rows[i].id;
    // Keep what the current id already says, then spell the whole display
    // name, then the spelling closest to today's id.
    const said = id.split('_').filter((token) => token !== 'x' && !NATION_CODES.has(token));
    const list = [...acceptable[i]].map(([slug, info]) => ({
      slug, cost: info.cost, penalty: info.penalty,
      overlap: said.filter((token) => slug.replace(/_/g, '').includes(token)).length,
      distance: levenshtein(id, slug),
    }));
    list.sort((a, b) => b.overlap - a.overlap || a.cost - b.cost
      || a.distance + a.penalty - (b.distance + b.penalty)
      || a.penalty - b.penalty || a.slug.length - b.slug.length || (a.slug < b.slug ? -1 : 1));
    ranked.set(i, list);
  }
  // Assign in order of how constrained each vehicle is (fewest candidates first).
  const assignOrder = order.slice().sort((a, b) => ranked.get(a).length - ranked.get(b).length || a - b);
  for (const i of assignOrder) {
    const pick = ranked.get(i).find((c) => !taken.has(c.slug));
    rows[i].proposed = pick ? pick.slug : null;
    rows[i].alternatives = ranked.get(i).filter((c) => c.slug !== rows[i].proposed).slice(0, 3).map((c) => c.slug);
    if (pick) taken.add(pick.slug);
  }
  for (const [i, row] of rows.entries()) {
    if (row.ruledId) { row.proposed = row.ruledId; row.alternatives = []; }
    if (row.matches) { row.proposed = row.id; row.alternatives = []; }
    row.changes = row.proposed !== row.id;
    const previousOwner = row.changes ? oldIds.get(row.proposed) : undefined;
    row.reusesRetiredId = previousOwner !== undefined && previousOwner !== i ? vehicles[previousOwner].id : null;
    row.mismatchClass = row.matches ? null : classifyMismatch(row.id, acceptable[i], rows[i].displayName);
  }
  return rows;
}

function classifyMismatch(id, acceptable, displayName) {
  const strippedX = id.replace(/_x$/, '').replace(/(?<=\d)x$/, '');
  const parts = id.split('_');
  const strippedNation = NATION_CODES.has(parts[0]) ? parts.slice(1).join('_') : id;
  const both = NATION_CODES.has(parts[0]) ? strippedX.split('_').slice(1).join('_') : strippedX;
  if (strippedX !== id && acceptable.has(strippedX)) return 'x-suffix';
  if (strippedNation !== id && acceptable.has(strippedNation)) return 'nation-prefix';
  if (both !== id && acceptable.has(both)) return 'nation-prefix+x-suffix';
  const idDesignations = parts.filter((p) => /\d/.test(p));
  const nameDesignations = parseDisplayName(displayName).filter((u) => u.role === 'designation').flatMap((u) => u.variants.map((x) => x.v));
  if (idDesignations.some((d) => !nameDesignations.some((n) => n.replace(/_/g, '') === d || n.endsWith(d)))) return 'designation';
  return 'words';
}

// The coordinator's rulings of 2026-10-13 (the owner gave a free hand). Names
// apply to the table until tankLabels.ts carries them; ids override the slug.
export const COORDINATOR_RULINGS = Object.freeze({
  date: '2026-10-13',
  names: Object.freeze({
    warrior_tes_h: {
      displayName: 'Warrior TES(H)', shortName: 'Warrior TES(H)', tier: 10,
      note: 'VEH-11: the Warrior MILAN X becomes its own Warrior type at tier 10; its description says it carries the MILAN firing post',
    },
    type96b_x: { displayName: 'Type 96B', note: 'drop the X (09-15 ruling: no vehicle keeps one)' },
    aft10_x: { displayName: 'AFT-10', note: 'drop the X (09-15 ruling: no vehicle keeps one)' },
    bmp3m_dragun125_x: { displayName: 'BMP-3M Dragun 125', note: 'drop the X (09-15 ruling: no vehicle keeps one)' },
    type90: {
      displayName: 'Type 90 Kyū-maru', shortName: 'Type 90 Kyū-maru',
      note: 'no two cards read "Type 90": type90_x keeps the name and takes type90',
    },
  }),
  ids: Object.freeze({ type90: 'type90_kyumaru' }),
});

/** Apply the ruled display and short names to a fleet listing. */
export function applyRuledNames(vehicles, rulings = COORDINATOR_RULINGS) {
  return vehicles.map((v) => {
    const ruled = rulings.names[v.id];
    if (!ruled || (ruled.displayName === v.displayName && (ruled.shortName ?? v.shortName) === v.shortName
      && (ruled.tier ?? v.tier) === v.tier)) return v;
    return {
      ...v,
      tier: ruled.tier ?? v.tier,
      liveDisplayName: v.displayName,
      liveShortName: v.shortName,
      displayName: ruled.displayName,
      shortName: ruled.shortName ?? (v.shortName === v.displayName ? ruled.displayName : v.shortName),
      ruling: ruled.note,
    };
  });
}

/** Display-name problems the coordinator rules on (the table never renames a display name). */
export function nameProblems(vehicles) {
  const problems = new Map();
  const note = (id, text, suggestedName) => {
    if (!problems.has(id)) problems.set(id, []);
    problems.get(id).push({ text, ...(suggestedName ? { suggestedName } : {}) });
  };
  const byName = new Map();
  for (const v of vehicles) {
    if (/\sX$/.test(v.displayName)) {
      note(v.id, 'display name keeps an "X" suffix; the 2026-09-15 naming ruling says no vehicle keeps one', v.displayName.replace(/\sX$/, ''));
    }
    for (const label of new Set([v.displayName, v.shortName])) {
      if (!byName.has(label)) byName.set(label, new Set());
      byName.get(label).add(v.id);
    }
  }
  for (const v of vehicles) {
    const sameName = [...(byName.get(v.displayName) || [])].filter((id) => id !== v.id);
    if (sameName.length) note(v.id, `display name "${v.displayName}" is also a name of ${sameName.join(', ')}`);
    if (v.shortName === v.displayName) continue;
    const others = [...(byName.get(v.shortName) || [])].filter((id) => id !== v.id);
    if (others.length) note(v.id, `garage card short name "${v.shortName}" is also the name of ${others.join(', ')}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Usage scan

const BINARY = /\.(png|webp|jpe?g|gif|glb|gltf|bin|mp4|webm|mov|mp3|wav|ogg|m4a|ico|woff2?|ttf|otf|pdf|zip|gz|ktx2|basis|hdr|exr|avif|psd)$/i;
const CATEGORY_RULES = [
  ['roster-docs', (p) => /(^|\/)docs\/VEHICLE-ROSTER\.md$/.test(p)],
  ['history', (p) => /^docs\/history\//.test(p)], // dated records: read through the table, never rewritten
  ['fleet-freeze', (p) => /FLEET-FREEZE/.test(p) || /fleet-freeze/.test(p)],
  ['technical-diagrams', (p) => /^public\/icons\/.*_(armor|modules|crew)_side\.png$/.test(p)],
  ['icons', (p) => /^public\/icons\//.test(p) || /genIcons|tank-assets/.test(p)],
  ['anatomy', (p) => /combatAnatomy|internalLayout|interiorFill|crewLayout|moduleLayout/i.test(p)],
  ['marking-seats', (p) => /vehicleMarkingSeat|MarkingSeat|missionAttachmentSeats|missionDockSeats|marking-seats/.test(p)],
  ['ledgers', (p) => /^docs\/geometry-gate\//.test(p) || /fleet-geometry-ledger|sealed\.json|ledger\.json/.test(p)],
  ['inventories', (p) => /Inventory|inventory|controls-inventory|auxiliary(RoofGuns|Inventory)|garageAuxiliarySummary/.test(p)],
  ['generated', (p) => /\.generated\.|presentationAnchors|reference\.generated/.test(p)],
  ['receipts', (p) => /\.selftest\.mjs$|\.test-support\.|Baseline\.json$|baseline\.json$|receipts?\//.test(p)],
  ['ordering', (p) => /src\/vehicles\/fleetOrder\.ts$|src\/ui\/garageOrder\.ts$/.test(p)],
  ['progression', (p) => /src\/vehicles\/(tier|taxonomy)\.ts$/.test(p)],
  ['profiles', (p) => /^src\/vehicles\/profiles\//.test(p)],
  ['specs', (p) => /^src\/vehicles\/[^/]*(Spec|spec|SourceStudy|Manifest|manifest|Labels|registry|Registry)[^/]*\.ts$/.test(p)],
  ['studio-scenes', (p) => /\.scene\.json$|marketing-shots\/scenes|scenes-studio/.test(p)],
  ['media', (p) => /^tools\/media-|^public\/media\/|media-r\d/.test(p)],
  ['source-references', (p) => /^docs\/references\//.test(p)],
  ['docs', (p) => /\.md$|^docs\//.test(p)],
  ['code', (p) => /^(src|server|api|tools|scripts|site)\//.test(p)],
  ['other', () => true],
];
const URL_LINE = /:\/\/|[?&](id|tank|vehicle|spec)=|\/gallery|#/;

function categoryOf(path) {
  for (const [name, test] of CATEGORY_RULES) if (test(path)) return name;
  return 'other';
}

function trackedFiles(root) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z'], { maxBuffer: 1 << 28 }).toString('utf8');
  return out.split('\0').filter(Boolean);
}

function idPattern(ids) {
  const alts = ids.slice().sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![A-Za-z0-9_])(${alts.join('|')})(?![A-Za-z0-9])`, 'g');
}

export function scanUsage(roots, ids) {
  const pattern = idPattern(ids);
  const usage = new Map(ids.map((id) => [id, new Map()])); // id -> path -> {category, hits, path, url}
  const record = (id, path, kind) => {
    const byPath = usage.get(id);
    if (!byPath.has(path)) byPath.set(path, { path, category: categoryOf(path.replace(/^[^:]+::/, '')), text: 0, url: 0, inPath: false });
    const entry = byPath.get(path);
    if (kind === 'path') entry.inPath = true; else if (kind === 'url') entry.url += 1; else entry.text += 1;
  };
  let filesScanned = 0;
  for (const { root, label } of roots) {
    for (const rel of trackedFiles(root)) {
      const key = label ? `${label}::${rel}` : rel;
      pattern.lastIndex = 0;
      for (const m of rel.matchAll(pattern)) record(m[1], key, 'path');
      if (BINARY.test(rel)) continue;
      let text;
      try {
        const abs = join(root, rel);
        if (statSync(abs).size > 64 * 1024 * 1024) continue;
        text = readFileSync(abs, 'utf8');
      } catch { continue; }
      filesScanned += 1;
      if (!pattern.test(text)) continue;
      pattern.lastIndex = 0;
      for (const line of text.split('\n')) {
        if (!line) continue;
        pattern.lastIndex = 0;
        const isUrl = URL_LINE.test(line) && /(https?:\/\/|\/gallery|[?&](id|tank|vehicle|spec)=)/.test(line);
        for (const m of line.matchAll(pattern)) record(m[1], key, isUrl ? 'url' : 'text');
      }
    }
  }
  return { usage, filesScanned };
}

// ---------------------------------------------------------------------------
// Fleet load and report

async function loadFleet() {
  await import('../src/vehicles/tankFactory.ts');
  const specs = await import('../src/vehicles/specs.ts');
  const { tankTier } = await import('../src/vehicles/tier.ts');
  const production = new Set(specs.PRODUCTION_TANK_IDS);
  return specs.SAVED_TANK_IDS.map((id) => {
    const spec = specs.TANK_SPECS[id];
    return {
      id,
      displayName: spec.label?.displayName || spec.name,
      shortName: spec.label?.shortName || spec.label?.displayName || spec.name,
      nation: spec.nation || '',
      tier: tankTier(id),
      status: production.has(id) ? 'production' : spec.roster?.localVisible ? 'development' : 'reference',
    };
  });
}

const CATEGORY_ORDER = CATEGORY_RULES.map(([name]) => name);

function summarizeUsage(byPath) {
  const categories = {};
  let files = 0, occurrences = 0, urls = 0, pathNamed = 0;
  for (const entry of [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    files += 1; occurrences += entry.text + entry.url; urls += entry.url; if (entry.inPath) pathNamed += 1;
    const c = categories[entry.category] ||= { files: 0, occurrences: 0, paths: [] };
    c.files += 1; c.occurrences += entry.text + entry.url;
    c.paths.push(entry.inPath ? `${entry.path} [path]` : entry.path);
  }
  const ordered = {};
  for (const name of CATEGORY_ORDER) if (categories[name]) ordered[name] = categories[name];
  return { files, occurrences, urlOccurrences: urls, filesNamedById: pathNamed, categories: ordered };
}

function cell(v) { return String(v ?? '').replaceAll('|', '\\|'); }

function renderMarkdown(table) {
  const { rows, summary } = table;
  const lines = [];
  lines.push('# Tank id rename table (ID.01)', '');
  lines.push(`Generated ${table.generatedAt} from \`${table.source.commit}\` by \`node tools/tank-id-rename-table.mjs\`. Display names are unchanged; ids become a slug of the display name in the existing id style. The JSON beside this file carries every path.`, '');
  lines.push('## Summary', '');
  lines.push(`- Saved spec ids: **${summary.total}**; already match their display name: **${summary.matching}**; change: **${summary.changing}** (today's ids are tank id schema ${table.tankIdSchema}; the rename makes schema ${table.tankIdSchema + 1}).`);
  if (table.landedRenames.length) {
    lines.push(`- Already landed: ${table.landedRenames.map((map, k) => `schema ${k + 2} (${Object.entries(map).map(([a, b]) => `\`${a}\` -> \`${b}\``).join(', ')})`).join('; ')}. A schema-1 key applies these first.`);
  }
  lines.push(`- Mismatch classes: ${Object.entries(summary.byClass).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  lines.push(`- Swaps (a new id that another vehicle used to have): **${summary.swaps}**. These ids change meaning, so every stored or sent id carries the id schema and old inputs resolve through the versioned alias map (\`src/vehicles/tankIdAliases.ts\`). No proposal takes an id that stays.`);
  lines.push(`- Display-name problems for the coordinator: **${summary.nameProblems}** vehicles.`);
  lines.push(`- Usage: ${summary.filesScanned} text files scanned${table.source.extraRoots.length ? ` (+ ${table.source.extraRoots.join(', ')})` : ''}; the changing ids appear in ${summary.changingFiles} files (${summary.changingOccurrences} occurrences, ${summary.changingPathNamed} files named by id).`, '');
  lines.push('## Ids that change', '');
  lines.push('| # | Current id | Display name (in game) | Tier | Proposed id | Class | Reuses | Files | Where used (files per category) |');
  lines.push('| ---: | --- | --- | :---: | --- | --- | --- | ---: | --- |');
  rows.filter((r) => r.changes).forEach((r, k) => {
    const where = Object.entries(r.usage?.categories || {}).map(([c, v]) => `${c} ${v.files}`).join(', ');
    const shown = r.liveDisplayName ? `${r.displayName} (ruled ${COORDINATOR_RULINGS.date}; today "${r.liveDisplayName}")` : r.displayName;
    lines.push(`| ${k + 1} | \`${r.id}\` | ${cell(shown)} | ${r.tier} | \`${r.proposed}\`${r.alternatives.length ? ` (or ${r.alternatives.map((a) => `\`${a}\``).join(', ')})` : ''} | ${r.mismatchClass} | ${r.reusesRetiredId ? `\`${r.reusesRetiredId}\`` : ''} | ${r.usage?.files ?? ''} | ${cell(where)} |`);
  });
  lines.push('', `## Coordinator rulings (${COORDINATOR_RULINGS.date})`, '');
  lines.push('Swaps stand and the alias layer is versioned (every stored or sent id carries the tank id schema; a missing schema is schema 1). docs/history stays unedited.', '');
  for (const r of rows.filter((x) => x.liveDisplayName || x.ruledId)) {
    const name = r.liveDisplayName ? `"${r.liveDisplayName}" -> "${r.displayName}"${r.liveShortName !== r.shortName ? ` (card "${r.shortName}")` : ''}` : `"${r.displayName}"`;
    lines.push(`- \`${r.id}\` -> \`${r.proposed}\`: ${name}${r.nameRuling ? `; ${r.nameRuling}` : ''}${r.ruledId ? '; id ruled' : ''}.`);
  }
  lines.push('', '## Display-name problems (the coordinator rules)', '');
  const flagged = rows.filter((r) => r.nameProblems.length);
  if (!flagged.length) lines.push('None.');
  for (const r of flagged) {
    for (const p of r.nameProblems) {
      const suggestion = p.suggestedName ? ` Suggested name "${p.suggestedName}" -> id \`${p.suggestedId}\`.` : '';
      lines.push(`- \`${r.id}\` "${r.displayName}": ${p.text}.${suggestion}`);
    }
  }
  lines.push('', '## Ids that stay', '');
  lines.push(rows.filter((r) => !r.changes).map((r) => `\`${r.id}\` (${cell(r.displayName)})`).join(', '), '');
  lines.push('## Usage categories', '');
  lines.push('roster-docs (docs/VEHICLE-ROSTER.md), history (docs/history: dated records the rename leaves as written), fleet-freeze, technical-diagrams (armor/modules/crew side icons), icons, anatomy, marking-seats, ledgers (geometry gate, sealed, fleet geometry), inventories, generated, receipts, ordering (fleetOrder, garageOrder), progression (tier, taxonomy), profiles, specs, studio-scenes, media, source-references, docs, code, other. `[path]` marks a file whose path is named by the id (icons, references, ledgers). URL occurrences are counted inside each file entry in the JSON (`urlOccurrences`).', '');
  return lines.join('\n');
}

async function main() {
  const aliases = await import('../src/vehicles/tankIdAliases.ts');
  const fleet = applyRuledNames(await loadFleet());
  const plan = planRenames(fleet, { forcedIds: COORDINATOR_RULINGS.ids });
  const problems = nameProblems(fleet);
  const byId = new Map(fleet.map((v) => [v.id, v]));
  const rows = plan.map((row) => {
    const v = byId.get(row.id);
    const nameIssues = (problems.get(row.id) || []).map((p) => {
      if (!p.suggestedName) return p;
      const alt = planRenames(fleet.map((f) => (f.id === row.id ? { ...f, displayName: p.suggestedName } : f)), { forcedIds: COORDINATOR_RULINGS.ids });
      return { ...p, suggestedId: alt.find((a) => a.id === row.id)?.proposed ?? null };
    });
    return {
      ...row, shortName: v.shortName, nation: v.nation, tier: v.tier, status: v.status,
      ...(v.liveDisplayName ? { liveDisplayName: v.liveDisplayName, liveShortName: v.liveShortName, nameRuling: v.ruling } : {}),
      nameProblems: nameIssues,
    };
  });
  const extraRoots = option('scan-root').map((p) => resolve(p));
  let filesScanned = 0;
  if (!flag('no-usage')) {
    const roots = [{ root: ROOT, label: '' }, ...extraRoots.map((root) => ({ root, label: basename(root) }))];
    const scan = scanUsage(roots, fleet.map((v) => v.id));
    filesScanned = scan.filesScanned;
    for (const row of rows) row.usage = summarizeUsage(scan.usage.get(row.id));
  }
  const changing = rows.filter((r) => r.changes);
  const byClass = {};
  for (const r of changing) byClass[r.mismatchClass] = (byClass[r.mismatchClass] || 0) + 1;
  const proposals = changing.map((r) => r.proposed);
  const duplicates = proposals.filter((p, i) => proposals.indexOf(p) !== i);
  const unresolved = rows.filter((r) => r.changes && !r.proposed).map((r) => r.id);
  if (duplicates.length || unresolved.length) {
    throw new Error(`rename plan is not a bijection: duplicates ${duplicates.join(',')} unresolved ${unresolved.join(',')}`);
  }
  let commit = '';
  try { commit = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short=9', 'HEAD']).toString().trim(); } catch { /* not a checkout */ }
  const table = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    source: { commit, extraRoots: extraRoots.map((r) => basename(r)) },
    rules: 'see the header of tools/tank-id-rename-table.mjs',
    summary: {
      total: rows.length,
      matching: rows.length - changing.length,
      changing: changing.length,
      byClass,
      swaps: changing.filter((r) => r.reusesRetiredId).length,
      nameProblems: rows.filter((r) => r.nameProblems.length).length,
      filesScanned,
      changingFiles: new Set(changing.flatMap((r) => Object.values(r.usage?.categories || {}).flatMap((c) => c.paths))).size,
      changingOccurrences: changing.reduce((s, r) => s + (r.usage?.occurrences || 0), 0),
      changingPathNamed: changing.reduce((s, r) => s + (r.usage?.filesNamedById || 0), 0),
    },
    // The pending rename: today's ids (tank id schema `tankIdSchema`) to the proposed ones (the next schema).
    tankIdSchema: aliases.TANK_ID_SCHEMA,
    renames: Object.fromEntries(changing.map((r) => [r.id, r.proposed])),
    // Renames already landed: landedRenames[k] turns schema k+1 ids into schema k+2 ids (src/vehicles/tankIdAliases.ts).
    // A schema-1 key (a media fleet index, an old scene) applies these in order, then `renames`.
    landedRenames: aliases.TANK_ID_RENAMES,
    rows,
  };
  const outDirs = option('out');
  if (outDirs.length) {
    for (const dir of outDirs) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'rename-table.json'), `${JSON.stringify(table, null, 2)}\n`);
      writeFileSync(join(dir, 'rename-table.md'), `${renderMarkdown(table)}\n`);
      console.log(`tank-id-rename-table: wrote ${join(dir, 'rename-table.{json,md}')} (${changing.length}/${rows.length} ids change, ${table.summary.swaps} swaps)`);
    }
  } else if (flag('json')) {
    process.stdout.write(`${JSON.stringify(table, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderMarkdown(table)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
