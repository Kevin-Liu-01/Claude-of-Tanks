// fieldworksKit.selftest.mjs — props census #10, the field works (maps/fieldworksKit.ts):
//   - every map draws its period's form: the wire (a fence, stakes or knife-rests to 1945, the concertina to 1999, razor
//     tape after), the tent (no frame tent before 2000, a frame tent after), the hedgehog (lashed logs only to 1945),
//     the AA gun (the ZU-23-2 from 2000);
//   - the wire and the tent spend their legacy builders' draws exactly (the props stream), and so does the fire ring's
//     stones; the wire within 400 triangles a run and its record's run, its pickets' feet below grade;
//   - the hedgehog's members inside their beams' collision boxes (the gusset and the tyres a little proud), its leaning
//     feet on the ground;
//   - the tent inside its record (2.56 x 3.8 m, 2.1 m), and its collapse no raft (a quarter of its height, 60 % of its
//     plan); the breached sandbag stack within 1.5 x the intact's triangles, no raft, its height within the intact's;
//   - the AA gun's base and head coloured, its muzzles where the tracers start (2.6-3.0 m along the head).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as fw from './fieldworksKit.ts';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { MAP_SETTING_YEAR } from './periodClutterKit.ts';
import { hedgehogBeamSpecs } from '../propPlacement.ts';
import { box, jitterUV } from '../propGeometry.ts';

