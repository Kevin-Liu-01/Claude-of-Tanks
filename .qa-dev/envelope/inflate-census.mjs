// Read-only census (Main 2026-10-28): primary 'turret' and 'hull' bucket parts that are thin or small, stand past the
// tank's own authored main plates, and so inflate the calibrated armour envelope (the plates are mapped onto it by
// reconcileFrame, src/vehicles/combatAnatomy.ts). Per tank and frame: the flagged parts and how far the envelope shrinks
// without them (the OTCO fix's counterfactual).
//   node .qa-dev/census/inflate-census.mjs <from> <to>   (ALL_TANK_IDS indices) -> one JSON line per id
const { enableCombatAnatomyMeasurementMode } = await import('../../src/vehicles/combatAnatomyMeasurementMode.ts');
enableCombatAnatomyMeasurementMode();
await import('../../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('../../src/vehicles/specs.ts');
const { authoredCombatAnatomy } = await import('../../src/vehicles/combatAnatomy.ts');
const { createTank } = await import('../../src/vehicles/tankFactory.ts');
const [from, to] = process.argv.slice(2).map(Number);
const r3 = (x) => Math.round(x * 1000) / 1000, PAST = 0.05, THIN = 0.07, SMALL = 0.02;
const plateBox = (plates) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of plates || []) if ((p.kind || 'main') === 'main') for (const v of p.verts) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v[a]); max[a] = Math.max(max[a], v[a]); }
  return Number.isFinite(min[0]) ? { min, max } : null;
};
const union = (ps) => ps.length ? { min: [0, 1, 2].map((i) => Math.min(...ps.map((p) => p.min[i]))), max: [0, 1, 2].map((i) => Math.max(...ps.map((p) => p.max[i]))) } : null;
const dims = (p) => p.max.map((v, i) => v - p.min[i]);
const vol = (p) => dims(p).reduce((a, b) => a * Math.max(b, 1e-3), 1);
for (const id of ALL_TANK_IDS.slice(from, to)) {
  const row = { id };
  try {
    getSpec(id);
    const authored = authoredCombatAnatomy(id);
    const t = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, batchStatic: false, decor: false, camoSeed: 4242, quality: 'high' });
    const receipts = t.root.userData.combatGeometryParts || [];
    for (const [frame, plates] of [['turret', authored?.armor.turretPlates], ['hull', authored?.armor.hullPlates]]) {
      const plate = plateBox(plates), parts = receipts.filter((p) => p.bucket === frame);
      if (!plate || parts.length < 2) continue;
      const maxVol = Math.max(...parts.map(vol));
      const past = (p) => Math.max(plate.min[0] - p.min[0], p.max[0] - plate.max[0], plate.min[2] - p.min[2], p.max[2] - plate.max[2]);
      const flagged = parts.filter((p) => past(p) > PAST && (Math.min(...dims(p)) <= THIN || vol(p) <= maxVol * SMALL));
      const all = union(parts), kept = union(parts.filter((p) => !flagged.includes(p)));
      if (!kept) continue;
      const shrink = { side: r3(Math.max(all.max[0] - kept.max[0], kept.min[0] - all.min[0])), front: r3(all.max[2] - kept.max[2]), rear: r3(kept.min[2] - all.min[2]) };
      row[frame] = { parts: parts.length, flagged: flagged.length, shrink,
        env: [r3(all.max[0] - all.min[0]), r3(all.max[2] - all.min[2])], without: [r3(kept.max[0] - kept.min[0]), r3(kept.max[2] - kept.min[2])],
        top: flagged.sort((a, b) => past(b) - past(a)).slice(0, 6).map((p) => ({ past: r3(past(p)), dims: dims(p).map(r3), at: p.min.map((v, i) => r3((v + p.max[i]) / 2)) })) };
    }
    t.dispose();
  } catch (e) { row.error = String(e?.message ?? e).slice(0, 160); }
  console.log(JSON.stringify(row));
}
