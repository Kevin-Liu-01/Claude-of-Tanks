// The changed-only partition of the real fleet (no tank builds): every step decomposes per id, every dynamic read is
// declared and pinned to its current call sites, the demand loaders and the eager tool factory register the same group
// modules, a shared builder kit marks every id that uses it, the chain runs seats after fills and controls, and the
// balance pass is out of the core (keyed per id through the spec rows). First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { accessorPin, createGraph, dynamicSites, h16 } from './graph.mjs';
import { balanceTokens, computeState, emptyManifest, parseGroupLoaders, recordStep, refreshComponents, resolveChanged } from './fingerprint.mjs';
import { BALANCE, CPU_FIXPOINT_STEPS, DECLARED_DYNAMIC, FLEET_API_TOKENS, FLEET_API_USERS, GROUP_LOADERS_FILE, LOADER_FILES, PER_ID_ACCESSORS,
  SCHEDULING_ENV, SPEC_COMBAT, SPEC_REST, STEPS, TABLES, WORLD_STEPS, CATALOG_FILES, gpuChunks } from './steps.mjs';
import { browserIdCap } from '../browser-id-chunks.mjs';
import { declaredNotInput, tableFileList } from './globs.mjs';
import { tokenPin } from './world.mjs';

const root = resolve(import.meta.dirname, '../..');

// Every declaration still describes its file: a changed call site must be reviewed and re-pinned here.
for (const [file, declaration] of Object.entries(DECLARED_DYNAMIC)) {
  const sites = dynamicSites(readFileSync(join(root, file), 'utf8'), file);
  const pin = h16(sites.join('\n'));
  assert.equal(pin, declaration.pin, `${file}: dynamic call sites changed; review them and set pin: '${pin}' in steps.mjs\n  ${sites.join('\n  ')}`);
}

for (const [file, accessor] of Object.entries(PER_ID_ACCESSORS)) {
  const pin = accessorPin(readFileSync(join(root, file), 'utf8'), accessor.exportName);
  assert.equal(pin, accessor.pin, `${file}: its ${accessor.exportName} reads changed; review that they stay per id and set pin: '${pin}'`);
}

// Every world file that reaches the fleet is a reviewed user of the per-id API.
for (const [file, declaration] of Object.entries(FLEET_API_USERS)) {
  const pin = tokenPin(readFileSync(join(root, file), 'utf8'), FLEET_API_TOKENS);
  assert.equal(pin, declaration.pin, `${file}: its fleet uses changed; review that it builds only the map's donors and set pin: '${pin}'`);
}

// The balance pass's importers apply it to the registry and use it no other way (steps.mjs BALANCE).
for (const [file, declaration] of Object.entries(BALANCE.importers)) {
  const pin = tokenPin(readFileSync(join(root, file), 'utf8'), balanceTokens(root, BALANCE));
  assert.equal(pin, declaration.pin, `${file}: its uses of the balance pass changed; review that they only apply it to the registered specs and set pin: '${pin}'`);
}

const state = computeState({ root, steps: STEPS });
// The pass is out of the core and keyed through the spec rows: every step keys SPEC_REST, the combat readers SPEC_COMBAT.
assert.deepEqual([state.partition.balanceReason, BALANCE.entries.every((file) => state.partition.balance.includes(file) && !state.partition.core.includes(file))],
  [null, true], 'the balance pass is out of the core');
for (const [name, entry] of Object.entries(state.steps)) {
  assert.ok(entry.rowTables.includes(SPEC_REST), `${name} keys each id's spec`);
  assert.equal(entry.rowTables.includes(SPEC_COMBAT), Boolean(entry.step.rowReads?.includes(SPEC_COMBAT)), `${name}: the combat row only through rowReads`);
}
// Test-only tooling never keys a generator (266, Main's probe of 705417532f): the runner, the selftest tiers, scans and
// suites, the test:* commands and the tank release plan are read by no generator, so an edit to them marks no id. The
// control: each step's own generator is in its key.
const TEST_ONLY = /^tools\/(?:run-selftests|selftest-[\w-]+|test-[\w-]+|tank-release-(?:plan|check))\.mjs$|\.selftest\.mjs$/;
for (const [name, entry] of [...Object.entries(state.steps), ...Object.entries(state.world?.steps ?? {})]) {
  assert.deepEqual(entry.toolFiles.filter((file) => TEST_ONLY.test(file)), [], `${name}: test-only tooling keys this step`);
  assert.ok(entry.toolFiles.includes(entry.step.tool), `${name}: its generator ${entry.step.tool} keys it (control)`);
}
for (const [label, files] of [['the fleet core', state.partition.core], ...Object.entries(state.partition.groups)]) {
  assert.deepEqual(files.filter((file) => TEST_ONLY.test(file)), [], `${label}: test-only tooling in a build's key`);
}
assert.ok(TEST_ONLY.test('tools/test-lane.mjs') && TEST_ONLY.test('tools/run-selftests.mjs') && !TEST_ONLY.test('tools/gen-combat-anatomy.mjs'),
  'the test-only pattern names the harness and no generator');
