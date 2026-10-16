#!/usr/bin/env node
// Shipped interior fills in open bore air (tank-opt WRECK verify, 2026-10-16).
//
//   node tools/interior-fill-bore-air.mjs --ids=t80,c2_ariete | --all [--shard=k/n] [--write] [--gate]
//
// The fill generator never fills a voxel that can touch one of a tank's open muzzle bores (tools/physical-bore-air.mjs:
// the declared physical bore and every carved one). A record generated before its tank's bore was declared or carved
// still carries such boxes, and a regeneration re-measures the whole body. Found on 2026-10-16 (220 ids):
//   - turret-frame rods, one voxel square and 25-175 mm long, inside the carved bores of t80, t80b, type10_tk_x,
//     ua_t80bv and t90a. Turret stock in a gun-frame recess stays put when the gun elevates, droops or bends, so it
//     hangs in the air where the muzzle was (on every wreck: 0.13-0.28 m from the bent gun);
//   - gun-frame stock capping the recesses of c1_ariete and c2_ariete.
// The census lists every shipped box that holds a bore-air voxel. --write applies the generator's own rule to the
// shipped record alone: each such box is replaced in place by the boxes of its voxels outside the bore air (a box wholly
// inside goes), every other box stays byte for byte, and only that component's string changes on the id's line of its
// group module (src/vehicles/interiorFillGroups/<group>.generated.ts). Bore air is never a leak to the watertight
// measurement, so the body's measured seal is unchanged. --gate exits 1 when any listed tank keeps a box in bore air.
// Receipt: tools/interior-fill-bore-air.selftest.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { insideBoreAir } from './physical-bore-air.mjs';

const FILL_COMPONENTS = Object.freeze(['hull', 'turret', 'gun']);

/** A record component's inclusive voxel spans (base64 little-endian Uint16 sextets, interiorFills.ts). */
export function decodeFillSpans(encoded) {
  if (!encoded) return new Uint16Array(0);
  const bytes = Buffer.from(encoded, 'base64');
  const spans = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < spans.length; i++) spans[i] = bytes.readUInt16LE(2 * i);
  return spans;
}

/** The base64 string the generator writes for a component's spans. */
export function encodeFillSpans(spans) {
  const u16 = Uint16Array.from(spans);
  return Buffer.from(u16.buffer, u16.byteOffset, u16.byteLength).toString('base64');
}

/** Greedy boxes (x runs, then y, then z: the generator's order) over the kept voxels of one box's index range. */
function keptBoxes(keep, x0, y0, z0, sx, sy, sz) {
  const used = new Uint8Array(keep.length), out = [];
  const at = (x, y, z) => (z * sy + y) * sx + x;
  const free = (x, y, z) => keep[at(x, y, z)] && !used[at(x, y, z)];
  for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
    if (!free(x, y, z)) continue;
    let x1 = x; while (x1 + 1 < sx && free(x1 + 1, y, z)) x1++;
    let y1 = y;
    rows: while (y1 + 1 < sy) { for (let xx = x; xx <= x1; xx++) if (!free(xx, y1 + 1, z)) break rows; y1++; }
    let z1 = z;
    slabs: while (z1 + 1 < sz) { for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) if (!free(xx, yy, z1 + 1)) break slabs; z1++; }
    for (let zz = z; zz <= z1; zz++) for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[at(xx, yy, zz)] = 1;
    out.push(x0 + x, y0 + y, z0 + z, x0 + x1, y0 + y1, z0 + z1);
  }
  return out;
}

/**
 * The record's boxes that hold a bore-air voxel, and the record with the generator's rule applied: `bore` from
 * physicalBoreAir(root) of the tank built as the generator builds it (null: no open bore, nothing to prune). Returns
 * { hits: [{ component, box, span, inside, total }], record (a new record when anything changed, else the same one),
 * removedVoxels }.
 */
