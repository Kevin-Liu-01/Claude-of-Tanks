import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { REVOLUTION_PROTO_BASELINE, ZTZ100_PROTOTYPE_BASELINE, validatedPreservationOracle, preservationDimensionTargets,
  verifyPreservationBytes } from './preservation-oracle.ts';
import { requiredMinimumForQualityBar } from './geometry-gate-policy.mjs';
import { T90_X_REFERENCE_OVERRIDES } from './t90-x-reference-overrides.ts';
import { LEOPARD_X_REFERENCE_OVERRIDES } from './leopard-x-reference-overrides.ts';
import { WEST_X_REFERENCE_OVERRIDES } from './west-x-reference-overrides.ts';
import { SECOND_WAVE_X_REFERENCE_OVERRIDES } from './second-wave-x-reference-overrides.ts';
import { ABRAMS_X_REFERENCE_OVERRIDES } from './abrams-x-reference-overrides.ts';
import { SUPPLIED_SOURCE_REFERENCE_OVERRIDES } from './supplied-source-reference-overrides.mjs';
import { ARES_APC_X_REFERENCE_OVERRIDES } from './ares-apc-x-reference-overrides.ts';

const page = fs.readFileSync(new URL('./procedural-fidelity.html', import.meta.url), 'utf8');
const registryText = page.match(/const LOCAL_REFERENCE_OVERRIDES = (\{[\s\S]*?\n\});/)[1];
const registry = vm.runInNewContext(`(${registryText})`, { REVOLUTION_PROTO_BASELINE, ZTZ100_PROTOTYPE_BASELINE,
  T90_X_REFERENCE_OVERRIDES, LEOPARD_X_REFERENCE_OVERRIDES, WEST_X_REFERENCE_OVERRIDES, SECOND_WAVE_X_REFERENCE_OVERRIDES,
  ABRAMS_X_REFERENCE_OVERRIDES, SUPPLIED_SOURCE_REFERENCE_OVERRIDES, ARES_APC_X_REFERENCE_OVERRIDES });
const modernIsraeliSources = Object.fromEntries(
  ['merkava4_trophy', 'merkava4_barak', 'namer_ifv'].map(id => [id, WEST_X_REFERENCE_OVERRIDES[id]]),
);
for (const [id, source] of Object.entries({...ABRAMS_X_REFERENCE_OVERRIDES, ...SUPPLIED_SOURCE_REFERENCE_OVERRIDES, ...ARES_APC_X_REFERENCE_OVERRIDES, ...modernIsraeliSources})) {
  assert.equal(registry[id], source, 'actual fixed source registration survives the VM fixture');
  assert.equal(requiredMinimumForQualityBar(source.qualityBar), 92);
  assert.equal(validatedPreservationOracle(source, id), null, 'new source builds cannot use a preservation exemption');
}
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
assert.match(page, /preservationDimensionTargets\(source, id, preservation \? referenceDimensions : \{\}, specDimensions\)/,
  'actual baseline mask measurements feed the preservation dimension branch');
console.log('preservation-oracle.selftest: immutable 99-point historical baseline isolated from 92-point source fidelity');

assert.equal(registry.ztz100_prototype,undefined,'new concept cannot use the historical turret as its active target');
const ztz = {source:'glb',qualityBar:'preservation',comparisonPurpose:'preservation',preservation:ZTZ100_PROTOTYPE_BASELINE};
assert.equal(requiredMinimumForQualityBar(ztz.qualityBar),99,'historical floor itself is unchanged');
assert.equal(ZTZ100_PROTOTYPE_BASELINE.sourceCommit,'31d08f67378cd2bc5b883de3e0eba10513784612');
assert.equal(ZTZ100_PROTOTYPE_BASELINE.sourceId,'ztz100_x');
assert.equal(ZTZ100_PROTOTYPE_BASELINE.glbSha256,'ffbc0a0709328f693597054cfe048fcc0d7e289f720d9c777ffaf585722e86b6');
assert.equal(ZTZ100_PROTOTYPE_BASELINE.geometrySha256,'50d6b799d51ab196f9991dba5ba390daae3849fc2de72205f027583cd1dd0f7a');
for(const id of ['ztz100_prototype','ztz100_x','type100','toString','__proto__','unregistered']) {
  assert.throws(()=>validatedPreservationOracle(ztz,id),/invalid or unpinned/,'retired record cannot authorize any current vehicle');
}
for(const key of Object.keys(ZTZ100_PROTOTYPE_BASELINE)) {
  assert.throws(()=>validatedPreservationOracle({...ztz,preservation:{...ZTZ100_PROTOTYPE_BASELINE,[key]:'candidate-replacement'}},'ztz100_prototype'),/invalid or unpinned/);
}
assert.throws(()=>validatedPreservationOracle({...ztz,preservation:REVOLUTION_PROTO_BASELINE},'ztz100_prototype'),/invalid or unpinned/);
assert.throws(()=>validatedPreservationOracle({...preserved,preservation:ZTZ100_PROTOTYPE_BASELINE},'leo2_revolution_proto'),/invalid or unpinned/);
assert.equal(validatedPreservationOracle(registry.ztz100_x,'ztz100_x'),null);
assert.equal(requiredMinimumForQualityBar(registry.ztz100_x.qualityBar),92,'service source fidelity is unchanged');
await assert.rejects(verifyPreservationBytes(new ArrayBuffer(8),ZTZ100_PROTOTYPE_BASELINE),/hash mismatch/);
const ztzOracle=new URL('../public/models/community-candidates/ztz100_prototype_preservation.glb',import.meta.url);
if(fs.existsSync(ztzOracle)) {
  const bytes=fs.readFileSync(ztzOracle);
  await verifyPreservationBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),ZTZ100_PROTOTYPE_BASELINE);
}
console.log('preservation-oracle: immutable retired ZTZ bytes retained, current concept rejects stale99target, service92 unchanged');