// No step key holds a public page (266): the route table only names them (steps.mjs namesOnly), and a document-head
// edit re-ran the world steps on every map and centering and icons on every id. A step that really reads a page joins
// PAGE_READERS with the reason.
const PAGE_READERS = Object.freeze({});
for (const [name, entry] of [...Object.entries(state.steps), ...Object.entries(state.world?.steps ?? {})]) {
  const pages = entry.toolFiles.filter((file) => /^[^/]+\.html$/.test(file) && !PAGE_READERS[name]?.includes(file));
  assert.deepEqual(pages, [], `${name}: public pages key this step; if it reads them, list them in PAGE_READERS`);
}
// The accessors take effect: seats key the roof-gun inventory per id, not the whole table.
assert.deepEqual(state.steps.seats.foreignTables, [], 'seats reach no table whole');
assert.ok(state.steps.seats.rowTables.includes('auxiliaryInventory'), 'seats key the inventory per id');
assert.ok(state.steps.gunLines.rowTables.includes('geometryLedger'), 'gun lines key each id\'s fleet-ledger row (rowReads)');
assert.deepEqual(state.steps.gunLines.foreignTables, [], 'gun lines reach no table whole (the fleet ledger is covered, keyed per id)');
// (268) the toolchain is Node, the platform and the lock: a receipt (under the runner's preloads) computes the command line's
assert.deepEqual(state.toolchainParts.map((part) => part.slice(0, part.indexOf(':'))), ['schema', 'node', 'platform', 'package-lock'],
  'the toolchain keys the schema, Node, the platform and the lock alone');
assert.deepEqual(state.globalReasons, [], 'the fleet decomposes');
for (const step of STEPS) assert.ok(state.steps[step.name].decomposed, `${step.name}: ${state.steps[step.name].reasons.join('; ')}`);
assert.ok(state.ids.length >= 200, 'the roster is read');

// Registry agreement: each id's group has a demand loader, and every loader module is one the eager tool factory
// registers too (tankFactory.ts directly or through profiledProcedurals.ts), so a group closure is what builds its ids.
const loaders = parseGroupLoaders(readFileSync(join(root, GROUP_LOADERS_FILE), 'utf8'));
for (const [id, group] of Object.entries(state.groupById)) assert.ok(loaders[group], `${id}: group ${group} has no loader`);
const graph = createGraph({ root });
const registered = new Set(LOADER_FILES.flatMap((file) => [...graph.edges(join(root, file)).exec]));
for (const [group, modules] of Object.entries(loaders)) {
  for (const module of modules) {
    const file = resolve(root, 'src/vehicles', module);
    assert.ok(registered.has(file), `${group}: ${module} is not registered by the eager factory`);
  }
}

