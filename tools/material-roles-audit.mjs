#!/usr/bin/env node
// FSP-06 material-role census (owner 2026-09-25: "camouflage on painted vehicle bodywork; distinct
// materials/colors for accessory equipment, cloth, bags and mechanisms").
//
//   node tools/material-roles-audit.mjs [--ids=a,b | --all | --production] [--json=path] [--md=path]
//                                       [--no-decor] [--quiet] [--gate]
//
// Builds every selected tank headless (procedural, HIGH, decoration kit on) with the factory's opt-in part
// census, so each authored part is observed with the bucket it merges into and the profile line that authored
// it, before the bucket merge erases part identity. A part is classified by the words on its authoring line
// (the call and up to two preceding comment lines): soft goods (bags, packs, bedrolls, tarps, nets, sandbags,
// curtains, aprons), rubber (flaps, tires, hoses, gaiters), optic glass (lenses, vision blocks, windows), bare
// metal (tow cables, chains, MG bodies, exhausts, tool heads, antenna bases), wood (logs, planks, tool handles,
// crates) and solid-painted cans (jerry / fuel / water / ammunition cans). A part whose words ask for a distinct
// material but whose bucket carries the camouflage map is a CAMO-ON-ACCESSORY violation; a part whose words
// name painted bodywork or stowage (skirt, fender, bin, box, basket, hatch, cupola, shield ...) but whose bucket
// carries a bare finish is a BARE-BODYWORK violation. Violations are ranked by the part's bounding-box surface
// area (what the chase camera sees at 15-25 m; every one of these buckets is LOD0 stock).
//
// After the build the merged tree is censused by appearance role (object/material userData.appearanceRole,
// Decor_* kit materials by key) with triangle counts, and the distinct-material count per tank is recorded
// (the battleGeometrySharing bound: no more than +2 materials per tank across a re-roling round).
//
// The classification is lexical evidence, not a verdict: every row carries the file:line and the authoring text
// so a reviewer can read the part's intent. --gate exits 1 when any camo-on-accessory violation remains.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './tank-surface-collect.mjs'; // node canvas shim: materials are set as shipped

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const quiet = flag('quiet');
// --dump=path writes every observed part (bucket, authored bucket, finish, area, site, words) as JSON lines.
const dumpPath = opt('dump', '');
const dump = dumpPath ? [] : null;

const { createTank, bucketMaterialKey } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, PRODUCTION_TANK_IDS, TANK_SPECS } = await import('../src/vehicles/specs.ts');
// tankFactory.ts registers the whole roster for node tools; fleetFactory (the browser's lazy owner) must not be imported here.
const ids = flag('all') ? [...ALL_TANK_IDS]
  : opt('ids', '') ? opt('ids', '').split(',').map((id) => id.trim()).filter(Boolean)
    : [...PRODUCTION_TANK_IDS];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---- material keys -> finish class ------------------------------------------------------------------------
// hull/barrel carry the camouflage map; wheels/detail/canvasCloth are scheme-tinted solids; the rest are fixed.
const CAMO_KEYS = new Set(['hull', 'barrel']);
const FINISH_OF_KEY = Object.freeze({
  hull: 'camo', barrel: 'camo', wheels: 'scheme-paint', detail: 'solid-paint', canvasCloth: 'cloth', canvasPale: 'cloth',
  dark: 'metal', rubber: 'rubber', glass: 'glass', wood: 'wood', spareTrack: 'metal', shadow: 'shadow',
});

