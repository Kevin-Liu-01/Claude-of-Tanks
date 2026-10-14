// vehicleGroundOcclusion.test-support — the fixture the ground-occlusion receipts share (vehicleGroundOcclusion.selftest
// and tools/vehicle-ground-occlusion.browser.selftest): the T-90M as measureVehicleGroundHull measured it on the
// 2026-10-03 build (createTank('t90m', high)), the top of its shoes (the brute-force union stands its runs to it), and
// the ground points the law is held to — beside the track, ahead of the glacis, behind the rear plate, off a corner and
// under the belly between the tracks.

export const T90M = Object.freeze({
  hx: 1.8794, yb: 0.42, yt: 1.5891, fz0: -3.9116, fz1: 3.9116, pz0: -2.898, pz1: -2.7324, hr: 0.474, hf: 0.0498,
  y0: 0, xi: 1.2521, xo: 1.7614, tz0: -3.2542, tz1: 3.3048, cz0: -2.0852, cz1: 2.4357, sr: 0.5155, sf: 0.5537,
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

/**
 * [label, receiver, normal, card] past the union's points: the wraps, the shoes (a card: no sun state), the gap fade,
 * tilted receivers, a fading one
 */
const EXTRA_POINTS = Object.freeze([
  ['under a rear wrap', [1.5, 0, h.cz0 - 0.5], [0, 1, 0], false],
  ['just past the shoes', [h.xo + 0.01, 0, 0], [0, 1, 0], false],
  ['a shoe on the ground run', [1.5, 0.06, 0], [0, 1, 0], true],
  ['a shoe up the rear ramp', [1.6, 0.4, h.cz0 - 0.5], [0, 1, 0], true],
  ['a grass blade under the rear ramp', [1.5, 0.1, h.cz0 - 0.5], [0, 1, 0], true],
  ['the terrain under a pitched track end', [1.5, 0.09, h.cz0 - 0.5], [0, 1, 0.05], false],
  ['the ground under the ground run', [1.5, 0, 0], [0, 1, 0], false],
  ['a grass blade beside the hull', [2.3, 0.2, 0.5], [0, 1, 0], true],
  ['under a hull riding high', [0.4, -0.13, 1.0], [0, 1, 0], false],
  ['inside the gap fade', [h.xi - 0.05, 0, 0.5], [0, 1, 0], false],
  ['under the rear plate', [0.3, 0, -3.5], [0, 1, 0], false],
  ['a slope facing the hull', [2.6, 0.3, -2.0], [-0.4, 0.9, 0.17], false],
  ['a wall facing the hull', [-2.3, 0.6, 0.3], [1, 0, 0], false],
  ['a slope ahead', [-0.3, 0.1, 4.3], [0.1, 0.97, -0.2], false],
  ['fading behind', [0, 0, h.fz0 - 3.5], [0, 1, 0], false],
  // (2026-10-08) the runs as drawn: the third case lifts the right run's front and droops the left's middle
  ['under the right run, ahead', [1.5, 0, 1.5], [0, 1, 0], false],
  ['under the left run, 4 cm down', [-1.5, -0.04, 0.2], [0, 1, 0], false],
  ['a shoe of the left run, 3 cm down', [-1.5, -0.03, 0.2], [0, 1, 0], true],
  ['inside the right run\'s face, ahead', [h.xi - 0.05, 0, 1.8], [0, 1, 0], false],
  ['the lane\'s soft outer edge', [h.xo + 0.02, 0, -0.5], [0, 1, 0], false],
]);

/**
 * The GLSL receipt's cases: the uniforms the module itself packs (updateVehicleGroundOcclusionUniforms over roots whose
 * cached solid is the T-90M) and the CPU twin's expectation of 1 − shade at each receiver — the bare geometry (one hull,
 * no interreflection, the whole ambient share), snow under a sun with a second hull 6 m to the right, then (2026-10-08)
 * the runs as a gear draws them (its hull group's runningGearGroundRun: the right run's front lifted, the left's middle
 * drooped).
 */
export async function vehicleGroundGlslCases() {
  const THREE = await import('three');
  const M = await import('./vehicleGroundOcclusion.ts');
  const A = await import('./sceneAlpha.ts');
  const unitOf = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const receivers = [...UNION_POINTS.map(([label, p]) => [label, p, [0, 1, 0], false]), ...EXTRA_POINTS]
    .map(([label, p, nrm, card]) => [label, p, unitOf(nrm), card]);
  const rootAt = (x, reader = null) => {
    const root = new THREE.Group(); root.position.set(x, 0, 0); root.updateMatrixWorld(true);
    root.userData.groundAoShape = T90M; root.userData.groundAoShapeFor = null;
    if (reader) {
      const hullG = new THREE.Group(); root.add(hullG);
      hullG.userData.runningGearGroundRun = reader;
      root.userData.groundAoRunOwner = hullG;
    }
    return { root };
  };
  let packedRuns = null;
  const pack = (roots, rho, hullAlbedo, lamps = []) => {
    const u = M.createVehicleGroundOcclusionUniforms();
    M.updateVehicleGroundOcclusionUniforms(u, roots, true, rho, hullAlbedo, M.GROUND_AO_BELLY_VIEW, 1, lamps);
    const knots = u.uVehGroundR.value.flatMap((v) => v.toArray());
    packedRuns = { left: knots.slice(0, 8), right: knots.slice(8, 16) };
    return { hullCount: u.uVehGround.value, rows: u.uVehGroundM.value.flatMap((v) => v.toArray()),
      solids: u.uVehGroundB.value.flatMap((v) => v.toArray()), runs: knots, light: u.uVehGroundLight.value.toArray(),
      snow: u.uVehGroundSnow.value, keyCount: u.uVehKeyLight.value,
      keyP: u.uVehKeyLightP.value.flatMap((v) => v.toArray()), keyE: u.uVehKeyLightE.value.flatMap((v) => v.toArray()),
      r4: u.uVehGroundR4.value.toArray(), r5: u.uVehGroundR5.value.toArray(), r6: u.uVehGroundR6.value.toArray() };
  };
  // the block skips a pixel it barely touches; the hulls' joint share is capped (round 3: GROUND_AO_OCC_MAX; on snow —
  // contact r2: the receiver's own cover — GROUND_AO_OCC_MAX_SNOW)
  const UP = { x: 0, y: 1, z: 0 };
  // (round 4) a hull the receiver is a receiver of (its reach, not its skin, not one of its shoes): the crease's core, the
  // shoe band's sun shadow, the snow berm and (contact r2) the FX lamps' cut come only from such a hull
  const receives = (q, runs) => {
    const H = T90M.yt - T90M.y0;
    const dx = Math.abs(q.x) - T90M.hx, dz = Math.abs(q.z - 0.5 * (T90M.fz0 + T90M.fz1)) - 0.5 * (T90M.fz1 - T90M.fz0);
    const dOut = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
    if (dOut > H * M.GROUND_AO_REACH[1] || q.y > T90M.yt || q.y < T90M.y0 - H * M.GROUND_AO_REACH[1]) return false;
    return !(q.y > T90M.yb + 0.02 && dOut < M.GROUND_AO_HULL_SKIN_M);
  };
  // the GLSL's shade (round 4): 1 − occ·ambShare − sunShare·sunCut, the core past the cap, the band's shadow and the berm's
  // slopes on the sun share; `hulls` the receiver in each hull's frame, `ambShare` the pixel's, `snowW` its own snow weight
  // (contact r2); `keys` (contact r2, one hull at the origin): the lamps (world = hull frame), their irradiance E and the
  // pixel's T and A — the lamps' cut and the shares over T + A + ΣE (groundShadeWithKeyLights)
  const shade = (hulls, n, card, ambShare, sun, snowW, strengths, runs = null, keys = null) => {
    const per = [], cores = [];
    let band = 0, berm = 1, gear = 0;
    const blocked = keys ? keys.lamps.map(() => 0) : [];
    for (const q of hulls) {
      // (round 5) no shoe skip: the shoes carry the vehicle tag, a card in the lane is grass in the running gear
      if (!receives(q, runs)) continue;
      gear = Math.max(gear, M.gearWeight(q, T90M, card));
      per.push(M.vehicleGroundOcclusionLocal(q, n, T90M, strengths, card, runs, M.groundWallSoft(snowW)));
      cores.push(M.contactCoreOcclusion(q, T90M, runs, 1, snowW));
      band = Math.max(band, M.shoeBandSunShadow(q, T90M, sun, runs));
      berm *= M.snowBermGain(q, n, T90M, sun, snowW, runs);
      if (keys && !card) {
        // (the r2 final capture) a contact occlusion of the lamp: under and round the footprint, capped
        const kw = M.keyLightReach(q, T90M);
        keys.lamps.forEach((L, i) => { blocked[i] = Math.max(blocked[i], kw * M.hullBlocksKeyLight(q, L, T90M)); });
      }
    }
    const occ = M.combineVehicleGroundOcclusion(per, 0, Math.max(0, ...cores), M.gearCap(M.groundOcclusionCap(snowW), gear));
    const sunCut = 1 - (1 - band) * berm;
    if (occ <= 0.003 && Math.abs(sunCut) <= 0.003 && !(Math.max(0, ...blocked) > 0)) return 0;
    if (keys && !card) return 1 - M.groundShadeWithKeyLights(occ, keys.T, keys.A, keys.E, blocked, sunCut);
    return occ * ambShare + (1 - ambShare) * sunCut;
  };
  const base = { amb: [1, 1, 0, 0], fillDir: [0, 1, 0], sunDir: [0, 1, 0], points: receivers.map((r) => r[1]), normals: receivers.map((r) => r[2]),
    // the scene target's alpha: a card (no sun state) under 1.5, a lit pixel's 2 + its sun visibility
    alphas: receivers.map((r) => (r[3] ? 1 : 2.5)),
    // (2026-10-14, contact r2) the aerial pass's snow reader, the real one (the fixture stubs only the sun's)
    snowGlsl: A.SCENE_ALPHA_SNOW_READ_GLSL };
  const vec = (a) => ({ x: a[0], y: a[1], z: a[2] });
  // a card's ambient share: 0.6 in the open, the whole of it under a belly (inside a footprint, below the belly) — of a
  // hull the pixel is a receiver of (a shoe of hull A, or the hull's own skin, takes none from it)
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // (2026-10-10, round 3) all ambient only in the hull's own shadow: the ray toward the sun (here straight up) meets its box
  const underOf = (q, runs = null) => {
    const dx = Math.abs(q.x) - T90M.hx, dz = Math.abs(q.z - 0.5 * (T90M.fz0 + T90M.fz1)) - 0.5 * (T90M.fz1 - T90M.fz0);
    const dOut = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
    if (q.y > T90M.yb + 0.02 && dOut < M.GROUND_AO_HULL_SKIN_M) return 0;
    void smooth;
    return M.hullSunShadow(q, T90M, { x: 0, y: 1, z: 0 });
  };
  const cardShare = (q, runs = null) => M.GROUND_AO_CARD_AMBIENT_SHARE + (1 - M.GROUND_AO_CARD_AMBIENT_SHARE) * underOf(q, runs);
  const geometry = {
    name: 'geometry: one hull, no interreflection, the whole ambient share',
    input: { ...base, ...pack([rootAt(0)], 0.25, 0), sunLum: 0 },
    expected: receivers.map(([, p, nrm, card]) => shade([vec(p)], vec(nrm), card, card ? cardShare(vec(p)) : 1, UP, 0, { belly: 1, wall: 1 })),
  };
  const kSun = 0.65, snow = M.vehicleGroundStrengths(0.8, kSun, M.GROUND_AO_HULL_ALBEDO, M.GROUND_AO_BELLY_VIEW);
  const snowInput = pack([rootAt(0), rootAt(6)], 0.8, M.GROUND_AO_HULL_ALBEDO);
  // (2026-10-14, contact r2) every lit receiver is snowy terrain, written in the snow band (its sun whole: the fixture's
  // stub reads every lit alpha as visibility 1); a card carries no snow
  const snowAlphas = receivers.map((r) => (r[3] ? 1 : A.encodeSceneAlpha(1, 1)));
  const sunlit = {
    name: 'snow under a sun, a second hull 6 m to the right (contact r2: the receiver\'s own snow cover)',
    input: { ...base, ...snowInput, alphas: snowAlphas, sunLum: kSun },
    expected: receivers.map(([, p, nrm, card], i) => shade([vec(p), { x: p[0] - 6, y: p[1], z: p[2] }], vec(nrm), card,
      card ? cardShare(vec(p)) : 1 / (1 + kSun * Math.max(nrm[1], 0)), UP, snowInput.snow * A.decodeSceneSnow(snowAlphas[i]), snow)),
  };
  // the gear's (z, travel) pairs a side, hull-local: the right run climbing from its rear to 9 cm up at its front wheel,
  // the left's middle wheels drooped 4 cm (the band between them follows)
  const drawnWheels = {
    [-1]: [[-2.2, 0], [-1.4, 0], [-0.6, -0.04], [0.2, -0.04], [1.0, -0.04], [1.8, 0], [2.4, 0]],
    [1]: [[-2.2, 0], [-1.4, 0], [-0.6, 0.01], [0.2, 0.03], [1.0, 0.05], [1.8, 0.07], [2.4, 0.09]],
  };
  const reader = (side, out) => { drawnWheels[side].forEach(([z, t], i) => { out[i * 2] = z; out[i * 2 + 1] = t; }); return drawnWheels[side].length; };
  const drawnInput = pack([rootAt(0, reader)], 0.25, 0);
  const runs = packedRuns;
  const drawn = {
    name: 'the runs as drawn: the right run lifted ahead, the left drooped in the middle',
    input: { ...base, ...drawnInput, sunLum: 0 },
    expected: receivers.map(([, p, nrm, card]) => shade([vec(p)], vec(nrm), card, card ? cardShare(vec(p), runs) : 1, UP, 0, { belly: 1, wall: 1 }, runs)),
  };
  // (round 4) grass under a low sun from the hull's left (32°, the Verdant day), the runs as drawn: the shoe band's sun line
  // on the right run's shade side, the crease's core, the softer broad share — and the grime on the hull's own pixels
  const lowSun = [-Math.cos(0.5585), Math.sin(0.5585), 0.12];
  const lowSunLen = Math.hypot(...lowSun), sunL = lowSun.map((v) => v / lowSunLen);
  const kLow = 2.2, grass = M.vehicleGroundStrengths(0.25, kLow * Math.max(sunL[1], 0), M.GROUND_AO_HULL_ALBEDO, M.GROUND_AO_BELLY_VIEW);
  const lowInput = pack([rootAt(0, reader)], 0.25, M.GROUND_AO_HULL_ALBEDO);
  const underLow = (q) => (!receives(q, runs)) ? 0 : M.hullSunShadow(q, T90M, vec(sunL));
  const lowSunCase = {
    name: 'grass under a low sun from the left, the runs as drawn',
    input: { ...base, ...lowInput, sunLum: kLow, sunDir: sunL },
    expected: receivers.map(([, p, nrm, card]) => {
      const q = vec(p), n = vec(nrm);
      const T = kLow * Math.max(n.x * sunL[0] + n.y * sunL[1] + n.z * sunL[2], 0);
      const amb = card ? M.GROUND_AO_CARD_AMBIENT_SHARE + (1 - M.GROUND_AO_CARD_AMBIENT_SHARE) * underLow(q) : 1 / (1 + T);
      return shade([q], n, card, amb, vec(sunL), 0, grass, runs);
    }),
    expectedGrime: receivers.map(([, p]) => M.vehicleGrime(vec(p), T90M, runs)),
  };
  // (contact r2, 2026-10-14) a night flare high over the hull's front left and a low blast off its right: the ground the hull
  // stands between and each lamp loses that lamp's share; the night's sky its ambient share (no sun)
  const lamp = (x, y, z, intensity, distance) => {
    const parent = new THREE.Group(); const light = new THREE.PointLight(0xffffff, intensity, distance, 2);
    light.position.set(x, y, z); parent.add(light); return light;
  };
  const lamps = [lamp(-3, 12, 6, 220, 0), lamp(5.5, 0.6, -1, 30, 13)];
  const keyInput = pack([rootAt(0)], 0.25, 0, lamps);
  const keyed = {
    name: '(contact r2) a night flare and a low blast, one hull: the lamps it stands in front of',
    input: { ...base, ...keyInput, sunLum: 0 },
    expected: receivers.map(([, p, nrm, card]) => {
      const q = vec(p), n = vec(nrm);
      const at = [], E = [];
      for (let i = 0; i < keyInput.keyCount; i++) {
        const P4 = keyInput.keyP.slice(i * 4, i * 4 + 4), E4 = keyInput.keyE.slice(i * 4, i * 4 + 4);
        at.push({ x: P4[0], y: P4[1], z: P4[2] });
        E.push(M.keyLightIrradiance(q, n, at[i], E4[0], P4[3], E4[1]));
      }
      // the night's sky: A = 1 whatever the normal (amb (1, 1, 0, 0)), no sun
      return shade([q], n, card, card ? cardShare(q) : 1, UP, 0, { belly: 1, wall: 1 }, null, { lamps: at, E, T: 0, A: 1 });
    }),
  };
  return { labels: receivers.map((r) => r[0]), cases: [geometry, sunlit, drawn, lowSunCase, keyed], glsl: M.VEHICLE_GROUND_OCCLUSION_GLSL };
}
