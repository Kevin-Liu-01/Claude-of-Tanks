// A prop gives where a hull meets it (dcore 2026-10-10; world/propCrush.ts, world/propCrushPresentation.ts; the owner:
// "just let physics work"; waves 350/352: a map vehicle flipped to the burnt wreck in one frame after the hull had driven
// into it, a hut's heap came back unchanged from under the tracks). With a map vehicle's own geometry:
//   - a hull crossing it presses it from the moment its box (and the band ahead of its glacis) reaches the vehicle's,
//     nothing of it ever stands inside the hull behind the hull's front ramp, no point of it ever rises again, it ends a
//     pancake, and the same crossing crushes it the same to the bit;
//   - a hull clipping one side leaves the far side standing, sagging toward the crushed edge;
//   - the presentation: the copy appears at contact (not before), hides the pool's slot, keeps the slot's livery; the
//     simulation's crush event then draws nothing new (no swap to the broken pool); a crush the press never saw sweeps a
//     hull across it (live, or at once when settled; the Studio's sweeps off); a heap broken earlier is drawn from its
//     broken slot when a hull presses it later; reset stands everything back up.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { civilianVehicleTypes } from './maps/inhabitKit.ts';
import { createCrushField, deformPositions, hullMeetsBox, pressField, vehicleAnatomy } from './propCrush.ts';
import { createPropCrushPresentation } from './propCrushPresentation.ts';

let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jeep = civilianVehicleTypes('verdant', false).jeep.build(rng);
jeep.computeBoundingBox();
const b = jeep.boundingBox;
const hw = Math.max(-b.min.x, b.max.x), hl = Math.max(-b.min.z, b.max.z), top = b.max.y;
const rest = jeep.getAttribute('position').array;
const HL = 3.4, HW = 1.8, V = 8, DT = 1 / 60;

/** A hull crossing the jeep along `ang` (from +x) offset `off` across its travel; per frame the deformed positions. */
function cross(ang, off) {
  const fx = Math.cos(ang), fz = Math.sin(ang), ox = -fz * off, oz = fx * off;
  const f = createCrushField(hw, hl, top);
  const out = new Float32Array(rest.length), prev = new Float32Array(rest.length).fill(Infinity);
  let firstContact = null, worstInside = 0, rose = 0;
  for (let s = -(hl + hw + HL + 2); s < hl + hw + HL + 1; s += V * DT) {
    const cx = ox + fx * s, cz = oz + fz * s;
    if (!hullMeetsBox(cx, cz, fx, fz, HL, HW, hw, hl)) continue;
    if (firstContact === null) firstContact = { cx, cz, s };
    pressField(f, cx, cz, fx, fz, HL, HW);
    deformPositions(f, rest, out);
    for (let v = 0; v < out.length; v += 3) {
      const px = out[v] - cx, pz = out[v + 2] - cz, u = px * fx + pz * fz, w = -px * fz + pz * fx;
      if (Math.abs(w) < HW - 0.3 && u < HL - 1.2 && u > -HL + 0.3) worstInside = Math.max(worstInside, out[v + 1]);
      if (out[v + 1] > prev[v + 1] + 1e-5) rose = Math.max(rose, out[v + 1] - prev[v + 1]);
      prev[v + 1] = out[v + 1];
    }
  }
  return { out, firstContact, worstInside, rose };
}

