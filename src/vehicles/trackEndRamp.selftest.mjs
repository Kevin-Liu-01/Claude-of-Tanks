import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';

// End-wheel re-lay (owner 2026-09-18: "the tracks appear sticky to the wheels … morphing to stick onto the wheels").
// At rest the loaded run leaves each outer road wheel on the common external tangent to the idler / sprocket wrap.
// When that wheel travels, the band must keep that law — the wheel arc, the ramp stations and the end-wheel arc
// pivot about the fixed end wheel — instead of wearing the band like a sock (the influence field moved the ramp by a
// fading share of the travel and the fit pushed the rest onto the tire: 62 mm off the true tangent on a Bradley whose
// end wheels drooped 11 cm). Settled on the 18 m convex round course, every end-region centreline point sits on the
// live wheel seat circle, on the end-wheel wrap circle or on the common tangent between them; at rest the band is
// restored byte-identical to its authored course by the garage reset.
// tos1a_tagil (owner 2026-09-21, "improper wrapping … around the front road wheel and back road wheel"): a staggered
// rig whose left wheels sit 38 mm aft of the course stations — the re-lay must find the wheel by STATION and pivot the
// ramp about the side's own axle (relay.sideOffsetM), not the shared station where no wheel is.
const IDS = ['m2a2_bradley', 't90m', 'spz_puma_s1', 'tiger1', 'leo2a6', 'kf51_x', 'tos1a_tagil'];
const R = 18, SECONDS = 3;
const heightAt = (x, z) => -(R - Math.sqrt(Math.max(0, R * R - z * z)));
const heightField = { getHeightAt: heightAt, getGroundType: () => 'dirt',
  getNormalAt: (x, z) => { const e = 0.05; const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e); const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); return new THREE.Vector3(-dx, 1, -dz).normalize(); } };