// ---- lexicon: words on the authoring line -> the finish the part asks for ----------------------------------
// Order matters: the first matching class wins. Each entry: [class, expected finishes (any is fine), regex].
const ACCESSORY_CLASSES = [
  ['cloth', ['cloth'], /\b(bags?|(ruck|back|kit|stowage|bergen|soft|canvas)[- ]?packs?|rucksacks?|duffels?|bedrolls?|bed[- ]rolls?|tarps?|tarpaulins?|canvas|sacks?|sandbags?|canvas aprons?|curtains?|blankets?|netting|camo[- ]?nets?|cargo[- ]nets?|bundles?|kit[- ]?bags?|holdalls?|haversacks?|bergens?|webbing|ponchos?|groundsheets?|tent|sleeping[- ]bag|mantlet (boot|cover)|(gun|muzzle|dust|canvas) covers?|canvas (roll|sleeve|hood|boot))\b/],
  ['rubber', ['rubber'], /\b(rubber|tires?|tyres?|mud[- ]?flaps?|hoses?|gaiters?|grommets?|bellows)\b/],
  // "window" alone is gate jargon (a mask column window); only a named optical window counts.
  ['glass', ['glass'], /\b(lens(es)?|glass|vision[- ]blocks?|(driver'?s?|vision|sight|optical?|episcope|periscope|searchlight|lamp|headlight) (windows?|glass|lens(es)?|face))\b/],
  // Exhaust silencer boxes and cowls are painted with the hull; only the pipe/stack/tip runs bare and sooted.
  ['metal', ['metal'], /\b(tow[- ]?cables?|cables?|chains?|wire[- ]rope|mgs?|machine[- ]?guns?|(mg|gun) receivers?|muzzle[- ]brakes?|exhaust (pipes?|stacks?|tips?|outlets?|nozzles?|tubes?|elbows?)|tool (heads?|blades?)|(axe|shovel|pick|mattock) (heads?|blades?)|crowbars?|sledge(hammer)?s?|hasps?|padlocks?|clasps?|turnbuckles?|ratchets?|winch(es)?|antenna (bases?|pots?|insulators?)|whips?|spare[- ]track|track[- ]links?|wire[- ]mesh|mesh[- ]screens?)\b/],
  ['wood', ['wood'], /\b(logs?|unditching|planks?|timbers?|crates?|(tool|shovel|axe|pick|wooden) handles?|hafts?|wooden)\b/],
  ['solid-paint', ['solid-paint', 'cloth', 'metal'], /\b(jerry[- ]?cans?|fuel[- ]cans?|water[- ]cans?|ammo(nition)?[- ](cans?|box(es)?|tins?))\b/],
];
// Painted bodywork / stowage that must NOT be bare.
const BODYWORK_RE = /\b(skirts?|fenders?|mudguards?|glacis|bins?|box(es)?|cases?|baskets?|racks?|bustles?|hatch(es)?|cupolas?|shields?|cowls?|handrails?|ladders?|splash[- ]?(board|plate)s?|brackets?|rails?|steps?)\b/;
// Words that mark deliberate negative space, hardware or working gear on a dark bucket (never bodywork).
const DARK_INTENT_RE = /\b(recess(es)?|inset|slot|vent|louvers?|bore|shadow|void|gap|seam|channel|bolts?|nuts?|rivets?|hinges?|latch(es)?|teeth|sprocket|idler|roller|tread|hub|axle|bearing|pin|weld|bead|lip|edge|trim|strip|fade|dark|black|steel|gunmetal|bare|grille|grill|screen|mesh|cage|slat|bar|wire|cable|chain|tube|pipe|barrel|mg|muzzle|exhaust|lamp|light|lens|glass|optic|periscope|sight|antenna|mount|pivot|arm|spring|shock|damper|track|shoe|link|cleat|grouser|guard|frame|stanchion|post|strut|brace|standoff|spacer|bracket|clamp|band|ring|collar|cap|plug|bung|nozzle|hook|eye|clevis|shackle|tow|handle|grab|hand[- ]?hold|foot[- ]?step|rung|ladder|rail)\b/;

const TOOL_FILE = fileURLToPath(import.meta.url);
const sourceCache = new Map();
function sourceLines(file) {
  if (!sourceCache.has(file)) {
    try { sourceCache.set(file, readFileSync(file, 'utf8').split('\n')); } catch { sourceCache.set(file, null); }
  }
  return sourceCache.get(file);
}
function authoringText(file, line) {
  const lines = sourceLines(file);
  if (!lines || line < 1 || line > lines.length) return '';
  const own = lines[line - 1] ?? '';
  let text = own;
  // If the call line carries no comment, borrow the one comment line directly above it — but only when that
  // line stands alone: a multi-line paragraph describes a whole block, not the first part after it.
  if (!/\/\//.test(own)) {
    const above = lines[line - 2] ?? '', beforeAbove = lines[line - 3] ?? '';
    // `// ---- engine deck: ...` lines are section headers describing a whole block, never one part.
    if (/^\s*\/\//.test(above) && !/^\s*\/\/\s*-{3,}/.test(above) && !/^\s*\/\//.test(beforeAbove)) text = `${above} ${text}`;
  }
  return text.replace(/\s+/g, ' ').trim();
}
// The words a line says about its part: comments and identifiers, with camelCase split ("cableReel" -> "cable
// reel"), and the geometry vocabulary of the call itself removed so `box(` never reads as a stowage box.
const CODE_VOCAB_RE = /\b(box|cyl[XYZ]?|torus[VH]?|sph|sphere|lathe|cap[XYZ]|tube|ring|plate|xform|xformParts|KIT|FITTINGS|Math|PI|add(Equipment|Cupola|Hatch|ExternalArmor|ModuleVisual|Mudguard)?|const|let|for|of|if|else|return|true|false|null|s|i|j|k|n|x|y|z|w|h|d|r|P|q)\b/g;
const BUCKET_LITERAL_RE = /'((?:hull|turret|gun)[A-Za-z0-9]*)'/;
function wordsOf(text) {
  // A helper that emits a housing and its glass from one line names `glass` as a parameter or a bucket literal;
  // that word describes the sibling part, not this one.
  // "TurretPack"/"PackWorld" helpers re-base a pack of turret parts authored in hull space — an assembly, not a
  // soft pack.
  return text.replace(/\bglass\b(?=\s*[?,)\].:])/g, ' ').replace(/\bglass[A-Z][A-Za-z0-9]*/g, ' ').replace(/'(?:hull|turret|gunMount)Glass'/g, ' ')
    .replace(/\b\w*(?:TurretPack|PackWorld|packWorld|PACK_BUCKETS)\w*/g, ' ')
    .replace(/\b[A-Z][A-Z0-9_]{2,}\b/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/'[a-zA-Z]+'/g, ' ')
    .replace(CODE_VOCAB_RE, ' ').replace(/\bbuckets?\b/g, ' ')
    .replace(/[0-9.]+/g, ' ').replace(/[^a-zA-Z\s-]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}
// Armor stays camouflaged whatever its bucket or wording (FSP-06: never strip paint from actual armor because a
// builder bucket happens to be called equipment) — the T-90M's soft-bag ERA, Relikt/Kontakt tiles, applique.
const ARMOR_RE = /\b(era|relikt|kontakt|4s2\d|armou?r|applique|reactive|slat|cage|skirt|schurzen)\b/;
const FRAME_RE = /(?:\(|\s|^)(file:\/\/[^\s)]+?|\/[^\s):]+?):(\d+):(\d+)\)?$/;
function parseFrames(stack) {
  const frames = [];
  for (const raw of stack.split('\n').slice(1)) {
    const m = FRAME_RE.exec(raw.trim());
    if (!m) continue;
    let file = m[1];
    if (file.startsWith('file://')) file = fileURLToPath(file);
    if (file === TOOL_FILE) continue;
    frames.push({ file, line: Number(m[2]), rel: relative(repoRoot, file) });
  }
  return frames;
}
const isCore = (rel) => rel.endsWith('src/vehicles/tankFactoryCore.ts') || rel === 'src/vehicles/tankFactoryCore.ts';
const isKit = (rel) => rel.endsWith('src/vehicles/profiles/kit.ts') || rel.endsWith('src/vehicles/factoryGeometry.ts');

function classify(words) {
  for (const [cls, finishes, re] of ACCESSORY_CLASSES) if (re.test(words)) return { cls, finishes };
  return null;
}
function bboxArea(part) {
  if (!part.boundingBox) part.computeBoundingBox();
  const b = part.boundingBox; if (!b || b.isEmpty()) return 0;
  const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
  return 2 * (w * h + h * d + w * d);
}
function triangles(geometry) {
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  return Math.round((geometry.index ? geometry.index.count : position.count) / 3);
}

const previousLimit = Error.stackTraceLimit;
const rows = [];
const MAJOR_AREA_M2 = Number(opt('major-area', '0.15'));
let camoViolationTotal = 0, bareViolationTotal = 0, majorTotal = 0, clusterOverrideTotal = 0;
for (const id of ids) {
  const spec = TANK_SPECS[id];
  const parts = [];
  const partCensus = (bucket, part, source) => {
    Error.stackTraceLimit = 16;
    const frames = parseFrames(new Error().stack || '').filter((f) => !isCore(f.rel)).slice(0, 4);
    Error.stackTraceLimit = previousLimit;
    // The authoring evidence is the innermost frames outside the factory: a kit helper (towCable, periscope) and
    // the profile line that called it. The fix site is the innermost line that names a bucket literally.
    // Only the innermost two frames contribute code (the part's own call and the helper that emitted it); outer
    // frames are sibling call lists, so only their comments count.
    const raw = frames.map((f) => authoringText(f.file, f.line));
    // Frame 1 contributes its code only when frame 0 is a generic emitter (`P.add(bucket, geo, ...)` with no
    // bucket literal); when the innermost line already names the bucket, the caller is an orchestrator listing
    // sibling stages (`smoke(P);machineGun(P);mainGun(P)`), so only its comment counts.
    // A line that chains three or more builder stages (`smoke(P);machineGun(P);mainGun(P)`) is an orchestrator.
    const orchestrator = (t) => (t.match(/\(P[,)]/g) ?? []).length >= 3;
    const texts = frames.map((f, index) => {
      const text = raw[index];
      const codeCounts = index === 0 || (index === 1 && !BUCKET_LITERAL_RE.test(raw[0]) && !orchestrator(text));
      return { frame: f, text: codeCounts ? text : (text.match(/\/\/.*$/)?.[0] ?? '') };
    });
    const literal = texts.find((t) => BUCKET_LITERAL_RE.test(t.text)) ?? null;
    const site = literal?.frame ?? frames.find((f) => !isKit(f.rel)) ?? frames[0] ?? null;
    const authored = literal ? BUCKET_LITERAL_RE.exec(literal.text)?.[1] ?? null : null;
    // Two bucket literals in one conditional (`rigid ? 'hull' : 'hullRubber'`) are an authored per-variant choice.
    const authoredChoice = literal ? (literal.text.match(/'(?:hull|turret|gun)[A-Za-z0-9]*'/g) ?? []).length >= 2 && /\?/.test(literal.text) : false;
    parts.push({ bucket, authored, authoredChoice, source, tris: triangles(part), area: bboxArea(part), site,
      text: texts.map((t) => t.text).filter(Boolean).join(' | ') });
  };
  let tank;
  const startedAt = performance.now();
  try {
    tank = createTank(id, null, { proceduralOnly: true, quality: 'high', batchStatic: false, decor: !flag('no-decor'), partCensus });
  } catch (error) {
    rows.push({ id, error: error.message.slice(0, 200) });
    if (!quiet) console.log(id.padEnd(24), 'BUILD FAILED', error.message.slice(0, 100));
    continue;
  }
  const buildMs = performance.now() - startedAt;
  // ---- part census by bucket / material key / finish ---------------------------------------------------
  const byBucket = {};
  const byFinish = {};
  const camoViolations = [];
  const bareViolations = [];
  const authoredChoices = [];
  for (const part of parts) {
    const key = bucketMaterialKey(part.bucket);
    const finish = FINISH_OF_KEY[key] ?? 'unknown';
    const b = byBucket[part.bucket] || (byBucket[part.bucket] = { key, finish, parts: 0, tris: 0, area: 0 });
    b.parts++; b.tris += part.tris; b.area += part.area;
    const f = byFinish[finish] || (byFinish[finish] = { parts: 0, tris: 0, area: 0 });
    f.parts++; f.tris += part.tris; f.area += part.area;
    const text = part.text;
    const where = part.site ? `${part.site.rel}:${part.site.line}` : '?';
    const words = wordsOf(text);
    const authoredFinish = part.authored ? FINISH_OF_KEY[bucketMaterialKey(part.authored)] ?? 'unknown' : null;
    if (dump) dump.push({ id, bucket: part.bucket, authored: part.authored, key, finish, source: part.source, tris: part.tris, area: Number(part.area.toFixed(4)), where, words, text });
    // A receipt name in the comment ("weathered rubber (a4 receipt)") describes a check, not this part's finish.
    const asks = ARMOR_RE.test(words) || /\breceipts?\b/.test(words) ? null : classify(words);
    if (part.authored && part.authored !== part.bucket && /ExternalArmor$/.test(part.bucket)
        && authoredFinish !== finish && authoredFinish !== 'camo' && authoredFinish !== 'unknown') {
      // The builder asked for a distinct finish; an enclosing ERA cluster re-routed the part to camouflaged
      // external armor (tankFactoryCore add(): the bucket argument is ignored inside a cluster).
      camoViolations.push({ cls: `cluster-override:${part.authored}`, expected: authoredFinish, bucket: part.bucket, key, tris: part.tris,
        area: Number(part.area.toFixed(4)), where, text: text.slice(0, 220) });
    } else if (asks && CAMO_KEYS.has(key) && !asks.finishes.includes(finish)) {
      (part.authoredChoice ? authoredChoices : camoViolations).push({ cls: asks.cls, expected: asks.finishes[0], bucket: part.bucket, key, tris: part.tris,
        area: Number(part.area.toFixed(4)), where, text: text.slice(0, 220) });
    } else if (!asks && (finish === 'metal') && BODYWORK_RE.test(words) && !DARK_INTENT_RE.test(words) && !ARMOR_RE.test(words)) {
      bareViolations.push({ cls: 'bodywork', expected: 'camo', bucket: part.bucket, key, tris: part.tris,
        area: Number(part.area.toFixed(4)), where, text: text.slice(0, 220) });
    }
  }
  // Merge violations that share one authoring line (loops, mirrored sides) so the ranking counts a part once.
  const merge = (list) => {
    const byWhere = new Map();
    for (const v of list) {
      const hit = byWhere.get(v.where);
      if (hit) { hit.count++; hit.tris += v.tris; hit.area = Number((hit.area + v.area).toFixed(4)); }
      else byWhere.set(v.where, { ...v, count: 1 });
    }
    return [...byWhere.values()].sort((a, b) => b.area - a.area);
  };
  const camoMerged = merge(camoViolations), bareMerged = merge(bareViolations);
  // ---- merged-tree census by appearance role -------------------------------------------------------------
  const root = tank.root; root.updateMatrixWorld(true);
  const roles = {};
  const materials = new Set();
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (o.userData?.shadowOnly || /^procShadow_/.test(o.name || '')) return;
    const slots = Array.isArray(o.material) ? o.material : [o.material];
    const instances = o.isInstancedMesh ? o.count : 1;
    const tris = triangles(o.geometry) * instances;
    for (const m of slots) {
      if (!m) continue;
      materials.add(m);
      let role = o.userData?.appearanceRole || m.userData?.appearanceRole || '';
      if (!role && typeof m.name === 'string' && m.name.startsWith('Decor_')) role = `decor:${m.name.slice(6)}`;
      if (!role && o.userData?.fitting) role = `fitting:${o.userData.fitting}`;
      role = role || 'unclassified';
      const r = roles[role] || (roles[role] = { slots: 0, tris: 0 });
      r.slots++; r.tris += Math.round(tris / slots.length);
    }
  });
  const camoTris = Object.entries(roles).filter(([role]) => role === 'armorPaint').reduce((s, [, r]) => s + r.tris, 0);
  const totalTris = Object.values(roles).reduce((s, r) => s + r.tris, 0);
  const row = {
    id, nation: spec?.nation ?? '?', buildMs: Math.round(buildMs), partCount: parts.length,
    byFinish: Object.fromEntries(Object.entries(byFinish).map(([k, v]) => [k, { parts: v.parts, tris: v.tris, area: Number(v.area.toFixed(3)) }])),
    byBucket: Object.fromEntries(Object.entries(byBucket).map(([k, v]) => [k, { key: v.key, finish: v.finish, parts: v.parts, tris: v.tris, area: Number(v.area.toFixed(3)) }])),
    roles, materialCount: materials.size, camoTris, totalTris,
    camoViolationArea: Number(camoMerged.filter((v) => !v.cls.startsWith('cluster-override')).reduce((s, v) => s + v.area, 0).toFixed(3)),
    camoViolations: camoMerged, bareViolations: bareMerged, authoredChoices: merge(authoredChoices),
  };
  // Sites at or above MAJOR_AREA_M2 of bounding-box area are what the chase camera reads at 15-25 m; smaller
  // ones are hardware-scale and listed for completeness.
  row.majorSites = camoMerged.filter((v) => !v.cls.startsWith('cluster-override') && v.area >= MAJOR_AREA_M2).length;
  row.clusterOverrideSites = camoMerged.filter((v) => v.cls.startsWith('cluster-override')).length;
  camoViolationTotal += camoMerged.length - row.clusterOverrideSites; bareViolationTotal += bareMerged.length;
  majorTotal += row.majorSites; clusterOverrideTotal += row.clusterOverrideSites;
  rows.push(row);
  if (!quiet) {
    console.log(id.padEnd(24), String(row.nation).padEnd(8), `parts ${String(parts.length).padStart(5)}`, `mats ${String(materials.size).padStart(3)}`,
      `camo-on-accessory ${String(camoMerged.length - row.clusterOverrideSites).padStart(3)} (major ${String(row.majorSites).padStart(2)}, ${row.camoViolationArea.toFixed(2)} m2)`,
      `cluster-override ${String(row.clusterOverrideSites).padStart(3)}`, `bare-bodywork ${String(bareMerged.length).padStart(3)}`);
  }
  tank.dispose?.();
}

