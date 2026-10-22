#!/usr/bin/env node
// tools/civic-census.mjs — which maps need the civic-area and pathway kit (the maps lane, 228; the owner, 2026-10-19:
// "finalize all 'pathway' architecture and civic areas for maps that would need that"). Read-only, from each map's
// committed collision shard and its config (no build):
//   - its town pads (hardstands inside the village rect): the records standing on each, the structures fronting it within
//     20 m (a pad ringed by frontage and empty is a square left blank);
//   - the legacy kerb pass replayed (props.ts placeStreetCurbs: a kerb at 5.05 m and a slab at 6.35 m down both sides of
//     every street in the town rect): its pieces, those under a structure, those with no frontage within 9 m, those on
//     a pad, and the junctions it leaves open;
//   - its need: `civic` (a town pad with 8+ fronting structures and 4 or fewer records on it), `pathways` (a kerbed map whose
//     legacy pieces stand a third or more under a house, with no frontage, or on a pad), and whether it has a plan.
//
//   node tools/civic-census.mjs [--out=<file.jsonl>] [mapId...]      every map when none is named
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith('--out='))?.slice(6) ?? null;
const { decodeCollisionManifest } = await import(`${ROOT}/server/collisionManifestCodec.ts`);
const { MAP_IDS, getMapConfig } = await import(`${ROOT}/src/world/maps/index.ts`);
const { civicPlanFor } = await import(`${ROOT}/src/world/civic/plans/index.ts`);
const maps = args.filter((a) => !a.startsWith('--'));
const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const rows = [];
for (const id of maps.length ? maps : MAP_IDS) {
  const cfg = getMapConfig(id), T = cfg.terrain;
  let manifest;
  try { manifest = decodeCollisionManifest(JSON.parse(readFileSync(join(ROOT, 'server/world-collision-manifests', `${id}.json`), 'utf8'))); }
  catch { rows.push({ map: id, error: 'no shard' }); continue; }
  const town = T.village ?? null, roads = T.roads?.paths ?? [];
  const boxes = manifest.obstacles.map((o) => ({ k: o.k, c: !!o.c, x0: o.b[0], z0: o.b[2], x1: o.b[3], z1: o.b[5], h: o.b[4] - o.b[1] }));
  const structures = boxes.filter((o) => o.k === 'structure' && o.h > 1);
  const solid = boxes.filter((o) => (!o.c || o.k === 'structure' || o.k === 'wallstone') && o.h > 1);
  const inBox = (x, z, o, m = 0) => x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m;
  const pads = (T.hardstands ?? []).filter((p) => p.width < 200 && p.length < 200);
  const padFrame = (p) => { const y = (p.yawDeg ?? 0) * Math.PI / 180; return { c: Math.cos(y), s: Math.sin(y) }; };
  const onPad = (p, x, z, grow = 0) => { const { c, s } = padFrame(p), dx = x - p.x, dz = z - p.z;
    return Math.abs(dx * c - dz * s) <= p.width / 2 + grow && Math.abs(dx * s + dz * c) <= p.length / 2 + grow; };
  const townPads = pads.filter((p) => town && p.x >= town.x0 && p.x <= town.x1 && p.z >= town.z0 && p.z <= town.z1).map((p) => {
    let records = 0, frontage = 0;
    for (const o of boxes) {
      const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
      if (onPad(p, cx, cz)) records++;
      else if (o.k === 'structure' && onPad(p, cx, cz, 20)) frontage++;
    }
    return { at: [p.x, p.z], size: [p.width, p.length], records, frontage };
  });
  // the legacy kerb pass, replayed
  let pieces = 0, under = 0, open = 0, onPads = 0, holes = 0;
  if (cfg.props?.curbs && town) {
    const distOther = (x, z, skip) => { let b = Infinity; roads.forEach((n, ri) => { if (ri !== skip) for (let i = 0; i + 1 < n.length; i++) b = Math.min(b, segD(x, z, ...n[i], ...n[i + 1])); }); return b; };
    roads.forEach((nodes, ri) => {
      for (let i = 0; i + 1 < nodes.length; i++) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1], mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < town.x0 - 6 || mx > town.x1 + 6 || mz < town.z0 - 6 || mz > town.z1 + 6) continue;
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), tx = dx / len, tz = dz / len, n = Math.max(1, Math.ceil(len / 5.2));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, cx = ax + dx * t, cz = az + dz * t;
          for (const side of [-1, 1]) {
            if (distOther(cx - tz * side * 5.05, cz + tx * side * 5.05, ri) < 6.8) { holes++; continue; }
            const wx = cx - tz * side * 6.35, wz = cz + tx * side * 6.35;
            pieces++;
            if (pads.some((p) => onPad(p, wx, wz))) { onPads++; continue; }
            if (solid.some((o) => inBox(wx, wz, o, 0.6))) { under++; continue; }
            let front = false;
            for (let d = 2; d <= 9 && !front; d++) front = structures.some((o) => inBox(wx - tz * side * d, wz + tx * side * d, o));
            if (!front) open++;
          }
        }
      }
    });
  }
  const civic = townPads.some((p) => p.frontage >= 8 && p.records <= 4);
  const pathways = pieces > 0 && (under + open + onPads) / pieces >= 1 / 3;
  const row = { map: id, plan: !!civicPlanFor(id), pads: townPads, kerbs: { pieces, underBuilding: under, noFrontage: open, onPad: onPads, junctionHoles: holes },
    need: { civic, pathways } };
  rows.push(row);
  console.log(`${id.padEnd(12)} plan ${row.plan ? 'yes' : 'no '}  civic ${civic ? 'NEED' : '-   '}  pathways ${pathways ? 'NEED' : '-   '}  pads ${townPads.map((p) => `${p.records}/${p.frontage}`).join(' ') || '-'}  kerbs ${pieces} (${under} under, ${open} open, ${onPads} on pads)`);
}
if (out) writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
