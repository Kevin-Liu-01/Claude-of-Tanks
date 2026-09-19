import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OBJECT695_EPOKHA as RECIPE, OBJECT695_EPOKHA_FRAME, object695SourceTransform } from './object695-epokha-reference.mjs';
import { deriveObject695Reference, readReferenceGlb, verifyOnlySelectedTransforms, digest } from './derive-object695-epokha-source.mjs';
import { SOURCE_WORLD_FRAMES, validateSourceWorldFrame } from './source-world-registration.mjs';
import { SECOND_WAVE_X_REFERENCE_OVERRIDES } from './second-wave-x-reference-overrides.ts';
import { roofEquipmentVerdict } from './source-equipment-policy.mjs';
import { verifyConfigurationSource } from './source-configuration-record.mjs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url));
const manifest = JSON.parse(read(RECIPE.recipePath));
const equipment = JSON.parse(read('docs/references/batches/supplied-afv-configurations.json')).configurations.object695_x;
assert.equal(equipment.roofMachineGuns, 0, 'Epokha has a coaxial weapon, not an extra roof MG');
assert.deepEqual(equipment.source, { path: RECIPE.source.path, sha256: RECIPE.source.sha256 });
assert.equal(equipment.ownerDecision.assembly, RECIPE.recipePath);
const sourceReceipt = { id: 'object695_x', verified: true, ...equipment.source };
assert.equal(roofEquipmentVerdict('object695_x', { mg: 0, invalidWeaponMarkers: 0 }, equipment, sourceReceipt).passed, true);
assert.equal(roofEquipmentVerdict('object695_x', { mg: 1, invalidWeaponMarkers: 0 }, equipment, sourceReceipt).passed, false);
assert.equal(roofEquipmentVerdict('object695_x', { mg: 0, invalidWeaponMarkers: 0 }, equipment, { ...sourceReceipt, verified: false }).passed, false);
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const frame = SOURCE_WORLD_FRAMES.object695_x;
assert.deepEqual(frame, OBJECT695_EPOKHA_FRAME);
assert.deepEqual(frame.turret, [0, 2.15, -1.10]);
assert(Math.abs(frame.gun[0] + .004) < 1e-12 && Math.abs(frame.gun[1] - 2.857) < 1e-12 && Math.abs(frame.gun[2] + .51) < 1e-12);
assert.equal(manifest.output.sha256, frame.sha256);
assert.deepEqual(manifest.source, RECIPE.source);
assert.deepEqual(manifest.donor, RECIPE.donor);
assert.deepEqual(manifest.operations.map(row => [row.selector.name, row.selector.nodeIndex, row.selector.triangles]), RECIPE.owners);
assert.equal(manifest.operations.reduce((n, row) => n + row.selector.triangles, 0), 36505);
assert(manifest.operations.every(row => row.selector.maxCorrespondenceResidualM < 1e-6));
assert.deepEqual(manifest.sourceOnlyDatums.originalBounds.min, manifest.sourceOnlyDatums.derivedBounds.min);
assert.equal(manifest.sourceOnlyDatums.originalBounds.size[0], manifest.sourceOnlyDatums.derivedBounds.size[0]);
assert.equal(manifest.sourceOnlyDatums.originalBounds.size[2], manifest.sourceOnlyDatums.derivedBounds.size[2]);
assert(Math.abs(manifest.sourceOnlyDatums.muzzleZ - 1.02705) < 1e-6);
const ref = SECOND_WAVE_X_REFERENCE_OVERRIDES.object695_x;
assert.equal(ref.glb.path, `/${RECIPE.outputPath.slice('public/'.length)}`);
assert.equal(ref.qualityBar, 'exemplar');
assert.equal(ref.glb.fixedMount, true);
assert.equal(ref.glb.componentMasks, false);
assert.equal(ref.glb.geometryComponentMasks, false);

const frames = () => ({
  reference: { rootMatrix: [...identity], hull: [0, 0, 0], turret: [0, 0, 0], gun: [0, 0, 0] },
  procedural: { rootMatrix: [...identity], hull: [0, 0, 0], turret: [...frame.turret], gun: [...frame.gun] },
});
const verify = sample => validateSourceWorldFrame(frame, frame.sha256, sample);
assert.equal(verify(frames()).passed, true);
const stale = frames(); stale.procedural.gun = [0, 2.81, -.45];
assert.equal(verify(stale).passed, false, 'obsolete long-gun frame must fail');
for (const axis of [0, 1, 2]) {
  const shifted = frames(); shifted.procedural.gun[axis] += .013;
  assert.equal(verify(shifted).passed, false, 'unchanged 12 mm datum threshold');
}
assert.equal(validateSourceWorldFrame(frame, RECIPE.source.sha256, frames()).passed, false, 'old source bytes cannot claim the derived certificate');

// Literal mutation controls run without private source availability in CI.
const before = { bin: Buffer.from([1, 2, 3, 4]), json: { nodes: Array.from({ length: 40 }, (_, i) => ({ name: `Object_${i + 1}`, mesh: i })), materials: [{ name: 'original' }] } };
const after = { bin: Buffer.from(before.bin), json: structuredClone(before.json) };
const transform = object695SourceTransform();
for (const [, index] of RECIPE.owners) Object.assign(after.json.nodes[index], { scale: Array(3).fill(transform.scale), translation: [...transform.translation] });
verifyOnlySelectedTransforms(before, after);
for (const mutate of [
  value => { value.bin[0] = 0; },
  value => { value.json.nodes[2].translation = [0, .01, 0]; },
  value => { value.json.nodes[1].scale[0] += .001; },
  value => { value.json.nodes[1].translation[1] += .001; },
  value => { delete value.json.nodes[1].translation; },
  value => { value.json.nodes[1].name = 'wrong-owner'; },
  value => { value.json.materials[0].name = 'repainted'; },
]) {
  const wrong = { bin: Buffer.from(after.bin), json: structuredClone(after.json) }; mutate(wrong);
  assert.throws(() => verifyOnlySelectedTransforms(before, wrong));
}
assert.throws(() => deriveObject695Reference(Buffer.from('wrong-hull'), Buffer.alloc(0)), /authenticated Object hull/);

if (process.argv.includes('--source-proof')) {
  assert.equal(verifyConfigurationSource('object695_x', equipment).verified, true);
  const original = read(RECIPE.source.path), donor = read(RECIPE.donor.path);
  assert.throws(() => deriveObject695Reference(original, Buffer.from('wrong-turret')), /authenticated Kurg turret/);
  const replay = deriveObject695Reference(original, donor);
  assert.equal(digest(replay.bytes), frame.sha256, 'exact deterministic derived bytes');
  assert.deepEqual(replay.manifest, manifest, 'actual selected-source census and dimensions');
  assert.deepEqual(replay.bytes, read(RECIPE.outputPath));
  verifyOnlySelectedTransforms(readReferenceGlb(original), readReferenceGlb(replay.bytes));
  console.log('object695-epokha-reference: actual two-parent source replay and binary/nonselected preservation PASS');
}
console.log('object695-epokha-reference: nine whole source owners, source-only frames, unchanged floor/masks and mutation negatives PASS');
