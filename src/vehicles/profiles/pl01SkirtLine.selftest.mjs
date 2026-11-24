// 276 (Kevin 2026-11-24, "make the sideskirts of the pl01s align with the upper glacis and hull", with a gallery surface
// markup on the pl01 hull: remove the vertical strip at x -1.62, y 1.325-2.065, z -3.505..3.44, normal inboard). The
// skirts carried their own top table (fold at z 1.88) while the deck and upper glacis came from the loft deck line (fold
// at z 1.30): forward the skirts stood up to 0.146 m proud of the glacis edge and their inboard bevel wall showed over
// the deck; aft they sat 22-29 mm under it. Now one deck line and one side plane drive both (profiles/poland.ts
// PL01_DECK_LINE, PL01_HULL_SIDE_X). On both PL-01s, measured on the built hull armour mesh at 4 cm stations:
//   - the deck is flat out to the side line (x 1.55 vs 1.6158) and the skirt crest bevel starts at its edge (1.6162);
//   - that side edge is the upper glacis plane (1.975 @ z 1.30 -> 1.46 @ 3.425) over the glacis;
//   - the skirt outer face holds the ±1.90 plane over the running-gear span;
//   - no face lies in the marked band (a vertical inboard wall at |x| 1.62), and no inboard-facing face rises above
//     the deck next to it.
// Planted controls: the old strip put back, and the skirt tops raised 30 mm, must each fail.
import assert from 'node:assert/strict';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';

const SIDE_X = 1.616;
const TOL = 0.005;
const BAND = { x: 1.62, yMin: 1.325, yMax: 2.065 };
const glacisPlaneY = (z) => 1.975 + (z - 1.30) * ((1.46 - 1.975) / (3.425 - 1.30));
const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
const down = new T.Vector3(0, -1, 0);

function hullGeometry(id) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, batchStatic: false });
  const hull = tank.root.getObjectByName('rig_hull').getObjectByName('hull');
  assert(hull?.isMesh, `${id}: the hull armour mesh exists`);
  return hull.geometry.index ? hull.geometry.toNonIndexed() : hull.geometry.clone();
}

function audit(geometry) {
  const mesh = new T.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  const ray = new T.Raycaster();
  const topAt = (x, z) => {
    ray.set(new T.Vector3(x, 3.5, z), down); ray.far = 4;
    return ray.intersectObject(mesh)[0]?.point.y ?? NaN;
  };
  const out = { deckStep: 0, skirtStep: 0, glacis: 0, outer: 0, bandFaces: 0, overDeck: 0, at: {} };
  const note = (key, value, where) => { if (value > out[key]) { out[key] = value; out.at[key] = where; } };
  for (let z = -3.48; z <= 3.40 + 1e-9; z += 0.04) {
    for (const s of [-1, 1]) {
      const deck = topAt(s * 1.55, z), edge = topAt(s * (SIDE_X - 0.0002), z), skirt = topAt(s * (SIDE_X + 0.0002), z);
      // a missing surface (the base build left a 4 mm open slot between the hull wall at 1.616 and the skirt at 1.62)
      // reads as a 1 m step
      const step = (p, q) => (Number.isFinite(p) && Number.isFinite(q) ? Math.abs(p - q) : 1);
      note('deckStep', step(deck, edge), `${s}:${z.toFixed(2)}`);
      // 0.4 mm apart across the side line: the crest bevel falls 0.48 m/m outboard (up to ~7 m/m in the V-nose tip, where
      // the face closes from 1.80 to 1.66 over its last 0.24 m), so any larger reading is a step, not the chamfer
      note('skirtStep', step(skirt, edge), `${s}:${z.toFixed(2)}`);
      if (z >= 1.30 && z <= 3.40) note('glacis', step(edge, glacisPlaneY(z)), `${s}:${z.toFixed(2)}`);
      if (z >= -2.80 && z <= 1.85) {
        ray.set(new T.Vector3(s * 3, (Number.isFinite(edge) ? edge : deck) - 0.20, z), new T.Vector3(-s, 0, 0)); ray.far = 2;
        const hit = ray.intersectObject(mesh)[0];
        note('outer', hit ? Math.abs(Math.abs(hit.point.x) - 1.90) : 1, `${s}:${z.toFixed(2)}`);
      }
    }
  }
  const pos = geometry.attributes.position, a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  const n = new T.Vector3(), e1 = new T.Vector3(), e2 = new T.Vector3();
  for (let f = 0; f < pos.count / 3; f++) {
    a.fromBufferAttribute(pos, 3 * f); b.fromBufferAttribute(pos, 3 * f + 1); c.fromBufferAttribute(pos, 3 * f + 2);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    const cx = (a.x + b.x + c.x) / 3, side = Math.sign(cx);
    const inboard = n.x * side;
    const ys = [a.y, b.y, c.y];
    if (inboard < -0.95 && [a, b, c].every((v) => Math.abs(Math.abs(v.x) - BAND.x) <= 0.004)
      && Math.max(...ys) > BAND.yMin && Math.min(...ys) < BAND.yMax) out.bandFaces++;
    if (inboard < -0.3 && Math.abs(cx) >= 1.55 && Math.abs(cx) <= 1.95) {
      for (const v of [a, b, c]) {
        const z = Math.min(3.40, Math.max(-3.48, v.z));
        if (v.y > topAt(side * 1.55, z) + 0.003) { out.overDeck++; break; }
      }
    }
  }
  return out;
}