// a full crossing from the side
{
  const one = cross(Math.PI / 2, 0), two = cross(Math.PI / 2, 0);
  assert.ok(one.firstContact, 'the hull reaches the jeep');
  // the first press comes while the hull's front is still short of the jeep's near side (its glacis' band ahead)
  const front = one.firstContact.s + HL;
  assert.ok(front < -hl + 0.05 && front > -hl - 0.6, `it gives at contact: the hull's front ${front.toFixed(2)} m against the jeep's side at ${(-hl).toFixed(2)} m`);
  assert.ok(one.worstInside < 0.5, `nothing stands inside the hull behind its front ramp (highest ${one.worstInside.toFixed(2)} m)`);
  assert.ok(one.rose < 0.015, `no point of its body rises again by more than its creases deepen (${one.rose.toFixed(4)} m)`);
  let after = 0;
  for (let v = 1; v < one.out.length; v += 3) after = Math.max(after, one.out[v]);
  assert.ok(after < 0.5, `it ends a pancake (${top.toFixed(2)} m tall -> ${after.toFixed(2)} m)`);
  assert.deepEqual(Array.from(two.out), Array.from(one.out), 'the same crossing crushes it the same');
  console.log(`  full crossing: gives ${(-hl - front).toFixed(2)} m ahead of the hull's front, ${top.toFixed(2)} m -> ${after.toFixed(2)} m, inside the hull at most ${one.worstInside.toFixed(2)} m`);
}
// a hull clipping one side (its edge 0.5 m into the jeep's far half... its near quarter)
{
  const clip = cross(0, hw + HW - 0.6);
  let farTop = 0, nearTop = 0;
  for (let v = 0; v < clip.out.length; v += 3) {
    if (rest[v + 2] < -hl * 0.5) continue; // the crossing runs along x: the sides are ±z
    if (rest[v] < 0) nearTop = Math.max(nearTop, clip.out[v + 1]); else farTop = Math.max(farTop, clip.out[v + 1]);
  }
  void nearTop;
  let standing = 0, count = 0;
  for (let v = 0; v < clip.out.length; v += 3) {
    if (rest[v + 2] > -hw) continue;
    count++;
    if (clip.out[v + 1] > rest[v + 1] - 0.05) standing++;
  }
  assert.ok(count === 0 || standing >= count * 0.3, `the far side stands (${standing}/${count})`);
  console.log(`  clipped: ${standing}/${count} of the far side's points stand`);
}

// canvas (wave 352: "canvas never reads as cloth"): a tent run over lies flatter than a body, in soft folds, dragged on
{
  const tent = new THREE.ConeGeometry(1.6, 2.2, 24, 8, true).translate(0, 1.1, 0);
  tent.computeBoundingBox();
  const tb = tent.boundingBox, thw = Math.max(-tb.min.x, tb.max.x), thl = Math.max(-tb.min.z, tb.max.z);
  const trest = tent.getAttribute('position').array;
  const press = (cloth) => {
    const f = createCrushField(thw, thl, tb.max.y, undefined, cloth);
    const out = new Float32Array(trest.length);
    for (let s = -(thl + HL + 1); s < thl + HL; s += V * DT) pressField(f, 0, s, 0, 1, HL, HW);
    deformPositions(f, trest, out);
    return out;
  };
  const cloth = press(true), rigid = press(false);
  let ctop = 0, rtop = 0, drag = 0, lo = Infinity, hi = -Infinity;
  for (let v = 0; v < cloth.length; v += 3) {
    ctop = Math.max(ctop, cloth[v + 1]); rtop = Math.max(rtop, rigid[v + 1]);
    drag = Math.max(drag, cloth[v + 2] - trest[v + 2]);
    lo = Math.min(lo, cloth[v + 1]); hi = Math.max(hi, cloth[v + 1]);
  }
  assert.ok(ctop < rtop && ctop < 0.35, `canvas lies flatter than a body (${ctop.toFixed(2)} m against ${rtop.toFixed(2)} m)`);
  assert.ok(drag > 0.25, `canvas is dragged on with the hull (${drag.toFixed(2)} m)`);
  assert.ok(hi - lo > 0.05, `in folds, not a plane (${(hi - lo).toFixed(2)} m of relief)`);
  console.log(`  canvas: ${tb.max.y.toFixed(2)} m -> ${ctop.toFixed(2)} m (a body ${rtop.toFixed(2)} m), dragged ${drag.toFixed(2)} m, folds ${(hi - lo).toFixed(2)} m`);
}

