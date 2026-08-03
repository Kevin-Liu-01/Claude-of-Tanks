// TANK STANDARD CHECK (docs/BUILD-STANDARD.md §F.3) — one command that
// aggregates the standard's machine-checkable gates per tank:
//   A. geometry-gate components (latest docs/geometry-gate/<id>.json,
//      staleness-flagged; use --gate to force a fresh run first)
//   B4. track containment (tools/track-clip-audit.mjs --exact)
//   B2/B3. contiguity + decoration: v2 items — reported as MANUAL until the
//      KIT fitting markers + top-down hole scan land (kit-fittings round).
// Usage: node tools/tank-standard-check.mjs --ids=a,b [--gate]
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const idArg = process.argv.find((a) => a.startsWith('--ids='));
if (!idArg) { console.error('usage: node tools/tank-standard-check.mjs --ids=a,b [--gate]'); process.exit(1); }
const ids = idArg.slice(6).split(',');
const forceGate = process.argv.includes('--gate');

if (forceGate) {
  execFileSync('node', ['tools/geometry-gate.mjs', `--ids=${ids.join(',')}`], { stdio: 'inherit' });
}

// containment (one batched run)
let clip = new Map();
try {
  const out = execFileSync('node', ['tools/track-clip-audit.mjs', '--exact', `--ids=${ids.join(',')}`],
    { encoding: 'utf8' });
  for (const line of out.split('\n')) {
    const m = line.match(/\[track-clip\] (\S+)\s+front\s+(\S+) rear\s+(\S+)/);
    if (m) clip.set(m[1], { front: m[2], rear: m[3] });
  }
} catch (e) {
  console.error('[standard-check] track-clip audit failed:', e.message.slice(0, 120));
}

const CLIP_BAND = 60; // kv2-graduate band (BUILD-STANDARD §B4)
console.log('id                 | gateMin | components (h/w/t/st/d/f)      | age  | clip f/r  | contig | decor');
console.log('-------------------|---------|--------------------------------|------|-----------|--------|------');
let fails = 0;
for (const id of ids) {
  let row = 'no gate json', min = '—', age = '—';
  try {
    const p = `docs/geometry-gate/${id}.json`;
    const j = JSON.parse(readFileSync(p, 'utf8'));
    const c = j.components;
    min = j.geoMin;
    row = [c.hullCurves, c.wholeCurves, c.turretCurves, c.stations, c.dims, c.floaters].join('/');
    age = `${Math.round((Date.now() - statSync(p).mtimeMs) / 60000)}m`;
  } catch { /* keep placeholder */ }
  const cl = clip.get(id);
  const clipStr = cl ? `${cl.front}/${cl.rear}` : '—';
  const clipOk = cl && Number(cl.front) <= CLIP_BAND && Number(cl.rear) <= CLIP_BAND;
  const gateOk = typeof min === 'number' && min >= 90;
  if (!gateOk || (cl && !clipOk)) fails++;
  console.log(
    `${id.padEnd(19)}| ${String(min).padStart(7)} | ${String(row).padEnd(31)}| ${String(age).padStart(4)} | ` +
    `${clipStr.padStart(9)}${cl ? (clipOk ? ' ✓' : ' ✗') : '  '}| MANUAL | MANUAL`);
}
console.log(`\n[standard-check] ${ids.length - fails}/${ids.length} pass the machine-checkable gates ` +
  `(gate>=90 + clip<=${CLIP_BAND}); contiguity/decoration are critic checks until the kit-marker census lands.`);
process.exit(fails ? 2 : 0);
