#!/usr/bin/env node
// Fleet track-wrap review (owner 2026-09-14: "reseat tracks — cornered track in the bottom right,
// don't let wheels glitch into tracks").
//
//   node tools/track-wrap-review.mjs [--ids=a,b | --all] [--gate] [--json=path]
//
// Builds every tank (procedural, high tier) and measures, per running-gear unit and per end, how the
// loaded run leaves the outer road wheel. The flat run seats the tire into the band by an authored
// amount (axle height minus the run height is the band-centreline radius under the axle); the ramp
// must keep that same radius around the wheel — closer means the ramp chord passes through the tire,
// further means daylight between tire and ramp (the corner at ground level the owner saw).
//   clearance = min over ramp centreline points of (distance to the axle − (axleY − botY))
//   clearance < -0.005 m  CUTS   the ramp cuts deeper into the wheel than the flat run does
//   clearance >  0.050 m  GAP    the ramp leaves the wheel with a visible gap / corner
// Authored courses (cfg.loopPoints) are reported too; they carry their own reference-fitted ramps.
// END WRAP per side (owner 2026-09-21: TOS-1A "improper wrapping … around the front road wheel and back road wheel"):
// the clearance above reads the course against the shared station list, which a rig with staggered axles
// (wheelZsLeftM / wheelZsRightM) passes while its rendered band wraps a station 38–124 mm from either wheel. The
// `wrap L/R` columns (tools/track-end-wrap.mjs) read each side's REST BAND against that side's actual outer wheel:
// the worse of the two ends' deviation from the ideal tangent wrap in mm, `CUT-…` when the band centreline rides
// > 3 mm inside its seat and `OFF-…` when it sits > 5 mm off the tangent wrap (`gl` = ground-level end, exempt).
// --gate exits 1 when any unit CUTS or any side is CUT / OFF the tangent wrap.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './tank-surface-collect.mjs'; // node canvas shim
import { endWrapRows, endWrapFlags } from './track-end-wrap.mjs';
const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { KIT } = await import('../src/vehicles/tankFactoryCore.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
const ids = flag('all') ? [...ALL_TANK_IDS] : opt('ids', 'm1a2,t72b3m').split(',').filter(Boolean);
const EPS = 1e-6;

function rampClearance(receipt, end) {
  const { loopPoints, wheelZs, wheelY } = receipt;
  if (!Array.isArray(loopPoints) || !Array.isArray(wheelZs) || !wheelZs.length) return null;
  const index = end === 'rear' ? wheelZs.indexOf(Math.min(...wheelZs)) : wheelZs.indexOf(Math.max(...wheelZs));
  const wheelZ = wheelZs[index];
  const axleY = receipt.wheelYs?.[index] ?? wheelY;
  // the seat is the loop's own lowest run (authored loops may sit above the configured botY)
  const botY = Math.min(...loopPoints.map(([, y]) => y));
  // A drive or idler sitting at ground level (dead-track WWII rigs) keeps the run flat out to its
  // own ground crossing; there is no wheel wrap to measure at that end.
  const ends = [receipt.sprocket, receipt.idler].filter(Boolean);
  const endWheel = ends.length === 2 ? (end === 'rear' ? (ends[0].z < ends[1].z ? ends[0] : ends[1]) : (ends[0].z < ends[1].z ? ends[1] : ends[0])) : null;
  // wrap clearance follows tankFactoryCore endpointWrapClearanceM (2026-09-17): rim + 2 mm, or an authored datum at/below the rim
  const wrap = endWheel ? KIT.endpointWrapClearanceM(endWheel, receipt.trackTh) : receipt.trackTh / 2 + 0.002;
  if (endWheel && endWheel.y - (endWheel.trackR ?? endWheel.r) - wrap <= botY + 0.005) return 'ground-level';
  const flatRun = loopPoints.filter(([, y]) => Math.abs(y - botY) <= 1e-4);
  const contactZ = flatRun.length ? (end === 'rear' ? Math.min(...flatRun.map(([z]) => z)) : Math.max(...flatRun.map(([z]) => z))) : wheelZ;
  let minimum = Infinity;
  for (const [z, y] of loopPoints) {
    if (y - botY <= EPS || y > axleY) continue;
    if (end === 'rear' ? z > contactZ - EPS : z < contactZ + EPS) continue;
    minimum = Math.min(minimum, Math.hypot(z - wheelZ, y - axleY) - (axleY - botY));
  }
  return Number.isFinite(minimum) ? +minimum.toFixed(3) : null;
}

/** Per side: the worse end's deviation (mm) from the ideal tangent wrap about that side's own outer wheel, and flags. */
function sideEndWrap(wrapRows, unit, side) {
  const ends = wrapRows.filter((row) => row.unit === unit && row.side === side);
  if (!ends.length) return { value: null, flags: [] };
  const measured = ends.filter((row) => row.status === 'ok');
  if (!measured.length) return { value: ends.every((row) => row.status === 'ground-level') ? 'gl' : ends[0].status, flags: [] };
  const value = +Math.max(...measured.map((row) => row.deviationMm)).toFixed(1);
  const flags = [];
  for (const row of measured) for (const f of endWrapFlags(row)) flags.push(`${f}-${side < 0 ? 'L' : 'R'}-${row.end}`);
  return { value, flags, offsetMm: Math.max(...measured.map((row) => Math.abs(row.offsetMm))) };
}

const rows = []; let cuts = 0, gaps = 0, wraps = 0;
for (const id of ids) {
  let tank; try { tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, batchStatic: false }); } catch (error) { rows.push({ id, error: error.message }); continue; }
  // receipts live on the builder's hull group, which is not always the rig node
  const receipts = []; tank.root.traverse((o) => { const list = o.userData?.runningGearReceipts; if (Array.isArray(list)) receipts.push(...list); });
  const wrapRows = endWrapRows(tank.root);
  for (const [unit, receipt] of receipts.entries()) {
    const rear = rampClearance(receipt, 'rear'), front = rampClearance(receipt, 'front');
    const flags = [];
    for (const [label, value] of [['rear', rear], ['front', front]]) {
      if (value === null || value === 'ground-level') continue;
      if (value < -0.005) flags.push(`CUTS-${label}`); else if (value > 0.05) flags.push(`GAP-${label}`);
    }
    const wrapL = sideEndWrap(wrapRows, unit, -1), wrapR = sideEndWrap(wrapRows, unit, 1);
    flags.push(...wrapL.flags, ...wrapR.flags);
    if (flags.some((f) => f.startsWith('CUTS'))) cuts++; if (flags.some((f) => f.startsWith('GAP'))) gaps++;
    if (wrapL.flags.length || wrapR.flags.length) wraps++;
    rows.push({ id, unit, rear, front, wrapL: wrapL.value, wrapR: wrapR.value, stationOffsetMm: Math.max(wrapL.offsetMm || 0, wrapR.offsetMm || 0), wheelR: receipt.wheelR, trackTh: receipt.trackTh, flags });
  }
  tank.dispose?.();
}
console.log('id'.padEnd(22), 'unit', 'rear'.padStart(7), 'front'.padStart(7), 'wrap L'.padStart(7), 'wrap R'.padStart(7), ' flags');
for (const r of rows) {
  if (r.error) { console.log(r.id.padEnd(22), 'BUILD FAILED', r.error.slice(0, 80)); continue; }
  console.log(r.id.padEnd(22), String(r.unit).padEnd(4), String(r.rear ?? '-').padStart(7), String(r.front ?? '-').padStart(7),
    String(r.wrapL ?? '-').padStart(7), String(r.wrapR ?? '-').padStart(7), ' ' + (r.flags.join(',') || 'ok'));
}
console.log(`track wrap review: ${ids.length} tanks, ${rows.filter((r) => !r.error).length} units, ${cuts} cut a wheel, ${gaps} leave a gap, ${wraps} off the per-side tangent wrap`);
const jsonPath = opt('json', ''); if (jsonPath) { mkdirSync(resolve(jsonPath, '..'), { recursive: true }); writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1)); }
if (flag('gate') && (cuts || wraps)) process.exit(1);
