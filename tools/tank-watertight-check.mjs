#!/usr/bin/env node
// Watertight check for tank bodies: "pour water into the turret or hull and it must not spill out".
//
//   node tools/tank-watertight-check.mjs --ids=abramsx,leclerc [--voxel=0.025] [--exclude=<regex>] [--json=path] [--gate] [--verbose] [--no-fills] [--no-lanes] [--full-body]
//   node tools/tank-watertight-check.mjs --self-test
//
// The built tank's body triangles (running gear, decals, shadow proxies, wires and soft goods excluded) are
// voxelised conservatively; the exterior is flood-filled from the grid border; a voxel counts as DEEP INTERIOR
// when a body shell lies in all six axis directions from it (so open nooks — the turret-ring slit, deck recesses,
// the space under the belly or between skirt and hull — never qualify). Any deep-interior voxel the exterior
// flood reaches is a LEAK: the body has a gap there that water would pour through. Leaks are clustered and
// reported with their position (tank frame), volume, the shell groups around them, and the mouth (where the
// water exits). --gate exits 1 when any listed tank leaks more than --max-leak-l litres (default 0.05).
// Track lanes (2026-09-21, follow-up to d0cbb9fcd): the volume a track band and its shoe belt sweep is never body
// interior — the fill generator leaves it as air (tools/track-lane-boxes.mjs, the one lane definition both tools
// read) — yet where a hull's nose or sponsons enclose that lane the deep-interior test still saw water there and
// the Jagdpanzer E100 X read 4.53 L, the Leclerc classic X 0.80 L of lane air as "leaks". Deep-interior water inside
// a lane box is therefore excluded from the leak and REPORTED SEPARATELY as track-lane volume, so nothing is hidden;
// --no-lanes restores the plain measurement and --self-test proves on synthetic bodies that a real hole beside a
// lane is still reported and that leak + lane equals the plain leak.
// Fill policy (2026-10-02): the body is the boundary the tank's fill generation bounds plus its shipped fill solids
// (tools/tank-watertight-measure.mjs, shared with the fleet gate): primary-body and launcher hulls are measured against
// their authored shells, so the external-fitting air their policy leaves open is not misread as a leak, and the Barak's
// retained rear bay is reported apart. --full-body restores the all-mesh measurement for diagnosis.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { collectTriangles } from './tank-surface-collect.mjs';
import { DEFAULT_EXCLUDE } from './tank-voxel-body.mjs';
import { trackLaneBoxesForVoxel } from './track-lane-boxes.mjs';
import { measureWatertight, retainedSourceAir, watertightBody } from './tank-watertight-measure.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const VOXEL = Number(opt('voxel', '0.025'));
const MAX_LEAK_L = Number(opt('max-leak-l', '0.05'));
// Running gear, decals, shadow proxies, wires and soft goods are not body: the owner's rule is "hull and turret,
// not tracks or fenders". Wheel/hub/sprocket names cover the source-fitted road wheels that are not in 'gear' buckets.
// Fills to zero (2026-09-15): the check must drop exactly the meshes the fill generator drops. Its own
// case-insensitive copy of the pattern also matched every unnamed body mesh (three.js names them
// "Mesh"; the pattern's `^mesh` was meant for the hull's mesh-grille parts), so thousands of hull
// triangles vanished from the check alone (KF51 89.9 L, Leopard 2A5 6.4 L…). Share DEFAULT_EXCLUDE;
// an explicit --exclude stays case-insensitive as documented.
const EXCLUDE = opt('exclude') ? new RegExp(opt('exclude'), 'i') : DEFAULT_EXCLUDE;
const verbose = flag('verbose');
const lanesOn = !flag('no-lanes');
const fullBody = flag('full-body');
const { createTank } = await import('../src/vehicles/tankFactory.ts');
// Interior fills 2026-09-13: the shipped tank carries its generated fills; --no-fills measures the authored shells alone.
if (!flag('no-fills')) { const { ensureAllInteriorFills } = await import('../src/vehicles/interiorFills.ts'); await ensureAllInteriorFills(); }
const ids = opt('ids', 'abramsx').split(',').filter(Boolean);

/** One measurement through the shared module (lane volume and retained air are reported apart from the leak). */
function measure(tris, meshes, laneBoxes, retainedAir = null) {
  return measureWatertight(tris, meshes, laneBoxes, { voxel: VOXEL, exclude: EXCLUDE, maxLeakL: MAX_LEAK_L, retainedAir });
}
// The leading "N L reaches the deep interior" token is the line's contract for log readers; lane evidence follows it.
function describe(label, r, seconds) {
  const lanes = lanesOn ? `track lane ${r.trackLaneL} L excluded (${r.laneBoxes} lane${r.laneBoxes === 1 ? '' : 's'})` : 'track lanes not excluded (--no-lanes)';
  const retained = r.retainedL ? `; retained source air ${r.retainedL} L` : '';
  return `${label}: ${r.watertight ? 'WATERTIGHT' : 'LEAKING'} — ${r.leakL} L reaches the deep interior (${r.clusters.length} gap${r.clusters.length === 1 ? '' : 's'}); ${lanes}${retained}; enclosed ${r.enclosedL} L of ${r.deepL} L deep interior; ${r.grid.bodyTris} body tris, grid ${r.grid.nx}x${r.grid.ny}x${r.grid.nz} @ ${VOXEL} m${seconds === undefined ? '' : ` (${seconds} s)`}`;
}

