// The changed-only partition of the real fleet (no tank builds): every step decomposes per id, every dynamic read is
// declared and pinned to its current call sites, the demand loaders and the eager tool factory register the same group
// modules, a shared builder kit marks every id that uses it, and the chain runs seats after fills and controls.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { accessorPin, createGraph, dynamicSites, h16 } from './graph.mjs';
import { computeState, emptyManifest, normalizedNodeOptions, parseGroupLoaders, recordStep, refreshComponents, resolveChanged } from './fingerprint.mjs';
import { CPU_FIXPOINT_STEPS, DECLARED_DYNAMIC, FLEET_API_TOKENS, FLEET_API_USERS, GROUP_LOADERS_FILE, LOADER_FILES, PER_ID_ACCESSORS,
  STEPS, WORLD_STEPS } from './steps.mjs';
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

const state = computeState({ root, steps: STEPS });
// The accessors take effect: seats key the roof-gun inventory per id, not the whole table.
assert.deepEqual(state.steps.seats.foreignTables, [], 'seats reach no table whole');
assert.ok(state.steps.seats.rowTables.includes('auxiliaryInventory'), 'seats key the inventory per id');
assert.ok(state.steps.gunLines.rowTables.includes('geometryLedger'), 'gun lines key each id\'s fleet-ledger row (rowReads)');
assert.deepEqual(state.steps.gunLines.foreignTables, [], 'gun lines reach no table whole (the fleet ledger is covered, keyed per id)');
assert.equal(normalizedNodeOptions('--max-old-space-size=4096 --import=file:///w/tools/assert-graph-guard.mjs --x'), '--x',
  'the heap cap and the runner\'s assert guard never key the toolchain');
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

console.log(`changed-only fleet-partition.selftest: PASS (${state.ids.length} ids, ${Object.keys(state.groups).length} groups, core ${state.partition.core.length} files; kit marks ${marked.ids.length}; ${state.world.ids.length} maps, a ${t90Group} edit marks ${remarked.ids.length})`);
