#!/usr/bin/env node
// Muzzle-bore triangle inventory (owner 2026-09-22: "audit all our wheels and gun holes again ...
// the point of adding holes instead of carving them into the barrel is that we save on triangles,
// so actually check for this and make sure were saving the triangles here").
//
//   node tools/muzzle-bore-inventory.mjs [--ids=a,b | --all] [--quality=high,low] [--json=path] [--md=path] [--gate] [--debug]
//
// Builds every selected tank under node at each quality and measures the mouth in the rig_muzzle frame:
//  * added hole   the factory's universal fallback assembly, muzzleBoreShadowFallback{Rim,Throat,Annulus,Disc},
//                 counted per part (the "hole that is added");
//  * carved bore  barrel-bucket triangles (gun/gunDark/gunBarrelN/gunMount) inside the terminal window of the
//                 mouth (radius <= 1.3 R, from the floor to 2 cm ahead of the marker) that are not the tube's
//                 outward-facing skin, split into cap (the ordinary tube end within 3 cm), floor, wall, ring and
//                 lip, plus the barrel's own axial recess depth measured by rays that ignore the fallback
//                 (a "hole that is carved");
//  * method       fallback-only | physical-declared (P.physicalMuzzleBore contract, ray-verified at build) |
//                 authored-recess (a funnel/torus/disc recess merged into the gun buckets, §B3.1 helpers) |
//                 carved-undeclared (a recess deeper than the 3 cm counterbore law with no contract) |
//                 none (sealed launch canisters);
//  * seat policy  tools/muzzle-seat-policy.mjs muzzleSeatAxialFit on every muzzleSeatReceipt, with the same
//                 assembled disc-depth witness the browser probe adds;
//  * formulas     for a mouth of N segments: hole as built (since 2026-09-22) = flat ring 2N + disc N (+ throat
//                 sleeve 2N when the authored tube stops short) = 3N–5N; a verified physical recess keeps only
//                 the disc (N). Before 2026-09-22 the hole was rim torus 10N + annulus 2N + disc N = 13N–15N.
//                 carved recess = wall 2N + floor N = 3N, plus the annulus ring 2N that an open tube end needs
//                 = 5N, which is a net 4N over the capped tube it replaces (the cap it removes is N).
// --gate exits 1 when any selected hull pays twice (a carved or authored recess AND the fallback assembly)
// without a physical contract. Node-only: no vite, no puppeteer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import './tank-surface-collect.mjs'; // node canvas shim
import { muzzleSeatAxialFit } from './muzzle-seat-policy.mjs';

import { pathToFileURL } from 'node:url';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const args = isMain ? process.argv.slice(2) : [];
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);

const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { DEVELOPMENT_TANK_IDS, getSpec } = await import('../src/vehicles/specs.ts');
const { expectedMuzzleBoreCount } = await import('../src/vehicles/tankAssets.ts');
let fills = null;
try { fills = await import('../src/vehicles/interiorFills.ts'); } catch { fills = null; }

const ids = flag('all') ? [...DEVELOPMENT_TANK_IDS] : opt('ids', 'm1a2,k2,kf41_lynx_x').split(',').map((s) => s.trim()).filter(Boolean);
const qualities = opt('quality', 'high,low').split(',').map((s) => s.trim()).filter(Boolean);
const debug = flag('debug');
/** Methods that satisfy the owner's rule: the fallback assembly alone, or a declared, ray-verified physical bore. */
export const ALLOWED_BORE_METHODS = Object.freeze(['fallback-only', 'physical-declared', 'none']);

