#!/usr/bin/env node
// Generate interior fill solids for tank bodies so every hull and turret is watertight by construction.
//
//   node tools/gen-interior-fills.mjs --ids=a,b | --all [--voxel=0.025] [--cell=2] [--out=src/vehicles/generated/interiorFills.generated.ts] [--stats]
//
// For each tank the body is voxelised (tools/tank-voxel-body.mjs), the exterior flood-filled and the deep interior
// found exactly as tools/tank-watertight-check.mjs does. Every deep-interior voxel the water reaches (a leak) is a
// candidate; candidates are grouped into coarse cells (--cell voxels a side, conservative: every voxel of a cell must
// leak and belong to the same body component), cells whose column is closed above or below by a moving part (gun,
// gun mount, mantlet) are skipped, and the remaining cells are greedy-meshed into axis-aligned boxes per component
// (hull boxes in the hull frame, turret boxes in the turret frame). The boxes are buried strictly inside the body's
// own shells, so silhouettes never move; behind a real gap they read as the dark interior wall the eye expects.
// The generated module is consumed by tankFactory at build time (applyInteriorFills) and excluded from the authored
// geometry fingerprints.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectTriangles } from './tank-surface-collect.mjs';
import { readdirSync, unlinkSync } from 'node:fs';
import { voxelise, floodExterior, deepInterior, DEFAULT_EXCLUDE } from './tank-voxel-body.mjs';
import { FLEET_GROUP_BY_ID } from '../src/vehicles/fleetManifest.ts';
import { interiorFillSelection, mergeInteriorFillGroup } from './interior-fill-selection.mjs';
import { interiorFillBoundaryTriangles } from './interior-fill-body-policy.mjs';
import { createBarakBayFillPolicy } from './barak-rear-bay-fill-policy.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
if (flag('stats')) console.log('[interior-fills] Statistics only: no generated files will be written.');
const VOXEL = Number(opt('voxel', '0.025'));
const CELL = Math.max(1, Math.round(Number(opt('cell', '2'))));
// fine-pass boxes below this many voxels are slivers along sloped plates: dropped (they stay as residual)
const MIN_FINE = Math.max(0, Number(opt('min-fine', '12')));
const MOVING = /^(gun|gunMount|mantlet)/i;
const { createTank } = await import('../src/vehicles/tankFactory.ts');
// --all covers the whole registered fleet (fleetManifest), not the 27 legacy specs ids (2026-09-14 fix:
// 80 tanks had never received fills because --all read ALL_TANK_IDS).
const requestedIds = flag('all') ? Object.keys(FLEET_GROUP_BY_ID) : opt('ids', 'abramsx').split(',').filter(Boolean);
const ids = interiorFillSelection(FLEET_GROUP_BY_ID, requestedIds);
// chase-to-zero (owner 2026-09-14): repeat the fill until the residual stops shrinking — boxes create new
// enclosures between themselves and sloped plates, which the next round closes.
const ROUNDS = Math.max(1, Number(opt('rounds', '4')));

/** Per-voxel component (1 hull, 2 turret, 0 none) from the deep-interior column spans. */
function componentAt(grid, x, y, z) {
  const { spans, nx } = grid; const k = z * nx + x;
  const inHull = spans.minY[1][k] < y && y < spans.maxY[1][k];
  const inTurret = spans.minY[2][k] < y && y < spans.maxY[2][k];
  if (inHull && inTurret) return y > spans.maxY[1][k] - 4 ? 2 : 1;
  return inHull ? 1 : inTurret ? 2 : 0;
}

/** Column span of the turret proper (shell groups named turret*, never gun/mantlet): a voxel inside it is
 * enclosed by the turret body itself, so a fill there stays hidden whatever the gun does. */
function turretProperSpans(grid) {
  const { shell, nx, ny, nz, groups } = grid;
  const proper = new Uint8Array(groups.length + 1); for (let g = 0; g < groups.length; g++) proper[g + 1] = /^turret/i.test(groups[g]) ? 1 : 0;
  const minY = new Int16Array(nx * nz).fill(32767), maxY = new Int16Array(nx * nz).fill(-1);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const g = shell[(z * ny + y) * nx + x]; if (!g || !proper[g]) continue;
    const k = z * nx + x; if (y < minY[k]) minY[k] = y; if (y > maxY[k]) maxY[k] = y;
  }
  return { minY, maxY };
}
function insideTurretProper(spans, grid, x, y, z) { const k = z * grid.nx + x; return spans.minY[k] < y && y < spans.maxY[k]; }
/** Column span of the moving gun group (gun, gun mount, mantlet): a pocket enclosed by it rides with the gun. */
function movingSpans(grid) {
  const { shell, nx, ny, nz, groups } = grid;
  const moving = new Uint8Array(groups.length + 1); for (let g = 0; g < groups.length; g++) moving[g + 1] = MOVING.test(groups[g]) ? 1 : 0;
  const minY = new Int16Array(nx * nz).fill(32767), maxY = new Int16Array(nx * nz).fill(-1);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const g = shell[(z * ny + y) * nx + x]; if (!g || !moving[g]) continue;
    const k = z * nx + x; if (y < minY[k]) minY[k] = y; if (y > maxY[k]) maxY[k] = y;
  }
  return { minY, maxY };
}

