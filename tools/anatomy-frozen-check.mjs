// Gallery anatomy lane check (not an npm test receipt): every frozen combat/legacy path and every vehicle's canonical
// armor JSON still hash to the manifest taken at the lane's reviewed base. The anatomy presentation reads the combat
// volumes and never writes them; run this before landing anatomy work (`node tools/anatomy-frozen-check.mjs`). The
// manifest is a point-in-time freeze, so it lives outside npm test: later combat work legitimately moves these hashes.
// Copyright (c) 2026 Kevin B. Liu. First-party receipt; see NOTICE.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalJson, fileHashes, armorHashes, frozenFiles } from './anatomy-frozen.mjs';

const manifest = JSON.parse(readFileSync(new URL('./anatomy-frozen.manifest.json', import.meta.url), 'utf8'));
assert.match(manifest.base, /^[0-9a-f]{9,40}$/, 'the manifest names the reviewed base it was taken at');

// The canonicalizer is order-independent and drops runtime caches only.
assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: null }], _cache: 9 }), canonicalJson({ a: [2, { c: null, d: 3 }], b: 1 }));
assert.notEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 1.0000001 }));

const files = fileHashes();
assert.ok(frozenFiles().length > 900, 'the frozen set covers the sim, combat anatomy, profiles and registry');
const fileDrift = Object.keys(manifest.files).filter((file) => files[file] !== manifest.files[file]);
const added = Object.keys(files).filter((file) => !(file in manifest.files));
assert.deepEqual(fileDrift, [], `frozen files changed: ${fileDrift.slice(0, 12).join(', ')}`);
assert.deepEqual(added, [], `new files under a frozen root: ${added.slice(0, 12).join(', ')}`);

const armor = await armorHashes();
const armorDrift = Object.keys(manifest.armor).filter((id) => armor[id] !== manifest.armor[id]);
assert.equal(Object.keys(armor).length, Object.keys(manifest.armor).length, 'the fleet roster is the manifest roster');
assert.deepEqual(armorDrift, [], `armor models changed: ${armorDrift.slice(0, 12).join(', ')}`);
console.log(`anatomy-frozen: ${Object.keys(files).length} frozen files and ${Object.keys(armor).length} armor models byte-identical to ${manifest.base} PASS`);
