// R1 combat byte identity (Gallery anatomy lane): every frozen combat/legacy path and every vehicle's canonical
// armor JSON still hash to the 16aeab482 manifest. The anatomy presentation reads the volumes and never writes them.
// Copyright (c) 2026 Kevin B. Liu. First-party receipt; see NOTICE.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalJson, fileHashes, armorHashes, frozenFiles } from './anatomy-frozen.mjs';

const manifest = JSON.parse(readFileSync(new URL('./anatomy-frozen.manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.base, '16aeab482', 'the manifest was taken at the reviewed base');

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
console.log(`anatomy-frozen: ${Object.keys(files).length} frozen files and ${Object.keys(armor).length} armor models byte-identical to 16aeab482 PASS`);
