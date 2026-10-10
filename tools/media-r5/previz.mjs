#!/usr/bin/env node
// Previz of moving shots (2026-10-05, owner: "the camera itself moving as if it's on a fully 3D track, tanks moving in
// crazy directions with a lot of speed, the camera close and far away"): for each scene with a storyboard, the camera's
// eye as a schematic (ground grid, roads, buildings as boxes, woods as cylinders, tanks as hull + turret + gun, blasts
// and smoke as markers) beside a top-down map of every route and the lens's own track, over the lens's distance to the
// hero across the take. Camera and tanks are sampled with the Studio's own interpolation (src/game/studioTimeline.ts),
// so the motion here is the motion the renderer gets — choreography without the GPU queue. Ground is flat (heights
// above ground, as the Studio's groundRel rails fly).
//   MEDIA_R5_LIGHT=1 node tools/media-r5/previz.mjs [--scenes=shots/media-r5/site50/scenes] [--ids=s03,s21]
//     [--out=shots/media-r5/previz] [--fps=15] [--features=shots/media-r5/features]
// Writes <out>/<id>.mp4 (1280×720) and <out>/<id>.jpg (a six-frame sheet).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { sampleActorTrack, sampleCameraRail } from '../../src/game/studioTimeline.ts';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const SCENES = arg('scenes', 'shots/media-r5/site50/scenes'), OUT = arg('out', 'shots/media-r5/previz');
const FEATURES = arg('features', 'shots/media-r5/features'), FPS = Number(arg('fps', '15'));
const IDS = arg('ids', '').split(',').filter(Boolean);
const W = 1280, H = 720, VW = 960, VH = 540;
const BUILDING_H = { chapel: 15, church: 18, mill: 12, granary: 10, barn: 9, tower: 22, minaret: 26, warehouse: 11, factory: 14, ruin: 4, cottage: 6 };
const SIDE = { hero: ['#f0a12e', '#a86a12'], ally: ['#7fb2e5', '#3f6f9e'], foe: ['#e5484d', '#8f2a2e'], wreck: ['#5c5148', '#3a332d'] };

const files = existsSync(SCENES) ? readdirSync(SCENES).filter((f) => f.endsWith('.json') && (!IDS.length || IDS.some((id) => f.startsWith(id)))) : [];
if (!files.length) throw new Error(`previz: no scenes in ${SCENES}${IDS.length ? ` for ${IDS}` : ''}`);
mkdirSync(OUT, { recursive: true });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const rad = (d) => d * Math.PI / 180;