export function pruneBoreAirFills(bore, record) {
  const grid = { origin: record.o, voxel: record.v };
  const hits = [];
  let removedVoxels = 0;
  const next = { ...record };
  for (const component of FILL_COMPONENTS) {
    if (!record[component] || !bore) continue;
    const spans = decodeFillSpans(record[component]);
    const out = [];
    let changed = false;
    for (let i = 0; i + 5 < spans.length; i += 6) {
      const [x0, y0, z0, x1, y1, z1] = spans.subarray(i, i + 6);
      const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
      const keep = new Uint8Array(sx * sy * sz);
      let inside = 0;
      for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
        if (insideBoreAir(bore, grid, x0 + x, y0 + y, z0 + z)) inside++;
        else keep[(z * sy + y) * sx + x] = 1;
      }
      if (!inside) { out.push(x0, y0, z0, x1, y1, z1); continue; }
      changed = true;
      removedVoxels += inside;
      hits.push({ component, box: i / 6, span: [x0, y0, z0, x1, y1, z1], inside, total: keep.length });
      out.push(...keptBoxes(keep, x0, y0, z0, sx, sy, sz));
    }
    if (!changed) continue;
    if (out.length) next[component] = encodeFillSpans(out);
    else delete next[component];
  }
  return { hits, record: hits.length ? next : record, removedVoxels };
}

/**
 * The group module's text with `id`'s component strings replaced by `record`'s (the generator's line format: one
 * `  "<id>": { v, o, t, g, hull, turret, gun },` line per tank). Only the changed components' strings move.
 */
export function rewriteGroupRecord(text, id, before, after) {
  const head = `  ${JSON.stringify(id)}: { `;
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.startsWith(head));
  if (at < 0 || lines.findIndex((line, k) => k > at && line.startsWith(head)) >= 0) throw new Error(`${id}: not exactly one record line`);
  let line = lines[at];
  for (const component of FILL_COMPONENTS) {
    if (before[component] === after[component]) continue;
    const old = `, ${component}: ${JSON.stringify(before[component])}`;
    if (line.split(old).length !== 2) throw new Error(`${id}: ${component} string not found once on its record line`);
    line = line.replace(old, after[component] ? `, ${component}: ${JSON.stringify(after[component])}` : '');
  }
  lines[at] = line;
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
  const flag = (name) => args.includes(`--${name}`);
  // the generator's build (gen-interior-fills.mjs): the canvas shim first, the procedural tank at its build pose
  await import('./tank-surface-collect.mjs');
  const { createTank } = await import('../src/vehicles/tankFactory.ts');
  const { ensureInteriorFills, interiorFillRecord } = await import('../src/vehicles/interiorFills.ts');
  const { FLEET_GROUP_BY_ID } = await import('../src/vehicles/fleetManifest.ts');
  const { physicalBoreAir } = await import('./physical-bore-air.mjs');
  let ids = flag('all') ? Object.keys(FLEET_GROUP_BY_ID) : opt('ids', '').split(',').filter(Boolean);
  if (!ids.length) throw new Error('--ids=a,b or --all');
  const unknown = ids.filter((id) => !Object.hasOwn(FLEET_GROUP_BY_ID, id));
  if (unknown.length) throw new Error(`unknown tank ids: ${unknown.join(', ')}`);
  const shard = opt('shard', '');
  if (shard) { const [k, n] = shard.split('/').map(Number); ids = ids.filter((_, i) => i % n === k); }
  await ensureInteriorFills(ids);
  const write = flag('write');
  const rewritten = new Map();
  let withHits = 0;
  for (const id of ids) {
    const record = interiorFillRecord(id);
    if (!record) { console.log(`-    ${id}: no fills`); continue; }
    const tank = createTank(id, null, { proceduralOnly: true });
    let result;
    try { result = pruneBoreAirFills(physicalBoreAir(tank.root), record); } finally { tank.dispose(); }
    if (result.hits.length) withHits++;
    console.log(`${result.hits.length ? 'BORE' : 'ok  '} ${id}${result.hits.map((h) => ` ${h.component}#${h.box} [${h.span.join(',')}] ${h.inside}/${h.total}`).join('')}`);
    if (!write || !result.hits.length) continue;
    const file = resolve('src/vehicles/interiorFillGroups', `${FLEET_GROUP_BY_ID[id] || 'core'}.generated.ts`);
    const text = rewritten.get(file) ?? readFileSync(file, 'utf8');
    rewritten.set(file, rewriteGroupRecord(text, id, record, result.record));
    console.log(`     ${id}: ${result.removedVoxels} bore-air voxel(s) left open`);
  }
  for (const [file, text] of rewritten) writeFileSync(file, text);
  console.log(`\ninterior-fill-bore-air: ${withHits} of ${ids.length} tank(s) ship fill boxes in open bore air`
    + `${write && rewritten.size ? `; rewrote ${rewritten.size} group module(s)` : ''}`);
  if (flag('gate') && withHits && !write) process.exit(1);
}
