// The changed-only partition of the real fleet (no tank builds): every step decomposes per id, every dynamic read is
// declared and pinned to its current call sites, the demand loaders and the eager tool factory register the same group
// modules, a shared builder kit marks every id that uses it, and the chain runs seats after fills and controls.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createGraph, dynamicSites, h16 } from './graph.mjs';
import { computeState, emptyManifest, parseGroupLoaders, recordStep, refreshComponents, resolveChanged } from './fingerprint.mjs';
import { CPU_FIXPOINT_STEPS, DECLARED_DYNAMIC, GROUP_LOADERS_FILE, LOADER_FILES, STEPS } from './steps.mjs';

const root = resolve(import.meta.dirname, '../..');

// Every declaration still describes its file: a changed call site must be reviewed and re-pinned here.
for (const [file, declaration] of Object.entries(DECLARED_DYNAMIC)) {
  const sites = dynamicSites(readFileSync(join(root, file), 'utf8'), file);
  const pin = h16(sites.join('\n'));
  assert.equal(pin, declaration.pin, `${file}: dynamic call sites changed; review them and set pin: '${pin}' in steps.mjs\n  ${sites.join('\n  ')}`);
}

const state = computeState({ root, steps: STEPS });
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

// Chain order: seats read the fills and the roof guns, spare-track reads the dock seats.
const at = (name) => CPU_FIXPOINT_STEPS.indexOf(name);
assert.ok(at('controls') >= 0 && at('fills') > at('controls') && at('seats') > at('fills') && at('spareTrack') > at('seats'),
  `CPU order ${CPU_FIXPOINT_STEPS}`);
assert.ok(at('anatomy') > at('controls'), 'anatomy reads the roof guns');
const chain = readFileSync(join(root, 'tools/tank-regen-changed.mjs'), 'utf8');
assert.match(chain, /for \(const name of CPU_FIXPOINT_STEPS\.filter\(selected\)\)/, 'the chain runs the CPU steps in table order');

console.log(`changed-only fleet-partition.selftest: PASS (${state.ids.length} ids, ${Object.keys(state.groups).length} groups, core ${state.partition.core.length} files; kit marks ${marked.ids.length})`);
