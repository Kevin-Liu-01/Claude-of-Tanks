// Lane tool (envelope-honesty-264): the look must not change. Every built part (all buckets) as
// [parent group, material key, camo?, rounded box], before and after an anatomy-only edit: the multiset must be identical
// (a bucket move relabels a part; it never moves, reshapes or repaints one). Reports the relabels.
//   node .qa-dev/envelope/look.mjs baseline <id,id,...>    writes .qa-dev/envelope/look/<id>.json
//   node .qa-dev/envelope/look.mjs compare <id,id,...>     exit 1 on any geometry or material change
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const [mode, list] = process.argv.slice(2);
const ids = (list || '').split(',').filter(Boolean);
if (!['baseline', 'compare'].includes(mode) || !ids.length) throw new Error('usage: look.mjs baseline|compare <ids>');
const { createTank } = await import('../../src/vehicles/tankFactory.ts');
const { bucketMaterialKey } = await import('../../src/vehicles/tankFactoryCore.ts');
const dir = new URL('./look/', import.meta.url);
mkdirSync(dir, { recursive: true });
const CAMO = /^(hull|hullCupola|hullHatch|hullExternalArmor|hullEquipment|hullGun|hullDetail|hullPaintedDetail|hullOpenLattice|hullFixedPaintedBodywork|hullTrackGuardL|hullTrackGuardR|hullTrackDetailL|hullTrackDetailR|turret|turretCupola|turretHatch|turretExternalArmor|turretEquipment|turretDetail|turretPaintedDetail|turretOpenLattice|gun|gunMount|gunMountLamp|gunBarrel0|gunBarrel1)$/;
const r = (v) => (Math.round(v * 1e4) / 1e4).toFixed(4);
let bad = 0;
for (const id of ids) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const parts = [], buckets = [];
  for (const p of tank.root.userData.combatGeometryParts || []) {
    const key = `${p.parent}|${bucketMaterialKey(p.bucket)}|${CAMO.test(p.bucket) ? 'camo' : 'flat'}|${p.min.map(r).join(',')}|${p.max.map(r).join(',')}`;
    parts.push(key); buckets.push(`${key}|${p.bucket}`);
  }
  tank.dispose();
  parts.sort(); buckets.sort();
  const file = new URL(`${id}.json`, dir);
  if (mode === 'baseline') { writeFileSync(file, JSON.stringify({ id, parts, buckets })); console.log(`${id}: ${parts.length} parts`); continue; }
  if (!existsSync(file)) { console.log(`${id}: no baseline`); bad++; continue; }
  const base = JSON.parse(readFileSync(file, 'utf8'));
  const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const a = count(base.parts), b = count(parts);
  const gone = [...a].filter(([k, n]) => (b.get(k) || 0) < n).map(([k]) => k);
  const added = [...b].filter(([k, n]) => (a.get(k) || 0) < n).map(([k]) => k);
  const ab = count(base.buckets), bb = count(buckets);
  const relabelled = [...bb].filter(([k, n]) => (ab.get(k) || 0) < n).map(([k, n]) => `${k.split('|').at(-1)} x${n - (ab.get(k) || 0)}`);
  const moves = {};
  for (const entry of relabelled) { const [bucket] = entry.split(' '); moves[bucket] = (moves[bucket] || 0) + Number(entry.split('x').at(-1)); }
  if (gone.length || added.length) { bad++; console.log(`${id}: LOOK CHANGED: ${gone.length} parts gone, ${added.length} new`); for (const k of [...gone.slice(0, 5), ...added.slice(0, 5)]) console.log(`   ${k}`); }
  else console.log(`${id}: look identical (${parts.length} parts); relabelled into: ${JSON.stringify(moves)}`);
}
if (bad) process.exitCode = 1;
