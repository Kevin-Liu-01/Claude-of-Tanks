#!/usr/bin/env node
// Roofs without walls, per tank (tools/roof-pocket.mjs): the see-through pockets under panels that read as solid.
//   node tools/roof-pocket-census.mjs --ids=leclerc_s1,leclerc_s2 [--json=path] [--gate]
//   node tools/roof-pocket-census.mjs --all [--json=path] [--from=<id>]
// Builds each id first-party (createTank, proceduralOnly, high, seed 4242, the geometry receipt's build), measures the
// turret (gun at rest) and the hull (no running gear) in their own frames and prints each exposed pocket: owner, plan area,
// volume, depth from its mouth and its box. --gate exits non-zero when any measured tank has one. First-party tooling:
// Kevin B. Liu (NOTICE.md).
import { writeFileSync } from 'node:fs';
import './tank-surface-collect.mjs'; // node canvas shim: builders paint their canvas textures as in the browser
import { uniqueIds } from './id-list.mjs';
import { OWNER_RULES, ownerSoups, roofPockets } from './roof-pocket.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
let ids = args.includes('--all') ? [...ALL_TANK_IDS] : uniqueIds(opt('ids', '').split(',').map((s) => s.trim()).filter(Boolean), 'roof-pocket-census --ids');
if (opt('from')) ids = ids.slice(Math.max(0, ids.indexOf(opt('from'))));
if (!ids.length) { console.error('roof-pocket-census: pass --ids=<a,b> or --all'); process.exit(2); }

const rows = [];
for (const id of ids) {
  const started = Date.now();
  let tank;
  try {
    tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
    const soups = ownerSoups(tank), found = [];
    for (const [owner, soup] of Object.entries(soups)) for (const p of roofPockets(soup.tri, { ...OWNER_RULES[owner], body: soup.body })) found.push({ owner, ...p });
    found.sort((a, b) => b.areaM2 - a.areaM2);
    const areaCm2 = found.reduce((t, p) => t + p.areaM2 * 1e4, 0);
    rows.push({ id, pockets: found.length, areaCm2: +areaCm2.toFixed(0), found });
    console.log(`${id}: ${found.length ? `${found.length} pocket(s), ${areaCm2.toFixed(0)} cm2` : 'none'} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    for (const p of found.slice(0, 8)) {
      console.log(`  ${p.owner} ${(p.areaM2 * 1e4).toFixed(0)} cm2, ${p.volumeL.toFixed(1)} L, depth ${(p.depthM * 100).toFixed(0)} cm, roof y ${p.roof.join('..')}, box x ${p.box[0]}..${p.box[3]} y ${p.box[1]}..${p.box[4]} z ${p.box[2]}..${p.box[5]}`);
    }
  } catch (error) {
    rows.push({ id, error: String(error?.message || error) });
    console.log(`${id}: ERROR ${String(error?.message || error).slice(0, 200)}`);
  } finally {
    tank?.dispose?.();
  }
}
if (opt('json')) writeFileSync(opt('json'), `${JSON.stringify(rows, null, 1)}\n`);
const flagged = rows.filter((r) => r.pockets);
console.log(`roof-pocket census: ${rows.length} tank(s), ${flagged.length} with pockets${flagged.length ? `: ${flagged.sort((a, b) => b.areaCm2 - a.areaCm2).map((r) => `${r.id} ${r.areaCm2}`).join(', ')}` : ''}`);
if (args.includes('--gate') && flagged.length) process.exitCode = 1;