// A shared builder kit marks every id built on it: the Ukrainian donor turret kit reaches the whole national
// modernization group, t72b3m_hetman_ii included.
const kit = 'src/vehicles/profiles/ukraineDonorTurretKit.ts';
const owners = Object.entries(state.partition.groups).filter(([, files]) => files.includes(kit)).map(([group]) => group);
assert.ok(owners.includes('nationalModernization'), `${kit} is in the nationalModernization closure (${owners})`);
const manifest = emptyManifest();
for (const name of ['fills']) recordStep(manifest, name, null, Object.fromEntries(state.ids.map((id) => [id, state.inKey(name, id)])), state);
refreshComponents(manifest, state);
assert.equal(resolveChanged(state, manifest, { steps: ['fills'] }).fills.mode, 'none');
for (const group of owners) state.groups[group] = `${state.groups[group]}-edited`;
const marked = resolveChanged(state, manifest, { steps: ['fills'] }).fills;
const expected = state.ids.filter((id) => state.groupChain(id).some((group) => owners.includes(group)));
assert.deepEqual(marked.ids, expected, 'exactly the ids whose builder chain reaches the kit');
const national = state.ids.filter((id) => state.groupById[id] === 'nationalModernization');
assert.ok(national.length >= 13 && national.includes('t72b3m_hetman_ii'), `national modernization ids: ${national}`);
for (const id of national) assert.ok(marked.ids.includes(id), `${id} is marked by the kit`);
assert.ok(marked.ids.length < state.ids.length, 'a group kit does not mark the whole fleet');

// The world decomposes per map: every map has a config, every world step is keyed per map, and a donor's builder marks
// only the maps whose wreck plan bakes it (coastal bakes t90am).
assert.ok(state.world, 'the world rows read');
assert.deepEqual(state.world.globalReasons, [], 'the world decomposes');
for (const step of WORLD_STEPS) assert.ok(state.world.steps[step.name].decomposed, `${step.name}: ${state.world.steps[step.name].reasons.join('; ')}`);
assert.ok(state.world.ids.length >= 30, 'the map roster is read');
assert.ok(state.world.donorsOf('collision', 'coastal').includes('t90am'), 'coastal bakes t90am');
const worldManifest = emptyManifest();
for (const step of WORLD_STEPS) {
  recordStep(worldManifest, step.name, null, Object.fromEntries(state.world.ids.map((map) => [map, state.world.inKey(step.name, map)])), state.world);
}
refreshComponents(worldManifest, state);
assert.equal(resolveChanged(state.world, worldManifest, { steps: ['collision'] }).collision.mode, 'none');
const t90Group = state.groupById.t90am;
state.groups[t90Group] = `${state.groups[t90Group]}-edited`;
const bakers = state.world.ids.filter((map) => state.world.donorsOf('collision', map).some((id) => state.groupChain(id).includes(t90Group)));
const remarked = resolveChanged(state.world, worldManifest, { steps: ['collision'] }).collision;
assert.deepEqual(remarked.ids, bakers, `a ${t90Group} builder edit marks exactly the maps that bake one of its ids`);
assert.ok(remarked.ids.includes('coastal') && remarked.ids.length < state.world.ids.length, `maps marked: ${remarked.ids}`);

// Chain order: seats read the fills and the roof guns, spare-track reads the dock seats.
const at = (name) => CPU_FIXPOINT_STEPS.indexOf(name);
assert.ok(at('controls') >= 0 && at('fills') > at('controls') && at('seats') > at('fills') && at('spareTrack') > at('seats'),
  `CPU order ${CPU_FIXPOINT_STEPS}`);
assert.ok(at('anatomy') > at('controls'), 'anatomy reads the roof guns');
const chain = readFileSync(join(root, 'tools/tank-regen-changed.mjs'), 'utf8');
assert.match(chain, /for \(const name of CPU_FIXPOINT_STEPS\.filter\(selected\)\)/, 'the chain runs the CPU steps in table order');

// A GPU step's browser holds a chunk within its time and its renderer caps (266: icons' time cap alone, 440 ids, put the
// whole 255-id fleet in one browser and the 6 GB renderer guard killed it). Every chunk of this fleet and of 255 ids keeps
// both, the chunks cover the list once in order, and the chain plans and runs GPU steps through gpuChunks, whose ids per
// browser are the tool's own (tools/browser-id-chunks.mjs). Control: the time cap alone puts the 255 ids in one browser.
assert.match(chain, /const chunks = gpuChunks\(step, list\);/, 'the chain runs GPU steps in gpuChunks holds');
for (const step of STEPS.filter((entry) => entry.device === 'gpu')) {
  const maxIds = browserIdCap(step.tool);
  assert.ok(maxIds > 0, `${step.name}: a GPU step's tool caps its ids per browser (BROWSER_ID_CAPS)`);
  for (const list of [state.ids, Array.from({ length: 255 }, (_, index) => `id${index}`)]) {
    const chunks = gpuChunks(step, list);
    assert.deepEqual(chunks.flat(), list, `${step.name}: the chunks cover the ${list.length} ids once, in order`);
    assert.ok(chunks.every((chunk) => chunk.length <= maxIds && chunk.length * step.perIdS <= step.chunkS),
      `${step.name}: chunks ${chunks.map((chunk) => chunk.length)} within ${maxIds} ids and ${step.chunkS} s`);
  }
}
const icons = STEPS.find((entry) => entry.name === 'icons');
const fleet255 = Array.from({ length: 255 }, (_, index) => `id${index}`);
assert.ok(Math.floor(icons.chunkS / icons.perIdS) >= 255 && gpuChunks(icons, fleet255).length > 1,
  'control: the time cap alone would hold 255 icons ids in one browser; the tool\'s cap splits them');
