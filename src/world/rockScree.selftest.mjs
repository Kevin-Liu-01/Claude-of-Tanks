// b46, the treescn lane (2026-10-09; the critics on Reservoir's and Saltwind's boulders, wave 287, and on Redrock's,
// waves 282-325: "smooth blobs", "no burial or fracture", "no talus or block apron", "the boulders need to sit in the
// earth ... with scattered clasts"; the owner's maps to raise: Glacier Pass, Obsidian Caldera, Titan Gorge, Copper Mesa,
// Redrock). The scree at a boulder's foot and the stones it asks of those maps. A construction receipt:
// 1. the clast (rockDressing.ts buildScreeClast): twenty flat facets, every one facing out, its fracture planes' breaks,
//    flattened, about unit size, the boulders' painted facts — a function of its seed;
// 2. the table: the maps to raise break their stones (angular) and strew their scree; Reservoir and Saltwind (b46) their
//    scree; every other map none — the owner's light-touch maps' stones as they were;
// 3. the producer: the props' own bed builder (sliced from props.ts) strews a stone's scree round its foot on its own
//    stream — outside the stone's section, half sunk into the ground, more down the fall line, none on the road core —
//    as the boulders' own material draws it, on the desktop only, casting nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { terrainNearMeshHeightAt } from './terrain.ts';
import {
  boulderSectionRadius, boulderSections, buildScreeClast, paintBoulder, rockAngularityFor, rockDressingFor, rockLithologyFor,
} from './rockDressing.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 1. the clast
for (const lithology of ['gneiss', 'basalt', 'sandstone', 'karst', 'greywacke']) {
  for (let s = 0; s < 6; s++) {
    const form = buildScreeClast(mulberry32(900 + s), lithology), g = form.geometry, p = g.attributes.position, n = g.attributes.normal;
    assert.equal(p.count, 60, `${lithology} ${s}: twenty flat facets`);
    assert.ok(g.getAttribute('aRockFace') && !g.index, `${lithology} ${s}: the boulders' facts, flat-shaded`);
    let freshFacets = 0, maxR = 0, minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (let f = 0; f < 20; f++) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { const v = f * 3 + k; cx += p.getX(v) / 3; cy += p.getY(v) / 3; cz += p.getZ(v) / 3; }
      const v = f * 3;
      assert.ok(n.getX(v) * cx + n.getY(v) * cy + n.getZ(v) * cz > 0, `${lithology} ${s}: facet ${f} faces out`);
      if (form.fresh[v] === 1) freshFacets++;
    }
    for (let v = 0; v < p.count; v++) {
      maxR = Math.max(maxR, Math.hypot(p.getX(v), p.getY(v), p.getZ(v)));
      minY = Math.min(minY, p.getY(v)); maxY = Math.max(maxY, p.getY(v)); minX = Math.min(minX, p.getX(v)); maxX = Math.max(maxX, p.getX(v));
    }
    assert.ok(freshFacets >= 1, `${lithology} ${s}: a fracture plane's fresh break (${freshFacets} facets)`);
    assert.ok(maxR <= 1.3 && maxR >= 0.6, `${lithology} ${s}: about unit size (${maxR.toFixed(2)})`);
    assert.ok(maxY - minY < 0.9 * (maxX - minX), `${lithology} ${s}: lower than it is broad (a chip, a slab)`);
    paintBoulder(form, null, lithology);
    assert.equal(g.getAttribute('color').count, 60, `${lithology} ${s}: painted as the map's stone`);
    const again = buildScreeClast(mulberry32(900 + s), lithology).geometry.attributes.position.array;
    assert.deepEqual(Array.from(again), Array.from(p.array), `${lithology} ${s}: a function of its seed`);
  }
}