// the presentation over a pool of one jeep
function poolOf(geometry, broken) {
  const material = new THREE.MeshStandardMaterial();
  const imI = new THREE.InstancedMesh(geometry, material, 1);
  imI.setMatrixAt(0, new THREE.Matrix4());
  imI.setColorAt(0, new THREE.Color(0.2, 0.5, 0.3));
  const imB = broken ? new THREE.InstancedMesh(broken, material, 1) : null;
  if (imB) { imB.count = 0; imB.setColorAt(0, new THREE.Color(0.4, 0.4, 0.4)); }
  return { mats4: [new THREE.Matrix4()], imI, imB };
}
function setup(broken = null, burns = false) {
  const group = new THREE.Group();
  const record = { kind: 'jeep', x: 0, y: 0, z: 0, r: 2.1, slot: 0, state: 0 };
  const pool = poolOf(jeep, broken);
  const burnt = [];
  const press = createPropCrushPresentation({ group, records: [record], poolOf: () => pool, near: (a, b2, c, d, out) => { out.length = 0; out.push(0); return out; },
    eligible: () => true, burns: () => burns, onBurn: (x, y, z, h) => burnt.push([x, y, z, h]) });
  return { group, record, pool, press, burnt };
}
const slotScale = (im, i) => { const m = new THREE.Matrix4(); im.getMatrixAt(i, m); return new THREE.Vector3().setFromMatrixScale(m).x; };
{
  const { group, record, pool, press } = setup();
  // the hull comes from -z along +z (yaw 0) and stops short: no copy yet
  press.pressHull(0, -(hl + HL + 1.5), 0, HL, HW);
  assert.equal(press.stats().copies, 0, 'no copy before the hull meets it');
  // its front a third of a metre short of the jeep's tail: the band ahead of its glacis meets it
  press.pressHull(0, -(hl + HL + 0.3), 0, HL, HW);
  assert.equal(press.stats().copies, 1, 'the copy appears at contact');
  assert.equal(slotScale(pool.imI, 0), 0, 'the pool\'s slot hidden');
  const copy = group.children.find((m) => m.name === 'crush-jeep');
  const c = new THREE.Color();
  copy.getColorAt(0, c);
  assert.ok(Math.abs(c.g - 0.5) < 1e-6, 'it keeps its livery (no burnt swap)');
  // the simulation's crush event: drawn by the press, nothing swapped
  record.state = 1;
  assert.equal(press.takes(0, 'ram', 0, 1, false), true, 'the sim\'s crush finds it pressed: no swap');
  for (let s = -(hl + HL); s < hl + HL; s += V * DT) { press.pressHull(0, s, 0, HL, HW); press.step(DT); }
  for (let i = 0; i < 40; i++) press.step(DT);
  copy.geometry.computeBoundingBox();
  assert.ok(copy.geometry.boundingBox.max.y < 0.5, `run over, it lies flat (${copy.geometry.boundingBox.max.y.toFixed(2)} m)`);
  assert.equal(press.stats().frozen, 1, 'and is frozen');
  press.reset();
  assert.equal(group.children.length, 0, 'reset: the copy gone');
  assert.equal(slotScale(pool.imI, 0), 1, 'and the slot stands again');
}
{
  // a crush the press never saw: a sweep along the event (live), and at once when settled; the Studio's off
  const live = setup();
  live.record.state = 1;
  assert.equal(live.press.takes(0, 'ram', 0, 1, false), true, 'a crush the press never saw is drawn by a sweep');
  for (let i = 0; i < 40; i++) live.press.step(DT);
  const lc = live.group.children[0];
  lc.geometry.computeBoundingBox();
  assert.ok(lc.geometry.boundingBox.max.y < 0.5, `the sweep flattens it (${lc.geometry.boundingBox.max.y.toFixed(2)} m)`);
  const settled = setup();
  settled.record.state = 1;
  settled.press.takes(0, 'ram', 1, 0, true);
  settled.press.step(0);
  const sc = settled.group.children[0];
  sc.geometry.computeBoundingBox();
  assert.ok(sc.geometry.boundingBox.max.y < 0.5, `settled: flat at once (${sc.geometry.boundingBox.max.y.toFixed(2)} m)`);
  const studio = setup();
  studio.press.setSweeps(false);
  studio.record.state = 1;
  studio.press.takes(0, 'ram', 0, 1, false);
  for (let i = 0; i < 40; i++) studio.press.step(DT);
  const st = studio.group.children[0];
  st.geometry.computeBoundingBox();
  assert.ok(st.geometry.boundingBox.max.y > top - 0.05, 'the Studio\'s crush waits for its hulls\' presses (no sweep)');
  // a shell's destruction is not the press's (the burn is the pool's) unless the prop was pressed already
  const shot = setup();
  assert.equal(shot.press.takes(0, 'shell', 0, 1, false), false, 'a shell\'s destruction with no press is the pool\'s');
}
{
  // a heap broken earlier (its broken slot 0): a hull pressing it later draws it from there and flattens it further
  const heap = jeep.clone();
  const { group, record, pool, press } = setup(heap);
  record.state = 1; record._bi = 0;
  pool.imB.count = 1;
  pool.imB.setMatrixAt(0, new THREE.Matrix4());
  for (let s = -(hl + HL); s < hl + HL; s += V * DT) { press.pressHull(0, s, 0, HL, HW); press.step(DT); }
  assert.equal(slotScale(pool.imB, 0), 0, 'the broken slot hidden');
  const copy = group.children[0];
  copy.getColorAt(0, new THREE.Color());
  copy.geometry.computeBoundingBox();
  assert.ok(copy.geometry.boundingBox.max.y < 0.5, `the heap flattened where the tracks crossed it (${copy.geometry.boundingBox.max.y.toFixed(2)} m)`);
  assert.equal(slotScale(pool.imI, 0), 1, 'its intact slot untouched (the broken one stood in for it)');
}
{
  // a near miss (wave 351): the glass goes, the side facing the burst dents, it is shoved off and settles — the same twice
  const run = () => {
    const { group, press } = setup(null, true);
    press.blast(0, -4, 0.6, 0, 0.8);
    for (let i = 0; i < 70; i++) press.step(DT);
    return group.children[0];
  };
  const one = run(), two = run();
  assert.ok(one, 'a near miss makes the copy');
  const ix = one.geometry.index.array;
  let collapsed = 0;
  for (let k = 0; k < ix.length; k += 3) if (ix[k] === ix[k + 1] && ix[k] === ix[k + 2]) collapsed++;
  assert.ok(collapsed > 10, `its glass blown out (${collapsed} triangles)`);
  const pos = one.geometry.getAttribute('position').array;
  let dented = 0;
  for (let v = 0; v < pos.length; v += 3) if (rest[v] < -hw * 0.6 && pos[v] > rest[v] + 0.02) dented++;
  assert.ok(dented > 20, `the side facing the burst dented in (${dented} points)`);
  const m = new THREE.Matrix4();
  one.getMatrixAt(0, m);
  const at = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(at.x > 0.3 && at.x < 0.8 && Math.abs(at.y) < 1e-3, `shoved off the burst and settled on the ground (${at.x.toFixed(2)}, ${at.y.toFixed(3)})`);
  const m2 = new THREE.Matrix4();
  two.getMatrixAt(0, m2);
  assert.deepEqual(m2.elements, m.elements, 'the same near miss shoves it the same');
  console.log(`  near miss: ${collapsed} glass triangles out, ${dented} points dented, shoved ${at.x.toFixed(2)} m`);
}
{
  // a round's kill on a vehicle: it burns — the fire raised once, the paint chars over seconds (no flip), it settles
  const { group, record, press, burnt, pool } = setup(null, true);
  record.state = 1;
  assert.equal(press.takes(0, 'shell', 1, 0, false), true, 'a round\'s kill on a vehicle is the press\'s (it burns)');
  assert.equal(burnt.length, 1, 'its fire raised once');
  const copy = group.children[0];
  const c = new THREE.Color();
  copy.getColorAt(0, c);
  assert.ok(Math.abs(c.g - 0.5) < 1e-6, 'at the kill it still wears its paint');
  for (let i = 0; i < 60 * 2.5; i++) press.step(DT);
  copy.getColorAt(0, c);
  assert.ok(c.g < 0.5 && c.g > 0.08, `it chars over seconds (green ${c.g.toFixed(3)} at 2.5 s)`);
  for (let i = 0; i < 60 * 4; i++) press.step(DT);
  copy.getColorAt(0, c);
  assert.ok(c.g < 0.07, `charred by the end (green ${c.g.toFixed(3)})`);
  const m = new THREE.Matrix4();
  copy.getMatrixAt(0, m);
  assert.ok(Math.abs(new THREE.Vector3().setFromMatrixPosition(m).y + 0.12) < 1e-3, 'settled onto its rims');
  assert.ok(pool.imB === null, 'no broken pool needed');
  // settled (a late joiner): charred at once, no fire raised
  const late = setup(null, true);
  late.record.state = 1;
  late.press.takes(0, 'shell', 1, 0, true);
  late.press.step(0);
  late.group.children[0].getColorAt(0, c);
  assert.ok(c.g < 0.07 && late.burnt.length === 0, 'settled: charred at once, no fire');
}
// heavy plant (Lane C, 2026-10-15; the owner: "destroyed vehicles must crumple"): a D8H's field carries its kind's floor
// (setPieceDestructibles.ts SET_PIECE_MASS.floor, the type's crushFloor). A hull crossing it presses it no lower than
// that share of its height, its upper works rack over along the travel and its panels buckle; the same crossing crushes it
// the same; the presentation shoves it off the hull's line, once
{
  const { SET_PIECE_MASS, setPieceDestructibleTypes } = await import('./maps/setPieceDestructibles.ts');
  const type = setPieceDestructibleTypes().setpiece_d8h;
  assert.equal(type.crushFloor, SET_PIECE_MASS.d8h.floor, 'the type carries its kind\'s floor');
  const dozer = type.build(rng);
  dozer.computeBoundingBox();
  const db = dozer.boundingBox, dhw = Math.max(-db.min.x, db.max.x), dhl = Math.max(-db.min.z, db.max.z), dtop = db.max.y;
  const drest = dozer.getAttribute('position').array;
  const run = () => {
    const f = createCrushField(dhw, dhl, dtop, undefined, false, type.crushFloor);
    const out = new Float32Array(drest.length);
    for (let s = -(dhl + HL + 2); s < dhl + HL + 1; s += V * DT) {
      if (!hullMeetsBox(0, s, 0, 1, HL, HW, dhw, dhl)) continue;
      pressField(f, 0, s, 0, 1, HL, HW);
    }
    deformPositions(f, drest, out);
    return out;
  };
  const one = run(), two = run();
  assert.deepEqual(Array.from(two), Array.from(one), 'the same crossing crushes the dozer the same');
  let hi = 0, lean = 0, n = 0, wave = 0;
  for (let v = 0; v < one.length; v += 3) {
    hi = Math.max(hi, one[v + 1]);
    if (drest[v + 1] > dtop * 0.7) { lean += one[v + 2] - drest[v + 2]; n++; }
    wave = Math.max(wave, Math.abs(one[v] - drest[v]));
  }
  lean /= Math.max(1, n);
  assert.ok(hi > dtop * type.crushFloor * 0.95, `it keeps its floor (${dtop.toFixed(2)} m -> ${hi.toFixed(2)} m, floor ${(dtop * type.crushFloor).toFixed(2)} m)`);
  assert.ok(hi < dtop * 0.9, `and is crushed down from its top (${hi.toFixed(2)} m)`);
  assert.ok(lean > 0.1, `its upper works rack over along the travel (${lean.toFixed(2)} m)`);
  assert.ok(wave > 0.05, `its panels buckle (${wave.toFixed(2)} m)`);
  // the presentation: shoved off the hull's line once, then its frame follows it
  const group = new THREE.Group();
  const record = { kind: 'setpiece_d8h', x: 0, y: 0, z: 0, r: 3, slot: 0, state: 0 };
  const pool = { ...poolOf(dozer, null), meta: type };
  const press = createPropCrushPresentation({ group, records: [record], poolOf: () => pool, near: (a, b2, c, d, o) => { o.length = 0; o.push(0); return o; },
    eligible: () => true });
  for (let s = -(dhl + HL + 1); s < dhl + HL; s += V * DT) { press.pressHull(0, s, 0, HL, HW); press.step(DT); }
  for (let i = 0; i < 90; i++) press.step(DT);
  const copy = group.children[0], m = new THREE.Matrix4();
  copy.getMatrixAt(0, m);
  const at = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(Math.abs(at.x) > HW + 0.5, `shoved off the hull's line (${at.x.toFixed(2)} m aside)`);
  console.log(`  heavy plant: D8H ${dtop.toFixed(2)} m -> ${hi.toFixed(2)} m (floor ${type.crushFloor}), racked ${lean.toFixed(2)} m, buckled ${wave.toFixed(2)} m, shoved ${at.x.toFixed(2)} m aside`);
}
// map cars (the car-wreck lane, 2026-10-20; Steinburg r5's blind critics: a run-over Golf "flattened into a wavy tarp-like
// sheet with no readable wheels, arches or roofline"): a car's field carries its anatomy, read from its own geometry. A hull
// crossing it leaves its belly's clearance between the tracks and presses it to the floor under them; what stands over a
// cap is pressed in order (the roof stays over the doors), its footprint kept; its wheels splay and are never squashed into
// the heap; it never rises again, and the same crossing crushes it the same. The presentation bursts its glass at the crush
// (no triangle more or less), and a round's kill buckles it as it burns, burns its tyres to the rims and blackens it.
{
  const golf = civilianVehicleTypes('urban', false).sedan.build(rng);
  golf.computeBoundingBox();
  const gb = golf.boundingBox, ghw = Math.max(-gb.min.x, gb.max.x), ghl = Math.max(-gb.min.z, gb.max.z), gtop = gb.max.y;
  const grest = golf.getAttribute('position').array, gsurf = golf.getAttribute('surf').array;
  const an = vehicleAnatomy(grest, gsurf, 255, gtop, ghw);
  assert.ok(an.belt > gtop * 0.45 && an.belt < gtop * 0.75, `its belt line is its glass's foot (${an.belt.toFixed(2)} m of ${gtop.toFixed(2)} m)`);
  const wheels = [];
  for (let k = 0; k < an.wheels.length; k += 6) wheels.push(Array.from(an.wheels.slice(k, k + 6)));
  assert.equal(wheels.length, 4, `its four wheels found (${wheels.length})`);
  assert.equal(wheels.filter((w) => w[5] < 0).length, 2, 'two a side');
  for (const [zc, yc, r] of wheels) assert.ok(r > 0.2 && r < 0.4 && Math.abs(yc - r) < 1e-6 && Math.abs(zc) > 0.8 && Math.abs(zc) < ghl, `a wheel at its axle (z ${zc.toFixed(2)}, r ${r.toFixed(2)})`);
  const cross = () => {
    const f = createCrushField(ghw, ghl, gtop, undefined, false, 0, an);
    const out = new Float32Array(grest.length), prev = new Float32Array(grest.length).fill(Infinity);
    let rose = 0, belly = 0, track = 0;
    for (let s = -(ghw + HL + 2); s < ghw + HL + 1; s += V * DT) {
      if (!hullMeetsBox(s, 0, 1, 0, HL, HW, ghw, ghl)) continue;
      pressField(f, s, 0, 1, 0, HL, HW);
      deformPositions(f, grest, out);
      for (let v = 0; v < out.length; v += 3) {
        // (a splaying wheel turns about its foot, its inner rim lifting: the body's points only)
        if (an.wheelOf[v / 3] < 0 && out[v + 1] > prev[v + 1]) rose = Math.max(rose, out[v + 1] - prev[v + 1]);
        prev[v + 1] = out[v + 1];
        // under the hull behind its front ramp: between the tracks, and under them (the hull runs along x: across it is z)
        const u = out[v] - s, w = Math.abs(out[v + 2]);
        if (u > HL - 1.2 || u < -HL + 0.3 || an.wheelOf[v / 3] >= 0) continue;
        if (w < HW * 0.66 - 0.25) belly = Math.max(belly, out[v + 1]);
        else if (w > HW * 0.66 + 0.15 && w < HW - 0.1) track = Math.max(track, out[v + 1]);
      }
    }
    return { out, rose, belly, track };
  };
  const one = cross(), two = cross();
  assert.deepEqual(Array.from(two.out), Array.from(one.out), 'the same crossing crushes the car the same');
  assert.ok(one.rose < 0.015, `no point of its body rises again by more than its creases deepen (${one.rose.toFixed(4)} m)`);
  assert.ok(one.belly < 0.7 && one.belly > 0.47, `between the tracks it keeps the belly's clearance and no more (${one.belly.toFixed(2)} m)`);
  assert.ok(one.track < 0.45, `under the tracks it is pressed down (${one.track.toFixed(2)} m)`);
  // the roof stays over the doors: the greenhouse's top over the belt line's points, on average, where both stand
  let roofY = 0, roofN = 0, beltY = 0, beltN = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, rx0 = Infinity, rx1 = -Infinity;
  for (let v = 0; v < grest.length; v += 3) {
    const y = grest[v + 1];
    if (Math.abs(grest[v + 2]) < 0.6 && an.wheelOf[v / 3] < 0) {
      if (y > an.belt + 0.7 * (gtop - an.belt)) { roofY += one.out[v + 1]; roofN++; }
      else if (y > an.belt - 0.12 && y < an.belt) { beltY += one.out[v + 1]; beltN++; }
    }
    x0 = Math.min(x0, one.out[v]); x1 = Math.max(x1, one.out[v]); z0 = Math.min(z0, one.out[v + 2]); z1 = Math.max(z1, one.out[v + 2]);
    rx0 = Math.min(rx0, grest[v]); rx1 = Math.max(rx1, grest[v]);
  }
  roofY /= Math.max(1, roofN); beltY /= Math.max(1, beltN);
  assert.ok(roofY > beltY, `the roof stays over the doors (${roofY.toFixed(2)} m over ${beltY.toFixed(2)} m)`);
  assert.ok(x1 - x0 > (rx1 - rx0) * 0.95 && z1 - z0 > ghl * 2 * 0.9, `its footprint kept (${(x1 - x0).toFixed(2)} x ${(z1 - z0).toFixed(2)} m)`);
  // the wheels stand out of the heap and splay outward
  for (let k = 0; k < wheels.length; k++) {
    let hi = 0, out0 = 0, out1 = 0, n = 0;
    for (let v = 0; v < grest.length; v += 3) {
      if (an.wheelOf[v / 3] !== k) continue;
      hi = Math.max(hi, one.out[v + 1]); out0 += Math.abs(grest[v]); out1 += Math.abs(one.out[v]); n++;
    }
    assert.ok(n > 50 && hi > 0.2, `wheel ${k} stands out of the heap (${hi.toFixed(2)} m, ${n} points)`);
    assert.ok(out1 >= out0 - 1e-6, `wheel ${k} splays out, never in`);
  }
  // the presentation: the glass bursts at the crush, no triangle more or less; a round's kill buckles, burns and blackens it
  const rig = (vehicle) => {
    const group = new THREE.Group();
    const record = { kind: 'sedan', x: 0, y: 0, z: 0, r: 2.3, slot: 0, state: 0 };
    const pool = poolOf(golf, null);
    const press = createPropCrushPresentation({ group, records: [record], poolOf: () => pool, near: (a, b2, c, d, o) => { o.length = 0; o.push(0); return o; },
      eligible: () => true, burns: () => true, vehicle: () => vehicle, onBurn: () => {} });
    return { group, record, press };
  };
  const crushed = rig(true);
  crushed.record.state = 1;
  crushed.press.takes(0, 'ram', 1, 0, false);
  for (let i = 0; i < 60; i++) crushed.press.step(DT);
  const cc = crushed.group.children[0], cix = cc.geometry.index.array;
  let burst = 0;
  for (let k = 0; k < cix.length; k += 3) if (cix[k] === cix[k + 1] && cix[k] === cix[k + 2]) burst++;
  assert.ok(burst > 40, `a crushed car's glass bursts (${burst} triangles)`);
  assert.equal(cix.length, golf.index.count, 'and it draws no triangle more or less');
  cc.geometry.computeBoundingBox();
  const sweptTop = cc.geometry.boundingBox.max.y;
  assert.ok(sweptTop > 0.47 && sweptTop < 0.8, `an unseen ram sweeps a tank's belly over it, not a pancake (${sweptTop.toFixed(2)} m)`);
  const shot = rig(true);
  shot.record.state = 1;
  shot.press.takes(0, 'shell', 1, 0, false);
  const sc = shot.group.children[0], scol = sc.geometry.getAttribute('color').array, spos = sc.geometry.getAttribute('position').array;
  const paintLum = () => {
    let l = 0, n = 0;
    for (let v = 0; v < gsurf.length; v += 3) if (gsurf[v + 2] > 200) { l += 0.2126 * scol[v] + 0.7152 * scol[v + 1] + 0.0722 * scol[v + 2]; n++; }
    return l / n;
  };
  const lum0 = paintLum();
  shot.press.step(DT);
  sc.geometry.computeBoundingBox();
  const killTop = sc.geometry.boundingBox.max.y;
  assert.ok(killTop < gtop - 0.01, `the kill buckles it at once (${gtop.toFixed(2)} m -> ${killTop.toFixed(2)} m)`);
  for (let i = 0; i < 60 * 7; i++) shot.press.step(DT);
  sc.geometry.computeBoundingBox();
  const burntTop = sc.geometry.boundingBox.max.y, lum1 = paintLum();
  assert.ok(burntTop < killTop - 0.03, `and more as it burns (${burntTop.toFixed(2)} m)`);
  assert.ok(lum1 < lum0 * 0.2 && lum1 < 0.07, `its paint blackened (${lum0.toFixed(3)} -> ${lum1.toFixed(3)})`);
  let tyre = 0;
  for (let v = 0; v < grest.length; v += 3) {
    const k = an.wheelOf[v / 3];
    if (k < 0 || gsurf[v] < 0.8 * 255 || gsurf[v + 1] > 13 || gsurf[v + 2] > 13) continue;
    tyre = Math.max(tyre, Math.hypot(spos[v + 2] - wheels[k][0], spos[v + 1] - (wheels[k][1] - wheels[k][2] * 0.28)) / wheels[k][2]);
  }
  assert.ok(tyre < 0.75, `its tyres burnt to the rims (${tyre.toFixed(2)} of a radius)`);
  const m = new THREE.Matrix4();
  sc.getMatrixAt(0, m);
  assert.ok(Math.abs(new THREE.Vector3().setFromMatrixPosition(m).y) < 1e-6, 'its settle is in its own rest (the placement stays)');
  const lateBurn = rig(true);
  lateBurn.record.state = 1;
  lateBurn.press.takes(0, 'shell', 1, 0, true);
  lateBurn.press.step(0);
  const lb = lateBurn.group.children[0];
  lb.geometry.computeBoundingBox();
  assert.ok(Math.abs(lb.geometry.boundingBox.max.y - burntTop) < 0.02, 'settled: burnt out at once');
  console.log(`  map car: Golf ${gtop.toFixed(2)} m, belt ${an.belt.toFixed(2)} m, ${wheels.length} wheels; crossed: belly ${one.belly.toFixed(2)} m, tracks ${one.track.toFixed(2)} m, `
    + `roof ${roofY.toFixed(2)} m over the belt's ${beltY.toFixed(2)} m; swept ${sweptTop.toFixed(2)} m, ${burst} glass triangles out; `
    + `shot ${gtop.toFixed(2)} -> ${killTop.toFixed(2)} -> ${burntTop.toFixed(2)} m, paint ${lum0.toFixed(3)} -> ${lum1.toFixed(3)}, tyres ${tyre.toFixed(2)} r`);
}
console.log('propCrush: a vehicle gives at contact and pancakes under the tracks, never rising, the same twice; the far side of a clip stands; '
  + 'the copy keeps its livery, the sim\'s crush swaps nothing, unseen crushes sweep (not in the Studio), heaps flatten again; heavy plant keeps its floor, racks, buckles and is shoved aside; a map car keeps its belly\'s clearance, its roof over its doors, its footprint and its wheels, bursts its glass, and buckles, blackens and burns to its rims when shot PASS');