const counted = (seed) => {
  let s = seed >>> 0, n = 0;
  const f = () => { n++; s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  f.count = () => n;
  return f;
};
const bounds = (g) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position'));
const tris = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

// --- the period's form on every map
for (const [map, year] of Object.entries(MAP_SETTING_YEAR)) {
  const f = fw.fieldworksForms(map);
  if (f.wire) {
    const want = year <= 1945 ? ['fence', 'stakes', 'knife'] : year < 2000 ? ['concertina'] : ['razor'];
    assert.ok(want.includes(f.wire), `${map} (${year}): its wire is ${f.wire}, not ${want.join('/')}`);
  }
  if (f.tent) assert.ok(year < 2000 ? f.tent !== 'tunnel' : f.tent === 'tunnel', `${map} (${year}): its tent is ${f.tent}`);
  assert.ok(f.hedgehog !== 'timber' || year <= 1945, `${map} (${year}): lashed logs only to 1945`);
  assert.ok(year < 2000 ? f.aa !== 'zu23' || year >= 1960 : f.aa === 'zu23', `${map} (${year}): its AA gun is ${f.aa}`);
}

// --- the wire, the tent: the legacy draws spent exactly; inside their records
const wireMaps = ['autumn', 'verdant', 'blackglass', 'urban', 'airfield'];
for (const map of [...wireMaps, 'monsoon', 'whiteout']) {
  const types = fw.fieldworksTypes(map, false, DESTRUCTIBLE_TYPES);
  for (const kind of ['barbedwire', 'tent']) {
    const t = types[kind];
    if (!t) continue;
    assert.equal(t.ownBroken, true, `${map} ${kind}: its broken state its own (no PROP_FRACTURE)`);
    for (const [label, build, legacy] of [['intact', t.build, DESTRUCTIBLE_TYPES[kind].build], ['broken', t.broken, DESTRUCTIBLE_TYPES[kind].broken]]) {
      const r1 = counted(11), r2 = counted(11);
      const g = build(r1);
      legacy(r2).dispose();
      assert.equal(r1.count(), r2.count(), `${map} ${kind} ${label}: the legacy draws spent exactly`);
      assert.ok(g.getAttribute('color') && g.getAttribute('normal'), `${map} ${kind} ${label}: coloured, lit`);
      const b = bounds(g);
      if (kind === 'barbedwire' && label === 'intact') {
        assert.ok(tris(g) <= 400, `${map} wire: ${tris(g)} triangles a run (cap 400)`);
        assert.ok(Math.abs(b.min.z) <= 1.32 && b.max.z <= 1.32 && Math.max(-b.min.x, b.max.x) <= 0.4, `${map} wire: inside its run`);
        assert.ok(b.min.y < 0 && b.max.y <= 1.1, `${map} wire: its pickets driven below grade, a metre high`);
      }
      if (kind === 'tent') {
        assert.ok(Math.max(-b.min.x, b.max.x) <= 1.3 && Math.max(-b.min.z, b.max.z) <= 1.95 && b.max.y <= 2.15, `${map} tent ${label}: inside its record`);
        if (label === 'broken') {
          const pitched = bounds(t.build(counted(11)));
          assert.ok(b.max.y >= 0.25 * pitched.max.y, `${map} tent: its collapse no raft (${b.max.y.toFixed(2)} of ${pitched.max.y.toFixed(2)} m)`);
          const plan = (bb) => (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
          assert.ok(plan(b) >= 0.6 * plan(pitched), `${map} tent: its collapse covers its plan`);
        }
      }
      g.dispose();
    }
  }
}

// --- the ammunition crates in their army's paint: the same draws and triangles as the olive, a phone's never overridden
{
  const pine = fw.fieldworksTypes('verdant', false, DESTRUCTIBLE_TYPES).ammobox;
  assert.ok(pine && !fw.fieldworksTypes('verdant', true, DESTRUCTIBLE_TYPES).ammobox, 'verdant: its crates bare pine on a desktop only');
  for (const [label, b, legacy] of [['intact', pine.build, DESTRUCTIBLE_TYPES.ammobox.build], ['broken', pine.broken, DESTRUCTIBLE_TYPES.ammobox.broken]]) {
    const r1 = counted(5), r2 = counted(5), g = b(r1), h = legacy(r2);
    assert.equal(r1.count(), r2.count(), `verdant crates ${label}: the olive's draws`);
    assert.equal(tris(g), tris(h), `verdant crates ${label}: the olive's triangles`);
    assert.notDeepEqual(Array.from(g.getAttribute('color').array.slice(0, 3)), Array.from(h.getAttribute('color').array.slice(0, 3)), `verdant crates ${label}: repainted`);
  }
}

// --- the hedgehog: members inside their beams' boxes, the leaning feet grounded
for (const map of ['autumn', 'verdant', 'blackglass', 'ruinspires', 'desert', 'mars']) {
  const specs = hedgehogBeamSpecs(0, 0, 0, 0.7, 1, [0, 0, 0]);
  specs.forEach((spec, i) => {
    const parts = fw.buildHedgehogBeam(map, i, spec.tilt, spec.yaw, 0, 0, 0, 1);
    const beam = parts[0].geometry;
    // the member in the beam's frame: inside its 0.16 x 0.16 x 2.1 m box (the joint's plates and the tyres a little proud)
    const inv = new THREE.Matrix4().makeRotationY(spec.yaw).multiply(new THREE.Matrix4().makeRotationX(spec.tilt)).invert();
    const p = beam.getAttribute('position'), v = new THREE.Vector3();
    let worst = 0;
    for (let k = 0; k < p.count; k++) {
      v.set(p.getX(k), p.getY(k) - 0.62, p.getZ(k)).applyMatrix4(inv);
      if (Math.abs(v.z) > 0.2) worst = Math.max(worst, Math.abs(v.x) - 0.08, Math.abs(v.y) - 0.08, Math.abs(v.z) - 1.05);
    }
    assert.ok(worst <= 0.01, `${map} hedgehog beam ${i}: its member inside its box (${worst.toFixed(3)} m out)`);
    const b = bounds(beam);
    if (i < 2) assert.ok(b.min.y <= 0.02 && b.min.y >= -0.07, `${map} hedgehog beam ${i}: its foot on the ground (${b.min.y.toFixed(3)})`);
    for (const part of parts) assert.equal(part.bucket, 'baked');
  });
}

// --- the breached sandbag stacks: the intact's cost and height, no raft
for (const kind of ['sandbagbig', 'sandbagsmall', 'sandbagwall']) {
  let spent = 0;
  const intact = fw.buildSandbagStack(kind), heap = fw.buildSandbagHeap(kind, () => { spent++; });
  assert.equal(spent, 1, `${kind}: the remnant's draws spent first`);
  const bi = bounds(intact), bh = bounds(heap);
  assert.ok(tris(heap) <= 1.5 * tris(intact), `${kind}: the breach ${tris(heap)} triangles of the intact's ${tris(intact)}`);
  assert.ok(bh.max.y <= bi.max.y + 0.02 && bh.max.y >= 0.25 * bi.max.y, `${kind}: the breach stands within the stack and is no raft`);
}

// --- the AA guns: coloured, their muzzles where the tracers start
for (const map of ['autumn', 'fjord', 'verdant', 'steppe', 'skybridge', 'airfield']) {
  const { base, head } = fw.buildAaGun(map);
  assert.ok(base.getAttribute('color') && head.getAttribute('color'), `${map} AA: coloured`);
  const reach = bounds(head).max.z;
  assert.ok(map === 'skybridge' ? reach > 1.8 : reach >= 2.6 && reach <= 3.0, `${map} AA: its muzzles at ${reach.toFixed(2)} m`);
  assert.ok(bounds(base).min.y >= -0.05, `${map} AA: its pit on the ground`);
}

// --- the fire ring: its stones on the old ring's draws
for (const map of ['autumn', 'airfield']) {
  const r1 = counted(3), r2 = counted(3);
  const parts = fw.buildCampFireRing(map, 10, 2, -4, r1);
  const n = 5 + ((r2() * 3) | 0);
  for (let k = 0; k < n; k++) { const st = box(0.22 + r2() * 0.1, 0.18, 0.2, 1.4); jitterUV(st, r2); st.rotateY(r2() * Math.PI); }
  assert.equal(r1.count(), r2.count(), `${map} fire ring: the old ring's draws`);
  assert.equal(parts.filter((p) => p.bucket === 'stone').length, n, `${map} fire ring: ${n} stones`);
}

console.log('fieldworksKit.selftest: period forms on every map, legacy draws spent, wire within 400 triangles and its run, hedgehog members in their boxes, tents in their records, no raft wrecks, AA muzzles, fire-ring draws PASS');