rows.sort((a, b) => (b.camoViolationArea ?? -1) - (a.camoViolationArea ?? -1));
const ok = rows.filter((r) => !r.error);
console.log(`material-roles audit: ${rows.length} tanks (${rows.length - ok.length} failed builds), `
  + `${camoViolationTotal} camo-on-accessory sites (${majorTotal} major >= ${MAJOR_AREA_M2} m2) on `
  + `${ok.filter((r) => r.camoViolations.length - r.clusterOverrideSites > 0).length} tanks, `
  + `${clusterOverrideTotal} ERA-cluster overrides (by factory design, reported separately), ${bareViolationTotal} bare-bodywork sites`);

const jsonPath = opt('json', '');
if (jsonPath) {
  mkdirSync(resolve(jsonPath, '..'), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), ids: ids.length, rows }, null, 1));
}
const mdPath = opt('md', '');
if (mdPath) {
  const lines = [];
  lines.push('| id | nation | parts | materials | camo tris / total | camo-on-accessory sites (major) | area m2 | ERA-cluster overrides | bare-bodywork |', '|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    if (r.error) { lines.push(`| ${r.id} | - | BUILD FAILED | | | | | | |`); continue; }
    lines.push(`| ${r.id} | ${r.nation} | ${r.partCount} | ${r.materialCount} | ${r.camoTris} / ${r.totalTris} | ${r.camoViolations.length - r.clusterOverrideSites} (${r.majorSites}) | ${r.camoViolationArea.toFixed(2)} | ${r.clusterOverrideSites} | ${r.bareViolations.length} |`);
  }
  const isOverride = (v) => v.cls.startsWith('cluster-override');
  lines.push('', '## Camo-on-accessory sites (ranked by bounding-box area)', '');
  for (const r of rows) {
    const sites = r.error ? [] : r.camoViolations.filter((v) => !isOverride(v));
    if (!sites.length) continue;
    lines.push(`### ${r.id} (${r.nation}) — ${sites.length} sites (${r.majorSites} major), ${r.camoViolationArea.toFixed(2)} m2`, '');
    lines.push('| area m2 | n | class -> expected | bucket | where | authoring text |', '|---:|---:|---|---|---|---|');
    for (const v of sites) lines.push(`| ${v.area.toFixed(3)} | ${v.count} | ${v.cls} -> ${v.expected} | ${v.bucket} | ${v.where} | ${v.text.replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  lines.push('## ERA-cluster overrides (authored distinct finish, re-routed to camouflaged external armor by the factory; by design)', '');
  for (const r of rows) {
    const sites = r.error ? [] : r.camoViolations.filter(isOverride);
    if (!sites.length) continue;
    lines.push(`### ${r.id} (${r.nation}) — ${sites.length} sites, ${sites.reduce((s, v) => s + v.area, 0).toFixed(2)} m2`, '');
    lines.push('| area m2 | n | authored -> rendered | where | authoring text |', '|---:|---:|---|---|---|');
    for (const v of sites) lines.push(`| ${v.area.toFixed(3)} | ${v.count} | ${v.cls.slice('cluster-override:'.length)} -> ${v.bucket} | ${v.where} | ${v.text.replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  lines.push('## Authored per-variant choices (a conditional names two buckets; the builder chose this finish for this variant)', '');
  for (const r of rows) {
    const sites = r.error ? [] : r.authoredChoices;
    if (!sites.length) continue;
    lines.push(`### ${r.id} (${r.nation}) — ${sites.length} sites, ${sites.reduce((s, v) => s + v.area, 0).toFixed(2)} m2`, '');
    lines.push('| area m2 | n | class | bucket | where | authoring text |', '|---:|---:|---|---|---|---|');
    for (const v of sites) lines.push(`| ${v.area.toFixed(3)} | ${v.count} | ${v.cls} | ${v.bucket} | ${v.where} | ${v.text.replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  lines.push('## Bare-bodywork sites (dark bucket, bodywork words)', '');
  for (const r of rows) {
    if (r.error || !r.bareViolations.length) continue;
    lines.push(`### ${r.id} (${r.nation}) — ${r.bareViolations.length} sites`, '');
    lines.push('| area m2 | n | bucket | where | authoring text |', '|---:|---:|---|---|---|');
    for (const v of r.bareViolations) lines.push(`| ${v.area.toFixed(3)} | ${v.count} | ${v.bucket} | ${v.where} | ${v.text.replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  mkdirSync(resolve(mdPath, '..'), { recursive: true });
  writeFileSync(mdPath, lines.join('\n'));
}
if (dump) {
  mkdirSync(resolve(dumpPath, '..'), { recursive: true });
  writeFileSync(dumpPath, dump.map((row) => JSON.stringify(row)).join('\n'));
}
if (flag('gate') && camoViolationTotal) process.exit(1);
