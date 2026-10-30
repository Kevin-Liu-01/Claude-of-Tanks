// Read-only census (Main 2026-10-28): primary 'turret' and 'hull' bucket parts that stand proud of the bucket's bulky
// core and so inflate the combat anatomy's armour envelope (tools/gen-combat-anatomy.mjs PRIMARY_BUCKETS).
//   node .qa-dev/census/envelope-census.mjs <from> <to>   (indices into ALL_TANK_IDS) -> one JSON line per id
import '../../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS } from '../../src/vehicles/specs.ts';
import { createTank } from '../../src/vehicles/tankFactory.ts';
const [from, to] = process.argv.slice(2).map(Number);
const opts = { proceduralOnly: true, geometryReceipt: true, batchStatic: false, decor: false, camoSeed: 4242, quality: 'high' };
const r3 = (x) => Math.round(x * 1000) / 1000;
const dims = (p) => p.max.map((v, i) => v - p.min[i]);
const vol = (p) => dims(p).reduce((a, b) => a * Math.max(b, 1e-3), 1);
const union = (ps) => ({ min: [0, 1, 2].map((i) => Math.min(...ps.map((p) => p.min[i]))), max: [0, 1, 2].map((i) => Math.max(...ps.map((p) => p.max[i]))) });
for (const id of ALL_TANK_IDS.slice(from, to)) {
  const row = { id };
  try {
    const t = createTank(id, null, opts);
    const receipts = t.root.userData.combatGeometryParts || [];
    for (const bucket of ['turret', 'hull']) {
      const parts = receipts.filter((p) => p.bucket === bucket);
      if (parts.length < 2) { row[bucket] = { parts: parts.length }; continue; }
      const maxVol = Math.max(...parts.map(vol));
      const core = union(parts.filter((p) => vol(p) >= maxVol * 0.05)), env = union(parts);
      const grow = { xNeg: core.min[0] - env.min[0], xPos: env.max[0] - core.max[0], zNeg: core.min[2] - env.min[2], zPos: env.max[2] - core.max[2] };
      const cw = core.max[0] - core.min[0], cl = core.max[2] - core.min[2], ew = env.max[0] - env.min[0], el = env.max[2] - env.min[2];
      const proud = parts.filter((p) => vol(p) < maxVol * 0.05).map((p) => {
        const out = Math.max(core.min[0] - p.min[0], p.max[0] - core.max[0], core.min[2] - p.min[2], p.max[2] - core.max[2]);
        return { out: r3(out), dims: dims(p).map(r3), min: p.min.map(r3), max: p.max.map(r3), module: p.module ?? null, parent: p.parent ?? null };
      }).filter((p) => p.out > 0.03).sort((a, b) => b.out - a.out);
      row[bucket] = { parts: parts.length, core: { w: r3(cw), l: r3(cl) }, env: { w: r3(ew), l: r3(el) },
        grow: Object.fromEntries(Object.entries(grow).map(([k, v]) => [k, r3(v)])), footprint: r3(ew * el / (cw * cl) - 1),
        proudCount: proud.length, thin: proud.filter((p) => Math.min(...p.dims) <= 0.07).length, proud: proud.slice(0, 12) };
    }
    t.dispose();
  } catch (e) { row.error = String(e?.message ?? e).slice(0, 200); }
  console.log(JSON.stringify(row));
}
