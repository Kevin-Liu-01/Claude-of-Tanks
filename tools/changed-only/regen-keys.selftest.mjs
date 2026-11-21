// Each step's key holds only what the step reads (274), replayed on the real fleet without writing the tree: an edit is
// keyed through the graph's overlay (graph.mjs `overlay`), and a (step, id) or (step, map) is due when its in-key moved.
//   273.1 (brand-top-274: a route in src/ui/localeRouting.ts, brand UI and media files, docs/ATTRIBUTION.md, catalog keys
//         no page of a step draws) marked centering (the route table) and icons (the route table, and the brand motion
//         scripts in tools/media-r5/motion) on all 311 ids and wreckPlan, collision and trenches (docs/ATTRIBUTION.md) on all
//         33 maps; a 30-minute regen wrote identical bytes. Now it marks nothing.
//   274.0 (armour-live-pen-274: the armour-paint GLSL and its doc comment in src/vehicles/materials.ts, in the fleet core)
//         marked every step on every id and every map (3.5-4 h). Now only the GPU steps, whose page compiles the shader.
//   Controls (a file a step does read moves, so it is due): a materials.ts constant outside the shader text marks every
//   step; shader text named outside a compile hook is refused and keyed whole; localePrefix.ts (the icons page's i18n
//   reads it) marks centering and icons; the wreck plan tool marks its maps. Under KEYS_273 (273's keys) both replays
//   mark what they marked then.
// Also: the re-key (fingerprint.mjs rekeyManifest) carries current keys over and leaves stale ones due, and the chain's
// selection (steps.mjs chainSelection) runs the gate only by name and counts a chain without it as full. Reads the rows
// once (about a minute of CPU); builds nothing. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeState, emptyManifest, KEYS_273, readRows, recordStep, refreshComponents, rekeyManifest, resolveChanged } from './fingerprint.mjs';
import { createGraph } from './graph.mjs';
import { chainSelection, STEPS, WORLD_STEPS } from './steps.mjs';

const root = resolve(import.meta.dirname, '../..');
const rows = readRows(root, process.env);
const stateOf = (config, overlay = {}) => computeState({ root, rows, config, graph: createGraph({ root, overlay }) });
const text = (file) => readFileSync(resolve(root, file), 'utf8');

const base = { now: stateOf(undefined), then: stateOf(KEYS_273) };
const ALL = base.now.ids.length, MAPS = base.now.world.ids.length;
const TANK_STEPS = STEPS.map((step) => step.name), GPU = STEPS.filter((step) => step.device === 'gpu').map((step) => step.name);
const CPU = TANK_STEPS.filter((name) => !GPU.includes(name)), WORLD = WORLD_STEPS.map((step) => step.name);

/** step -> how many ids (maps) an edit makes due: those whose in-key moved from the unedited tree's, same formula. */
function dueAfter(overlay, formula = 'now') {
  const before = base[formula], after = stateOf(formula === 'now' ? undefined : KEYS_273, overlay);
  const out = { state: after };
  for (const name of TANK_STEPS) out[name] = before.ids.filter((id) => before.inKey(name, id) !== after.inKey(name, id)).length;
  for (const name of WORLD) out[name] = before.world.ids.filter((map) => before.world.inKey(name, map) !== after.world.inKey(name, map)).length;
  return out;
}
const counts = (due, names) => Object.fromEntries(names.map((name) => [name, due[name]]));
const every = (names, n) => Object.fromEntries(names.map((name) => [name, n]));

// ---- 273.1: every file brand-top-274 modified that is still here, edited as it was (a route, catalog keys, the rest a
// comment or a byte), all at once
const BRAND_TOP = ['404.html', 'README.md', 'docs/ATTRIBUTION.md', 'docs/SCREENSHOT_CONTRACT.md', 'public/brand/manifest.json',
  'public/brand/social-avatar-400.png', 'public/brand/social-avatar.svg', 'public/sitemap.xml', 'public/textures/garage/garage-display-atlas.webp',
  'public/textures/garage/garage-display-emissive.webp', 'site/home.html', 'src/presentation/publicShell.ts', 'src/ui/brandMark.ts',
  'src/ui/brandMarkRoll.ts', 'src/ui/components/DIRECTION.md', 'src/ui/garageDisplayAtlas.generated.ts', 'src/ui/i18nCatalog.en-US.json',
  'src/ui/i18nCatalog.zh-CN.json', 'src/ui/localeRouting.ts', 'tools/brand-marks.mjs', 'tools/generate-garage-display-atlas.mjs',
  'tools/i18n-page-catalogs.selftest.mjs', 'tools/media-production/campaignArtwork.mjs', 'tools/media-r5/films/restore.mjs',
  'tools/media-r5/kit-assemble.mjs', 'tools/media-r5/kit-page.mjs', 'tools/media-r5/motion/build.mjs', 'tools/media-r5/motion/posters-build.mjs',
  'tools/public-shell.mjs', 'vercel.json', 'vite.config.ts'];
