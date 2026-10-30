// The gun-face split's fleet table (265, release 266; src/sim/gunFaceSplit.ts): per turreted vehicle, the share of
// frontal turret hits whose plate the split moves. Level rays from dead ahead on a 4 cm grid over the gun plates'
// windows widened 0.8 m in x and 0.2 m in height (turret yaw 0), traced as built and again with every turret face's
// split taken off (the reads before 266): hits, moved, moved onto a gun plate (+gun) and off one (-gun), the plate
// moves, and the line-of-sight KE median (keMm / cos impact) before and after.
//   cd <worktree> && node tools/gun-face-split-table.mjs [--ids=a,b] [--json=out.json]
// Copyright © 2026 Kevin B. Liu.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const imp = (path) => import(pathToFileURL(resolve(path)).href);
await imp('src/vehicles/tankFactory.ts');
const THREE = await imp('node_modules/three/build/three.module.js');
const { getSpec, PRODUCTION_TANK_IDS } = await imp('src/vehicles/specs.ts');
const { tankPoseFromState, traceTank } = await imp('src/sim/armor.ts');

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ids = arg('ids') ? arg('ids').split(',') : PRODUCTION_TANK_IDS;
const GUN_FACE_PLATE = /mantlet|gun_notch/i;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pose = tankPoseFromState({ pos: V(0, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
const losOf = (hit) => Math.round((hit.plate.keMm ?? 0) / Math.max(0.05, Math.cos(((hit.impactAngleDeg ?? 0) * Math.PI) / 180)));
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

/** The first plate each grid ray meets on the turret: [plate, los] per grid point (null: none or not the turret). */
function frontReads(armor, grid) {
  return grid.map(([x, y]) => {
    const hit = traceTank(V(x, y, 12), V(x, y, -12), pose, armor).find((h) => h.kind === 'plate');
    return hit && hit.impactFrame === 'turret' ? [hit.plate, losOf(hit)] : null;
  });
}

const table = {};
for (const id of ids) {
  const armor = getSpec(id).armor;
  const gun = (armor.turretPlates ?? []).filter((p) => (p.kind || 'main') === 'main' && GUN_FACE_PLATE.test(p.name) && p.verts?.length >= 3);
  if (!gun.length || !armor.collisionShells?.turret?.length) continue;
  const pivot = armor.turretPivot ?? [0, 0, 0];
  const xs = gun.flatMap((p) => p.verts.map((v) => v[0])), ys = gun.flatMap((p) => p.verts.map((v) => v[1]));
  const grid = [];
  for (let y = Math.min(...ys) - 0.2; y <= Math.max(...ys) + 0.2 + 1e-9; y += 0.04) {
    for (let x = Math.min(...xs) - 0.8; x <= Math.max(...xs) + 0.8 + 1e-9; x += 0.04) grid.push([x + pivot[0], y + pivot[1]]);
  }
  const after = frontReads(armor, grid);
  const stripped = [];
  for (const cell of armor.collisionShells.turret) for (const face of cell.faces) if (face.gunSplit) { stripped.push([face, face.gunSplit]); delete face.gunSplit; }
  let before;
  try { before = frontReads(armor, grid); } finally { for (const [face, split] of stripped) face.gunSplit = split; }
  const gunPlates = new Set(gun);
  let hits = 0, moved = 0, toGun = 0, offGun = 0;
  const moves = {}, losBefore = [], losAfter = [];
  for (let index = 0; index < grid.length; index++) {
    const b = before[index], a = after[index];
    if (!b || !a) continue;
    hits++;
    losBefore.push(b[1]);
    losAfter.push(a[1]);
    if (a[0] === b[0]) continue;
    moved++;
    if (gunPlates.has(a[0])) toGun++;
    else offGun++;
    const key = `${b[0].name}->${a[0].name}`;
    moves[key] = (moves[key] ?? 0) + 1;
  }
  table[id] = { hits, moved, share: hits ? +(moved / hits).toFixed(3) : 0, toGun, offGun, losBefore: median(losBefore), losAfter: median(losAfter), moves };
}

const rows = Object.entries(table).sort((a, b) => b[1].share - a[1].share || a[0].localeCompare(b[0]));
for (const [id, r] of rows) {
  if (!r.moved) continue;
  const top = Object.entries(r.moves).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`${id.padEnd(26)} ${String(r.moved).padStart(4)}/${String(r.hits).padEnd(5)} ${String(Math.round(r.share * 100)).padStart(3)}%  +gun ${String(r.toGun).padStart(3)} -gun ${String(r.offGun).padStart(3)}  LOS ${r.losBefore}->${r.losAfter}  ${top}`);
}
const at = (share) => rows.filter(([, r]) => r.share >= share).length;
console.log(`gun-face split: ${rows.length} turreted vehicles; any frontal hit moved ${rows.filter(([, r]) => r.moved).length}; >=1% ${at(0.01)}; >=5% ${at(0.05)}; >=10% ${at(0.1)}`);
if (arg('json')) writeFileSync(arg('json'), `${JSON.stringify(table, null, 1)}\n`);