const _p = new THREE.Vector3();
function lowerExternalTangent(za, ya, ra, zb, yb, rb) {
  const dz = zb - za, dy = yb - ya, d = Math.hypot(dz, dy);
  const uz = dz / d, uy = dy / d; const cosA = (rb - ra) / d; const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const [nz, ny] = [[uz * cosA - uy * sinA, uy * cosA + uz * sinA], [uz * cosA + uy * sinA, uy * cosA - uz * sinA]].reduce((best, n) => (n[1] > best[1] ? n : best));
  return { nz, ny, c: nz * za + ny * ya - ra };
}
const cellsOf = (band) => {
  // the band's own frame: the builder's relay circles and the wheel entries' travel live there (scaled rigs put the gear in a scaled group)
  const pos = band.geometry.getAttribute('position'); const cells = [];
  for (let i = 0; i * 24 < pos.count; i++) cells.push({ z: (pos.getZ(i * 24 + 2) + pos.getZ(i * 24 + 6)) / 2, y: (pos.getY(i * 24 + 2) + pos.getY(i * 24 + 6)) / 2 });
  return cells;
};
const results = [];
for (const id of IDS) {
  const spec = getSpec(id);
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    const root = tank.root, hull = root.getObjectByName('rig_hull');
    const relays = hull.userData.runningGearEndRelays;
    assert.ok(Array.isArray(relays) && relays.length === 2, `${id}: both ends of the loaded run carry a re-lay`);
    for (const relay of relays) assert.ok(relay.wheelArc >= 4 && relay.endArc >= 4 && relay.ramp >= 1, `${id}: ${relay.side} re-lay classified the wheel arc, the end arc and the ramp (${JSON.stringify(relay)})`);
    const bands = []; root.traverse((o) => { if (o.isMesh && o.name === 'gearTrackBandL') bands.push(o); });
    const band = bands.at(-1);
    const rest = band.geometry.getAttribute('position').array.slice();
    // the round course: end regions on the live wheel seat circle, on the end-wheel wrap circle or on the tangent between them
    const state = createTankState(spec, new THREE.Vector3(0, heightAt(0, 0), 0), 0);
    const entity = { spec, state, input: { throttle: 0, steer: 0 }, combat: null, contactGeom: tank.contactGeom ? { ...tank.contactGeom } : null };
    tank.setGroundSampler?.(heightAt);
    for (let i = 0; i < Math.round(SECONDS / SIM_DT); i++) { updateTank(entity, heightField, SIM_DT); tank.syncFromState(state, SIM_DT); }
    const cells = cellsOf(band);
    const allWheels = hull.userData.runningGearRoadWheels(-1);
    const wheels = allWheels.filter((w) => !w.rec).sort((a, b) => a.z - b.z);
    const th = hull.userData.runningGearReceipts.at(-1).trackTh;
    const outer = [wheels[0], wheels.at(-1)];
    assert.ok(outer.every((w) => Math.abs(w.voff) > 0.03), `${id}: the outer wheels travel on the round course (${outer.map((w) => w.voff.toFixed(3))})`);
    let worst = 0, points = 0, moved = 0;
    const restCells = []; for (let i = 0; i * 24 < rest.length / 3; i++) restCells.push({ z: (rest[(i * 24 + 2) * 3 + 2] + rest[(i * 24 + 6) * 3 + 2]) / 2, y: (rest[(i * 24 + 2) * 3 + 1] + rest[(i * 24 + 6) * 3 + 1]) / 2 });
    for (const relay of relays) {
      // this side's own station: the course station plus the side offset the builder baked (0 on unstaggered rigs)
      const stationZ = relay.wheelZ + (relay.sideOffsetM?.left ?? 0);
      const w = wheels.find((x) => Math.abs(x.z - stationZ) < 1e-6);
      assert.ok(w, `${id}: ${relay.side} outer road wheel found at z ${stationZ}`);
      const ax = { z: w.z, y: relay.wheelRestY + w.voff }; const end = { z: relay.endZ, y: relay.endY };
      const tan = lowerExternalTangent(ax.z, ax.y, relay.wheelRadius, end.z, end.y, relay.endRadius);
      const stations = relay.wheelArcIndices.length + relay.rampIndices.length + relay.endArcIndices.length;
      assert.ok(stations >= 8, `${id}: ${relay.side} end region has stations (${stations})`);
      // the law: wheel-arc stations keep their rest radius about the LIVE axle, end-arc stations keep their rest
      // radius about the fixed end wheel (chord stations of a subdivided arc included), ramp stations lie on the
      // live common tangent — and the region really moved with the wheel
      // another live tire (interleaved rows included) may push a station outward — never inward — when its underside
      // reaches the re-laid arc; that push is the contact fit doing its job and is accepted only when such a tire is there
      const justified = (c, exclude) => allWheels.some((o) => o !== exclude && Math.abs(Math.hypot(c.z - o.z, c.y - (o.y + o.voff)) - (o.r + th / 2)) <= 3e-3);
      for (const index of relay.wheelArcIndices) {
        const c = cells[index], r0 = restCells[index];
        const signed = Math.hypot(c.z - ax.z, c.y - ax.y) - Math.hypot(r0.z - stationZ, r0.y - relay.wheelRestY);
        const dev = Math.abs(signed); points++; moved = Math.max(moved, Math.hypot(c.z - r0.z, c.y - r0.y));
        // inward never; outward up to 3 mm is the contact fit clearing a live chord that dips into the tire (a rescaled
        // sweep lengthens the graded chords — 1.3 mm on the Tiger's 0.48 m seat), beyond that another tire must be there
        assert.ok(signed >= -1e-3, `${id}: ${relay.side} wheel-arc station z ${c.z.toFixed(3)} sank ${(-signed * 1000).toFixed(1)} mm into its seat`);
        if (signed > 3e-3) assert.ok(justified(c, w), `${id}: ${relay.side} wheel-arc station z ${c.z.toFixed(3)} left its seat radius by ${(signed * 1000).toFixed(1)} mm with no other tire to clear`);
        else worst = Math.max(worst, dev);
      }
      for (const index of relay.endArcIndices) {
        const c = cells[index], r0 = restCells[index];
        const dev = Math.abs(Math.hypot(c.z - end.z, c.y - end.y) - Math.hypot(r0.z - end.z, r0.y - end.y));
        worst = Math.max(worst, dev); points++; moved = Math.max(moved, Math.hypot(c.z - r0.z, c.y - r0.y));
        assert.ok(dev <= 1e-3, `${id}: ${relay.side} end-arc station z ${c.z.toFixed(3)} left the wrap radius by ${(dev * 1000).toFixed(1)} mm`);
      }
      for (const index of relay.rampIndices) {
        const c = cells[index], r0 = restCells[index];
        const dev = Math.abs(tan.nz * c.z + tan.ny * c.y - tan.c);
        worst = Math.max(worst, dev); points++; moved = Math.max(moved, Math.hypot(c.z - r0.z, c.y - r0.y));
        assert.ok(dev <= 1.5e-3, `${id}: ${relay.side} ramp station z ${c.z.toFixed(3)} sits ${(dev * 1000).toFixed(1)} mm off the live tangent`);
      }
    }
    assert.ok(moved >= 0.02, `${id}: the end regions followed the drooping outer wheels (${(moved * 1000).toFixed(0)} mm)`);
    // the garage reset restores the authored band byte for byte
    tank.resetForGaragePresentation();
    assert.deepEqual(band.geometry.getAttribute('position').array, rest, `${id}: the garage reset restores the authored band byte for byte`);
    results.push({ id, points, worstMm: +(worst * 1000).toFixed(2), movedMm: +(moved * 1000).toFixed(0), voffs: outer.map((w) => +w.voff.toFixed(3)) });
  } finally { tank.dispose?.(); }
}
console.log('trackEndRamp.selftest:', JSON.stringify(results));
