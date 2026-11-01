#!/usr/bin/env node
// Whip rods per tank, found by their geometry (tools/whip-rods.mjs), each named tagged or UNTAGGED: whether the geometry
// gate's body rule (tools/body-height-parts.mjs) already sets it aside as an antenna.
//   node tools/whip-rod-census.mjs --ids=t90,t90ms_tagil [--json=path] [--gate] [--jobs=N]
//   node tools/whip-rod-census.mjs --all [--json=path] [--gate] [--jobs=N] [--rods]
// Builds each id first-party (createTank, proceduralOnly, high, seed 4242, the geometry receipt's build) and prints every
// whip: its node path, its tag, length, how far its tip stands proud, radius, tilt from vertical, foot and tip in the
// tank's frame. --rods lists every rod, the ones that are not whips (racks, slats, cages, dischargers) marked so. --gate
// exits non-zero when any whip is untagged (a rod tools/whip-rods.mjs NOT_WHIPS read and found not to be an aerial is
// listed as reviewed). --jobs splits the ids over that many child processes. First-party tooling:
// Kevin B. Liu (NOTICE.md).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './tank-surface-collect.mjs'; // node canvas shim: builders paint their canvas textures as in the browser
import { fleetRoster } from './fleet-geometry-digest.mjs';
import { uniqueIds } from './id-list.mjs';
import { notWhip, whipRods } from './whip-rods.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);

const roster = fleetRoster();
const ids = flag('all') ? roster : uniqueIds(opt('ids', '').split(',').map((s) => s.trim()).filter(Boolean), 'whip-rod-census --ids');
if (!ids.length) { console.error('whip-rod-census: pass --ids=<a,b> or --all'); process.exit(2); }
const unknown = ids.filter((id) => !roster.includes(id));
if (unknown.length) { console.error(`whip-rod-census: unknown id(s) ${unknown.join(', ')}`); process.exit(2); }

const isRenderNode = (o) => (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) && o.geometry;
const r3 = (v) => v.map((x) => +x.toFixed(3));

/** Measure `list` here, one tank at a time; each row { id, rods, untagged } or { id, error }. */
async function measure(list) {
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const rows = [];
  for (const id of list) {
    let tank;
    try {
      tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
      const rods = whipRods(tank.root, { isRenderNode, rods: flag('rods') }).map((r) => ({ path: r.path, whip: r.whip, twin: r.twin,
        proudM: +r.proudM.toFixed(3), tagged: r.tagged, tag: r.tag, notWhip: (r.whip && !r.tagged && notWhip(id, r.measure.foot)?.why) || undefined,
        lengthM: +r.measure.length.toFixed(3), radiusMm: +(r.measure.radius * 1000).toFixed(1), tiltDeg: +r.measure.tiltDeg.toFixed(1),
        foot: r3(r.measure.foot), tip: r3(r.measure.tip), triangles: r.triangles }));
      const untagged = rods.filter((r) => r.whip && !r.tagged && !r.notWhip).length;
      rows.push({ id, rods, untagged });
      console.log(`${id}: ${rods.length} rod(s)${untagged ? `, ${untagged} UNTAGGED` : ''}`);
      for (const r of rods) {
        console.log(`  ${r.tagged ? 'tagged' : r.notWhip ? `reviewed (${r.notWhip})` : r.whip ? 'UNTAGGED' : 'untagged'}${r.whip ? '' : ' (not a whip)'} ${r.path} [${r.tag ?? '-'}] ${r.lengthM} m, proud ${r.proudM} m${r.twin ? ' (twin)' : ''}, r ${r.radiusMm} mm, tilt ${r.tiltDeg}, foot ${r.foot.join(',')}, tip ${r.tip.join(',')}, ${r.triangles} tris`);
      }
    } catch (error) {
      rows.push({ id, error: String(error?.message || error) });
      console.log(`${id}: ERROR ${String(error?.message || error).slice(0, 200)}`);
    } finally {
      tank?.dispose?.();
    }
  }
  return rows;
}

/** The same measurement over `jobs` child processes (each its own heap, 4 GB), rows back in `list` order. */
async function measureParallel(list, jobs) {
  const dir = mkdtempSync(join(tmpdir(), 'cot-whip-rods-'));
  const chunks = Array.from({ length: jobs }, (_, j) => list.filter((_, i) => i % jobs === j)).filter((c) => c.length);
  const runs = chunks.map((chunk, j) => new Promise((done, fail) => {
    const out = join(dir, `part-${j}.json`);
    const child = spawn(process.execPath, ['--max-old-space-size=4096', 'tools/whip-rod-census.mjs', `--ids=${chunk.join(',')}`, `--json=${out}`, '--part', ...(flag('rods') ? ['--rods'] : [])],
      { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (b) => process.stdout.write(b));
    child.on('exit', (code) => (code === 0 ? done(JSON.parse(readFileSync(out, 'utf8'))) : fail(new Error(`whip-rod-census part ${j} exited ${code}`))));
  }));
  const byId = new Map((await Promise.all(runs)).flat().map((r) => [r.id, r]));
  return list.map((id) => byId.get(id));
}

const jobs = Math.max(1, Math.min(ids.length, Number(opt('jobs', '1')) || 1));
const rows = jobs > 1 ? await measureParallel(ids, jobs) : await measure(ids);
if (opt('json')) writeFileSync(opt('json'), `${JSON.stringify(rows, null, 1)}\n`);
if (flag('part')) process.exit(0);
const errors = rows.filter((r) => r.error), flagged = rows.filter((r) => r.untagged);
const tagged = rows.reduce((t, r) => t + (r.rods?.filter((x) => x.whip && x.tagged).length ?? 0), 0);
console.log(`whip-rod census: ${rows.length} tank(s), ${tagged} tagged whip(s), ${flagged.reduce((t, r) => t + r.untagged, 0)} untagged${flagged.length ? ` (${flagged.map((r) => `${r.id} ${r.untagged}`).join(', ')})` : ''}${errors.length ? `, ${errors.length} error(s): ${errors.map((r) => r.id).join(', ')}` : ''}`);
if (flag('gate') && (flagged.length || errors.length)) process.exit(1);
