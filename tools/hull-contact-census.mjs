#!/usr/bin/env node
// Fleet contact census (tools/hull-contact-census-lib.mjs): floating hull, turret and gun stock (fittings, stowage,
// nets and props included) and belly pits per tank.
//   node tools/hull-contact-census.mjs --ids=kf51_u,leo2a5m [--json=out.json] [--all-islands]
//   node tools/hull-contact-census.mjs --all --json=out.json [--where]   (--where: each part's authoring source lines)
// Prints one summary line per tank, then each visible float (clearance >= 4 mm) and each belly pit.
import { writeFileSync } from 'node:fs';
import { uniqueIds } from './id-list.mjs';
import { FLEET_GROUP_BY_ID } from '../src/vehicles/fleetManifest.ts';
import { hullContactCensus, VISIBLE_FLOAT_GAP_M } from './hull-contact-census-lib.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ids = process.argv.includes('--all') ? Object.keys(FLEET_GROUP_BY_ID) : uniqueIds((arg('ids') ?? '').split(',').filter(Boolean), 'hull-contact-census --ids');
if (!ids.length) { console.error('usage: node tools/hull-contact-census.mjs --ids=a,b | --all [--json=path]'); process.exit(1); }
const allIslands = process.argv.includes('--all-islands');
const out = [], f = (v) => v.map((n) => n.toFixed(3)).join(',');
for (const id of ids) {
  const started = performance.now();
  let row;
  try { row = hullContactCensus(id, { where: process.argv.includes('--where') }); }
  catch (error) { console.log(`${id}: ERROR ${error.message}`); out.push({ id, error: String(error.message) }); continue; }
  // visible: clear of the hull by VISIBLE_FLOAT_GAP_M or more, not enclosed in the vehicle's own armour and (on the gun)
  // not resting on the turret
  const floating = row.islands.filter((island) => island.gapM === null || island.gapM >= VISIBLE_FLOAT_GAP_M);
  const visible = floating.filter((island) => !island.enclosed && !island.held);
  console.log(`${id}: ${row.parts} parts, ${row.islands.length} islands (${visible.length} visible, `
    + `${visible.filter((i) => i.flap).length} flap, ${floating.filter((i) => i.enclosed).length} enclosed, ${floating.filter((i) => i.held).length} held), ${row.pits.length} belly pits `
    + `(${((performance.now() - started) / 1000).toFixed(1)} s)`);
  for (const island of allIslands ? row.islands : visible) {
    console.log(`   ${island.body} ${island.flap ? 'FLAP ' : ''}float gap ${island.gapM === null ? '>0.8' : (island.gapM * 1000).toFixed(0)} mm `
      + `[${f(island.min)} .. ${f(island.max)}] ${island.parts.map((p) => p.bucket).join(' ')}`);
  }
  for (const pit of row.pits) {
    console.log(`   PIT ${pit.kind} x ${f(pit.x)} z ${f(pit.z)} area ${pit.areaM2.toFixed(2)} m2 rise ${pit.riseM.toFixed(2)} m see-through ${pit.seeThroughCells}`);
  }
  out.push(row);
}
const json = arg('json');
if (json) writeFileSync(json, JSON.stringify(out, null, 1));
