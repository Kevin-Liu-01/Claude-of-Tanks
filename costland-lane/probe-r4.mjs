const M = await import(process.cwd() + '/src/engine/vehicleGroundOcclusion.ts');
const S = await import(process.cwd() + '/src/engine/vehicleGroundOcclusion.test-support.mjs');
const T = S.T90M, UP = { x: 0, y: 1, z: 0 };
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
const sL = unit(-1, 1, 0), sR = unit(1, 1, 0);
for (const b of [0.01, 0.03, 0.06, 0.11, 0.16, 0.19, 0.21]) {
  const q = { x: T.xo + b, y: 0, z: 0 };
  console.log(`berm beyond ${b}: noon ${M.snowBermGain(q, UP, T, UP, 1).toFixed(3)} sunBeyondTrack(L) ${M.snowBermGain(q, UP, T, sL, 1).toFixed(3)} sunOutside(R) ${M.snowBermGain(q, UP, T, sR, 1).toFixed(3)}`);
}
for (const b of [0, 0.02, 0.05, 0.08, 0.1, 0.12, 0.2, 0.4]) {
  const q = { x: T.xo + b, y: 0, z: 0 };
  console.log(`band beyond ${b}: 45L ${M.shoeBandSunShadow(q, T, sL).toFixed(3)} 32L ${M.shoeBandSunShadow(q, T, unit(-Math.cos(0.5585), Math.sin(0.5585), 0)).toFixed(3)}`);
}
// profile beside the track in shadow, with core + soft
const st = M.vehicleGroundStrengths(0.25, 2.0);
for (const d of [0, 0.01, 0.02, 0.035, 0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2]) {
  const q = { x: T.xo + d, y: 0, z: 0 };
  const occ = M.combineVehicleGroundOcclusion([M.vehicleGroundOcclusionLocal(q, UP, T, st, false)], 0, M.contactCoreOcclusion(q, T));
  console.log(`beside ${d}: shade-in-shadow ${(1 - occ).toFixed(3)}`);
}
