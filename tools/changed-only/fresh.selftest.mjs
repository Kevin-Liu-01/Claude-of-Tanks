// Generator freshness at resolver cost (test-speed R8d): every fleet generator's committed outputs are current for the
// committed fingerprint manifest (release/fingerprints.tsv), so a lane that edits a builder, a kit, a spec, a generator
// or its flags without running `npm run tank:regen:changed` turns this red, naming the ids and why. No tank is built
// (about 15 s). A toolchain difference (Node, lockfiles) is reported, not failed: the nightly
// `tank:regen:changed -- --check --all` re-runs every generator's own --check and covers it, and any resolver miss.
// Without a manifest (before the release's bootstrap commit) it reports that and passes.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { MANIFEST_PATH, computeState, readManifest, resolveChanged } from './fingerprint.mjs';
import { STEPS } from './steps.mjs';

// A tree may be named (a parity tree); the receipt itself checks its own repository.
const root = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../..'));
const manifest = readManifest(root);
if (!manifest) {
  console.log(`changed-only fresh.selftest: PASS (no ${MANIFEST_PATH} yet: bootstrap it with npm run tank:regen:changed -- --all and commit the outputs and the manifest)`);
} else {
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
  console.log(`changed-only fresh.selftest: PASS (${STEPS.length} steps x ${state.ids.length} ids current for ${MANIFEST_PATH})`);
}