const FALLBACK_GROUP = /^muzzleBoreShadowFallback(?:_\d+)?$/;
const FALLBACK_PART = /^muzzleBoreShadowFallback(Rim|Throat|Annulus|Disc)(?:_\d+)?$/;
const HIDDEN_AUTHORED = /^(muzzleBoreShadowRim|muzzleBoreShadowDisc|muzzleTipShadowDot)$/;
const BARREL_BUCKET = /^(gun|gunDark|gunBarrel\d+(?:Dark)?|gunMount|gunMountDark)$/;
const CAP_MAX_DEPTH_M = 0.03; // tankFactoryCore MUZZLE_COUNTERBORE_MAX_M: deeper center caps are floors, not mouths

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _n = new THREE.Vector3(), _ab = new THREE.Vector3(), _ac = new THREE.Vector3();
const _m = new THREE.Matrix4();

function triangleCount(geometry) {
  const position = geometry?.getAttribute?.('position');
  if (!position) return 0;
  return Math.floor((geometry.index ? geometry.index.count : position.count) / 3);
}
function visibleInTree(object, root) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === root) return true;
  }
  return true;
}
function writesColor(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => material && material.visible !== false && material.colorWrite !== false);
}
function forEachTriangle(mesh, toFrame, callback) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) return;
  const index = geometry.index;
  _m.multiplyMatrices(toFrame, mesh.matrixWorld);
  const count = triangleCount(geometry);
  for (let t = 0; t < count; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    _a.fromBufferAttribute(position, i0).applyMatrix4(_m);
    _b.fromBufferAttribute(position, i1).applyMatrix4(_m);
    _c.fromBufferAttribute(position, i2).applyMatrix4(_m);
    callback(_a, _b, _c);
  }
}