/** True when the first shell above or below the voxel belongs to a part that moves relative to the turret body. */
function underMovingPart(grid, x, y, z) {
  const { shell, nx, ny, groups } = grid;
  for (const dir of [1, -1]) {
    for (let yy = y + dir; yy >= 0 && yy < ny; yy += dir) {
      const g = shell[(z * ny + yy) * nx + x];
      if (g) { if (MOVING.test(groups[g - 1])) return true; break; }
    }
  }
  return false;
}

function greedyBoxes(cell, cnx, cny, cnz, comp) {
  const used = new Uint8Array(cell.length); const boxes = [];
  const at = (x, y, z) => (z * cny + y) * cnx + x;
  for (let z = 0; z < cnz; z++) for (let y = 0; y < cny; y++) for (let x = 0; x < cnx; x++) {
    const i = at(x, y, z); if (cell[i] !== comp || used[i]) continue;
    let x1 = x; while (x1 + 1 < cnx && cell[at(x1 + 1, y, z)] === comp && !used[at(x1 + 1, y, z)]) x1++;
    let y1 = y;
    outerY: while (y1 + 1 < cny) { for (let xx = x; xx <= x1; xx++) { const j = at(xx, y1 + 1, z); if (cell[j] !== comp || used[j]) break outerY; } y1++; }
    let z1 = z;
    outerZ: while (z1 + 1 < cnz) { for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) { const j = at(xx, yy, z1 + 1); if (cell[j] !== comp || used[j]) break outerZ; } z1++; }
    for (let zz = z; zz <= z1; zz++) for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[at(xx, yy, zz)] = 1;
    boxes.push([x, y, z, x1, y1, z1]);
  }
  return boxes;
}

// Tracks are moving parts too (2026-09-19, T-90M X): the lane a track band sweeps — between its upper and lower
// runs, idler to sprocket, one voxel of clearance around it — is never interior air, even where the hull's nose or
// sponson plates enclose it. The strict track-clip audit has tested the installed fills against the bands since
// 1cb462309; the T-90M's nose filled 89 voxels of its idler wrap before this rule.
const _bandPoint = new THREE.Vector3();
function trackBandBoxes(root, pad) {
  root.updateMatrixWorld(true);
  const boxes = [];
  root.traverse((node) => {
    if (!node.isMesh || !/^gearTrackBand/.test(node.name || '')) return;
    boxes.push(new THREE.Box3().setFromObject(node).expandByScalar(pad));
  });
  return boxes;
}
function insideTrackBand(boxes, grid, x, y, z) {
  if (!boxes.length) return false;
  const [ox, oy, oz] = grid.origin;
  const v = grid.voxel;
  _bandPoint.set(ox + (x + 0.5) * v, oy + (y + 0.5) * v, oz + (z + 0.5) * v);
  for (const box of boxes) if (box.containsPoint(_bandPoint)) return true;
  return false;
}

function nodeWorldPosition(root, names) {
  root.updateMatrixWorld(true);
  for (const name of names) { const node = root.getObjectByName(name); if (node) { const e = node.matrixWorld.elements; return [e[12], e[13], e[14]]; } }
  return [0, 0, 0];
}