// 2. the table
for (const mapId of ['alpine', 'caldera', 'titan_gorge', 'copper_mesa', 'badlands']) {
  const d = rockDressingFor(mapId, null);
  assert.ok(d.scree >= 0.85, `${mapId}: a full scree at its stones' feet (${d.scree})`);
  assert.ok(rockAngularityFor(mapId) >= 0.6, `${mapId}: its stones fresh-broken`);
}
assert.ok(rockDressingFor('caldera', null).bedLip > 1.5, 'the caldera\'s blocks half buried in the ash soil');
assert.ok(rockDressingFor('alpine', null).mossNorth === 1, 'Glacier Pass: its moss on the shaded side');
for (const mapId of ['reservoir', 'saltwind']) assert.ok(rockDressingFor(mapId, null).scree > 0.3, `${mapId}: b46's rubble`);
// the owner's light-touch maps (2026-10-09: winter, Saltwind and Reservoir judged in the wave, railyard, Verdant, coastal,
// desert, Frontier, fjord) and every map not asked: no scree, their stones' angularity as it was
for (const mapId of ['verdant', 'winter', 'railyard', 'coastal', 'desert', 'frontier', 'fjord', 'autumn', 'monsoon', 'oasis', 'whiteout', 'mars']) {
  assert.equal(rockDressingFor(mapId, null).scree, 0, `${mapId}: no scree`);
  assert.equal(rockAngularityFor(mapId), 0, `${mapId}: its stones as they were`);
}

