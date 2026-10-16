// Release 227 (owner 2026-10-16: "for our turret upghrades, it should be a brand new era packages for both though,
// donnt make it just copy the t90ms. innovate for the hetman 2 and zubr 2 and also the zubr. also make thhe zubr 2 and
// zubr autocannons into proper machine gun emplacements that are aut ocontrolled"): the receipt of the three national
// frontal ERA packages (profiles/ukraineFrontEra.ts, profiles/polandFrontEra.ts, profiles/eraModuleKit.ts), their
// special lights and the Zubrs' WKM-B emplacements. For Hetman II, Zubr and Zubr II at HIGH and LOW:
//   - the six gameplay ERA sectors and every new module bound to one, by side; every module seated within 6 mm of
//     permanent stock; live, spent and reset ERA with the permanent carriers kept;
//   - the working envelopes: the main gun at every legal pitch of 1-degree yaw steps (recoil 0 and -.135) clears every
//     new part, with 3 cm under the barrel over the front arc and 5 cm beside the mantlet; the rear-arc pitch curves
//     keep the gun 1.5 cm off all hull stock (HIGH); the driver's 9-degree sight plane, the mantlet's sweep box, the
//     turret ring (2.5 cm over the hull's own stock at every yaw, measured on the build), the smoke lines of fire, the
//     gunner's sight ray and the hatches' opening zones;
//   - no new part entering another existing (non-seat) part deeper than its 7 mm seat;
//   - every new lens: its night emitter registered, its aperture open for .5 m, recessed 4-26 mm in its housing and
//     lapping at least 4 mm into it; the light counts; the Zubr II's illuminator under its station's pitch stage,
//     its beam following yaw and pitch;
//   - drawn triangles and draws within the gatefix2 baseline (draws: Zubr +0, Zubr II +1 for the illuminator, Hetman II
//     +1 for its first hull glass: the field net opens only round Glass stock);
// and a deterministic Node case of both Zubrs' stations through src/sim/auxiliarySystems.ts: with no player input
// each slews to and fires at an enemy drone in range (counter-drone) and at a soft vehicle, holds fire on a main battle
// tank's front, stops at the B toggle, and repeats identically.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {frontEnvelope, mosaicLayout} from './profiles/eraModuleKit.ts';
import {minimumMechanicalGunPitch} from '../sim/gunPitchLimits.ts';
import {vehicleNightLightEmittersFor} from './vehicleNightLighting.ts';
import {NATIONAL_ROOF_LOADOUTS} from './nationalRoofConfig.ts';
import {auxiliaryWeaponProfile} from './auxiliaryWeapons.ts';
import {auxiliaryState, requestAuxiliary, stepRoofGun, auxiliaryShot} from '../sim/auxiliarySystems.ts';

const IDS = ['t72b3m_hetman_ii', 't72b3_zubr', 't72b3_zubr_ii'];
const SECTORS = ['glacis_era_L', 'glacis_era_R', 'skirt_era_L', 'skirt_era_R', 'turret_era_L', 'turret_era_R'];
/** New ERA modules per sector (both sides alike), as built. */
const MODULES = {
  t72b3m_hetman_ii: {glacis_era: 4, skirt_era: 1, turret_era: 11},
  t72b3_zubr: {glacis_era: 18, skirt_era: 10, turret_era: 18},
  t72b3_zubr_ii: {glacis_era: 15, skirt_era: 13, turret_era: 48},
};
/** The gatefix2 baseline (integ/226 c3cc76fa8, this receipt's census): drawn triangles HIGH/LOW and draws HIGH/LOW. */
const BASELINE = {
  t72b3m_hetman_ii: {tris: [146669, 110265], draws: [59, 55], extraDraws: 1},
  t72b3_zubr: {tris: [132458, 96242], draws: [60, 56], extraDraws: 0},
  t72b3_zubr_ii: {tris: [147729, 110249], draws: [59, 55], extraDraws: 1},
};
const LIGHTS = {t72b3m_hetman_ii: {headlights: 8, markers: 2}, t72b3_zubr: {headlights: 4}, t72b3_zubr_ii: {headlights: 11, markers: 4}};
/** Hatch opening zones: plan centre, radius (the lid's plus 30 cm), and the plane nothing new may stand above there. */
const HATCHES = {
  t72b3m_hetman_ii: {hull: [[-.079, 1.72, .674, 1.54]], turret: [[-.627, -.359, .74, .79], [.528, -.527, .63, .70]]},
  t72b3_zubr: {hull: [[0, 1.59, .59, 1.46]], turret: [[-.627, -.359, .74, .79], [.528, -.527, .63, .70]]},
  t72b3_zubr_ii: {hull: [[0, 1.59, .59, 1.46]], turret: [[-.627, -.359, .74, .79], [.528, -.527, .63, .70]]},
};
const SMOKE = [[1.16, 2.163, .085], [1.37, 2.129, .145], [1.58, 2.067, .199], [1.35, 1.994, .242], [1.56, 1.932, .296], [1.56, 1.82, .36]]
  .map(([x, y, z]) => new THREE.Vector3(x - .0000072471277, y - 1.52948397398, z - .1143146502203));