assert.throws(() => gpuChunks({ ...icons, tool: 'tools/uncapped.mjs' }, fleet255), /no BROWSER_ID_CAPS row/,
  'control: a GPU tool without a cap row is refused, never run uncapped');
// 266: the chunk helper's environment only schedules (where a fresh browser starts): every name it reads is a SCHEDULING_ENV
// row, so a smoke run under COT_BROWSER_ID_CAP keeps the GPU steps' keys (without the row, cap 7 moved icons and centering).
const chunkEnv = graph.edges(join(root, 'tools/browser-id-chunks.mjs')).flags.environment;
assert.ok(chunkEnv.includes('COT_BROWSER_ID_CAP') && chunkEnv.every((name) => Object.hasOwn(SCHEDULING_ENV, name)),
  `tools/browser-id-chunks.mjs reads ${chunkEnv.join(', ')}: each only schedules, so each is a SCHEDULING_ENV row`);
// 266: so does its cap table (steps.mjs scheduleOnly): the GPU steps key the helper and the launcher it loads, never the
// table, so a re-measured cap re-runs no step. Control: the helper executes the table, and without the declaration the
// edge would stay in the key.
const capsTable = 'tools/browser-id-caps.mjs';
for (const name of ['icons', 'centering']) {
  const files = state.steps[name].toolFiles;
  assert.ok(files.includes('tools/browser-id-chunks.mjs') && files.includes('tools/browser-launch.mjs') && !files.includes(capsTable),
    `${name}: keys tools/browser-id-chunks.mjs and tools/browser-launch.mjs, never ${capsTable}`);
  // (266) nor the capture lock the launcher imports: it only schedules (browser-launch.mjs scheduleOnly)
  assert.ok(!files.includes('tools/capture-lock.mjs'), `${name}: never keys tools/capture-lock.mjs`);
}
// 266: the browser guard's limits only decide when a browser is killed: every name the launcher reads is a SCHEDULING_ENV
// row (keyed with their values, a raised tree cap moved icons and centering).
const launchEnv = graph.edges(join(root, 'tools/browser-launch.mjs')).flags.environment;
assert.ok(launchEnv.includes('COT_BROWSER_TREE_CAP_MB') && launchEnv.every((name) => Object.hasOwn(SCHEDULING_ENV, name)),
  `tools/browser-launch.mjs reads ${launchEnv.join(', ')}: each only schedules, so each is a SCHEDULING_ENV row`);