// 3. the producer
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
{
  const at = source.indexOf('  function* buildRockBeds(): Generator<PropsBuildSlice, THREE.BufferGeometry[], void> {');
  const end = source.indexOf('  // the scenery lane (wave 57, "a ruler-straight base line on the grass with no soil collar")', at);
  assert.ok(at > 0 && end > at, 'the beds\' builder');
  const cellSrc = stripTypeScriptTypes(/  const BED_CELL_M = \d+;\n  const bedCellKey = [^\n]*\n/.exec(source)[0]);
  const shareSrc = source.slice(source.indexOf('  function contactShare(rho: number): number {'));
  assert.ok(/const screeGeos: THREE\.BufferGeometry\[\] = \[\];\n  function\* buildRockBeds/.test(source), 'the scree\'s list beside the builder');
  // a straight-sided stone a metre in radius at scale 1.6 on ground falling to +x (one in ten), the road core at x > 40
  const build = (scree, slope, roadFrom = Infinity) => {
    const form = { geometry: new THREE.CylinderGeometry(1, 1, 2, 48, 12) };
    const ground = (x) => -slope * (x - 10);
    const placement = new THREE.Matrix4().compose(new THREE.Vector3(10, ground(10) - 0.22 * 1.6, 20), new THREE.Quaternion(), new THREE.Vector3(1.6, 1.6, 1.6));
    const rockPlacements = [[placement], [], []], rockGeos = [form.geometry, form.geometry, form.geometry];
    const field = { getHeightAt: (x) => ground(x) };
    const screeGeos = [];
    const fn = new Function('THREE', 'terrainNearMeshHeightAt', 'heightField', 'nearMeshVertexHeight', 'cfg', 'rockDressing', 'snowCap', 'rockGeos',
      'rockPlacements', 'rockClutter', 'boulderSections', 'boulderSectionRadius', 'rockContact', 'rockSpotOf', 'rockBedShades', 'contactShare',
      'screeGeos', 'buildScreeClast', 'paintBoulder', 'rockLithologyFor', 'mapId', 'seed', 'mulberry32', 'P', 'discClearOfRoadCore',
      `${cellSrc}\n${stripTypeScriptTypes(source.slice(at, end))}\nreturn buildRockBeds;`)(THREE, terrainNearMeshHeightAt, field,
      (px, pz) => field.getHeightAt(px, pz), { splat: { rippleDir: [1, 0] } }, { dust: 0, bedLip: 1, scree }, false, rockGeos, rockPlacements,
      new Map(), boulderSections, boulderSectionRadius, false, new Map(), [], () => 0,
      screeGeos, buildScreeClast, paintBoulder, rockLithologyFor, 'alpine', 1337, mulberry32, { rockTone: null },
      (_f, x, _z, r) => x + r < roadFrom);
    const it = fn();
    let r = it.next();
    while (!r.done) r = it.next();
    return { screeGeos, form, ground };
  };
  assert.ok(shareSrc.length > 0);
  assert.equal(build(0, 0).screeGeos.length, 0, 'no scree where the map asks for none');
  const flat = build(1, 0), fall = build(1, 0.1);
  for (const [label, { screeGeos, form, ground }] of [['flat ground', flat], ['a fall line', fall]]) {
    assert.equal(screeGeos.length, 1, `${label}: one cell's geometry`);
    const g = screeGeos[0], p = g.attributes.position, sections = boulderSections(form.geometry);
    for (const name of ['normal', 'color', 'aRockFace', 'aRockGround']) assert.ok(g.getAttribute(name), `${label}: the boulders' ${name}`);
    const clasts = p.count / 60;
    assert.ok(clasts >= 6 && clasts <= 11, `${label}: a stone's apron (${clasts} clasts)`);
    let downhill = 0;
    for (let c = 0; c < clasts; c++) {
      let cx = 0, cz = 0, lo = Infinity, hi = -Infinity;
      for (let v = c * 60; v < c * 60 + 60; v++) { cx += p.getX(v) / 60; cz += p.getZ(v) / 60; lo = Math.min(lo, p.getY(v)); hi = Math.max(hi, p.getY(v)); }
      const gy = g.getAttribute('aRockGround').getX(c * 60), d = Math.hypot(cx - 10, cz - 20);
      const foot = boulderSectionRadius(sections, (gy - (ground(10) - 0.22 * 1.6)) / 1.6, Math.atan2(cz - 20, cx - 10)) * 1.6;
      assert.ok(d >= foot * 0.8, `${label} clast ${c}: outside the stone (${d.toFixed(2)} m, its foot ${foot.toFixed(2)} m)`);
      assert.ok(d <= foot + 3.2, `${label} clast ${c}: within its apron (${d.toFixed(2)} m)`);
      assert.ok(Math.abs(gy - ground(cx)) < 0.25, `${label} clast ${c}: on the drawn ground under it`);
      assert.ok(lo < gy && hi > gy, `${label} clast ${c}: half sunk (${lo.toFixed(2)} .. ${hi.toFixed(2)} about ${gy.toFixed(2)})`);
      if (cx > 10) downhill++;
    }
    if (label === 'a fall line') assert.ok(downhill / clasts >= 0.6, `the scree crowds down the fall line (${downhill} of ${clasts})`);
  }
  // none on the road core
  const road = build(1, 0, 11);
  const rp = road.screeGeos[0]?.attributes.position;
  for (let v = 0; rp && v < rp.count; v += 60) {
    let cx = 0;
    for (let k = 0; k < 60; k++) cx += rp.getX(v + k) / 60;
    assert.ok(cx < 11, 'no clast on the road core');
  }
  // a function of its seat: the same stone, the same scree
  assert.deepEqual(Array.from(build(1, 0.1).screeGeos[0].attributes.position.array), Array.from(fall.screeGeos[0].attributes.position.array), 'the stone\'s own stream');
  const block = source.slice(source.indexOf('if (screeShare > 0 && meanR >= 0.45) {'), source.indexOf('const base = cell.pos.length / 3;', at));
  assert.ok(block.length > 0 && !/\brng\(\)|\bdraw\(\)/.test(block), 'no draw of the map\'s stream');
}
// the desktop alone, the boulders' material, casting nothing
assert.match(source, /if \(!mobileProps\) group\.userData\.rockBeds = yield\* buildRockBeds\(\);\n[\s\S]{0,200}for \(const geometry of screeGeos\) \{\n\s*const mesh = new THREE\.Mesh\(geometry, mats\.rock\);/,
  'the scree beside the beds (the phones build neither), drawn with the boulders\' own material');
assert.match(source, /mesh\.name = 'rock-scree';\n\s*mesh\.castShadow = false;/, 'casting nothing');
// (and the phones' colliders take the map's angularity, as the desktop form does: every host derives the same)
assert.match(source, /\? buildBoulderForm\(vi, noi, mulberry32\(seed \+ 60 \+ vi\), hull, 6, legacyTop, boulderKindFor\(lithology, vi\), lithology, angular\)\.geometry/,
  'the phones\' collision form with the map\'s angularity');
console.log('rockScree selftest: OK');