const SMOKE_AXIS = new THREE.Vector3(.31, .38, .872).normalize();
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------------------
// Pure layout

{
  const f1 = mosaicLayout(.948, .24, 2, .5, .09);
  assert.deepEqual([f1.filter(p => p.row === 0).length, f1.filter(p => p.row === 1).length], [4, 5], 'fitted brick bond: 4 + 5');
  const f2 = mosaicLayout(.648, .24, 2, .5, .09);
  assert.deepEqual([f2.filter(p => p.row === 0).length, f2.filter(p => p.row === 1).length], [3, 4], 'fitted brick bond: 3 + 4');
  for (const p of [...f1, ...f2]) assert(p.end - p.start >= .09 - 1e-9, 'no sliver tile');
  assert.equal(mosaicLayout(.20, .24, 1, 0, .25).length, 0, 'a piece under minPiece is dropped');
}

// ---------------------------------------------------------------------------------------------------------------------
// Triangle helpers

function trisOf(g, matrix) {
  const p = g.getAttribute('position'), ix = g.index, out = [];
  for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k));
    if (matrix) for (const q of v) q.applyMatrix4(matrix);
    const tri = new THREE.Triangle(...v);
    out.push({v, tri, plane: tri.getPlane(new THREE.Plane()), box: new THREE.Box3().setFromPoints(v)});
  }
  return out;
}
function intersects(a, b) {
  if (!a.box.intersectsBox(b.box)) return false;
  for (const [x, y] of [[a, b], [b, a]]) { const d = x.v.map(p => y.plane.distanceToPoint(p)); if (!(Math.min(...d) < -2e-5 && Math.max(...d) > 2e-5)) return false; }
  const pt = new THREE.Vector3();
  for (const [x, y] of [[a, b], [b, a]]) for (let i = 0; i < 3; i++) {
    const s = x.v[i], d = x.v[(i + 1) % 3].clone().sub(s), l = d.length();
    if (l > 2e-5 && new THREE.Ray(s, d.divideScalar(l)).intersectTriangle(y.tri.a, y.tri.b, y.tri.c, false, pt)
      && pt.distanceTo(s) > 2e-5 && pt.distanceTo(s) < l - 2e-5) return true;
  }
  return false;
}
/** A plan (x/z) grid of triangles. */
class Grid {
  constructor(tris, cell = .1) {
    this.cell = cell; this.map = new Map(); this.box = new THREE.Box3();
    for (const t of tris) {
      this.box.union(t.box);
      for (let i = Math.floor(t.box.min.x / cell); i <= Math.floor(t.box.max.x / cell); i++)
        for (let k = Math.floor(t.box.min.z / cell); k <= Math.floor(t.box.max.z / cell); k++) {
          const key = i * 100003 + k; let list = this.map.get(key); if (!list) this.map.set(key, list = []); list.push(t);
        }
    }
  }
  near(box) {
    const out = new Set(), c = this.cell;
    if (!box.intersectsBox(this.box)) return out;
    for (let i = Math.floor(box.min.x / c); i <= Math.floor(box.max.x / c); i++)
      for (let k = Math.floor(box.min.z / c); k <= Math.floor(box.max.z / c); k++) for (const t of this.map.get(i * 100003 + k) ?? []) out.add(t);
    return out;
  }
  hits(tris) {
    for (const a of tris) { if (!a.box.intersectsBox(this.box)) continue; for (const b of this.near(a.box)) if (intersects(a, b)) return [a, b]; }
    return null;
  }
  /** The highest triangle under a plan point (or -Infinity). */
  top(x, z) {
    let best = -Infinity;
    for (const t of this.map.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell)) ?? []) {
      const [a, b, c] = t.v, den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(den) < 1e-12) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den, w = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den;
      if (u >= -1e-9 && w >= -1e-9 && u + w <= 1 + 1e-9) best = Math.max(best, u * a.y + w * b.y + (1 - u - w) * c.y);
    }
    return best;
  }
}
const vertsOf = g => { const p = g.getAttribute('position'), out = []; for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i)); return out; };
const isShadow = o => o.userData.shadowOnly || o.userData.authoredShadowProxy || /^procShadow/.test(o.name);