/** A pinhole on the rail sample: view space x right, y up, z forward (the Studio's fov is vertical). */
function lens(cam) {
  const pos = [cam.x, cam.y, cam.z], f = norm(sub([cam.lookX, cam.lookY, cam.lookZ], pos));
  let r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const c = Math.cos(rad(cam.rollDeg || 0)), s = Math.sin(rad(cam.rollDeg || 0));
  [r, u] = [r.map((v, k) => v * c + u[k] * s), u.map((v, k) => v * c - r[k] * s)];
  const fpx = (VH / 2) / Math.tan(rad(cam.fov) / 2);
  return { pos, f, r, u, fpx, view: (p) => { const d = sub(p, pos); return [dot(d, r), dot(d, u), dot(d, f)]; } };
}
const NEAR = 0.3;
/** Clip a view-space polygon to the near plane (Sutherland-Hodgman) and project it. */
function project(L, viewPts) {
  const out = [];
  for (let i = 0; i < viewPts.length; i++) {
    const a = viewPts[i], b = viewPts[(i + 1) % viewPts.length], ina = a[2] >= NEAR, inb = b[2] >= NEAR;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
  }
  return out.map((p) => [VW / 2 + p[0] / p[2] * L.fpx, VH / 2 - p[1] / p[2] * L.fpx]);
}
const boxFaces = (cx, cz, yawDeg, w, l, y0, y1) => { // w across the yaw, l along it
  const f = [Math.sin(rad(yawDeg)), Math.cos(rad(yawDeg))], r = [-f[1], f[0]];
  const at = (a, b, y) => [cx + r[0] * a + f[0] * b, y, cz + r[1] * a + f[1] * b];
  const c = [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]];
  const faces = c.map((p, i) => { const q = c[(i + 1) % 4]; return { pts: [at(...p, y0), at(...q, y0), at(...q, y1), at(...p, y1)], shade: 0.7 + 0.12 * i }; });
  faces.push({ pts: c.map((p) => at(...p, y1)), shade: 1 });
  return faces;
};
const footprintBox = (b, h) => boxFaces(b.x, b.z, 90 - (b.rot ?? 0) * 180 / Math.PI, b.w, b.d, 0, h);
const shadeHex = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${[16, 8, 0].map((s) => Math.round(((n >> s) & 255) * k)).join(',')})`; };

function sideOf(actor) {
  if (actor.state && actor.state !== 'intact') return 'wreck';
  return actor.name === 'hero' ? 'hero' : actor.name.startsWith('foe') ? 'foe' : 'ally';
}

async function render(file) {
  const scene = JSON.parse(readFileSync(join(SCENES, file), 'utf8'));
  const board = scene.storyboard;
  if (!board?.shots?.length) return null;
  const id = file.replace(/\.json$/, ''), dur = board.durationMs;
  const fj = join(FEATURES, `features-${scene.map}.json`), feat = existsSync(fj) ? JSON.parse(readFileSync(fj, 'utf8')) : { buildings: [], roads: [], treeClusters: [] };
  const tracks = new Map((board.actorTracks ?? []).map((t) => [t.actor, t.keys]));
  const actorAt = (a, t) => {
    const keys = tracks.get(a.name);
    if (!keys?.length) return { x: a.pos[0], z: a.pos[1], facingDeg: a.facingDeg, turretDeg: a.turretDeg ?? 0, gunDeg: a.gunDeg ?? 0 };
    const o = {}; sampleActorTrack(keys, t, o); return o;
  };
  const camAt = (t) => { const o = {}; sampleCameraRail(board.shots, t, o); return o; };
  const hero = scene.actors.find((a) => a.name === 'hero') ?? scene.actors[0];
  // the take's numbers: the lens's distance to the hero and its height over time, the hero's speed
  const N = 120, series = [];
  for (let i = 0; i <= N; i++) {
    const t = dur * i / N, c = camAt(t), h = actorAt(hero, t);
    series.push({ t, d: Math.hypot(c.x - h.x, c.y - 1.5, c.z - h.z), y: c.y });
  }
  const dMax = Math.max(20, ...series.map((s) => s.d)), yMax = Math.max(10, ...series.map((s) => s.y));
  // the map's window: every route and the lens's track
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = dur * i / 40, c = camAt(t); pts.push([c.x, c.z]); for (const a of scene.actors) { const q = actorAt(a, t); pts.push([q.x, q.z]); } }
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0])), minZ = Math.min(...pts.map((p) => p[1])), maxZ = Math.max(...pts.map((p) => p[1]));
  const span = Math.max(maxX - minX, maxZ - minZ) + 60, mx = (minX + maxX) / 2, mz = (minZ + maxZ) / 2, MS = 320 / span;
  const mapX = (x) => 960 + 160 - (x - mx) * MS, mapY = (z) => 160 - (z - mz) * MS; // +z up the map, +x to the left (screen-right of a +z heading is -x)
  const blasts = (scene.effects ?? []).filter((e) => ['explosion', 'barrage', 'tank_kill', 'impact'].includes(e.type));
  const smokes = (scene.effects ?? []).filter((e) => ['burning', 'engine_smoke', 'fire_field', 'smoke_screen'].includes(e.type));
  const fires = (scene.effects ?? []).filter((e) => e.type === 'fire');
  const posOf = (e, t) => { if (Array.isArray(e.at)) return [e.at[0], e.at[1]]; const a = scene.actors.find((x) => x.name === e.actor); if (!a) return null; const q = actorAt(a, t); return [q.x, q.z]; };

  const canvas = createCanvas(W, H), g = canvas.getContext('2d');
  const frames = Math.max(2, Math.round(dur / 1000 * FPS)), sheetAt = new Set([0, 0.2, 0.4, 0.6, 0.8, 1].map((u) => Math.round(u * (frames - 1))));
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'veryfast', '-movflags', '+faststart', join(OUT, `${id}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  const sheet = createCanvas(1280 * 3 / 2, 720 * 2 / 2), sg = sheet.getContext('2d');
  let sheetN = 0;
  for (let n = 0; n < frames; n++) {
    const t = dur * n / (frames - 1), cam = camAt(t), L = lens(cam);
    // sky and ground
    const sky = g.createLinearGradient(0, 0, 0, VH); sky.addColorStop(0, '#6f8fae'); sky.addColorStop(1, '#c9d6de');
    g.fillStyle = sky; g.fillRect(0, 0, VW, VH);
    const G = 1500, ground = project(L, [[-G, 0, -G], [G, 0, -G], [G, 0, G], [-G, 0, G]].map((p) => L.view([p[0] + cam.x, 0, p[2] + cam.z])));
    if (ground.length > 2) { g.fillStyle = '#5d6b45'; g.beginPath(); ground.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
    const flat = (poly, fill, stroke) => { const p = project(L, poly.map((q) => L.view(q))); if (p.length < 3) return; g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); } };
    // ground grid, 10 m, out to 200 m
    g.lineWidth = 1;
    const gx0 = Math.round(cam.x / 10) * 10, gz0 = Math.round(cam.z / 10) * 10;
    for (let k = -20; k <= 20; k++) {
      for (const [a, b] of [[[gx0 + k * 10, 0, gz0 - 200], [gx0 + k * 10, 0, gz0 + 200]], [[gx0 - 200, 0, gz0 + k * 10], [gx0 + 200, 0, gz0 + k * 10]]]) {
        const p = project(L, [L.view(a), L.view(b)]);
        if (p.length === 2) { g.strokeStyle = 'rgba(20,30,15,0.25)'; g.beginPath(); g.moveTo(...p[0]); g.lineTo(...p[1]); g.stroke(); }
      }
    }
    for (const road of feat.roads ?? []) for (let i = 1; i < road.length; i++) {
      const [a, b] = [road[i - 1], road[i]];
      if (Math.hypot(a[0] - cam.x, a[1] - cam.z) > 700 && Math.hypot(b[0] - cam.x, b[1] - cam.z) > 700) continue;
      const d = norm([b[0] - a[0], 0, b[1] - a[1]]), o = [-d[2] * 4, d[0] * 4];
      flat([[a[0] + o[0], 0.02, a[1] + o[1]], [b[0] + o[0], 0.02, b[1] + o[1]], [b[0] - o[0], 0.02, b[1] - o[1]], [a[0] - o[0], 0.02, a[1] - o[1]]], '#a89f86');
    }
    for (const w of feat.waterOrSoft ?? []) if ('r' in w) flat(Array.from({ length: 24 }, (_, i) => [w.x + w.r * Math.cos(i / 24 * Math.PI * 2), 0.01, w.z + w.r * Math.sin(i / 24 * Math.PI * 2)]), 'rgba(70,120,190,0.8)');
    // solids, painter-sorted
    const solids = [];
    const push = (faces, color, alpha = 1) => { for (const f of faces) { const v = f.pts.map((p) => L.view(p)); const depth = Math.max(...v.map((p) => p[2])); if (depth < NEAR) continue; solids.push({ v, depth: v.reduce((s, p) => s + p[2], 0) / v.length, color: shadeHex(color, f.shade), alpha }); } };
    for (const b of feat.buildings ?? []) if (Math.hypot(b.x - cam.x, b.z - cam.z) < 600) push(footprintBox(b, BUILDING_H[b.kind] ?? 8), '#b07a5a');
    for (const tc of feat.treeClusters ?? []) {
      if (Math.hypot(tc.x - cam.x, tc.z - cam.z) > 600) continue;
      const r = tc.r * 0.75, segs = 14;
      const ring = (y) => Array.from({ length: segs }, (_, i) => [tc.x + r * Math.cos(i / segs * Math.PI * 2), y, tc.z + r * Math.sin(i / segs * Math.PI * 2)]);
      const lo = ring(0), hi = ring(14);
      push(lo.map((p, i) => ({ pts: [p, lo[(i + 1) % segs], hi[(i + 1) % segs], hi[i]], shade: 0.75 + 0.2 * Math.cos(i / segs * Math.PI * 2) })), '#2f5a2a', 0.55);
      push([{ pts: hi, shade: 1 }], '#3a6b33', 0.55);
    }
    for (const a of scene.actors) {
      const q = actorAt(a, t), [col] = SIDE[sideOf(a)];
      push(boxFaces(q.x, q.z, q.facingDeg, 3.6, 7.2, 0.45, 1.75), col);
      const ty = q.facingDeg + (q.turretDeg ?? 0), tf = [Math.sin(rad(ty)), Math.cos(rad(ty))];
      push(boxFaces(q.x - Math.sin(rad(q.facingDeg)) * 0.4, q.z - Math.cos(rad(q.facingDeg)) * 0.4, ty, 2.7, 3.2, 1.75, 2.6), col);
      const gx = q.x + tf[0] * 4.1, gz = q.z + tf[1] * 4.1, gy = 2.2 + Math.sin(rad(q.gunDeg ?? 0)) * 2.5;
      push(boxFaces(gx - tf[0] * 0.1, gz - tf[1] * 0.1, ty, 0.28, 5, gy - 0.14, gy + 0.14), '#2b2b2b');
    }
    for (const e of blasts) if (t >= e.tMs && t <= e.tMs + 700) { const p = posOf(e, t); if (p) push(boxFaces(p[0], p[1], 0, 6, 6, 0, 6), '#ff9a2e', 0.65); }
    for (const e of smokes) if (t >= e.tMs) { const p = posOf(e, t); if (p) push(boxFaces(p[0], p[1], 0, 3, 3, 2, 22), '#555555', 0.35); }
    for (const e of fires) if (t >= e.tMs && t <= e.tMs + 120) {
      const a = scene.actors.find((x) => x.name === e.actor); if (!a) continue; const q = actorAt(a, t), ty = rad(q.facingDeg + (q.turretDeg ?? 0));
      push(boxFaces(q.x + Math.sin(ty) * 9, q.z + Math.cos(ty) * 9, 0, 3, 3, 1.2, 4.2), '#fff2a8', 0.9);
    }
    solids.sort((a, b) => b.depth - a.depth);
    for (const s of solids) {
      const p = project(L, s.v); if (p.length < 3) continue;
      g.globalAlpha = s.alpha; g.fillStyle = s.color; g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
      g.globalAlpha = s.alpha * 0.5; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
    }
    g.globalAlpha = 1;
    // the map
    g.fillStyle = '#1d2418'; g.fillRect(960, 0, 320, 320);
    g.save(); g.beginPath(); g.rect(960, 0, 320, 320); g.clip();
    g.strokeStyle = '#a89f86'; g.lineWidth = Math.max(1, 8 * MS);
    for (const road of feat.roads ?? []) { g.beginPath(); road.forEach(([x, z], i) => (i ? g.lineTo(mapX(x), mapY(z)) : g.moveTo(mapX(x), mapY(z)))); g.stroke(); }
    for (const tc of feat.treeClusters ?? []) { g.fillStyle = 'rgba(60,140,60,0.35)'; g.beginPath(); g.arc(mapX(tc.x), mapY(tc.z), tc.r * MS, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#b07a5a';
    for (const b of feat.buildings ?? []) {
      const c = Math.cos(b.rot ?? 0), s = Math.sin(b.rot ?? 0), corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [b.x + c * u * b.w / 2 - s * v * b.d / 2, b.z + s * u * b.w / 2 + c * v * b.d / 2]);
      g.beginPath(); corners.forEach(([x, z], i) => (i ? g.lineTo(mapX(x), mapY(z)) : g.moveTo(mapX(x), mapY(z)))); g.closePath(); g.fill();
    }
    for (const a of scene.actors) {
      const [col] = SIDE[sideOf(a)]; g.strokeStyle = col; g.globalAlpha = 0.5; g.lineWidth = 1; g.beginPath();
      for (let i = 0; i <= 40; i++) { const q = actorAt(a, dur * i / 40); i ? g.lineTo(mapX(q.x), mapY(q.z)) : g.moveTo(mapX(q.x), mapY(q.z)); }
      g.stroke(); g.globalAlpha = 1;
      const q = actorAt(a, t); g.fillStyle = col; g.beginPath(); g.arc(mapX(q.x), mapY(q.z), 3.5, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#65d0dd'; g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i <= 60; i++) { const c = camAt(dur * i / 60); i ? g.lineTo(mapX(c.x), mapY(c.z)) : g.moveTo(mapX(c.x), mapY(c.z)); }
    g.stroke();
    const yaw = Math.atan2(cam.lookX - cam.x, cam.lookZ - cam.z), hf = Math.atan(Math.tan(rad(cam.fov) / 2) * VW / VH);
    g.fillStyle = 'rgba(101,208,221,0.25)'; g.beginPath(); g.moveTo(mapX(cam.x), mapY(cam.z));
    for (const k of [-1, 1]) g.lineTo(mapX(cam.x + Math.sin(yaw + k * hf) * 60), mapY(cam.z + Math.cos(yaw + k * hf) * 60));
    g.closePath(); g.fill(); g.fillStyle = '#65d0dd'; g.beginPath(); g.arc(mapX(cam.x), mapY(cam.z), 4, 0, Math.PI * 2); g.fill();
    g.restore();
    // the take's numbers
    g.fillStyle = '#0b0e11'; g.fillRect(0, 540, 1280, 180); g.fillRect(960, 320, 320, 220);
    const gxp = (tt) => 40 + tt / dur * 880, gy = (v, max) => 700 - v / max * 140;
    g.strokeStyle = 'rgba(159,176,191,0.25)'; g.lineWidth = 1;
    for (let v = 0; v <= dMax; v += dMax > 120 ? 50 : 20) { g.beginPath(); g.moveTo(40, gy(v, dMax)); g.lineTo(920, gy(v, dMax)); g.stroke(); g.fillStyle = '#6f7f8d'; g.font = '11px monospace'; g.fillText(`${v} m`, 4, gy(v, dMax) + 4); }
    for (const [key, max, col] of [['d', dMax, '#65d0dd'], ['y', dMax, '#ffd27a']]) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); series.forEach((s, i) => (i ? g.lineTo(gxp(s.t), gy(s[key], max)) : g.moveTo(gxp(s.t), gy(s[key], max)))); g.stroke(); }
    g.strokeStyle = '#f0a12e'; g.beginPath(); g.moveTo(gxp(t), 555); g.lineTo(gxp(t), 705); g.stroke();
    const h0 = actorAt(hero, Math.max(0, t - 50)), h1 = actorAt(hero, Math.min(dur, t + 50)), speed = Math.hypot(h1.x - h0.x, h1.z - h0.z) / ((Math.min(dur, t + 50) - Math.max(0, t - 50)) / 1000);
    const hc = actorAt(hero, t), dist = Math.hypot(cam.x - hc.x, cam.y - 1.5, cam.z - hc.z);
    g.fillStyle = '#e8edf2'; g.font = 'bold 16px monospace'; g.fillText(id, 972, 348);
    g.font = '13px monospace'; g.fillStyle = '#9fb0bf';
    [[`t ${(t / 1000).toFixed(2)} s`, '#ffd27a'], [`lens to hero ${dist.toFixed(1)} m`, '#65d0dd'], [`lens height ${cam.y.toFixed(1)} m`, '#ffd27a'], [`fov ${cam.fov.toFixed(1)}°  roll ${(cam.rollDeg || 0).toFixed(1)}°`, '#9fb0bf'],
      [`hero ${speed.toFixed(1)} m/s (${(speed * 3.6).toFixed(0)} km/h)`, '#f0a12e'], [`range over take ${Math.min(...series.map((s) => s.d)).toFixed(0)}–${Math.max(...series.map((s) => s.d)).toFixed(0)} m`, '#9fb0bf']]
      .forEach(([txt, col], i) => { g.fillStyle = col; g.fillText(txt, 972, 376 + i * 22); });
    g.fillStyle = '#6f7f8d'; g.font = '11px monospace'; g.fillText('lens to hero (cyan) · lens height (gold) · previz: flat ground, schematic boxes', 40, 556);
    const rgba = g.getImageData(0, 0, W, H).data;
    if (!ff.stdin.write(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength))) await new Promise((r) => ff.stdin.once('drain', r));
    if (sheetAt.has(n)) { sg.drawImage(canvas, (sheetN % 3) * 640, Math.floor(sheetN / 3) * 360, 640, 360); sheetN++; }
  }
  ff.stdin.end();
  await new Promise((resolve, reject) => ff.on('close', (code) => (code ? reject(new Error(`ffmpeg ${code}`)) : resolve())));
  writeFileSync(join(OUT, `${id}.jpg`), await sheet.encode('jpeg', 82));
  return { id, frames, range: [Math.min(...series.map((s) => s.d)), Math.max(...series.map((s) => s.d))] };
}

for (const file of files) {
  const r = await render(file);
  if (r) console.log(`previz ${r.id}: ${r.frames} frames, lens to hero ${r.range[0].toFixed(0)}–${r.range[1].toFixed(0)} m -> ${join(OUT, `${r.id}.mp4`)}`);
  else console.log(`previz ${file}: no storyboard, skipped`);
}
