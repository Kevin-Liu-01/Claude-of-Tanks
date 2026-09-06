import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { REVOLUTION_PROTO_BASELINE, validatedPreservationOracle, preservationDimensionTargets,
  verifyPreservationBytes } from './preservation-oracle.ts';
import { requiredMinimumForQualityBar } from './geometry-gate-policy.mjs';
import { T90_X_REFERENCE_OVERRIDES } from './t90-x-reference-overrides.ts';
import { LEOPARD_X_REFERENCE_OVERRIDES } from './leopard-x-reference-overrides.ts';
import { WEST_X_REFERENCE_OVERRIDES } from './west-x-reference-overrides.ts';

const page = fs.readFileSync(new URL('./procedural-fidelity.html', import.meta.url), 'utf8');
const registryText = page.match(/const LOCAL_REFERENCE_OVERRIDES = (\{[\s\S]*?\n\});/)[1];
const registry = vm.runInNewContext(`(${registryText})`, { REVOLUTION_PROTO_BASELINE,
  T90_X_REFERENCE_OVERRIDES, LEOPARD_X_REFERENCE_OVERRIDES, WEST_X_REFERENCE_OVERRIDES });
const rebuilt = registry.leo2_revolution;
const preserved = registry.leo2_revolution_proto;
assert.equal(rebuilt.qualityBar, 'exemplar');
assert.equal(requiredMinimumForQualityBar(rebuilt.qualityBar), 92, 'new Revolution retains the exemplar floor');
assert.equal(validatedPreservationOracle(rebuilt, 'leo2_revolution'), null, 'rebuilt source may not use the preservation branch');
assert.equal(rebuilt.glb.path, '/models/community-candidates/leopard_revolution_owner_2026.glb');
assert.equal(requiredMinimumForQualityBar(preserved.qualityBar), 99);
assert.equal(validatedPreservationOracle(preserved, 'leo2_revolution_proto'), REVOLUTION_PROTO_BASELINE);
assert.equal(REVOLUTION_PROTO_BASELINE.sourceCommit, 'da5e0cf0af4e4ddf7a29ec78d7e1c120ce12755b');
assert.equal(REVOLUTION_PROTO_BASELINE.glbSha256, 'ce63f41864d158627df7a89f0fc22e7f71ae753ded72e350206230bf2f417ff7');
assert.throws(() => validatedPreservationOracle(preserved, 'leo2_revolution'), /invalid or unpinned/,
  'preservation allowlist cannot quietly exempt the rebuilt production vehicle');
assert.throws(() => validatedPreservationOracle({ ...preserved, preservation: {
  ...REVOLUTION_PROTO_BASELINE, sourceCommit:'candidate-head',
} }, 'leo2_revolution_proto'), /invalid or unpinned/, 'baseline must be the immutable historical commit');
assert.throws(() => validatedPreservationOracle({ qualityBar:'preservation' }, 'leo2_revolution_proto'),
  /immutable baseline/, 'preservation cannot be selected by quality-bar label alone');
const measured = { overallLengthM:9.7205, widthM:4.002 };
const published = { overallLengthM:9.97, widthM:4 };
assert.equal(preservationDimensionTargets(rebuilt, 'leo2_revolution', measured, published), published,
  'the source rebuild remains independently anchored to its published dimensions');
assert.equal(preservationDimensionTargets(preserved, 'leo2_revolution_proto', measured, published), measured,
  'historical inaccuracy is retained only for the explicitly preserved original');
await assert.rejects(verifyPreservationBytes(new ArrayBuffer(8), REVOLUTION_PROTO_BASELINE), /hash mismatch/,
  'a substituted local GLB fails closed');
const oracle = new URL('../public/models/community-candidates/leo2_revolution_proto_preservation.glb', import.meta.url);
if (fs.existsSync(oracle)) {
  const bytes = fs.readFileSync(oracle);
  await verifyPreservationBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), REVOLUTION_PROTO_BASELINE);
}
assert.match(page, /if \(!preservation && !sourceWorldCertificate\) \{\s*reference\.root\.scale\.multiplyScalar/,
  'preservation must not independently rescale the candidate to hide drift');
assert.match(page, /preservationDimensionTargets\(source, id, preservation \? \{/,
  'actual baseline mask measurements feed the preservation dimension branch');
console.log('preservation-oracle.selftest: immutable 99-point historical baseline isolated from 92-point source fidelity');
