#!/usr/bin/env node
// Re-anchor fleet takes the motion search found no plan for (fleet-roster.json): each moves to the next free anchor on its
// own battlefield, one 150 m from every other fleet take there and 30 m from any anchor already tried for it, keeping its
// number, hero, hour, template, cast, paint and titles (they name the map, which stays). The anchors tried are kept in
// fleet-rejects.json, so a later run never offers them again. A take with no anchor left on its map is reported.
//   node tools/media-r5/fleet-replan.mjs <n,n,...> [--features=<dir>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorsFinder } from './fleet-anchors.mjs';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const FEATURES = arg('features') ?? process.env.MEDIA_R5_FEATURES ?? join(SHOTS_DIR, 'features');
const ROSTER = join(HERE, 'fleet-roster.json'), REJECTS = join(HERE, 'fleet-rejects.json');
const want = new Set((process.argv[2] ?? '').split(',').filter(Boolean).map(Number));
const roster = JSON.parse(readFileSync(ROSTER, 'utf8'));
const rejects = existsSync(REJECTS) ? JSON.parse(readFileSync(REJECTS, 'utf8')) : {};
const { anchorsOf } = anchorsFinder(FEATURES);
const moved = [], stuck = [];
for (const r of roster.filter((x) => want.has(x.n))) {
  (rejects[r.hero] ??= []).push(r.anchor);
  const others = roster.filter((x) => x.map === r.map && x.n !== r.n).map((x) => x.anchor);
  const spot = anchorsOf(r.map).find(([x, z]) => others.every(([ox, oz]) => Math.hypot(ox - x, oz - z) > 150)
    && rejects[r.hero].every(([rx, rz]) => Math.hypot(rx - x, rz - z) > 30));
  if (!spot) { stuck.push(`s${r.n} ${r.hero} (${r.map})`); continue; }
  r.anchor = [spot[0], spot[1]];
  r.heading = spot[2];
  moved.push(`s${r.n}`);
}
writeFileSync(ROSTER, `${JSON.stringify(roster, null, 1)}\n`);
writeFileSync(REJECTS, `${JSON.stringify(rejects, null, 1)}\n`);
console.log(`[fleet-replan] re-anchored ${moved.length}: ${moved.join(' ')}${stuck.length ? `; no anchor left: ${stuck.join(', ')}` : ''}`);