// 266: the GPU steps key the public directories their page is served (tools/icons-page-public.mjs, whose list is keyed),
// never all of public/: the vehicle count in public/llms.txt moved both on every id.
for (const name of ['icons', 'centering']) {
  const step = STEPS.find((entry) => entry.name === name);
  assert.ok(state.steps[name].toolFiles.includes('tools/icons-page-public.mjs'), `${name}: keys the served public list`);
  assert.ok(!state.steps[name].toolFiles.includes('public'), `${name}: never keys public/ whole (a name such as the guard's /public/ prefix)`);
  assert.ok(step.reads.length && step.reads.every((glob) => /^public\/[^/*]+\/\*\*$/.test(glob)) && !step.reads.includes('public/**'),
    `${name}: reads named public directories (${step.reads.join(', ')}), never public/**`);
}
// 267: the gate step keys each id's oracle from its own record (geometryGate.oracle), the public files its page loads
// beside them, and never public/ or docs/geometry-gate whole (its declaration covers both: the oracles per id, its own
// outputs); the records table holds only <id>.json, not the other steps' ledgers in that directory.
{
  const gate = state.steps.gate;
  assert.ok(gate.decomposed && gate.rowTables.includes('geometryGate.oracle') && !gate.rowTables.includes('specCombat'),
    `gate: keys its records' oracles and the spec rest only (${gate.rowTables.join(', ')}; ${gate.reasons.join('; ')})`);
  assert.ok(!gate.toolFiles.includes('public') && !gate.toolFiles.includes('docs/geometry-gate'),
    'gate: neither public/ nor docs/geometry-gate is keyed whole');
  assert.ok(['tools/gate-page-public.mjs', 'tools/served-public.mjs', 'tools/procedural-fidelity.html'].every((file) => gate.toolFiles.includes(file)),
    'gate: keys its page, its served-public list and the guard');
  assert.ok(gate.step.reads.every((glob) => glob !== 'public/**' && !glob.startsWith('public/models')), `gate: reads ${gate.step.reads.join(', ')}`);
  const recordFiles = tableFileList(root, TABLES.geometryGate, state.ids);
  assert.ok(recordFiles.length && recordFiles.every((file) => state.ids.includes(file.slice('docs/geometry-gate/'.length, -'.json'.length))),
    'gate: its records table holds only <id>.json');
  assert.ok(Object.keys(state.fileIds).includes(recordFiles[0]), 'control: the record files are read as table rows');
  for (const other of ['ledger.json', 'spare-track.json', 'gun-junction.json', 'moving-clearance-air.json', 'sim-floors.json']) {
    assert.ok(!recordFiles.includes(`docs/geometry-gate/${other}`), `gate: docs/geometry-gate/${other} is not a record`);
  }
}
// 267: the sim-floor ledger keys anatomy per id (TABLES simFloors, canonical) and through its frame, never by its bytes:
// the 266 Brazil merge reordered its rows and re-ran anatomy on every id for identical content.
{
  const anatomy = state.steps.anatomy;
  assert.ok(anatomy.rowTables.includes('simFloors') && !anatomy.toolFiles.includes('docs/geometry-gate/sim-floors.json')
    && !anatomy.foreignTables.includes('docs/geometry-gate/sim-floors.json'), 'anatomy: reads the sim floors per id, not the file whole');
  assert.equal(Object.keys(state.rows.simFloors ?? {}).length, state.ids.length, 'every id has a sim-floor row');
  for (const [name, entry] of Object.entries(state.steps)) {
    if (name !== 'anatomy') assert.ok(!entry.toolFiles.includes('docs/geometry-gate/sim-floors.json'), `${name}: never keys the sim floors`);
  }
}
// 267: no world bake reaches the i18n catalogs (the localized map name is UI code), and the GPU steps that do reach them
// key only the strings their page draws (catalogKeys); a HUD string edit re-ran both and every map.
for (const [name, entry] of Object.entries(state.world?.steps ?? {})) {
  assert.ok(!entry.toolFiles.some((file) => file === 'src/ui/i18n.ts' || CATALOG_FILES.includes(file)), `world ${name}: reaches no string catalog`);
}
for (const [name, entry] of Object.entries(state.steps)) {
  if (entry.toolFiles.some((file) => CATALOG_FILES.includes(file))) {
    assert.ok(entry.step.catalogKeys?.length, `${name}: reaches the string catalogs, so declares the keys its tool draws (catalogKeys)`);
  }
}
assert.ok(['centering', 'icons'].every((name) => state.steps[name].toolFiles.includes(CATALOG_FILES[0])), 'control: the icons page reaches them');
assert.ok(graph.edges(join(root, 'tools/browser-id-chunks.mjs')).exec.has(join(root, capsTable)), 'control: the helper executes the cap table');
assert.ok(declaredNotInput(DECLARED_DYNAMIC['tools/browser-id-chunks.mjs'], capsTable) && !declaredNotInput({}, capsTable),
  'control: only the scheduleOnly declaration takes the table out of the key');

console.log(`changed-only fleet-partition.selftest: PASS (${state.ids.length} ids, ${Object.keys(state.groups).length} groups, core ${state.partition.core.length} files; kit marks ${marked.ids.length}; ${state.world.ids.length} maps, a ${t90Group} edit marks ${remarked.ids.length})`);
