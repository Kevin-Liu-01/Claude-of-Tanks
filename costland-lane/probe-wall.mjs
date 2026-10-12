const M = await import(process.cwd() + '/src/engine/vehicleGroundOcclusion.ts');
const S = await import(process.cwd() + '/src/engine/vehicleGroundOcclusion.test-support.mjs');
const h = S.T90M;
const st = M.vehicleGroundStrengths(0.25, 2.0);
console.log('strengths grass k=2', st);
for (const d of [-0.1, 0, 0.01, 0.02, 0.035, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.8, 1.2, 2, 3]) {
  const q = { x: h.xo + d, y: 0, z: 0 };
  const occ = M.vehicleGroundOcclusionLocal(q, { x: 0, y: 1, z: 0 }, h, st, false);
  const rim = M.underTrackOcclusion(q, h);
  console.log(`beside ${d.toFixed(3)} m: occ ${occ.toFixed(3)} (rim ${rim.toFixed(3)}) shade-in-shadow ${(1 - Math.min(occ, M.GROUND_AO_OCC_MAX)).toFixed(3)}`);
}