/** Mouth measurements for one built tank. */
export function inventoryOne(id, quality) {
  const spec = getSpec(id);
  const expectedBores = expectedMuzzleBoreCount(spec);
  const visual = createTank(id, null, {
    proceduralOnly: true, quality, geometryReceipt: true, batchStatic: false,
    deferStaticBatch: true, camoSeed: 4242, staticPreview: true,
  });
  try {
    const root = visual.root;
    root.updateMatrixWorld(true);
    const muzzle = root.getObjectByName('rig_muzzle');
    const gunG = root.getObjectByName('rig_gun');
    if (!muzzle || !gunG) throw new Error(`${id}: rig_muzzle/rig_gun missing`);
    const fallbackGroups = [];
    const fallbackParts = [];
    let hiddenAuthoredTris = 0;
    root.traverse((object) => {
      if (FALLBACK_GROUP.test(object.name || '') && visibleInTree(object, root)) fallbackGroups.push(object);
      if (object.isMesh && FALLBACK_PART.test(object.name || '') && visibleInTree(object, root)) fallbackParts.push(object);
      if (object.isMesh && HIDDEN_AUTHORED.test(object.name || '') && !visibleInTree(object, root)) hiddenAuthoredTris += triangleCount(object.geometry);
    });
    const fallback = { rim: 0, throat: 0, annulus: 0, disc: 0, total: 0 };
    for (const part of fallbackParts) {
      const kind = FALLBACK_PART.exec(part.name)[1].toLowerCase();
      const tris = triangleCount(part.geometry);
      fallback[kind] += tris;
      fallback.total += tris;
    }
    // Barrel buckets: the merged tube meshes the player sees, excluding bore furniture.
    const barrelMeshes = [];
    let barrelTris = 0, gunSubtreeTris = 0;
    gunG.traverse((object) => {
      if (!object.isMesh || !visibleInTree(object, root) || !writesColor(object)) return;
      if (FALLBACK_PART.test(object.name || '') || HIDDEN_AUTHORED.test(object.name || '')) return;
      const tris = triangleCount(object.geometry);
      gunSubtreeTris += tris;
      if (BARREL_BUCKET.test(object.name || '')) { barrelTris += tris; barrelMeshes.push(object); }
    });
    // Seat receipts, with the browser probe's independent assembled disc-depth witness.
    const receipts = fallbackGroups.map((group) => {
      const receipt = group.userData.muzzleSeatReceipt;
      if (!receipt) return null;
      const disc = group.children.find((part) => /FallbackDisc/.test(part.name || ''));
      const physicalDiscDepthM = disc ? -muzzle.worldToLocal(disc.getWorldPosition(new THREE.Vector3())).z : null;
      return { ...receipt, physicalDiscDepthM };
    }).filter(Boolean);
    const seatPass = receipts.length === expectedBores && receipts.every(muzzleSeatAxialFit);
    const physical = root.userData.physicalMuzzleBoreVerification || null;
    const row = {
      id, quality, expectedBores, fallback, hiddenAuthoredTris, barrelTris, gunSubtreeTris,
      receipts: receipts.map((r) => ({
        revision: r.revision, supportSource: r.supportSource, outerRadiusM: r.outerRadiusM,
        supportOuterRadiusM: r.supportOuterRadiusM, markerGapM: r.markerGapM, lipAdvanceM: r.lipAdvanceM,
        discForwardM: r.discForwardM, physicalBoreDepthM: r.physicalBoreDepthM ?? null,
        physicalDiscDepthM: r.physicalDiscDepthM,
      })),
      seatPass,
      physical: physical ? { minimumDepthM: physical.minimumDepthM, measuredOuterRadiusM: physical.measuredOuterRadiusM } : null,
      recess: null, nTube: null, nBore: null, formulas: null, method: null, double: false, flags: [],
    };
    if (expectedBores === 0) {
      row.method = 'none';
      row.flags.push('SEALED-CANISTERS');
      return row;
    }
    if (!fallbackGroups.length) {
      row.method = 'fallback-missing';
      row.flags.push('NO-FALLBACK');
      return row;
    }
    // Axis frame: rig_muzzle orientation, origin on the first mouth's own axis at the muzzle plane (z = 0).
    const receipt = receipts[0] || {};
    const mouthR = Math.max(Number(receipt.supportOuterRadiusM) || 0, Number(receipt.outerRadiusM) || 0,
      Number(spec.armor?.gunBarrel?.radiusM) * 0.5 || 0, 0.012);
    const toMuzzle = muzzle.matrixWorld.clone().invert();
    const mouthLocal = muzzle.worldToLocal(fallbackGroups[0].getWorldPosition(new THREE.Vector3()));
    const bx = mouthLocal.x, by = mouthLocal.y;
    // Axial recess depth of the barrel itself (fallback excluded): center plus an off-seam ring.
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(muzzle.matrixWorld);
    const ray = new THREE.Raycaster();
    const depths = [];
    const samples = [[bx, by], ...[.173, 1.744, 3.315, 4.886].map((angle) => [bx + Math.cos(angle) * mouthR * .3, by + Math.sin(angle) * mouthR * .3])];
    for (const [x, y] of samples) {
      ray.set(muzzle.localToWorld(new THREE.Vector3(x, y, mouthR * 3 + .06)), direction);
      const hit = ray.intersectObjects(barrelMeshes, false).find((candidate) => writesColor(candidate.object));
      depths.push(hit ? -muzzle.worldToLocal(hit.point.clone()).z : null);
    }
    const finiteDepths = depths.filter((d) => Number.isFinite(d));
    const depthM = finiteDepths.length ? Math.max(0, Math.min(...finiteDepths)) : null; // shallowest barrel face on the axis
    const deepestM = finiteDepths.length ? Math.max(...finiteDepths) : null;
    // Terminal window: the mouth cylinder just outside the tube, from a little ahead of the marker to below the floor.
    const zMax = 0.02;
    const zMin = -((Number.isFinite(deepestM) ? deepestM : 0.045) + 0.03);
    const rWin = mouthR * 1.3, rSkinMin = mouthR * 0.8, rCenter = mouthR * 0.15, lipBand = 0.012;
    const recess = { recessed: false, carvedTris: 0, nonSkinTris: 0, inwardWallTris: 0, capTris: 0, floorTris: 0, wallTris: 0, ringTris: 0, lipTris: 0, skinTris: 0, darkTris: 0, depthM, deepestM, depths, byMesh: {} };
    const skinRing = []; // [z, angle, radius] of outward skin vertices near the mouth, for the segment estimate
    let inwardZLo = Infinity, inwardZHi = -Infinity; // axial extent of inward-facing wall stock
    for (const mesh of barrelMeshes) {
      const dark = /Dark$/.test(mesh.name);
      const tally = recess.byMesh[mesh.name] || (recess.byMesh[mesh.name] = { cap: 0, floor: 0, wall: 0, inward: 0, ring: 0, lip: 0, skin: 0 });
      forEachTriangle(mesh, toMuzzle, (a, b, c) => {
        const ra = Math.hypot(a.x - bx, a.y - by), rb = Math.hypot(b.x - bx, b.y - by), rc = Math.hypot(c.x - bx, c.y - by);
        const zLo = Math.min(a.z, b.z, c.z), zHi = Math.max(a.z, b.z, c.z);
        if (zHi < zMin || zLo > zMax) return;
        if (Math.max(ra, rb, rc) > rWin) return;
        const rMin = Math.min(ra, rb, rc), rMax = Math.max(ra, rb, rc);
        _ab.subVectors(b, a); _ac.subVectors(c, a); _n.crossVectors(_ab, _ac).normalize();
        const cx = (a.x + b.x + c.x) / 3 - bx, cy = (a.y + b.y + c.y) / 3 - by, zMid = (a.z + b.z + c.z) / 3;
        const cr = Math.hypot(cx, cy) || 1;
        const radialOut = (_n.x * cx + _n.y * cy) / cr; // +1 faces away from the axis, -1 faces the bore
        const axial = Math.abs(_n.z) > 0.9;
        // A lip is mouth furniture standing proud of the seat's support radius within the last 12 mm; a short
        // terminal course of the tube's own skin at exactly the support radius is not one.
        const lip = zLo >= -lipBand && rMax >= mouthR * 1.015;
        if (!lip && !axial && radialOut > 0.5 && rMin >= rSkinMin) {
          // Outward-facing skin of the tube, collar or brake body: not mouth furniture.
          recess.skinTris++; tally.skin++;
          if (zHi > -0.06) for (const v of [a, b, c]) skinRing.push([v.z, Math.round(Math.atan2(v.y - by, v.x - bx) * 360 / Math.PI) / 2, Math.hypot(v.x - bx, v.y - by)]);
          return;
        }
        if (dark) recess.darkTris++;
        if (axial && rMin < rCenter && -zMid <= CAP_MAX_DEPTH_M + 0.004) { recess.capTris++; tally.cap++; return; } // ordinary tube cap
        recess.nonSkinTris++;
        if (lip) { recess.lipTris++; tally.lip++; }
        else if (axial && rMin < rCenter) { recess.floorTris++; tally.floor++; }
        else if (axial) { recess.ringTris++; tally.ring++; }
        else {
          recess.wallTris++; tally.wall++;
          // Bore walls and recess funnels face the axis; brake and collar cylinders face away from it.
          if (radialOut < -0.5) {
            recess.inwardWallTris++; tally.inward++;
            inwardZLo = Math.min(inwardZLo, zLo); inwardZHi = Math.max(inwardZHi, zHi);
            if (debug) {
              const stations = tally.inwardStations || (tally.inwardStations = {});
              const key = `${zLo.toFixed(3)}..${zHi.toFixed(3)}@${rMin.toFixed(3)}-${rMax.toFixed(3)}`;
              stations[key] = (stations[key] || 0) + 1;
            }
          }
        }
      });
    }
    // A recess is inward-facing wall stock with real axial extent (the §B3.1 funnel spans 40 mm, the
    // shallowest declared bore 65 mm; brake sleeves and mouth chamfer bands are under 1 cm) or a
    // floor deeper than the 3 cm counterbore law; the smallest one in the fleet is a 12-segment wall.
    // Everything else in the window is mouth furniture — brake bodies, baffle rings, collars,
    // chamfers, MRS brackets — and is reported, not carved.
    recess.inwardSpanM = recess.inwardWallTris ? +(inwardZHi - inwardZLo).toFixed(4) : 0;
    recess.recessed = (recess.inwardWallTris >= 12 && recess.inwardSpanM >= 0.02) || recess.floorTris >= 12;
    recess.carvedTris = recess.recessed ? recess.nonSkinTris : 0;
    row.recess = recess;
    // Segment estimate: distinct angles on the most forward outward skin course at its own radius.
    if (skinRing.length) {
      const rRef = Math.max(...skinRing.map((v) => v[2]));
      const course = skinRing.filter((v) => Math.abs(v[2] - rRef) <= rRef * 0.03);
      const zRef = Math.max(...course.map((v) => v[0]));
      const angles = new Set(course.filter((v) => v[0] >= zRef - 0.004).map((v) => v[1]));
      row.nTube = Math.min(96, Math.max(3, angles.size));
    }
    row.nBore = fallback.annulus ? fallback.annulus / 2 / Math.max(1, expectedBores) : (fallback.disc / Math.max(1, expectedBores)) || null;
    const nB = row.nBore || 0, nT = row.nTube || nB, mouths = Math.max(1, expectedBores);
    row.formulas = {
      note: 'per mouth: hole as built (2026-09-22) = flat ring 2N + disc N (+ throat 2N when the tube stops short); physical recess keeps the disc only (N); before 2026-09-22 it was rim 10N + annulus 2N + disc N; carved = wall 2N + floor N = 3N, +2N annulus for an open end = 5N (net 4N over the removed cap N)',
      holeAsBuilt: fallback.total,
      holeMinimal: 3 * nB * mouths,
      carved3N_atBore: 3 * nB * mouths,
      carved5N_atBore: 5 * nB * mouths,
      carved5N_atTube: 5 * nT * mouths,
      carvedNet4N_atTube: 4 * nT * mouths,
      savingsVsCarved5N_atTube: 5 * nT * mouths - fallback.total,
      savingsMinimalVsCarved5N_atTube: 5 * nT * mouths - 3 * nB * mouths,
    };
    const recessed = recess.recessed;
    if (physical) row.method = 'physical-declared';
    else if (recessed && Number.isFinite(deepestM) && deepestM > CAP_MAX_DEPTH_M + 0.004) row.method = 'carved-undeclared';
    else if (recessed) row.method = 'authored-recess';
    else row.method = 'fallback-only';
    if (!recessed && recess.nonSkinTris > 0) row.flags.push(`FURNITURE-${recess.nonSkinTris}`);
    row.double = row.method !== 'fallback-only' && fallback.total > 0;
    if (row.double) row.flags.push(row.method === 'physical-declared' ? 'PHYSICAL+FALLBACK' : 'DOUBLE');
    if (!seatPass) row.flags.push('SEAT-FAIL');
    if (hiddenAuthoredTris) row.flags.push('HIDDEN-AUTHORED');
    if (!Number.isFinite(depthM)) row.flags.push('OPEN-AXIS');
    if (!debug) delete row.recess.byMesh;
    return row;
  } finally {
    visual.dispose?.();
  }
}

