#!/usr/bin/env node
// Spot finder for the versus stills: flat, dry, clear patches big enough for two tanks 15-25 m apart and a lens 25 m
// off, with buildings (or a wood) 50-170 m beyond them to frame the fight, ranked; the lens looks across the patch at
// that backdrop. Survey: the newest features dump of the map ($MEDIA_R5_FEATURES when set, else the combat round's
// shots/media-r5/combat224/review, else shots/media-r5/features).
//   node tools/media-r5/versus/spots.mjs <map> [count=6]     (run from the repository root)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS } from '../paths.mjs';
import { worldModel } from '../world-model.mjs';

export function featuresFile(map) {
  const dirs = [...(process.env.MEDIA_R5_FEATURES ? [process.env.MEDIA_R5_FEATURES] : []), join(SHOTS, 'combat224/review'), join(SHOTS, 'features')];
  for (const dir of dirs) {
    const f = join(dir, `features-${map}.json`);
    if (existsSync(f)) return f;
  }
  throw Error(`no features dump for ${map}`);
}
const DEG = Math.PI / 180;
const bearing = (a, b) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) / DEG) % 360 + 360) % 360;
const polar = (p, deg, d) => [p[0] + Math.sin(deg * DEG) * d, p[1] + Math.cos(deg * DEG) * d];

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const map = process.argv[2], count = Number(process.argv[3] ?? 6);
  const file = featuresFile(map), f = JSON.parse(readFileSync(file, 'utf8')), m = worldModel(f);
  const half = f.size / 2 - 90;
  const tall = m.records.filter((r) => r.max[1] - r.min[1] > 0.6 && r.kind !== 'tree');
  const blocked = (x, z, pad) => { const found = []; m.query(x - pad, z - pad, x + pad, z + pad, found); return found.some((r) => r.max[1] - r.min[1] > 0.6); };
  const buildings = f.buildings.map((b) => [b.x, b.z]);
  const clusters = (f.treeClusters ?? []).map((c) => [c.x, c.z, c.r]);
  const out = [];
  for (let x = -half; x <= half; x += 10) for (let z = -half; z <= half; z += 10) {
    // the fight's patch: 22 m around, gentle and dry, nothing taller than 0.6 m within 12 m
    let worst = 0, wet = 0;
    for (let dx = -22; dx <= 22; dx += 5.5) for (let dz = -22; dz <= 22; dz += 5.5) { worst = Math.max(worst, m.slopeAt(x + dx, z + dz)); wet = Math.max(wet, m.wetAt(x + dx, z + dz)); }
    if (worst > 0.14 || wet > 0.25 || blocked(x, z, 12)) continue;
    // the backdrop: the bearing with the most buildings 50-170 m off (else the nearest wood's)
    let best = null;
    for (let b = 0; b < 360; b += 15) {
      let n = 0;
      for (const [bx, bz] of buildings) { const d = Math.hypot(bx - x, bz - z), off = Math.abs(((bearing([x, z], [bx, bz]) - b) % 360 + 540) % 360 - 180); if (d > 50 && d < 170 && off < 25) n += 1; }
      let w = 0;
      for (const [cx, cz, r] of clusters) { const d = Math.hypot(cx - x, cz - z), off = Math.abs(((bearing([x, z], [cx, cz]) - b) % 360 + 540) % 360 - 180); if (d > 40 && d < 220 && off < 30) w += Math.min(1, r / 30); }
      const score = n * 1.0 + w * 0.6;
      // the lens stands 26 m back on the far side of the backdrop bearing: it must be clear too
      const eye = polar([x, z], b + 180, 26);
      if (Math.abs(eye[0]) > half + 40 || Math.abs(eye[1]) > half + 40 || blocked(eye[0], eye[1], 2.5) || m.wetAt(eye[0], eye[1]) > 0.3) continue;
      if (!best || score > best.score) best = { score, b, n, w: +w.toFixed(1), eye: eye.map((v) => +v.toFixed(1)) };
    }
    if (best && best.score >= 2) out.push({ x, z, slope: +worst.toFixed(3), ...best });
  }
  out.sort((a, b) => b.score - a.score);
  // spread the picks out: no two within 60 m
  const picks = [];
  for (const o of out) { if (picks.every((p) => Math.hypot(p.x - o.x, p.z - o.z) > 60)) picks.push(o); if (picks.length >= count) break; }
  console.log(`${map} (${file.split('/').slice(-3).join('/')}, ${f.buildings.length} buildings): ${out.length} patches`);
  for (const p of picks) console.log(`  centre ${p.x},${p.z}  backdrop bearing ${p.b} (${p.n} buildings, woods ${p.w})  lens ${p.eye}  slope ${p.slope}  sky sun ${f.sky?.sunAzimuthDeg}`);
}