if (flag('self-test')) {
  // Synthetic bodies through the same measurement: a closed box holds water; a roof hole leaks; beside a body-excluded
  // track band (gear*) the hole's leak is still reported while the deep water inside the band's lane box is excluded
  // and reported as lane volume — and leak + lane equals the plain leak, so the exclusion hides nothing.
  const box = (name, w, h, d, x = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 8, 5, 12), new THREE.MeshBasicMaterial()); m.name = name; m.position.x = x; return m; };
  const group = (...meshes) => { const g = new THREE.Group(); for (const m of meshes) g.add(m); return g; };
  // roof hole: the +y face triangles whose centroid lies within 0.1 m of (x -0.2, z 0) — the left half of the roof
  const punchRoof = (tris) => tris.filter((t) => !(Math.min(t.ay, t.by, t.cy) > 0.249 && Math.hypot((t.ax + t.bx + t.cx) / 3 + 0.2, (t.az + t.bz + t.cz) / 3) < 0.1));
  const run = (root, punch) => { const { tris, meshes } = collectTriangles(root); return measure(punch ? punchRoof(tris) : tris, meshes, trackLaneBoxesForVoxel(root, VOXEL)); };
  const closed = run(group(box('hull', 0.8, 0.5, 1.2)), false);
  const plain = run(group(box('hull', 0.8, 0.5, 1.2)), true);
  // the band sits in the box's right half (x 0.30..0.36): its padded lane box covers deep water there, not the hole
  const beside = run(group(box('hull', 0.8, 0.5, 1.2), box('gearTrackBandR', 0.06, 0.4, 1.0, 0.33)), true);
  console.log(describe('[self-test] closed box', closed));
  console.log(describe('[self-test] holed box', plain));
  console.log(describe('[self-test] holed box beside a track lane', beside));
  const sum = +(beside.leakL + beside.trackLaneL).toFixed(2);
  console.log(`[self-test] conservation: leak ${beside.leakL} L + lane ${beside.trackLaneL} L = ${sum} L vs plain leak ${plain.leakL} L`);
  const ok = closed.leakL === 0 && closed.trackLaneL === 0 && closed.laneBoxes === 0
    && plain.leakL > 0 && plain.trackLaneL === 0 && plain.laneBoxes === 0
    && beside.laneBoxes === 1 && beside.leakL > 0 && beside.trackLaneL > 0 && Math.abs(sum - plain.leakL) <= 0.02;
  console.log(`[self-test] ${ok ? 'PASS' : 'FAIL'}: closed box holds, a roof hole leaks, the hole beside a lane is still reported, leak + lane = plain leak`);
  process.exit(ok ? 0 : 1);
}

const report = []; let failures = 0;
for (const id of ids) {
  const started = performance.now();
  let tank;
  try { tank = createTank(id, null, { proceduralOnly: true }); } catch (error) { console.log(`${id}: build failed: ${error.message}`); failures++; continue; }
  const { tris, meshes } = collectTriangles(tank.root);
  const body = fullBody ? tris : watertightBody(id, tris, meshes);
  const r = measure(body, meshes, lanesOn ? trackLaneBoxesForVoxel(tank.root, VOXEL) : [], fullBody ? null : retainedSourceAir(id));
  const { grid, clusters, enclosedL, deepL, leakL, trackLaneL, watertight } = r;
  if (!watertight) failures++;
  report.push({ id, watertight, leakL, trackLaneL, retainedL: r.retainedL, body: fullBody ? 'full' : 'fill-policy', laneBoxes: r.laneBoxes, lanesExcluded: lanesOn, enclosedL, deepL, bodyTris: grid.bodyTris, grid: [grid.nx, grid.ny, grid.nz], clusters: clusters.slice(0, 12) });
  console.log(describe(id, r, ((performance.now() - started) / 1000).toFixed(1)));
  for (const c of clusters.slice(0, verbose ? 40 : 8)) {
    console.log(`   gap ${c.litres} L at (${c.centre.join(', ')}) extent (${c.extent.join('x')}) near ${c.groups.join(' ')}`);
    for (const m of c.mouths) console.log(`      enters at (${m.centre.join(', ')}) extent (${m.extent.join('x')}) ${m.voxels} vox, open toward ${m.exits}`);
  }
  tank.dispose?.();
}
const jsonPath = opt('json', '');
if (jsonPath) { mkdirSync(resolve(jsonPath, '..'), { recursive: true }); writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), voxel: VOXEL, maxLeakL: MAX_LEAK_L, report }, null, 1)); }
if (flag('gate') && failures) { console.log(`watertight check: ${failures} tank(s) leak`); process.exit(1); }