const out = {}; const stats = [];
for (const id of ids) {
  const t0 = performance.now();
  // Output is written only after every requested model has been measured.
  // Continuing after a failed build would preserve a stale selected record
  // and publish successful siblings as though the entire request succeeded.
  let tank;
  try { tank = createTank(id, null, { proceduralOnly: true }); }
  catch (error) { throw new Error(`${id}: build failed; no fill records written`, { cause: error }); }
  const sourceAir=createBarakBayFillPolicy(id,tank.root);
  const bandBoxes = trackBandBoxes(tank.root, VOXEL * 2); // two voxels of clearance: the audit samples 2 cm cells
  const { tris, meshes } = collectTriangles(tank.root);
  const boundary = interiorFillBoundaryTriangles(id, tris, meshes);
  const grid = voxelise(boundary, meshes, { voxel: VOXEL, exclude: DEFAULT_EXCLUDE });
  const ext = floodExterior(grid); const deep = deepInterior(grid);
  const { shell, nx, ny, nz, origin } = grid;
  // Fills to zero (2026-09-15): the residual test must see the fills exactly as the watertight check
  // will — as shell voxels of the `<component>InteriorFill` meshes the factory adds. Marking them as
  // group 1 (whatever mesh came first) gave the hull / turret column spans of deepInterior a
  // different shape than the check's, so a generator residual of 0 L did not mean a check of 0 L.
  const fillGroup = [0, 0, 0, 0];
  for (const [comp, key] of [[1, 'hull'], [2, 'turret'], [3, 'gun']]) {
    grid.groups.push(`${key}InteriorFill`); fillGroup[comp] = grid.groups.length; // shell value = index + 1
  }
  // leak voxels with component; moving-part columns skipped
  const proper = turretProperSpans(grid), moving = movingSpans(grid);
  const vox = new Uint8Array(shell.length); let leakVox = 0, skipped = 0, bandVox = 0;
  const collectLeaks = (extNow, deepNow, first) => {
    let found = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = (z * ny + y) * nx + x; if (!(extNow[i] && deepNow[i]) || vox[i] || claimed[i]) continue;
      if (first) leakVox++;
      if(sourceAir?.protects(grid,x,y,z))continue;
      if (insideTrackBand(bandBoxes, grid, x, y, z)) { if (first) bandVox++; continue; }
      const c = componentAt(grid, x, y, z); if (!c) continue;
      // a pocket closed by the gun or mantlet: filled as turret stock when the turret body itself encloses
      // it, as GUN-frame stock (component 3, rides with elevation) when the moving group encloses it,
      // skipped only when neither does
      if (underMovingPart(grid, x, y, z) && !insideTurretProper(proper, grid, x, y, z)) {
        // whatever the gun closes rides with the gun: inside a casemate the recess is the gun's own
        // travel space, so gun-frame stock there stays hidden through elevation (chase-to-zero)
        vox[i] = 3; found++; if (first) skipped++; continue;
      }
      vox[i] = c; found++;
    }
    return found;
  };
  const claimed = new Uint8Array(vox.length);
  collectLeaks(ext, deep, true);
  // Hierarchical fill: coarse cells first (every voxel of the cell leaks with the same component), then the
  // leftover leak voxels at full resolution. Coarse boxes carry the bulk cheaply; the fine pass closes the thin
  // layers along sloped and stepped plates that a coarse grid cannot reach.
  const turretOrigin = nodeWorldPosition(tank.root, ['rig_turret', 'turret']);
  const gunOrigin = nodeWorldPosition(tank.root, ['rig_gun', 'gun', 'rig_turret', 'turret']);
  const entry = { hull: [], turret: [], gun: [] }; let boxesTotal = 0, filledVox = 0; // fine-voxel inclusive spans [x0,y0,z0,x1,y1,z1]
  const compOf = new Uint8Array(shell.length); // component of every claimed voxel, for the final global remesh
  for (let round = 0; round < ROUNDS; round++) {
  if (round > 0) {
    // re-measure with the fills in place; anything still reached from outside becomes the next round's input
    const extR = floodExterior(grid), deepR = deepInterior(grid);
    if (!collectLeaks(extR, deepR, false)) break;
  }
  for (const step of [CELL, 1]) {
    if (step === 1 && CELL === 1) break;
    const cnx = Math.floor(nx / step), cny = Math.floor(ny / step), cnz = Math.floor(nz / step);
    const cell = new Uint8Array(cnx * cny * cnz);
    for (let cz = 0; cz < cnz; cz++) for (let cy = 0; cy < cny; cy++) for (let cx = 0; cx < cnx; cx++) {
      let comp = 0, ok = true;
      for (let dz = 0; dz < step && ok; dz++) for (let dy = 0; dy < step && ok; dy++) for (let dx = 0; dx < step; dx++) {
        const i = ((cz * step + dz) * ny + (cy * step + dy)) * nx + (cx * step + dx); const v = vox[i];
        if (!v || claimed[i] || (comp && v !== comp)) { ok = false; break; } comp = v;
      }
      if (ok && comp) cell[(cz * cny + cy) * cnx + cx] = comp;
    }
        for (const [comp, key] of [[1, 'hull'], [2, 'turret'], [3, 'gun']]) {
      let boxes = greedyBoxes(cell, cnx, cny, cnz, comp); if (!boxes.length) continue;
      if (step === 1 && MIN_FINE > 0) {
        const kept = boxes.filter(([x, y, z, x1, y1, z1]) => (x1 - x + 1) * (y1 - y + 1) * (z1 - z + 1) >= MIN_FINE);
        // unclaim the dropped slivers so they count as residual
        for (const b of boxes) if (!kept.includes(b)) for (let zz = b[2]; zz <= b[5]; zz++) for (let yy = b[1]; yy <= b[4]; yy++) for (let xx = b[0]; xx <= b[3]; xx++) cell[(zz * cny + yy) * cnx + xx] = 0;
        boxes = kept; if (!boxes.length) continue;
      }
      for (const [x, y, z, x1, y1, z1] of boxes) {
        entry[key].push(x * step, y * step, z * step, (x1 + 1) * step - 1, (y1 + 1) * step - 1, (z1 + 1) * step - 1);
        filledVox += (x1 - x + 1) * (y1 - y + 1) * (z1 - z + 1) * step ** 3;
      }
      boxesTotal += boxes.length;
    }
    // claim the filled voxels (and mark them shell for the residual test)
    for (let cz = 0; cz < cnz; cz++) for (let cy = 0; cy < cny; cy++) for (let cx = 0; cx < cnx; cx++) {
      const c = cell[(cz * cny + cy) * cnx + cx]; if (!c) continue;
      for (let dz = 0; dz < step; dz++) for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) { const i = ((cz * step + dz) * ny + (cy * step + dy)) * nx + (cx * step + dx); compOf[i] = c; vox[i] = 0; claimed[i] = 1; shell[i] = fillGroup[c]; }
    }
  }
  }
  // Global remesh: the rounds and the coarse/fine passes each meshed their own voxels; one greedy pass over the
  // union of every claimed voxel per component yields far fewer boxes for the same solid.
  for (const [comp, key] of [[1, 'hull'], [2, 'turret'], [3, 'gun']]) {
    const boxes = greedyBoxes(compOf, nx, ny, nz, comp);
    entry[key] = []; for (const [x, y, z, x1, y1, z1] of boxes) entry[key].push(x, y, z, x1, y1, z1);
  }
  boxesTotal = (entry.hull.length + entry.turret.length + entry.gun.length) / 6;
  if (!entry.hull.length) delete entry.hull; if (!entry.turret.length) delete entry.turret; if (!entry.gun.length) delete entry.gun;
  const ext2 = floodExterior(grid); const deep2 = deepInterior(grid); let residual = 0;
  for (let i = 0; i < shell.length; i++) if (ext2[i] && deep2[i]) residual++;
  const L = (n) => +(n * VOXEL ** 3 * 1000).toFixed(1);
  // origins at 6 decimals: a 4-decimal origin put every fill face a few microns off the lattice
  out[id] = { v: VOXEL, o: origin.map((v) => +v.toFixed(6)), t: turretOrigin.map((v) => +v.toFixed(6)), g: gunOrigin.map((v) => +v.toFixed(6)), ...entry };
  const row = { id, leakL: L(leakVox), filledL: L(filledVox), residualL: L(residual), skippedL: L(skipped), trackLaneL: L(bandVox), boxes: boxesTotal, tris: boxesTotal * 12, ms: Math.round(performance.now() - t0) };
  if(sourceAir){
    const receipt=sourceAir.receipt();row.preservedSourceAirL=L(receipt.cells.length);
    const evidenceDir=opt('source-air-evidence',null);
    if(evidenceDir){mkdirSync(resolve(evidenceDir),{recursive:true});writeFileSync(resolve(evidenceDir,`${id}.json`),JSON.stringify({...receipt,grid:{origin,voxel:VOXEL},raw:row},null,2)+'\n');}
    console.log(`${id}: retained ${row.preservedSourceAirL} L of measured source air; raw residual remains separately reported`);
  }
  stats.push(row);
  console.log(`${id}: leak ${row.leakL} L → filled ${row.filledL} L in ${row.boxes} boxes (${row.tris} tris), residual ${row.residualL} L, gun-frame under moving parts ${row.skippedL} L (${row.ms} ms)`);
  tank.dispose?.();
}
if (!flag('stats')) {
  const groupDir = resolve(opt('out-dir', 'src/vehicles/interiorFillGroups'));
  const loaderPath = resolve(opt('loader', 'src/vehicles/interiorFillLoaders.generated.ts'));
  mkdirSync(groupDir, { recursive: true });
  const encode = (spans) => { const u16 = new Uint16Array(spans); return Buffer.from(u16.buffer, u16.byteOffset, u16.byteLength).toString('base64'); };
  const byGroup = new Map();
  for (const [id, record] of Object.entries(out)) { const group = FLEET_GROUP_BY_ID[id] || 'core'; if (!byGroup.has(group)) byGroup.set(group, []); byGroup.get(group).push([id, record]); }
  const groupNames = [...byGroup.keys()].sort();
  let bytes = 0;
  for (const group of groupNames) {
    const lines = ['// Generated by tools/gen-interior-fills.mjs. Do not hand-edit.',
      '// Interior fill boxes per tank (base64 little-endian Uint16 sextets of inclusive fine-voxel spans, hull frame /',
      '// turret frame / gun frame): buried solids that make the body watertight. Regenerate after any playable geometry change.',
      "import type { InteriorFillRecord } from '../interiorFills.ts';", '',
      'export const INTERIOR_FILLS: Readonly<Record<string, InteriorFillRecord>> = Object.freeze({'];
    const groupFile = resolve(groupDir, `${group}.generated.ts`);
    const existing = !flag('all') && existsSync(groupFile)
      ? (await import(pathToFileURL(groupFile).href)).INTERIOR_FILLS : {};
    const records = mergeInteriorFillGroup(existing, Object.fromEntries(byGroup.get(group)), FLEET_GROUP_BY_ID, group);
    for (const [id, record] of Object.entries(records).sort((a, b) => a[0].localeCompare(b[0]))) {
      const parts = [`v: ${record.v}`, `o: [${record.o.join(', ')}]`, `t: [${record.t.join(', ')}]`];
      if (record.g) parts.push(`g: [${record.g.join(', ')}]`);
      if (record.hull) parts.push(`hull: ${JSON.stringify(typeof record.hull === 'string' ? record.hull : encode(record.hull))}`);
      if (record.turret) parts.push(`turret: ${JSON.stringify(typeof record.turret === 'string' ? record.turret : encode(record.turret))}`);
      if (record.gun) parts.push(`gun: ${JSON.stringify(typeof record.gun === 'string' ? record.gun : encode(record.gun))}`);
      lines.push(`  ${JSON.stringify(id)}: { ${parts.join(', ')} },`);
    }
    lines.push('});', '');
    const text = lines.join('\n'); bytes += text.length;
    writeFileSync(resolve(groupDir, `${group}.generated.ts`), text);
  }
  if (flag('all')) for (const name of readdirSync(groupDir)) { if (name.endsWith('.generated.ts') && !groupNames.includes(name.replace(/\.generated\.ts$/, ''))) unlinkSync(resolve(groupDir, name)); }
  // A newly generated family must become loadable even on a scoped --ids run.
  // Retain registered existing families and include the just-written modules.
  {
    const loadableGroups = [...new Set(Object.values(FLEET_GROUP_BY_ID))].sort()
      .filter(group => existsSync(resolve(groupDir, `${group}.generated.ts`)));
    const loader = ['// Generated by tools/gen-interior-fills.mjs. Do not hand-edit.',
      '// Explicit imports let Vite emit one immutable interior-fill chunk per visual family.', '',
      "import type { InteriorFillRecord } from './interiorFills.ts';", '',
      'type InteriorFillGroupModule = { INTERIOR_FILLS: Readonly<Record<string, InteriorFillRecord>> };', '',
      'export const INTERIOR_FILL_GROUP_LOADERS: Readonly<Record<string, () => Promise<InteriorFillGroupModule>>> = Object.freeze({',
      ...loadableGroups.map((group) => `  ${JSON.stringify(group)}: () => import('./interiorFillGroups/${group}.generated.ts'),`),
      '});', ''].join('\n');
    writeFileSync(loaderPath, loader);
  }
  console.log(`wrote ${groupNames.length} group module(s) to ${groupDir} (${(bytes / 1024).toFixed(0)} kB) and the loader map`);
}
const totalTris = stats.reduce((s, r) => s + r.tris, 0);
console.log(`fills: ${stats.length} tanks, ${stats.reduce((s, r) => s + r.boxes, 0)} boxes, ${totalTris} tris, residual ${stats.reduce((s, r) => s + r.residualL, 0).toFixed(0)} L of ${stats.reduce((s, r) => s + r.leakL, 0).toFixed(0)} L`);
