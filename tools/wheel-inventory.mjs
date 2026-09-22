#!/usr/bin/env node
// Fleet road-wheel inventory (owner 2026-09-22: "audit all our wheels … standardize our wheels across NATIONS").
//
//   node tools/wheel-inventory.mjs [--ids=a,b | --all] [--json=path] [--markdown=path]
//
// Builds every tank procedurally at both quality tiers and lists, per tank: nation, era, role, road-wheel
// count and radius, the wheel pattern the spec selects (wheelPatternFor) and the pattern the built gear
// carries, the road-wheel construction the gear receipt records (generic/measured-core/profile-solids or the
// nation-standard donor construction), the tire construction (solid / open annulus / tire bands), the
// number of instanced face layers, and the triangle count of ONE road wheel (all instanced road-wheel
// layers summed) at high and low quality. --json and --markdown write the same rows for the report.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './tank-surface-collect.mjs'; // node canvas shim
const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wheelPatternFor } = await import('../src/vehicles/wheelPatterns.ts');
const { resolveNationWheel } = await import('../src/vehicles/nationWheelSets.ts').catch(() => ({ resolveNationWheel: null }));
// tankFactory.ts registers the whole roster for node tools; fleetFactory (the browser's lazy owner) must not be imported here.
const ids = flag('all') ? [...ALL_TANK_IDS] : opt('ids', 'm1a2,challenger2,t90m').split(',').filter(Boolean);

const ROAD_WHEEL_LAYER = /^(gearRoadWheel|.*[Ww]heel(Face|Steel|Tire|Groove|Fastener|Hardware|Rim|Dish|Hub|Bolt|Recess|Pressed|Detail|Paired|Forged|Service|Annul))/;
function triangles(geometry) {
  if (!geometry) return 0;
  const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  const range = geometry.drawRange?.count ?? Infinity;
  return Math.floor(Math.min(count, range) / 3);
}
/** Triangles of one road wheel: every instanced layer that rides the road-wheel stations, one instance each. */
function roadWheelTriangles(root) {
  let total = 0; const layers = [];
  root.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const road = o.name === 'gearRoadWheelTires' || o.name === 'gearRoadWheelDiscs' || o.name === 'gearRoadWheelDiscsRecessed'
      || o.name === 'gearRoadWheelInsets' || o.userData?.dynamicWheelFace === true;
    if (!road) return;
    const tris = triangles(o.geometry);
    total += tris; layers.push(`${o.name}:${tris}`);
  });
  return { total, layers };
}
function build(id, quality) {
  return createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, batchStatic: false });
}

const rows = []; let failed = 0;
for (const id of ids) {
  const spec = TANK_SPECS[id];
  let high, low;
  try { high = build(id, 'high'); low = build(id, 'low'); }
  catch (error) { rows.push({ id, error: error.message }); failed++; high?.dispose?.(); continue; }
  try {
    const hull = high.root.getObjectByName('rig_hull');
    const gear = hull?.userData?.runningGearReceipts?.[0] ?? {};
    const pattern = hull?.userData?.wheelPatternReceipts?.[0] ?? {};
    const track = hull?.userData?.trackPatternReceipts?.[0] ?? {};
    const specPattern = (() => { try { return wheelPatternFor(spec, gear.style)?.id ?? null; } catch { return null; } })();
    const nation = resolveNationWheel ? resolveNationWheel(spec) : null;
    const tire = pattern.tireBands ? `tire-bands:${pattern.tireBands}` : pattern.openAnnulus ? 'open-annulus' : 'solid';
    const hi = roadWheelTriangles(high.root), lo = roadWheelTriangles(low.root);
    rows.push({
      id, nation: spec?.nation ?? '?', era: spec?.era ?? '?', role: spec?.role ?? '?',
      stations: gear.wheelZs?.length ?? null, wheelR: gear.wheelR ?? null,
      specPattern, builtPattern: pattern.id ?? null, style: pattern.style ?? gear.style ?? null,
      construction: pattern.construction ?? null, tire, faceLayers: pattern.wheelFaceLayers ?? 0,
      nationStandard: pattern.nationStandard ?? null,
      resolution: nation ? { kind: nation.kind, donor: nation.donor ?? null, construction: nation.construction ?? null, reason: nation.reason } : null,
      trackPattern: track.id ?? null,
      trisHigh: hi.total, trisLow: lo.total, layersHigh: hi.layers,
    });
  } finally { high.dispose?.(); low.dispose?.(); }
}
const pad = (v, n) => String(v ?? '-').padEnd(n);
console.log(pad('id', 22), pad('nation', 12), pad('era', 16), pad('role', 6), pad('n', 3), pad('r', 7), pad('pattern (spec -> built)', 36), pad('construction', 30), pad('tire', 14), pad('faces', 5), pad('tris hi/lo', 12), 'standard');
for (const r of rows) {
  if (r.error) { console.log(pad(r.id, 22), 'BUILD FAILED', r.error.slice(0, 90)); continue; }
  const std = r.resolution ? `${r.resolution.kind}${r.resolution.donor ? ':' + r.resolution.donor : ''}` : '';
  console.log(pad(r.id, 22), pad(r.nation, 12), pad(r.era, 16), pad(r.role, 6), pad(r.stations, 3), pad(r.wheelR?.toFixed?.(4), 7),
    pad(`${r.specPattern} -> ${r.builtPattern}`, 36), pad(r.construction, 30), pad(r.tire, 14), pad(r.faceLayers, 5), pad(`${r.trisHigh}/${r.trisLow}`, 12), std);
}
console.log(`wheel inventory: ${rows.length} tanks, ${failed} failed`);
const jsonPath = opt('json', ''); if (jsonPath) { mkdirSync(resolve(jsonPath, '..'), { recursive: true }); writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1)); }
const mdPath = opt('markdown', '');
if (mdPath) {
  const lines = ['| id | nation | era | role | wheels | radius m | pattern spec → built | construction | tire | face layers | tris high/low | standard |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    if (r.error) { lines.push(`| ${r.id} | BUILD FAILED | ${r.error} | | | | | | | | | |`); continue; }
    const std = r.resolution ? `${r.resolution.kind}${r.resolution.donor ? ' · ' + r.resolution.donor : ''}` : '';
    lines.push(`| ${r.id} | ${r.nation} | ${r.era} | ${r.role} | ${r.stations} | ${r.wheelR?.toFixed?.(4)} | ${r.specPattern} → ${r.builtPattern} | ${r.construction} | ${r.tire} | ${r.faceLayers} | ${r.trisHigh}/${r.trisLow} | ${std} |`);
  }
  mkdirSync(resolve(mdPath, '..'), { recursive: true }); writeFileSync(mdPath, lines.join('\n') + '\n');
}
if (failed) process.exit(1);