if (isMain) await main();

async function main() {
if (fills?.ensureInteriorFills) {
  try { await fills.ensureInteriorFills(ids); } catch (error) { console.warn(`[bore-inventory] interior fills not loaded: ${error.message}`); }
}

const rows = [];
let failures = 0;
for (const id of ids) {
  for (const quality of qualities) {
    try { rows.push(inventoryOne(id, quality)); }
    catch (error) { rows.push({ id, quality, error: error.message }); failures++; }
  }
}

const byId = new Map();
for (const row of rows) { if (!byId.has(row.id)) byId.set(row.id, {}); byId.get(row.id)[row.quality] = row; }
const pad = (s, n) => String(s ?? '').padEnd(n);
const hl = (get) => { const h = get('high'), l = get('low'); return `${h ?? '-'}/${l ?? '-'}`; };
console.log(pad('id', 22), pad('method', 18), pad('hole h/l', 10), pad('carved h/l', 11), pad('barrel h/l', 12), pad('carvedEq5N h/l', 15), pad('saving h/l', 12), pad('N h/l', 8), pad('depth', 7), 'seat flags');
const mdLines = ['| id | method | bore tris (hole) high/low | carved tris high/low | barrel tris high/low | carved-equivalent 5N tris high/low | savings (carved-eq minus hole) high/low | tube N high/low | recess depth m | seat policy ok | flags |', '|---|---|---|---|---|---|---|---|---|---|---|'];
for (const [id, q] of byId) {
  const get = (field) => (quality) => { const r = q[quality]; if (!r || r.error) return null; return field(r); };
  const err = Object.values(q).find((r) => r.error);
  if (err) { console.log(pad(id, 22), 'BUILD FAILED', err.error.slice(0, 90)); mdLines.push(`| ${id} | BUILD FAILED | | | | | | | | | ${err.error.slice(0, 60)} |`); continue; }
  const any = q.high || q.low;
  const method = any.method;
  const hole = hl(get((r) => r.fallback.total));
  const carved = hl(get((r) => r.recess?.carvedTris ?? 0));
  const barrel = hl(get((r) => r.barrelTris));
  const eq = hl(get((r) => r.formulas?.carved5N_atTube));
  const sav = hl(get((r) => r.formulas?.savingsVsCarved5N_atTube));
  const n = hl(get((r) => r.nTube));
  const depth = any.recess?.deepestM != null ? any.recess.deepestM.toFixed(3) : '-';
  const seat = Object.values(q).every((r) => r.seatPass) ? 'ok' : 'FAIL';
  const flags = [...new Set(Object.values(q).flatMap((r) => r.flags))].join(' ') || '-';
  console.log(pad(id, 22), pad(method, 18), pad(hole, 10), pad(carved, 11), pad(barrel, 12), pad(eq, 15), pad(sav, 12), pad(n, 8), pad(depth, 7), seat, flags);
  if (debug) for (const r of Object.values(q)) console.log('   ', r.quality, JSON.stringify(r.recess?.byMesh || {}), JSON.stringify(r.receipts));
  mdLines.push(`| ${id} | ${method} | ${hole} | ${carved} | ${barrel} | ${eq} | ${sav} | ${n} | ${depth} | ${seat} | ${flags} |`);
}
const doublePayers = [...byId.values()].filter((q) => Object.values(q).some((r) => !r.error && r.method !== 'fallback-only' && r.method !== 'physical-declared' && r.method !== 'none' && r.double));
const physicalPayers = [...byId.values()].filter((q) => Object.values(q).some((r) => !r.error && r.method === 'physical-declared'));
console.log(`bore inventory: ${byId.size} tanks x ${qualities.length} qualities, ${doublePayers.length} paying twice without a contract, ${physicalPayers.length} declared physical bores, ${failures} build failures`);
const jsonPath = opt('json', '');
if (jsonPath) { mkdirSync(dirname(resolve(jsonPath)), { recursive: true }); writeFileSync(resolve(jsonPath), JSON.stringify({ generatedAt: new Date().toISOString(), qualities, rows }, null, 1)); }
const mdPath = opt('md', '');
if (mdPath) { mkdirSync(dirname(resolve(mdPath)), { recursive: true }); writeFileSync(resolve(mdPath), `${mdLines.join('\n')}\n`); }
if (flag('gate') && (doublePayers.length || failures)) process.exit(1);
}
