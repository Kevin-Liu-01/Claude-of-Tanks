// Read-only census (Main 2026-10-28): how far each tank's calibrated anatomy envelope (combatAnatomyCalibrations, from its
// primary 'turret' and 'hull' bucket geometry) stands beyond its own authored main plates. reconcileFrame
// (src/vehicles/combatAnatomy.ts) maps the authored plate bounds onto that envelope, so every metre of growth moves the
// plates out. With --parts=<ids>, the primary-bucket parts standing past the authored plates (the attribution).
//   node .qa-dev/census/stretch-census.mjs [--parts=a,b]
const { enableCombatAnatomyMeasurementMode } = await import('../../src/vehicles/combatAnatomyMeasurementMode.ts');
enableCombatAnatomyMeasurementMode();
await import('../../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('../../src/vehicles/specs.ts');
const { authoredCombatAnatomy } = await import('../../src/vehicles/combatAnatomy.ts');
const { COMBAT_ANATOMY_CALIBRATIONS } = await import('../../src/vehicles/combatAnatomyCalibrations.ts');
const r3 = (x) => Math.round(x * 1000) / 1000;
const bounds = (plates) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of plates || []) if ((p.kind || 'main') === 'main') for (const v of p.verts) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v[a]); max[a] = Math.max(max[a], v[a]); }
  return Number.isFinite(min[0]) ? { min, max } : null;
};
const partsArg = process.argv.find((a) => a.startsWith('--parts='))?.slice(8);
if (!partsArg) {
  for (const id of ALL_TANK_IDS) {
    const row = { id };
    try {
      getSpec(id);
      const authored = authoredCombatAnatomy(id), cal = COMBAT_ANATOMY_CALIBRATIONS[id];
      if (!authored || !cal) { row.skip = !authored ? 'no authored anatomy' : 'no calibration'; console.log(JSON.stringify(row)); continue; }
      for (const [frame, plates] of [['turret', authored.armor.turretPlates], ['hull', authored.armor.hullPlates]]) {
        const from = bounds(plates), to = cal[frame];
        if (!from || !to) continue;
        row[frame] = { side: r3(Math.max(to.max[0] - from.max[0], from.min[0] - to.min[0])), front: r3(to.max[2] - from.max[2]),
          rear: r3(from.min[2] - to.min[2]), plateW: r3(from.max[0] - from.min[0]), plateL: r3(from.max[2] - from.min[2]),
          envW: r3(to.max[0] - to.min[0]), envL: r3(to.max[2] - to.min[2]), from: [from.min.map(r3), from.max.map(r3)] };
      }
    } catch (e) { row.error = String(e?.message ?? e).slice(0, 160); }
    console.log(JSON.stringify(row));
  }
} else {
  const { createTank } = await import('../../src/vehicles/tankFactory.ts');
  for (const id of partsArg.split(',')) {
    getSpec(id);
    const authored = authoredCombatAnatomy(id), out = { id };
    const t = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, batchStatic: false, decor: false, camoSeed: 4242, quality: 'high' });
    for (const [frame, plates] of [['turret', authored.armor.turretPlates], ['hull', authored.armor.hullPlates]]) {
      const from = bounds(plates);
      const parts = (t.root.userData.combatGeometryParts || []).filter((p) => p.bucket === frame);
      const proud = parts.map((p) => {
        const d = p.max.map((v, i) => v - p.min[i]);
        const past = Math.max(from.min[0] - p.min[0], p.max[0] - from.max[0], from.min[2] - p.min[2], p.max[2] - from.max[2]);
        return { past: r3(past), dims: d.map(r3), min: p.min.map(r3), max: p.max.map(r3) };
      }).filter((p) => p.past > 0.03).sort((a, b) => b.past - a.past);
      out[frame] = { parts: parts.length, proud: proud.length, thin: proud.filter((p) => Math.min(...p.dims) <= 0.07).length, top: proud.slice(0, 8) };
    }
    t.dispose();
    console.log(JSON.stringify(out));
  }
}
