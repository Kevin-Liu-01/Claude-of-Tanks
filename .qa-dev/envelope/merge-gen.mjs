// Lane tool (envelope-honesty-264): bring one batch worktree's regenerated rows into the lane tree, per id. Every batch
// worktree starts from the same source commit (S); each ran the ids-scoped chain for its own ids, so each generated table
// holds that batch's ids' new rows and S's rows for the rest. For every generated file, the lane's rows for the batch's ids
// are replaced by the batch's, byte for byte as the batch's generator wrote them; every other row stays the lane's.
//   node .qa-dev/envelope/merge-gen.mjs <batchRoot> <id,id,...> <baseRev> [--write]
// Refuses a file it cannot split into per-id blocks; warns when the batch changed a row outside its ids (against baseRev).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const [batchRoot, idList, baseRev] = process.argv.slice(2);
const write = process.argv.includes('--write');
const lane = '/Users/kevinliu/cot-lanes/envelope-honesty-264';
const ids = new Set(idList.split(','));
const GROUP_DIRS = ['src/vehicles/combatAnatomyGroups', 'src/vehicles/vehicleMarkingSeatGroups', 'src/vehicles/interiorFillGroups'];
const FILES = ['docs/geometry-gate/sim-floors.json', 'docs/geometry-gate/spare-track.json', 'docs/geometry-gate/gun-junction.json',
  'docs/references/fleet-geometry-ledger.json', 'docs/geometry-gate/moving-clearance-air.json', 'src/sim/missionAttachmentSeats.generated.ts',
  'src/sim/missionDockSeats.generated.ts', 'src/vehicles/combatGunRigs.generated.ts', 'src/vehicles/spareTrackSeatPlan.ts'];
const files = [...FILES];
for (const dir of GROUP_DIRS) for (const f of readdirSync(join(lane, dir))) if (f.endsWith('.generated.ts')) files.push(`${dir}/${f}`);
const baseText = (rel) => { try { return execFileSync('git', ['-C', lane, 'show', `${baseRev}:${rel}`], { encoding: 'utf8', maxBuffer: 1 << 28 }); } catch { return null; } };

/** Split a file into { head, blocks: [[id, text]], tail, trailingComma } at its one top-level id map. */
function blocks(text, rel) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /(=\s*(Object\.freeze\()?\{|"(rows|tanks)":\s*\{)\s*$/.test(l));
  if (start < 0) throw new Error(`${rel}: no map start`);
  const first = lines.slice(start + 1).find((l) => l.trim());
  const indent = first.match(/^ */)[0];
  const keyRe = new RegExp(`^${indent}(?:"([^"]+)"|([A-Za-z_$][\\w$]*)):\\s`);
  const closeRe = new RegExp(`^ {0,${Math.max(0, indent.length - 1)}}\\}`);
  const out = []; let i = start + 1, cur = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (closeRe.test(line)) break;
    const m = line.match(keyRe);
    if (m) { cur = [m[1] ?? m[2], [line]]; out.push(cur); continue; }
    if (!cur) throw new Error(`${rel}: line ${i + 1} before the first key`);
    cur[1].push(line);
  }
  if (i >= lines.length) throw new Error(`${rel}: no map end`);
  const lastBlock = out.at(-1)?.[1];
  const trailingComma = !!lastBlock && lastBlock.at(-1).trimEnd().endsWith(',');
  const strip = (b) => { const c = [...b]; c[c.length - 1] = c.at(-1).replace(/,\s*$/, ''); return c.join('\n'); };
  return { head: lines.slice(0, start + 1).join('\n'), tail: lines.slice(i).join('\n'),
    blocks: out.map(([id, b]) => [id, strip(b)]), trailingComma };
}
const join_ = ({ head, blocks: bs, tail, trailingComma }) =>
  `${head}\n${bs.map(([, t], k) => (k < bs.length - 1 || trailingComma ? `${t},` : t)).join('\n')}\n${tail}`;

function mergeOneLine(laneText, batchText, rel) {
  const cut = (t) => { const a = t.indexOf('Object.freeze('), b = t.lastIndexOf(');'); return [t.slice(0, a + 14), t.slice(a + 14, b), t.slice(b)]; };
  const [lh, lj, lt] = cut(laneText), [, bj] = cut(batchText);
  const lo = JSON.parse(lj), bo = JSON.parse(bj);
  if (JSON.stringify(lo) !== lj) throw new Error(`${rel}: lane JSON does not round-trip`);
  let moved = 0;
  for (const id of Object.keys(bo)) if (ids.has(id) && JSON.stringify(lo[id]) !== JSON.stringify(bo[id])) { lo[id] = bo[id]; moved++; }
  for (const id of ids) if (id in lo && !(id in bo)) throw new Error(`${rel}: ${id} missing from batch`);
  return [lh + JSON.stringify(lo) + lt, moved];
}

let changedFiles = 0, warnings = 0;
for (const rel of files) {
  const lp = join(lane, rel), bp = join(batchRoot, rel);
  if (!existsSync(bp) || !existsSync(lp)) { if (existsSync(bp) !== existsSync(lp)) { console.log(`!! ${rel}: present on one side only`); warnings++; } continue; }
  const lt = readFileSync(lp, 'utf8'), bt = readFileSync(bp, 'utf8');
  if (lt === bt) continue;
  const base = baseText(rel);
  if (bt === base) continue; // the batch did not touch it
  let merged, moved = 0;
  const oneLine = /Object\.freeze\(\{"/.test(bt) && bt.split('\n').length < 12;
  if (oneLine) {
    [merged, moved] = mergeOneLine(lt, bt, rel);
    if (base) { const bo = JSON.parse(base.slice(base.indexOf('Object.freeze(') + 14, base.lastIndexOf(');'))), xo = JSON.parse(bt.slice(bt.indexOf('Object.freeze(') + 14, bt.lastIndexOf(');')));
      for (const id of Object.keys(xo)) if (!ids.has(id) && JSON.stringify(xo[id]) !== JSON.stringify(bo[id])) { console.log(`!! ${rel}: batch changed ${id} outside its ids`); warnings++; } }
  } else {
    const L = blocks(lt, rel), Bk = blocks(bt, rel);
    if (join_(L) !== lt) throw new Error(`${rel}: lane file does not rebuild from its blocks`);
    const bmap = new Map(Bk.blocks);
    if (base) { const X = new Map(blocks(base, rel).blocks); for (const [id, t] of Bk.blocks) if (!ids.has(id) && X.get(id) !== t) { console.log(`!! ${rel}: batch changed ${id} outside its ids`); warnings++; } }
    for (const b of L.blocks) if (ids.has(b[0]) && bmap.has(b[0]) && bmap.get(b[0]) !== b[1]) { b[1] = bmap.get(b[0]); moved++; }
    const laneIds = new Set(L.blocks.map(([id]) => id));
    for (const [id] of Bk.blocks) if (ids.has(id) && !laneIds.has(id)) { console.log(`!! ${rel}: ${id} is new in the batch (not merged)`); warnings++; }
    merged = join_(L);
  }
  if (merged !== lt) { changedFiles++; console.log(`${rel}: ${moved} row(s) from the batch`); if (write) writeFileSync(lp, merged); }
}
console.log(`${write ? 'wrote' : 'would write'} ${changedFiles} file(s), ${warnings} warning(s)`);
if (warnings) process.exitCode = 1;