const edit = (file) => {
  if (file === 'src/ui/localeRouting.ts') {
    const now = text(file);
    assert.match(now, /  route\('notFound', /, 'localeRouting.ts: the route table, where 273.1 added /brand');
    return now.replace("  route('notFound', ", "  route('brand274' as PublicRouteId, '/brand274', 'brand274.html'),\n  route('notFound', ");
  }
  if (/i18nCatalog\.[\w-]+\.json$/.test(file)) return JSON.stringify({ ...JSON.parse(text(file)), 'brand274.replay.title': 'The set' }, null, 2);
  if (file.endsWith('.json')) return `${text(file)}\n`;
  if (/\.(?:png|webp)$/.test(file)) return `${text(file)}\0`;
  if (/\.(?:html|svg|xml)$/.test(file)) return `${text(file)}<!-- 273.1 replay -->\n`;
  if (file.endsWith('.md')) return `${text(file)}\n273.1 replay.\n`;
  return `${text(file)}\n// 273.1 replay\n`;
};
const brandTop = Object.fromEntries(BRAND_TOP.map((file) => [file, edit(file)]));
const brand = dueAfter(brandTop);
assert.deepEqual(counts(brand, [...TANK_STEPS, ...WORLD]), every([...TANK_STEPS, ...WORLD], 0), '273.1 replayed marks no step');
const brandThen = dueAfter(brandTop, 'then');
assert.deepEqual(counts(brandThen, [...TANK_STEPS, ...WORLD]), { ...every(TANK_STEPS, 0), ...every(WORLD, MAPS), icons: ALL },
  'control: under 273\'s keys it marks every map (docs/ATTRIBUTION.md, which src/authorship.ts only names) and icons on every id '
  + '(tools/media-r5/motion, which media-r5/paths.mjs only names); centering\'s route table is out of its page since 274');
for (const name of ['centering', 'icons']) {
  const files = base.now.steps[name].toolFiles;
  assert.ok(!files.includes('src/ui/localeRouting.ts') && files.includes('src/ui/localePrefix.ts') && files.includes('src/ui/i18n.ts'),
    `${name}: its page loads the locale prefix, never the route table (273.1 marked it on every id through the table)`);
}

// ---- 274.0: the armour-paint GLSL and its doc comment, as armour-live-pen-274 edited them
const MATERIALS = 'src/vehicles/materials.ts';
const materials = text(MATERIALS);
const shaderAt = materials.indexOf('const ARMOR_PAINT_DIFFUSE_GLSL = `');
const docAt = materials.lastIndexOf(' */', shaderAt);
assert.ok(shaderAt > 0 && docAt > 0 && !materials.slice(docAt, shaderAt).includes(';'), `${MATERIALS}: the armour-paint diffuse GLSL and its doc comment`);
const armour = `${materials.slice(0, docAt)} *   (274) and the reticle's verdict colour at its centre.\n${materials.slice(docAt, shaderAt + 34)}`
  + `\nvec4 apRowT = vec4( -1.0 );${materials.slice(shaderAt + 34)}`;
const pen = dueAfter({ [MATERIALS]: armour });
assert.deepEqual(counts(pen, [...CPU, ...WORLD]), every([...CPU, ...WORLD], 0), '274.0 replayed marks no CPU or world step');
assert.deepEqual(counts(pen, GPU), every(GPU, ALL), 'and every id on the GPU steps, whose page compiles the shader');
const penThen = dueAfter({ [MATERIALS]: armour }, 'then');
assert.deepEqual(counts(penThen, [...TANK_STEPS, ...WORLD]), { ...every(TANK_STEPS, ALL), ...every(WORLD, MAPS) },
  'control: under 273\'s keys it marks every step on every id and every map');

// ---- controls: a file a step reads moves, and the step is due
const constant = materials.replace('export const ARMOR_PAINT_SET_SLOTS = 64;', 'export const ARMOR_PAINT_SET_SLOTS = 65;');
assert.notEqual(constant, materials, `${MATERIALS}: ARMOR_PAINT_SET_SLOTS`);
assert.deepEqual(counts(dueAfter({ [MATERIALS]: constant }), [...TANK_STEPS, ...WORLD]), { ...every(TANK_STEPS, ALL), ...every(WORLD, MAPS) },
  'a materials.ts constant outside the shader text (the shader and the game read it) marks every step');
const leak = dueAfter({ [MATERIALS]: `${materials}\nexport const ARMOR_PAINT_TEXT_LENGTH = ARMOR_PAINT_DIFFUSE_GLSL.length;\n` });
assert.deepEqual(leak.state.partition.shaderText.masked, [], 'shader text named outside a compile hook: the file is keyed whole');
assert.match(leak.state.partition.shaderText.problems.join('\n'), /ARMOR_PAINT_DIFFUSE_GLSL is named outside a compile hook/);
assert.deepEqual(counts(leak, [...TANK_STEPS, ...WORLD]), { ...every(TANK_STEPS, ALL), ...every(WORLD, MAPS) }, 'and marks every step');
const prefix = dueAfter({ 'src/ui/localePrefix.ts': `${text('src/ui/localePrefix.ts')}\n// moved\n` });
assert.deepEqual(counts(prefix, [...TANK_STEPS, ...WORLD]), { ...every(TANK_STEPS, 0), ...every(WORLD, 0), centering: ALL, icons: ALL },
  'localePrefix.ts (the icons page\'s i18n reads it) marks centering and icons');
const plan = dueAfter({ 'tools/wreck-bake-plan.mjs': `${text('tools/wreck-bake-plan.mjs')}\n// moved\n` });
assert.deepEqual(counts(plan, [...TANK_STEPS, 'wreckPlan']), { ...every(TANK_STEPS, 0), wreckPlan: MAPS }, 'the wreck plan tool marks its maps');
assert.deepEqual(base.now.partition.shaderText, { masked: [MATERIALS], problems: [] }, 'the declared shader text holds on this tree');

// ---- the re-key: a table current under 273's keys carries over to these; a stale row stays due
const table = emptyManifest();
for (const view of [base.then, base.then.world]) for (const name of Object.keys(view.steps)) {
  recordStep(table, name, null, Object.fromEntries(view.ids.map((id) => [id, view.inKey(name, id)])), view);
}
refreshComponents(table, base.then);
const [staleId] = base.now.ids;
table.keys.controls[staleId].in = 'stale';
const [staleMap] = base.now.world.ids;
table.keys.collision[staleMap].in = 'stale';
const report = rekeyManifest(table, base.then, base.now);
assert.deepEqual([report.controls, report.collision, report.fills], [{ carried: ALL - 1, left: 1 }, { carried: MAPS - 1, left: 1 }, { carried: ALL, left: 0 }]);
const left = { ...resolveChanged(base.now, table), ...resolveChanged(base.now.world, table) };
assert.deepEqual(Object.fromEntries(Object.entries(left).map(([name, entry]) => [name, entry.ids])),
  { ...Object.fromEntries([...TANK_STEPS, ...WORLD].map((name) => [name, []])), controls: [staleId], collision: [staleMap] },
  'after the re-key only the stale rows are due');
assert.equal(table.core, base.now.core, 'the shared lines move to these keys');
const worldTool = (name) => table.comps[`world:tool:${name}`];
assert.equal(worldTool('wreckPlan'), base.now.world.comps['world:tool:wreckPlan'], 'a step that carried every map takes its own lines');
assert.equal(worldTool('collision'), base.then.world.comps['world:tool:collision'], 'a step left with a due map keeps them (its reasons stay true)');
assert.notEqual(base.then.world.comps['world:tool:collision'], base.now.world.comps['world:tool:collision'], '(control: the line differs)');

// ---- the chain's selection: the gate (opt-in) runs only by name; a chain without it is full
const pick = (options) => { const { selected, partial } = chainSelection(STEPS, WORLD_STEPS, options); return [[...TANK_STEPS, ...WORLD].filter(selected), partial]; };
const owed = [...TANK_STEPS, ...WORLD].filter((name) => name !== 'gate');
assert.deepEqual(pick({}), [owed, false], 'the plain chain runs every step but the gate, and is full');
assert.deepEqual(pick({ only: owed }), [owed, false], '--steps naming every step but the gate is full (272 and 273 stamped by hand)');
assert.deepEqual(pick({ only: ['gate'] })[0], ['gate'], 'the gate runs by name');
assert.equal(pick({ only: ['gate'] })[1], true, 'alone it is partial');
assert.equal(pick({ noGpu: true })[1], true, '--no-gpu is partial');
assert.equal(pick({ noWorld: true })[1], true, '--no-world is partial');
assert.equal(pick({ only: owed.filter((name) => name !== 'icons') })[1], true, 'leaving out an owed step is partial');

console.log(`changed-only regen-keys.selftest: PASS (273.1 and 274.0 replayed: ${GPU.join(', ')} due on 274.0 only; `
  + `273's keys marked ${MAPS}x${WORLD.length} maps and ${ALL}x${TANK_STEPS.length} ids)`);
