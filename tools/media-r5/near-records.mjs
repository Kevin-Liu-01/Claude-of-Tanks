#!/usr/bin/env node
// The battlefield's records around a point (combat round, 2026-10-13): kind, centre, footprint and height of every
// record within `r` m of [x, z] on a map, nearest first, and whether the point itself stands inside one — for placing
// a fight clear of the buildings before any lens is flown.
//   node tools/media-r5/near-records.mjs <map> <x> <z> [r=25]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { insideRecord, worldModel } from './world-model.mjs';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

const [map, xs, zs, rs = '25'] = process.argv.slice(2);
const x = Number(xs), z = Number(zs), r = Number(rs);
const model = worldModel(JSON.parse(readFileSync(join(process.env.MEDIA_R5_FEATURES ?? join(SHOTS_DIR, 'features'), `features-${map}.json`), 'utf8')));
const found = [];
model.query(x - r, z - r, x + r, z + r, found);
const rows = found.map((rec) => {
  const cx = (rec.min[0] + rec.max[0]) / 2, cz = (rec.min[2] + rec.max[2]) / 2;
  return { rec, cx, cz, d: Math.hypot(cx - x, cz - z) };
}).filter((o) => o.d <= r).sort((a, b) => a.d - b.d);
const gy = model.heightAt(x, z), inside = insideRecord(model, [x, gy + 1.2, z], 0.4);
console.log(`${map} [${x}, ${z}]: ground ${gy.toFixed(1)} m, ${inside ? `INSIDE ${inside.kind}` : 'clear'}; ${rows.length} records within ${r} m`);
for (const { rec, cx, cz, d } of rows.slice(0, 30)) {
  console.log(`  ${(rec.kind ?? 'record').padEnd(14)} centre ${cx.toFixed(1)},${cz.toFixed(1)} (${d.toFixed(1)} m) size ${(rec.max[0] - rec.min[0]).toFixed(1)}×${(rec.max[2] - rec.min[2]).toFixed(1)} up to ${rec.max[1].toFixed(1)}${rec.crushable ? ' crushable' : ''}${rec.canopyR ? ` crown ${rec.canopyR.toFixed(1)}` : ''}`);
}
