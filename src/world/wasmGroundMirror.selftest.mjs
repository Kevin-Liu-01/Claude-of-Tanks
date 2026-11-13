// The kernel's copy of the match's ground as an explicit binding (2026-11-02 audit S2, wasmWorldKernels.ts mirrorOverlay
// over terrainDeformation.ts TerrainDeformationMirror). The old mirror wrapped the overlay's own methods on every bind and
// never unwrapped them: binding one overlay twice sent every later stamp to the kernel twice (its ground drifted from the
// TypeScript's: a sim divergence between kernel and TypeScript peers), and a heap laid between a bind and the next clock
// step started on the kernel's own clock. Held here on Urban through the production seam (headlessCollisionWorld
// bindGroundOverlay, its kernel support field's terrain contact), every read compared with the TypeScript deformed field
// over the same overlay, as Float64 bytes:
// - one overlay bound twice: each later crater reaches the kernel once;
// - A, then B, then A again: the kernel holds A's ground (its stamps once), and B's later stamps never reach it;
// - unbound (null): nothing reaches the kernel, its ground is the bare surface;
// - an overlay whose clock ran before the bind: a heap laid next rises on the overlay's clock on both;
// - a mirror bound twice to one overlay is refused.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileWorldKernels } from './wasmWorldKernels.ts';
import { createDeformedHeightField, createTerrainDeformation } from '../sim/terrainDeformation.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const module = await compileWorldKernels(readFileSync(new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url)));
const ts = createDedicatedWorldCollision('urban');
const wasm = createDedicatedWorldCollision('urban', { kernels: module });
const kernelGround = wasm.kernelSupportField(wasm.heightField).getTerrainContactHeightAt;
const bits = (value) => Buffer.from(new Float64Array([value]).buffer).toString('hex');
/** The kernel's ground over a 13 x 13 grid about (x, z) against the TypeScript deformed field over `overlay`. */
function sameGround(overlay, x, z, label) {
  const field = overlay ? createDeformedHeightField(ts.heightField, overlay) : ts.heightField;
  for (let i = -6; i <= 6; i++) {
    for (let k = -6; k <= 6; k++) {
      const px = x + i * 0.77, pz = z + k * 0.91;
      const want = field.getContactHeightAt(px, pz), got = kernelGround(px, pz);
      assert.equal(bits(got), bits(want), `${label}: the kernel's ground at (${px}, ${pz}) reads ${got} where the TypeScript's reads ${want}`);
    }
  }
}

// one overlay bound twice
{
  const a = createTerrainDeformation();
  a.addCrater(20, 20, 2.5, 0.8, 0.3, 11);
  wasm.bindGroundOverlay(a);
  wasm.bindGroundOverlay(a);
  sameGround(a, 20, 20, 'bound twice, the stamp laid before');
  a.addCrater(60, -40, 2.5, 0.8, 0.3, 12);
  sameGround(a, 60, -40, 'bound twice, a crater after');
}

// A, B, A again; then unbound
{
  const a = createTerrainDeformation(), b = createTerrainDeformation();
  wasm.bindGroundOverlay(a);
  a.addCrater(-30, 10, 3, 1, 0.4, 21);
  wasm.bindGroundOverlay(b);
  b.addCrater(-30, 10, 2, 0.5, 0.2, 22);
  sameGround(b, -30, 10, 'rebound to B');
  wasm.bindGroundOverlay(a);
  sameGround(a, -30, 10, 'A again: its ground replayed');
  b.addCrater(-30, 10, 2, 0.5, 0.2, 23);
  a.addCrater(-31, 11, 1.5, 0.6, 0.2, 24);
  sameGround(a, -30, 10, 'A again: B unbound, A\'s next crater once');
  wasm.bindGroundOverlay(null);
  a.addCrater(5, 5, 3, 1, 0.4, 25);
  sameGround(null, 5, 5, 'unbound: the bare surface');
}

// a clock that ran before the bind
{
  const c = createTerrainDeformation();
  c.setTime(12);
  wasm.bindGroundOverlay(c);
  c.addRubble(0, -60, 6, 8, 0.3, 1.5);
  sameGround(c, 0, -60, 'a heap laid on the overlay\'s clock before its next step');
  c.setTime(13);
  sameGround(c, 0, -60, 'half risen');
  c.setTime(15);
  sameGround(c, 0, -60, 'risen');
  c.reset();
  c.addRubble(0, -60, 6, 8, 0.3, 1.5);
  sameGround(c, 0, -60, 'after a reset (the clock unset on both: risen at once)');
  wasm.bindGroundOverlay(null);
}

// a mirror bound twice to one overlay
{
  const d = createTerrainDeformation();
  const heard = [];
  const mirror = { crater: (s) => heard.push(s.seed), rubble() {}, course() {}, reset() {}, time() {} };
  const unbind = d.mirror(mirror);
  assert.throws(() => d.mirror(mirror), /bound already/, 'a mirror bound twice would hear each change twice');
  d.addCrater(1, 1, 2, 0.5, 0.2, 31);
  assert.ok(!d.addCrater(1, 1, 0, 0.5, 0.2, 32), 'a crater the overlay refuses');
  unbind();
  d.addCrater(1, 1, 2, 0.5, 0.2, 33);
  assert.deepEqual(heard, [31], 'told the admitted crater once, nothing refused, nothing after its unbind');
}

ts.release?.(); wasm.release?.();
console.log('wasmGroundMirror selftest passed: an overlay bound twice, rebound A-B-A and unbound reaches the kernel once and '
  + 'never after its unbind; a heap laid on a clock that ran before the bind rises on it on both; a mirror is told each change once');
