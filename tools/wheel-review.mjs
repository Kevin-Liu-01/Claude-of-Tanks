#!/usr/bin/env node
// Fleet wheel review (owner 2026-09-13: "a comprehensive wheel review of all tanks that makes sure our wheels are
// correctly using primitives, and look good").
//
//   node tools/wheel-review.mjs [--ids=a,b | --all] [--gate] [--json=path] [--max-lightness=0.34] [--max-proud-m=0.04]
//
// Builds every tank (procedural, high tier) and reports, per tank: nation, the wheel pattern the spec selects and the
// pattern the built gear carries, whether the road wheels use the hollow construction (paired halves / tire bands /
// open annulus / thin core), the road-wheel paint and tire lightness (HSL L of the material colour), and the widest
// wheel dressing layer relative to the tire face (dressing that floats outboard reads as an offset wheel).
// Flags: BRIGHT (paint lightness above --max-lightness), BRIGHT-TIRE (tire lightness above 0.30), PROUD (dressing
// more than --max-proud-m outboard of the tire face), MISMATCH (built pattern differs from the spec's pattern).
// --gate exits 1 when any flag fires.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import './tank-surface-collect.mjs'; // node canvas shim
const args = process.argv.slice(2);
const opt = (name, fallback) => { const hit = args.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const flag = (name) => args.includes(`--${name}`);
const MAX_L = Number(opt('max-lightness', '0.34')), MAX_TIRE_L = 0.30, MAX_PROUD = Number(opt('max-proud-m', '0.04'));
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { wheelPatternFor } = await import('../src/vehicles/wheelPatterns.ts');
// tankFactory.ts registers the whole roster for node tools; fleetFactory (the browser's lazy owner) must not be imported here.
const ids = flag('all') ? [...ALL_TANK_IDS] : opt('ids', 'm1a2,challenger2').split(',').filter(Boolean);

function lightness(color) { if (!color) return null; const r = color.r, g = color.g, b = color.b; return +((Math.max(r, g, b) + Math.min(r, g, b)) / 2).toFixed(3); }
function instanceXs(mesh) { const xs = []; const e = mesh.instanceMatrix?.array; if (!e) return xs; for (let i = 0; i < mesh.count; i++) xs.push(e[i * 16 + 12]); return xs; }

const rows = []; let flagged = 0;
for (const id of ids) {
  let tank; try { tank = createTank(id, null, { proceduralOnly: true, quality: 'high' }); } catch (error) { rows.push({ id, error: error.message }); continue; }
  const spec = TANK_SPECS[id]; const root = tank.root; root.updateMatrixWorld(true);
  const hull = root.getObjectByName('rig_hull');
  const receipts = hull?.userData?.runningGearReceipts || []; const patterns = hull?.userData?.nativeWheelPatterns || hull?.userData?.wheelPatternReceipts || [];
  const gear = receipts[0] || {};
  const specPattern = (() => { try { return wheelPatternFor(spec, gear.style)?.id ?? null; } catch { return null; } })();
  const builtPattern = typeof patterns[0] === 'string' ? patterns[0] : (patterns[0]?.id ?? null);
  let tires = null, discs = null, tireFaceX = 0, dressingMaxX = 0, dressingName = '', hollow = [];
  root.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const name = o.name || '';
    if (name === 'gearRoadWheelTires') { tires = o; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; for (const x of instanceXs(o)) tireFaceX = Math.max(tireFaceX, Math.abs(x) + Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x))); }
    if (name === 'gearRoadWheelDiscs') discs = o;
    if (o.userData?.dynamicWheelFace) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; for (const x of instanceXs(o)) { const outer = Math.abs(x) + Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)); if (outer > dressingMaxX) { dressingMaxX = outer; dressingName = name; } } }
  });
  if (gear.wheelTireInnerRadiusM) hollow.push('open-annulus'); if (gear.wheelTireBands) hollow.push('tire-bands');
  if (tires) {
    // paired halves: turned stock with a real guide channel — tire vertices sit on inner channel walls
    // (|x - mid| between 15 and 60 mm at a radius well inside the crown); a plain cylinder tire has
    // vertices only on its two outer rings at the crown radius.
    tires.geometry.computeBoundingBox(); const tb = tires.geometry.boundingBox; const mid = (tb.min.x + tb.max.x) / 2;
    const crown = Math.max(Math.abs(tb.min.y), Math.abs(tb.max.y), Math.abs(tb.min.z), Math.abs(tb.max.z));
    const pos = tires.geometry.attributes.position; let channelWall = 0;
    for (let i = 0; i < pos.count; i++) { const dx = Math.abs(pos.getX(i) - mid); const r = Math.hypot(pos.getY(i), pos.getZ(i)); if (dx > 0.015 && dx < 0.06 && r < crown * 0.93) channelWall++; }
    if (channelWall >= 8) hollow.push('paired-halves');
  }
  // camouflage-mapped wheel paint (the Patton family) carries a texture: its colour is only a multiplier, so lightness is not a paint read
  const paintL = discs?.material?.map ? null : lightness(discs?.material?.color), tireL = tires?.material?.map ? null : lightness(tires?.material?.color);
  const proud = tireFaceX && dressingMaxX ? +(dressingMaxX - tireFaceX).toFixed(3) : 0;
  const flags = [];
  if (paintL !== null && paintL > MAX_L) flags.push('BRIGHT'); if (tireL !== null && tireL > MAX_TIRE_L) flags.push('BRIGHT-TIRE');
  if (proud > MAX_PROUD) flags.push('PROUD'); if (specPattern && builtPattern && specPattern !== builtPattern) flags.push('MISMATCH');
  if (flags.length) flagged++;
  rows.push({ id, nation: spec?.nation ?? '?', specPattern, builtPattern, style: gear.style ?? null, wheelR: gear.wheelR ?? null, hollow: hollow.join('+') || 'solid', paintL, tireL, tireFaceX: +tireFaceX.toFixed(3), dressingMaxX: +dressingMaxX.toFixed(3), dressingName, proud, flags });
  tank.dispose?.();
}
console.log('id'.padEnd(22), 'nation'.padEnd(8), 'pattern (spec -> built)'.padEnd(34), 'hollow'.padEnd(26), 'paintL'.padStart(6), 'tireL'.padStart(6), 'proud'.padStart(7), ' flags');
for (const r of rows) {
  if (r.error) { console.log(r.id.padEnd(22), 'BUILD FAILED', r.error.slice(0, 80)); continue; }
  console.log(r.id.padEnd(22), String(r.nation).padEnd(8), `${r.specPattern} -> ${r.builtPattern}`.padEnd(34), r.hollow.padEnd(26), String(r.paintL ?? 'map').padStart(6), String(r.tireL ?? '-').padStart(6), String(r.proud).padStart(7), ' ' + (r.flags.join(' ') || 'ok'));
}
console.log(`wheel review: ${rows.length} tanks, ${flagged} flagged`);
const jsonPath = opt('json', ''); if (jsonPath) { mkdirSync(resolve(jsonPath, '..'), { recursive: true }); writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1)); }
if (flag('gate') && flagged) process.exit(1);
