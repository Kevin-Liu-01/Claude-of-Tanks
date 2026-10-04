// vehicleGroundOcclusion.test-support — the fixture the ground-occlusion receipts share (vehicleGroundOcclusion.selftest
// and tools/vehicle-ground-occlusion.browser.selftest): the T-90M as measureVehicleGroundHull measured it on the
// 2026-10-03 build (createTank('t90m', high)), the top of its shoes (the brute-force union stands its runs to it), and
// the ground points the law is held to — beside the track, ahead of the glacis, behind the rear plate, off a corner and
// under the belly between the tracks.

export const T90M = Object.freeze({
  hx: 1.8794, yb: 0.42, yt: 1.5891, fz0: -3.9116, fz1: 3.9116, pz0: -2.898, pz1: -2.7324, hr: 0.474, hf: 0.0498,
  y0: 0, xi: 1.2521, xo: 1.7614, tz0: -3.2542, tz1: 3.3048, cz0: -2.0852, cz1: 2.4357,
});
export const T90M_RUN_TOP = 1.2877;

const h = T90M;
/** [label, receiver (root frame, on the contact plane)] */
export const UNION_POINTS = Object.freeze([
  ['beside the track, 0.05 m', [h.xo + 0.05, 0, 0]],
  ['beside the track, 0.3 m', [h.xo + 0.3, 0, 0]],
  ['beside the track, 1.0 m', [h.xo + 1.0, 0, 0]],
  ['ahead of the glacis, 0.3 m', [0, 0, h.fz1 + 0.3]],
  ['ahead of the glacis, 1.0 m', [0, 0, h.fz1 + 1.0]],
  ['behind the rear plate, 0.3 m', [0, 0, h.fz0 - 0.3]],
  ['behind the rear plate, 1.0 m', [0, 0, h.fz0 - 1.0]],
  ['off the rear corner', [h.hx + 0.3, 0, h.fz0 - 0.3]],
  ['under the belly, centre', [0, 0, 0]],
  ['under the belly, near the rear', [0, 0, h.fz0 + 0.5]],
  ['under the belly, near the front', [0, 0, h.fz1 - 0.5]],
].map(([label, p]) => Object.freeze([label, Object.freeze(p)])));

/** [label, receiver, normal] past the union's points: the wraps, the shoes, the gap fade, tilted receivers, a fading one */
const EXTRA_POINTS = Object.freeze([
  ['under a rear wrap', [1.5, 0, h.cz0 - 0.5], [0, 1, 0]],
  ['just past the shoes', [h.xo + 0.01, 0, 0], [0, 1, 0]],
  ['a shoe on the ground run', [1.5, 0.06, 0], [1, 0.1, 0]],
  ['the terrain under a pitched track end', [1.5, 0.09, h.cz0 - 0.5], [0, 1, 0.05]],
  ['the ground under the ground run', [1.5, 0, 0], [0, 1, 0]],
  ['under a hull riding high', [0.4, -0.13, 1.0], [0, 1, 0]],
  ['inside the gap fade', [h.xi - 0.05, 0, 0.5], [0, 1, 0]],
  ['under the rear plate', [0.3, 0, -3.5], [0, 1, 0]],
  ['a slope facing the hull', [2.6, 0.3, -2.0], [-0.4, 0.9, 0.17]],
  ['a wall facing the hull', [-2.3, 0.6, 0.3], [1, 0, 0]],
  ['a slope ahead', [-0.3, 0.1, 4.3], [0.1, 0.97, -0.2]],
  ['fading behind', [0, 0, h.fz0 - 3.5], [0, 1, 0]],
]);

/**
 * The GLSL receipt's cases: the uniforms the module itself packs (updateVehicleGroundOcclusionUniforms over roots whose
 * cached solid is the T-90M) and the CPU twin's expectation of 1 − shade at each receiver — the bare geometry (one hull,
 * no interreflection, the whole ambient share), then snow under a sun with a second hull 6 m to the right.
 */
export async function vehicleGroundGlslCases() {
  const THREE = await import('three');
  const M = await import('./vehicleGroundOcclusion.ts');
  const unitOf = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const receivers = [...UNION_POINTS.map(([label, p]) => [label, p, [0, 1, 0]]), ...EXTRA_POINTS].map(([label, p, nrm]) => [label, p, unitOf(nrm)]);
  const rootAt = (x) => {
    const root = new THREE.Group(); root.position.set(x, 0, 0); root.updateMatrixWorld(true);
    root.userData.groundAoShape = T90M; root.userData.groundAoShapeFor = null;
    return { root };
  };
  const pack = (roots, rho, hullAlbedo) => {
    const u = M.createVehicleGroundOcclusionUniforms();
    M.updateVehicleGroundOcclusionUniforms(u, roots, true, rho, hullAlbedo, M.GROUND_AO_BELLY_VIEW);
    return { hullCount: u.uVehGround.value, rows: u.uVehGroundM.value.flatMap((v) => v.toArray()),
      solids: u.uVehGroundB.value.flatMap((v) => v.toArray()), light: u.uVehGroundLight.value.toArray() };
  };
  const shown = (occ) => (occ > 0.003 ? occ : 0); // the block skips a pixel it barely touches
  const base = { amb: [1, 1, 0, 0], fillDir: [0, 1, 0], sunDir: [0, 1, 0], points: receivers.map((r) => r[1]), normals: receivers.map((r) => r[2]) };
  const vec = (a) => ({ x: a[0], y: a[1], z: a[2] });
  const geometry = {
    name: 'geometry: one hull, no interreflection, the whole ambient share',
    input: { ...base, ...pack([rootAt(0)], 0.25, 0), sunLum: 0 },
    expected: receivers.map(([, p, nrm]) => shown(M.vehicleGroundOcclusionLocal(vec(p), vec(nrm), T90M, { belly: 1, wall: 1 }))),
  };
  const kSun = 0.65, snow = M.vehicleGroundStrengths(0.8, kSun, M.GROUND_AO_HULL_ALBEDO, M.GROUND_AO_BELLY_VIEW);
  const sunlit = {
    name: 'snow under a sun, a second hull 6 m to the right',
    input: { ...base, ...pack([rootAt(0), rootAt(6)], 0.8, M.GROUND_AO_HULL_ALBEDO), sunLum: kSun },
    expected: receivers.map(([, p, nrm]) => {
      const occ = M.combineVehicleGroundOcclusion([
        M.vehicleGroundOcclusionLocal(vec(p), vec(nrm), T90M, snow),
        M.vehicleGroundOcclusionLocal({ x: p[0] - 6, y: p[1], z: p[2] }, vec(nrm), T90M, snow)], 0);
      return shown(occ) / (1 + kSun * Math.max(nrm[1], 0));
    }),
  };
  return { labels: receivers.map((r) => r[0]), cases: [geometry, sunlit], glsl: M.VEHICLE_GROUND_OCCLUSION_GLSL };
}
