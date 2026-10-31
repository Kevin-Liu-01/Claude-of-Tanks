// Generator freshness at resolver cost (test-speed R8d): every fleet generator's committed outputs are current for the
// committed fingerprint manifest (release/fingerprints.tsv), so a lane that edits a builder, a kit, a spec, a generator
// or its flags without running `npm run tank:regen:changed` turns this red, naming the ids and why. No tank is built
// (one fingerprint state: about 55-75 s warm, more cold or loaded). A toolchain difference (Node, lockfiles) is reported, not failed: the nightly
// `tank:regen:changed -- --check --all` re-runs every generator's own --check and covers it, and any resolver miss.
// A missing or unreadable manifest fails (Main 2026-10-29, 265: a guard that passes vacuously is no guard); the
// negative controls below prove, on the same state, that a generator edited after the bootstrap, an input row moved
// for one id and an output row edited by hand are each caught.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { MANIFEST_PATH, SCHEMA, computeState, readManifest, resolveChanged } from './fingerprint.mjs';
import { STEPS } from './steps.mjs';

// A tree may be named (a parity tree); the receipt itself checks its own repository.
const root = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../..'));
const manifest = readManifest(root);
assert.ok(manifest, `${MANIFEST_PATH} is missing or unreadable (schema ${SCHEMA}): without it every generator passes unchecked. `
  + 'Restore it from origin/main, or re-run npm run tank:regen:changed and commit the manifest with its outputs (docs/DEVELOPMENT.md "Changed-only regeneration")');
// One state when the toolchain matches the manifest's (the usual case); a second, judged on the manifest's
// toolchain, only when it differs (229: computeState is 55-75 s warm).
const actual = computeState({ root, steps: STEPS });
const state = actual.toolchain === manifest.toolchain ? actual
  : computeState({ root, steps: STEPS, toolchainOverride: manifest.toolchain });
if (actual.toolchain !== manifest.toolchain) {
  console.log(`changed-only fresh.selftest: note: this toolchain differs from the manifest's (${actual.toolchainParts.join(', ')}); judged on the manifest's`);
}
assert.deepEqual(state.errors, [], 'every per-id table reads');
const result = resolveChanged(state, manifest);
const stale = Object.entries(result).filter(([, entry]) => entry.mode !== 'none');
const lines = stale.map(([name, entry]) => {
  const why = entry.reasons['*'] ?? [...new Set(entry.ids.flatMap((id) => entry.reasons[id] ?? []))];
  return `${name}: ${entry.mode} ${entry.ids.length} (${entry.ids.slice(0, 10).join(',')}${entry.ids.length > 10 ? ',...' : ''}) — ${why.slice(0, 4).join('; ')}`;
});
assert.equal(stale.length, 0, `generated fleet outputs are stale for their inputs; run npm run tank:regen:changed\n  ${lines.join('\n  ')}`);

// Negative controls on the fresh state (no second state, no tree edit): each stands in for a lane that landed a change
// without its regeneration, and the resolver that judged the tree fresh above must name it.
const step = STEPS[0].name, id = state.ids[0], other = state.ids[1];
const view = (patch) => ({ ...state, ...patch });
const moved = (name, key) => (stepName, tankId) => (stepName === name && (key === null || tankId === key)
  ? `${state.inKey(stepName, tankId)}~moved` : state.inKey(stepName, tankId));
// (1) the generator (or its flags) edited after the bootstrap: its tool key, so every id's input key, moves.
const generator = resolveChanged(view({ steps: { ...state.steps, [step]: { ...state.steps[step], tool: `${state.steps[step].tool}~edited` } },
  inKey: moved(step, null) }), manifest)[step];
assert.equal(generator.mode, 'all', `${step}: an edited generator re-runs on every id`);
assert.ok(generator.reasons[id].some((why) => why.startsWith('tool ')), `${step}: named as its tool (${generator.reasons[id]})`);
// (2) one id's input moved (its builder or a row it reads): that id alone.
const input = resolveChanged(view({ inKey: moved(step, id) }), manifest)[step];
assert.deepEqual([input.mode, input.ids], ['ids', [id]], `${step}: one moved input key marks its id alone`);
// (3) an output row edited by hand: that id, named as an outside edit.
const output = resolveChanged(view({ outKey: (name, tankId) => (name === step && tankId === other ? `${state.outKey(name, tankId)}~hand`
  : state.outKey(name, tankId)) }), manifest)[step];
assert.deepEqual([output.mode, output.ids, output.reasons[other]], ['ids', [other], ['output edited outside chain']],
  `${step}: a hand-edited output row is caught`);
// (4) no manifest at all: every step whole-fleet (the state the assertion at the top refuses).
assert.ok(Object.values(resolveChanged(state, null)).every((entry) => entry.mode === 'full'), 'no manifest marks every step full');
console.log(`changed-only fresh.selftest: PASS (${STEPS.length} steps x ${state.ids.length} ids current for ${MANIFEST_PATH}; `
  + `negative controls: an edited ${step} generator, a moved input and a hand-edited output caught)`);