// ---------------------------------------------------------------------------------------------------------------------
// Per vehicle

const report = {};
for (const id of IDS) for (const quality of ['high', 'low']) {
  const label = `${id}/${quality}`, high = quality === 'high';
  const fresh = [], stock = {hull: [], turret: []}, others = {hull: [], turret: []};
  const t = createTank(id, null, {proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242, partCensus(bucket, g) {
    const owner = bucket.startsWith('hull') ? 'hull' : bucket.startsWith('turret') ? 'turret' : null;
    if (!owner) return;
    const era = Object.hasOwn(g.userData, 'eraHitFaceVertexStarts');
    if (g.userData.frontEraPart) fresh.push({owner, bucket, g: g.clone(), name: g.userData.frontEraPart, sector: g.userData.frontEraSector,
      module: era && g.userData.eraHitFaceVertexStarts.length > 0, era, lamp: g.userData.frontEraLamp});
    else if (!/Glass|Cloth/.test(bucket)) others[owner].push({bucket, g: g.clone(), seat: bucket === owner || (bucket === `${owner}ExternalArmor` && !era)});
    if ((bucket === owner || bucket === `${owner}ExternalArmor`) && !era) stock[owner].push(g.clone());
  }});
  try {
    t.root.updateMatrixWorld(true);
    const spec = getSpec(id), env = frontEnvelope(id);
    const hullRig = t.root.getObjectByName('rig_hull'), turret = t.root.getObjectByName('rig_turret');
    const gun = t.root.getObjectByName('rig_gun'), recoil = t.root.getObjectByName('rig_recoil');
    const ringY = turret.position.y;
    const modules = fresh.filter(p => p.module);

    // sectors and module counts
    assert.deepEqual([...t.root.userData.eraClusterNames].sort(), [...SECTORS].sort(), `${label}: exactly the six ERA sectors`);
    for (const s of SECTORS) {
      const n = modules.filter(m => m.sector === s).length, want = MODULES[id][s.slice(0, -2)];
      assert.equal(n, want, `${label}: ${want} new modules in ${s} (${n})`);
      for (const m of modules.filter(m2 => m2.sector === s)) {
        m.g.computeBoundingBox(); const cx = (m.g.boundingBox.min.x + m.g.boundingBox.max.x) / 2;
        assert.equal(cx < 0 ? 'L' : 'R', s.slice(-1), `${label}: ${m.name} sits in the sector of its side`);
      }
    }
    assert(!fresh.some(p => p.era && p.owner === 'turret' && /gunMount/.test(p.bucket)), `${label}: no ERA on the gun mount`);

    // every module seated within 6 mm of permanent stock (its sunk base touches or enters the stock)
    for (const owner of ['hull', 'turret']) {
      const grid = new Grid(stock[owner].flatMap(g => trisOf(g)), .1), q = new THREE.Vector3();
      for (const m of modules.filter(p => p.owner === owner)) {
        let best = Infinity;
        for (const v of vertsOf(m.g)) {
          const box = new THREE.Box3(v.clone().subScalar(.02), v.clone().addScalar(.02));
          for (const tri of grid.near(box)) { tri.tri.closestPointToPoint(v, q); best = Math.min(best, q.distanceTo(v)); }
          if (best < 1e-4) break;
        }
        assert(best <= .006, `${label}: ${m.name} is seated on permanent stock (${best.toFixed(4)} m)`);
      }
    }

    // analytic envelopes over every new vertex
    const tan9 = Math.tan(9 * DEG), [dz, dy] = env.driver;
    let mins = {driver: Infinity, mantlet: Infinity, smoke: Infinity, sight: Infinity, hatch: Infinity};
    for (const p of fresh) {
      for (const v of vertsOf(p.g)) {
        if (p.owner === 'hull') {
          if (Math.abs(v.x) < .55 && v.z > dz) { const m = dy - tan9 * (v.z - dz) - v.y; mins.driver = Math.min(mins.driver, m); assert(m >= -1e-4, `${label}: ${p.name} blocks the driver's sight plane (${m.toFixed(4)})`); }
          for (const [hx, hz, r, plane] of HATCHES[id].hull) if (Math.hypot(v.x - hx, v.z - hz) < r) {
            mins.hatch = Math.min(mins.hatch, plane - v.y); assert(v.y <= plane - .01, `${label}: ${p.name} stands in the driver's hatch opening (${v.y.toFixed(3)})`); }
        } else {
          if (v.y > -.052 && v.y < .628 && v.z > .765 && v.z < 1.702) { mins.mantlet = Math.min(mins.mantlet, Math.abs(v.x) - .337);
            assert(Math.abs(v.x) >= .39 - 1e-4, `${label}: ${p.name} enters the mantlet's sweep (x ${v.x.toFixed(3)})`); }
          for (const s of SMOKE) { const d = v.clone().sub(s), tt = Math.max(0, d.dot(SMOKE_AXIS)), dist = d.addScaledVector(SMOKE_AXIS, -tt).length();
            mins.smoke = Math.min(mins.smoke, dist); assert(dist >= .10, `${label}: ${p.name} is ${dist.toFixed(3)} m from a smoke line of fire`); }
          if (v.x > .60 && v.x < .97 && v.z > .15) { const m = .80 - .176 * (v.z - .15) - v.y; mins.sight = Math.min(mins.sight, m);
            assert(m >= -1e-4, `${label}: ${p.name} enters the gunner's sight's lower ray (${m.toFixed(4)})`); }
          for (const [hx, hz, r, plane] of HATCHES[id].turret) if (Math.hypot(v.x - hx, v.z - hz) < r) {
            mins.hatch = Math.min(mins.hatch, plane - v.y); assert(v.y <= plane - .01, `${label}: ${p.name} stands in a cupola hatch's opening`); }
        }
      }
    }

    // the turret ring: new turret parts 2.5 cm over the hull's own stock at their radius over every yaw (measured), and
    // new hull parts 2.5 cm under the turret's lowest stock at theirs
    const hullStockTris = [];
    hullRig.traverse(o => { if (!o.isMesh || isShadow(o) || /ghillie|^gear/.test(o.name)) return;
      hullStockTris.push(...trisOf(o.geometry, new THREE.Matrix4().copy(hullRig.matrixWorld).invert().multiply(o.matrixWorld))); });
    const hullGrid = new Grid(hullStockTris, .1);
    const hullTop = new Map();
    for (let r = 1.0; r <= 2.72; r += .02) {
      let top = -Infinity;
      for (let a = 0; a < 360; a += 2) { const x = turret.position.x + Math.sin(a * DEG) * r, z = turret.position.z + Math.cos(a * DEG) * r; top = Math.max(top, hullGrid.top(x, z)); }
      hullTop.set(Math.round(r * 50), top - ringY);
    }
    let ringMin = Infinity;
    for (const p of fresh.filter(q => q.owner === 'turret')) for (const v of vertsOf(p.g)) {
      const bin = Math.round(Math.hypot(v.x, v.z) * 50);
      const h = Math.max(hullTop.get(bin - 1) ?? -Infinity, hullTop.get(bin) ?? -Infinity, hullTop.get(bin + 1) ?? -Infinity);
      if (!Number.isFinite(h)) continue;
      ringMin = Math.min(ringMin, v.y - h);
      assert(v.y - h >= .025, `${label}: ${p.name} clears the hull at r ${(bin / 50).toFixed(2)} by ${(v.y - h).toFixed(4)} (2.5 cm)`);
    }
    const turretLow = new Map();
    turret.traverse(o => { if (!o.isMesh || isShadow(o) || /ghillie/.test(o.name)) return;
      for (let gun2 = o; gun2; gun2 = gun2.parent) if (gun2 === gun) return;
      const m = new THREE.Matrix4().copy(turret.matrixWorld).invert().multiply(o.matrixWorld), p = o.geometry.getAttribute('position'), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); const b = Math.round(Math.hypot(v.x, v.z) * 50); turretLow.set(b, Math.min(turretLow.get(b) ?? Infinity, v.y)); } });
    for (const p of fresh.filter(q => q.owner === 'hull')) for (const v of vertsOf(p.g)) {
      const r = Math.hypot(v.x - turret.position.x, v.z - turret.position.z), b = Math.round(r * 50);
      const low = Math.min(turretLow.get(b - 1) ?? Infinity, turretLow.get(b) ?? Infinity, turretLow.get(b + 1) ?? Infinity);
      if (Number.isFinite(low)) assert(low - (v.y - ringY) >= .025, `${label}: ${p.name} stays under the turret's sweep at r ${r.toFixed(2)}`);
    }

    // the main gun: its triangles in the gun's frame, posed
    const gunMeshes = [];
    gun.traverse(o => { if (o.isMesh && !isShadow(o) && o.material?.colorWrite !== false) gunMeshes.push(o); });
    const gunLocal = gunMeshes.map(o => ({o, tris: trisOf(o.geometry), mount: /gunMount/.test(o.name)}));
    const posed = (frameRig, lower = 0, dx = 0, only = null) => {
      t.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(frameRig.matrixWorld).invert(), out = [];
      for (const {o, tris, mount} of gunLocal) {
        if (only === 'mount' && !mount) continue;
        if (only === 'barrel' && mount) continue;
        const m = inv.clone().multiply(o.matrixWorld).premultiply(new THREE.Matrix4().makeTranslation(dx, -lower, 0));
        for (const tr of tris) { const v = tr.v.map(q => q.clone().applyMatrix4(m)), tri = new THREE.Triangle(...v);
          out.push({v, tri, plane: tri.getPlane(new THREE.Plane()), box: new THREE.Box3().setFromPoints(v)}); }
      }
      return out;
    };
    const turretFresh = new Grid(fresh.filter(p => p.owner === 'turret').flatMap(p => trisOf(p.g)), .1);
    const hullFresh = new Grid(fresh.filter(p => p.owner === 'hull').flatMap(p => trisOf(p.g)), .1);
    const saved = [turret.rotation.y, gun.rotation.x, recoil.position.z];
    try {
      // turret parts: every pitch of the gun's range at both recoil states; 5 cm beside the mantlet
      turret.rotation.y = 0;
      for (let pitch = -spec.gunDepressionDeg; pitch <= spec.gunElevationDeg + 1e-9; pitch += 1) for (const travel of [0, .135]) {
        gun.rotation.x = -pitch * DEG; recoil.position.z = -travel;
        const hit = turretFresh.hits(posed(turret));
        assert(!hit, `${label}: the main gun at pitch ${pitch}, recoil ${travel} meets new turret stock`);
        if (travel === 0) for (const dx of [-.05, .05]) assert(!turretFresh.hits(posed(turret, 0, dx, 'mount')), `${label}: the mantlet keeps 5 cm from new turret stock at pitch ${pitch}`);
      }
      // hull parts: every degree of yaw at its lowest legal pitch, both recoil states; 3 cm under the barrel over the front arc
      for (let yaw = -179; yaw <= 180; yaw += 1) {
        const low = minimumMechanicalGunPitch(spec, yaw * DEG);
        turret.rotation.y = yaw * DEG; gun.rotation.x = -low;
        for (const travel of [0, .135]) {
          recoil.position.z = -travel;
          assert(!hullFresh.hits(posed(hullRig, Math.abs(yaw) <= 90 ? .03 : 0)), `${label}: the main gun at yaw ${yaw} (pitch ${(low / DEG).toFixed(1)}, recoil ${travel}) keeps ${Math.abs(yaw) <= 90 ? '3 cm over' : 'clear of'} new hull stock`);
        }
      }
      // the rear-arc curves: the barrel 1.5 cm off every hull stock triangle at the lowest legal pitch, half-degree yaw steps
      // (HIGH). The mantlet's own clearance does not change with pitch (it rides 4 mm over the T-72B3M's deck boxes at yaw
      // 120 and its driver's hatch ring ahead, as on the T-72B3M itself): the curves answer the barrel's.
      if (high) for (let a = 120; a <= 180; a += .5) for (const s of a === 180 ? [1] : [1, -1]) {
        const yaw = s * a * DEG, low = minimumMechanicalGunPitch(spec, yaw);
        turret.rotation.y = yaw; gun.rotation.x = -low;
        for (const travel of [0, .135]) {
          recoil.position.z = -travel;
          const hit = hullGrid.hits(posed(hullRig, .015, 0, 'barrel'));
          assert(!hit, `${label}: the rear-arc curve keeps the gun 1.5 cm off the hull at yaw ${s * a} (pitch ${(low / DEG).toFixed(2)}, recoil ${travel})${hit ? ` ${JSON.stringify(hit.map(h => h.v.map(q => q.toArray().map(n => +n.toFixed(3)))))}` : ''}`);
        }
      }
    } finally { [turret.rotation.y, gun.rotation.x, recoil.position.z] = saved; t.root.updateMatrixWorld(true); }

    // no new part enters an existing non-seat part deeper than a 7 mm seat (both the +Y and +X parity say inside)
    let overlapMax = 0;
    for (const owner of ['hull', 'turret']) {
      const solids = others[owner].filter(o => !o.seat).map(o => { o.g.computeBoundingBox(); return {box: o.g.boundingBox.clone().expandByScalar(.002), tris: trisOf(o.g), bucket: o.bucket}; });
      const inside = (v, tris, axis) => { const dir = axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), ray = new THREE.Ray(v, dir), pt = new THREE.Vector3();
        let n = 0; for (const tr of tris) if (ray.intersectTriangle(tr.tri.a, tr.tri.b, tr.tri.c, false, pt)) n++; return n % 2 === 1; };
      for (const p of fresh.filter(q => q.owner === owner)) {
        p.g.computeBoundingBox();
        const near = solids.filter(s => s.box.intersectsBox(p.g.boundingBox));
        if (!near.length) continue;
        for (const v of vertsOf(p.g)) for (const s of near) {
          if (!s.box.containsPoint(v) || !inside(v, s.tris, 'y') || !inside(v, s.tris, 'x')) continue;
          let depth = Infinity; const q = new THREE.Vector3();
          for (const tr of s.tris) { tr.tri.closestPointToPoint(v, q); depth = Math.min(depth, q.distanceTo(v)); }
          overlapMax = Math.max(overlapMax, depth);
          assert(depth <= .007, `${label}: ${p.name} enters existing ${s.bucket} stock ${depth.toFixed(4)} m (7 mm seat)`);
        }
      }
    }

    // lamps: every new lens a registered emitter, open for .5 m, recessed 4-26 mm, lapping 4 mm into its housing
    const coverage = t.root.userData.nightLightCoverage;
    assert.equal(coverage.headlights, LIGHTS[id].headlights, `${label}: ${LIGHTS[id].headlights} driving lamps`);
    assert.equal(coverage.markers ?? 0, LIGHTS[id].markers ?? 0, `${label}: ${LIGHTS[id].markers ?? 0} marker lamps`);
    assert.equal(coverage.shtora, 0, `${label}: no Shtora is claimed`);
    const solidMeshes = [], proxyMat = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
    t.root.traverse(o => { if (o.isMesh && !isShadow(o) && !/Glass$/.test(o.name) && o.material?.colorWrite !== false) {
      const m = new THREE.Mesh(o.geometry, proxyMat); m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.updateMatrixWorld(true); m.name = o.name; solidMeshes.push(m); } });
    const ray = new THREE.Raycaster();
    const firstHit = (from, dir, far) => { ray.set(from, dir); ray.near = 0; ray.far = far; return ray.intersectObjects(solidMeshes, false)[0] ?? null; };
    const lenses = fresh.filter(p => p.lamp);
    for (const p of lenses) {
      const rig = p.owner === 'hull' ? hullRig : turret, def = p.g.userData.vehicleNightLens;
      assert(def?.faces?.length, `${label}: ${p.name} carries an authored aperture`);
      const pos = p.g.getAttribute('position'), c = new THREE.Vector3(), n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
      let area = 0;
      for (const f of def.faces) {
        const ix = k => p.g.index ? p.g.index.getX(f + k) : f + k;
        a.fromBufferAttribute(pos, ix(0)); b.fromBufferAttribute(pos, ix(1)); cc.fromBufferAttribute(pos, ix(2));
        const cr = b.clone().sub(a).cross(cc.clone().sub(a)), ar = cr.length() / 2;
        c.addScaledVector(a.clone().add(b).add(cc), ar / 3); n.addScaledVector(cr.normalize(), ar); area += ar;
      }
      c.divideScalar(area); n.normalize();
      let back = 0;
      for (const v of vertsOf(p.g)) back = Math.min(back, v.clone().sub(c).dot(n));
      const cw = c.clone().applyMatrix4(rig.matrixWorld), nw = n.clone().transformDirection(rig.matrixWorld);
      const blocked = firstHit(cw.clone().addScaledVector(nw, .5), nw.clone().negate(), .497);
      assert(!blocked, `${label}: ${p.name}'s aperture is open for .5 m (${blocked?.object.name})`);
      const u = new THREE.Vector3().crossVectors(nw, Math.abs(nw.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize(), w = nw.clone().cross(u);
      // the housing's mouth: rays just outside the lens's own extent in four directions meet its rim (the deepest of the
      // four is the slot or bore wall next to it, the shallowest the lens's own housing face)
      const lu = p.g.clone().applyMatrix4(rig.matrixWorld), extent = d => { let e = 0; for (const v of vertsOf(lu)) e = Math.max(e, v.clone().sub(cw).dot(d)); return e; };
      let recess = -Infinity;
      for (const d of [u, u.clone().negate(), w, w.clone().negate()]) {
        const h = firstHit(cw.clone().addScaledVector(d, extent(d) + .003).addScaledVector(nw, .05), nw.clone().negate(), .2);
        if (h) recess = Math.max(recess, .05 - h.distance);
      }
      lu.dispose();
      assert(recess >= .004 && recess <= .026, `${label}: ${p.name} is recessed ${recess.toFixed(4)} m in its housing (4-26 mm)`);
      const lap = firstHit(cw.clone().addScaledVector(nw, back + .0005), nw, .06);
      assert(lap && lap.distance >= .0035, `${label}: ${p.name} laps ${(lap?.distance ?? 0).toFixed(4)} m into its housing (4 mm)`);
    }
    assert.equal(lenses.length, {t72b3m_hetman_ii: 8, t72b3_zubr: 2, t72b3_zubr_ii: 8}[id], `${label}: every new lens checked`);
    // the Zubr II's station illuminator: under the weapon's pitch stage, its beam following yaw and pitch
    if (id === 't72b3_zubr_ii') {
      const l = NATIONAL_ROOF_LOADOUTS[id], station = turret.getObjectByName(l.name), pitch = station.getObjectByName('auxiliaryWeaponPitch');
      const mesh = pitch.getObjectByName(`${l.name}_pitch_turretGlass`);
      assert(mesh, `${label}: the illuminator's lens rides the station's pitch stage`);
      const [lamp] = vehicleNightLightEmittersFor(mesh);
      assert.equal(lamp?.kind, 'headlight', `${label}: the illuminator is a registered driving lamp`);
      const world = () => { t.root.updateMatrixWorld(true); return {p: new THREE.Vector3(...lamp.position).applyMatrix4(mesh.matrixWorld),
        d: new THREE.Vector3(...lamp.direction).transformDirection(mesh.matrixWorld)}; };
      const rest = world();
      assert(rest.d.z > .99, `${label}: the illuminator looks along the weapon at rest`);
      const glass = new THREE.Box3().setFromObject(mesh);
      assert(glass.expandByScalar(.01).containsPoint(rest.p), `${label}: the illuminator's emitter sits on its lens`);
      station.rotation.y = .6; pitch.rotation.x = -.3;
      const moved = world();
      station.rotation.y = 0; pitch.rotation.x = 0; t.root.updateMatrixWorld(true);
      const yaw = Math.atan2(moved.d.x, moved.d.z), elev = Math.asin(moved.d.y);
      assert(Math.abs(yaw - .6) < .02 && Math.abs(elev - .3) < .02, `${label}: the illuminator's beam follows the station (yaw ${yaw.toFixed(3)}, pitch ${elev.toFixed(3)})`);
      assert(!glass.containsPoint(moved.p), `${label}: the illuminator's emitter moves with the weapon`);
    }
    proxyMat.dispose();

    // live, spent and reset ERA; the permanent carriers and the new permanent parts stay
    const digest = names => { const h = []; t.root.traverse(o => { if (o.isMesh && names.includes(o.name)) h.push(o.geometry.attributes.position.array.length, o.visible, o.geometry.drawRange.count); }); return JSON.stringify(h); };
    const permanentNames = ['hull', 'turret', 'hullDetail', 'turretDetail', 'gunMount', 'hullOpenLattice', 'turretOpenLattice'];
    const permanent = digest(permanentNames);
    for (const s of SECTORS) {
      assert(t.stripEra(s), `${label}: ${s} is live`);
      assert.equal(digest(permanentNames), permanent, `${label}: stripping ${s} keeps the permanent stock`);
    }
    assert(t.resetEra(), `${label}: ERA resets`);
    assert.equal(digest(permanentNames), permanent, `${label}: reset keeps the permanent stock`);

    // cost
    let tris = 0, draws = 0;
    t.root.traverse(o => {
      if (!o.isMesh) return; let visible = true; for (let q = o; q; q = q.parent) visible &&= q.visible;
      if (!visible || isShadow(o)) return; const mats = Array.isArray(o.material) ? o.material : [o.material]; if (!mats.some(m => m.colorWrite)) return;
      tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); draws++;
    });
    const k = high ? 0 : 1, base = BASELINE[id];
    assert(tris <= base.tris[k], `${label}: drawn triangles ${tris} within the baseline ${base.tris[k]}`);
    assert(draws <= base.draws[k] + base.extraDraws, `${label}: draws ${draws} within ${base.draws[k]} + ${base.extraDraws}`);
    (report[id] ??= {})[quality] = {modules: modules.length, tris, draws, ringMin: +ringMin.toFixed(4), overlapMax: +overlapMax.toFixed(4),
      mins: Object.fromEntries(Object.entries(mins).map(([key, value]) => [key, +value.toFixed(4)]))};
    console.log(`${label}: ${modules.length} new ERA modules, six sectors, seated; envelopes ${JSON.stringify(report[id][quality].mins)}, ring ${ringMin.toFixed(3)}, gun sweeps clear; ${lenses.length} lenses; ${tris} triangles, ${draws} draws PASS`);
  } finally {
    t.dispose();
    for (const p of fresh) p.g.dispose();
    for (const list of [...Object.values(stock), ...Object.values(others).map(l => l.map(o => o.g))]) for (const g of list) g.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The Zubrs' WKM-B emplacements in the authority: automatic counter-drone, soft-target and armour-gate behaviour

for (const id of ['t72b3_zubr', 't72b3_zubr_ii']) {
  const l = NATIONAL_ROOF_LOADOUTS[id], profile = auxiliaryWeaponProfile(l.caliber, id);
  assert.equal(l.caliber, 12.7, `${id}: a 12.7 mm emplacement`);
  assert(l.mount === 'cradle' || l.mount === 'casemate', `${id}: an emplacement mount`);
  assert.equal(profile.shell.name, '12.7×99 mm NATO API (WKM-B)', `${id}: fires the WKM-B round`);
  assert.equal(profile.rangeM, 240, `${id}: the heavy machine gun's range`);
  const spec = getSpec(id), mbt = getSpec('t72b3_zubr_ii');
  const run = () => {
    const entity = (eid, team, s, x, z, yaw = 0) => ({id: eid, team, spec: s, state: {pos: {x, y: 0, z}, yaw, turretYaw: 0, visualPitch: 0, visualRoll: 0},
      combat: {destroyed: false, reload: {t: 4}, ammo: [7, 8, 9]}});
    const shooter = entity('zubr', 'alpha', spec, 0, 0);
    const log = [];
    // 1. counter-drone: an enemy drone in flight inside 200 m, no vehicles
    const drone = {...entity('drone', 'bravo', {id: 'drone', dims: {heightM: .4}}, 40, 90), aerial: {kind: 'drone', active: true, launching: false, x: 40, y: 22, z: 90}};
    const hits = [];
    const ctx = {entities: [shooter, drone], visible: () => true, clear: () => true, counterDrone: true, droneHit: (d, chance) => hits.push(+chance.toFixed(5))};
    let shots = 0;
    for (let i = 0; i < 360; i++) if (stepRoofGun(shooter, i / 60, 1 / 60, ctx)) { shots++; log.push(['drone', i, +auxiliaryShot.direction.x.toFixed(5), +auxiliaryShot.direction.y.toFixed(5)]); }
    assert(shots > 0 && hits.length === shots, `${id}: with no input the station slews to and fires at the drone (${shots})`);
    const s = auxiliaryState(shooter);
    assert(Math.abs(Math.atan2(40, 90) - s.gunYaw) < .05 && s.gunPitch > .1, `${id}: the station's aim follows the drone`);
    // 2. a soft vehicle in range, no drone
    const soft = entity('truck', 'bravo', {id: 'truck', dims: {heightM: 2.6}}, -60, 120);
    ctx.entities = [shooter, soft]; ctx.counterDrone = false; shots = 0;
    for (let i = 0; i < 600; i++) if (stepRoofGun(shooter, 10 + i / 60, 1 / 60, ctx)) { shots++; log.push(['soft', i]); }
    assert(shots >= 15, `${id}: the station engages a soft vehicle by itself (${shots})`);
    // 3. a main battle tank's front: the armour gate holds fire
    const tank = entity('mbt', 'bravo', mbt, 0, 150, Math.PI);
    ctx.entities = [shooter, tank]; shots = 0;
    for (let i = 0; i < 600; i++) if (stepRoofGun(shooter, 30 + i / 60, 1 / 60, ctx)) shots++;
    assert.equal(shots, 0, `${id}: holds fire on a main battle tank's front`);
    // 4. B turns it off
    ctx.entities = [shooter, soft]; requestAuxiliary(shooter, 'roofGun', 50);
    assert.equal(auxiliaryState(shooter).gunOn, false, `${id}: B turns the emplacement off`);
    for (let i = 0; i < 300; i++) assert.equal(stepRoofGun(shooter, 50 + i / 60, 1 / 60, ctx), false, `${id}: off holds fire`);
    return JSON.stringify([log, hits, s.gunYaw.toFixed(6), s.gunPitch.toFixed(6)]);
  };
  assert.equal(run(), run(), `${id}: the station's behaviour repeats exactly`);
  console.log(`${id}: the WKM-B emplacement engages drones and soft vehicles with no input, holds on armour, stops at B, deterministic PASS`);
}
console.log('frontEraPackages:', JSON.stringify(report));
console.log('frontEraPackages: Hetman II stepped prow, Zubr Krata, Zubr II Krata-2, lights, emplacements and gun curves PASS');
