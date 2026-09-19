import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { getSpec } from './specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';

// Track system (owner 2026-09-17: "thinner tracks and reseated wheels for all … then actually double check in
// simulations to make sure our suspension and tracks dont glitch wheels"). A representative slice of the fleet drives
// the real movement sim over a rough synthetic field for six seconds while the visual runs its per-frame gear conform
// exactly as the battle runtime does; in hull space no road wheel's tire may pass through the band's upper face
// (cut) and no wheel in steady contact may float far above it (daylight — judged when the wheel's travel has settled,
// since the gear cadence lets the band trail a fast-moving wheel for a frame), while the suspension must actually travel.
const SUPPLIED_IDS = ['kurganets25_x', 'ztz100_x', 'fv510_milan_x', 'aft10_x',
  'bmp3m_dragun125_x', 'griffin50_x', 'kf41_lynx_x', 'k21_x', 'cv90_mkiv_x',
  'ajax_x', 'sabra_mk2_x', 'cv90105_tml_x', 'type96b_x', 'merkava4_barak'];
const IDS = ['t90m', 'm1a2', 'leo2a6', 'tiger1', 'mbt70', 'cv90_mkiv', 'kf51_x', 't72b3m_x', 'type100', ...SUPPLIED_IDS];
await ensureInteriorFills(IDS);
const MAX_CUT_M = 0.003, MAX_DAYLIGHT_M = 0.030, MIN_TRAVEL_M = 0.03, SECONDS = 6;
const heightAt = (x, z) => 0.14 * Math.sin(0.55 * z + 0.3) * Math.cos(0.4 * x)
  + 0.10 * Math.sin(1.7 * z + 0.9 * x) + 0.07 * Math.sin(3.1 * z) * Math.cos(1.3 * x + 0.4)
  + 0.16 * Math.exp(-((z - 18) ** 2) / 1.2) - 0.14 * Math.exp(-((z - 30) ** 2) / 2.0);
const heightField = { getHeightAt: heightAt, getGroundType: () => 'dirt',
  getNormalAt: (x, z) => { const e = 0.05; const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e); const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); return new THREE.Vector3(-dx, 1, -dz).normalize(); } };
const _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _sc = new THREE.Vector3();
const results = [];
for (const id of IDS) {
 for (const quality of SUPPLIED_IDS.includes(id) ? ['high', 'low'] : ['high']) {
  const spec = getSpec(id);
  const tank = createTank(id, null, { proceduralOnly: true, quality, camoSeed: 4242, geometryReceipt: true });
  try {
    const root = tank.root, hull = root.getObjectByName('rig_hull');
    const rec = hull?.userData.runningGearReceipts?.at(-1);
    assert.ok(rec, `${id}: running-gear receipt`);
    const state = createTankState(spec, new THREE.Vector3(0, heightAt(0, 0), 0), 0);
    const entity = { spec, state, input: { throttle: 1, steer: 0 }, combat: null,
      contactGeom: tank.contactGeom ? { halfLenM: tank.contactGeom.halfLenM, halfWidM: tank.contactGeom.halfWidM, zCenterM: tank.contactGeom.zCenterM } : null };
    tank.setGroundSampler?.(heightAt);
    const bands = {}; root.traverse((o) => { if (o.isMesh && /^gearTrackBand(L|R)$/.test(o.name)) bands[o.name.endsWith('L') ? 'L' : 'R'] = o; });
    const tires = []; root.traverse((o) => { if (o.isInstancedMesh && o.name === 'gearRoadWheelTires') tires.push(o); });
    assert.ok(tires.length && bands.L && bands.R, `${id}: road-wheel tires and both bands present`);
    const nearestRest = (z) => { let best = rec.wheelY, d = Infinity; rec.wheelZs.forEach((wz, k) => { const dd = Math.abs(wz - z); if (dd < d) { d = dd; best = rec.wheelYs?.[k] ?? rec.wheelY; } }); return best; };
    let maxCut = 0, maxDay = 0, maxOff = 0, minOff = 0;
    const lastOff = new Map(); // per wheel: daylight is judged on steady contact, not mid-transient (gear cadence lag)
    const steps = Math.round(SECONDS / SIM_DT);
    for (let i = 0; i < steps; i++) {
      entity.input.steer = i > steps * 0.6 ? 0.35 : 0;
      updateTank(entity, heightField, SIM_DT);
      tank.syncFromState(state, SIM_DT);
      if (i % 3) continue;
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(hull.matrixWorld).invert();
      for (const side of ['L', 'R']) {
        const band = bands[side], pos = band.geometry.getAttribute('position');
        const toHull = new THREE.Matrix4().multiplyMatrices(inv, band.matrixWorld);
        const pts = [];
        for (let v = 0; v < pos.count; v++) { _p.fromBufferAttribute(pos, v).applyMatrix4(toHull); if (_p.y < rec.wheelY + rec.wheelR) pts.push([_p.z, _p.y]); }
        for (const mesh of tires) {
          const toHullT = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
          for (let k = 0; k < mesh.count; k++) {
            mesh.getMatrixAt(k, _m); _m.premultiply(toHullT); _p.setFromMatrixPosition(_m);
            if ((side === 'L') !== (_p.x < 0)) continue;
            // This named native instance layer contains the actual road-wheel
            // tires. Do not filter against the left-side station list: source
            // stagger (e.g. ZTZ) otherwise silently excludes the entire right.
            const r = rec.wheelR * _sc.setFromMatrixScale(_m).y, wy = _p.y, wz = _p.z, off = wy - nearestRest(wz);
            maxOff = Math.max(maxOff, off); minOff = Math.min(minOff, off);
            const key = `${side}:${wz.toFixed(2)}`, steady = lastOff.has(key) && Math.abs(off - lastOff.get(key)) < 0.005;
            lastOff.set(key, off);
            let faceAtAxle = -Infinity, cut = 0;
            for (const [z, y] of pts) {
              if (y > wy) continue;
              const dz = z - wz;
              if (Math.abs(dz) <= r + 0.02) {
                const tireBottom = wy - Math.sqrt(Math.max(0, r * r - Math.min(dz * dz, r * r)));
                if (Math.abs(dz) < r) cut = Math.max(cut, y - tireBottom);
                if (Math.abs(dz) < 0.06) faceAtAxle = Math.max(faceAtAxle, y);
              }
            }
            maxCut = Math.max(maxCut, cut);
            if (steady && faceAtAxle > -Infinity) maxDay = Math.max(maxDay, (wy - r) - faceAtAxle);
          }
        }
      }
    }
    assert.ok(maxCut <= MAX_CUT_M, `${id}: a road wheel cuts ${(maxCut * 1000).toFixed(1)} mm through the band's upper face`);
    assert.ok(maxDay <= MAX_DAYLIGHT_M, `${id}: a road wheel floats ${(maxDay * 1000).toFixed(1)} mm above the band`);
    assert.ok(maxOff - minOff >= MIN_TRAVEL_M, `${id}: the suspension travelled only ${((maxOff - minOff) * 1000).toFixed(0)} mm over the rough field`);
    results.push({ id, quality, cutMm: +(maxCut * 1000).toFixed(1), daylightMm: +(maxDay * 1000).toFixed(1), travelMm: [Math.round(minOff * 1000), Math.round(maxOff * 1000)] });
  } finally { tank.dispose?.(); }
 }
}
console.log(JSON.stringify(results));
console.log('trackGlitchSimulation.selftest: rough-field suspension run keeps every road wheel on the band passed');