const passes = (r) => r.deckStep <= TOL && r.skirtStep <= TOL && r.glacis <= TOL && r.outer <= TOL
  && r.bandFaces === 0 && r.overDeck === 0;
const fmt = (r) => `deckStep ${(r.deckStep * 1000).toFixed(1)} mm, skirtStep ${(r.skirtStep * 1000).toFixed(1)} mm, `
  + `glacis ${(r.glacis * 1000).toFixed(1)} mm, outer ${(r.outer * 1000).toFixed(1)} mm, band faces ${r.bandFaces}, `
  + `inboard faces over the deck ${r.overDeck} (worst at side:z ${JSON.stringify(r.at)})`;

function withPlantedStrip(geometry) {
  // the removed wall: a vertical inboard face at x -1.62 from 0.135 under the old skirt top to the top, z 1.30..1.88
  const quad = [[-1.62, 1.875, 1.30], [-1.62, 2.01, 1.30], [-1.62, 1.845, 1.88], [-1.62, 1.98, 1.88]];
  // wound so its normal points inboard (+x), as the removed faces did
  const tri = [quad[0], quad[1], quad[2], quad[1], quad[3], quad[2]];
  const old = geometry.attributes.position.array;
  const next = new Float32Array(old.length + tri.length * 3);
  next.set(old); next.set(tri.flat(), old.length);
  const planted = new T.BufferGeometry();
  planted.setAttribute('position', new T.BufferAttribute(next, 3));
  return planted;
}

function withRaisedSkirts(geometry) {
  // the skirt tops lifted 30 mm, inner crest edge included (it shares the side line with the hull wall's top edge)
  const planted = new T.BufferGeometry();
  const p = new Float32Array(geometry.attributes.position.array);
  for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i]) > SIDE_X - 0.0001 && p[i + 1] > 1.80) p[i + 1] += 0.03;
  planted.setAttribute('position', new T.BufferAttribute(p, 3));
  return planted;
}

for (const id of ['pl01', 'pl01_105']) {
  const geometry = hullGeometry(id);
  const r = audit(geometry);
  console.log(`${id}: ${fmt(r)}`);
  assert(passes(r), `${id}: skirt crest, glacis side edge and hull side line agree within 5 mm (${fmt(r)})`);
  if (id === 'pl01') {
    const strip = audit(withPlantedStrip(geometry));
    console.log(`control (old strip planted): ${fmt(strip)}`);
    assert(strip.bandFaces > 0 && strip.overDeck > 0, 'control: the planted inboard strip is caught');
    const raised = audit(withRaisedSkirts(geometry));
    console.log(`control (skirt tops +30 mm): ${fmt(raised)}`);
    assert(raised.deckStep > TOL || raised.skirtStep > TOL, 'control: skirts standing proud of the deck are caught');
  }
}
console.log('pl01SkirtLine: PASS');
