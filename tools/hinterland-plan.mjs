#!/usr/bin/env node
// tools/hinterland-plan.mjs — the Hinterland's CPU plan view (HL-1, the horizons stream, 2026-10-13; B-architecture
// §7.3 step 2): what a map's hinterland will be, reviewed before any GPU time is spent. One PNG per map:
//   - the plan, 5.5 km across: shaded relief over the land cover (the map's own fields carried past the red line, woods,
//     water, settlement ground), the roads running on, the dykes, the tree rows, every planned building, the
//     settlements and the verticals (towers, mills, pylons) with their names;
//   - the overview, 32 km across: the far band's villages and towers, the sea, the flood, the far country;
//   - the skylines: from the centre eye, near (<= 4 km) and far, against the old ring's (dashed) and the envelope's C1
//     band; and the owner's eight EYE8 views, each over its own 100° of compass.
//
//   node tools/hinterland-plan.mjs --map=polders [--out=dir]    (a map's block, or its lab draft)
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { eye8Spots, loadWorld, marchSkyline, measureRing, skylineStats, ENVELOPE } from './horizon-envelope.mjs';
import { measureBuild, skylineObjects } from './hinterland-envelope.mjs';

const W = 1840, H = 1120;
const PLAN = { x: 10, y: 10, size: 1100, half: 2750 };
const OVER = { x: 1124, y: 10, w: 706, h: 520, half: 16000 };
const SKY = { x: 1124, y: 540, w: 706, h: 570 };

/** Display colours (sRGB) per cover class and per crop. */
const CLASS_RGB = {
  0: [176, 160, 100], 1: [118, 148, 82], 2: [44, 76, 42], 3: [138, 134, 126], 4: [162, 156, 144], 5: [236, 240, 244],
  6: [212, 186, 138], 7: [62, 104, 136], 8: [168, 152, 136], 9: [222, 212, 186], 10: [80, 76, 72], 11: [92, 120, 98], 12: [143, 138, 106],
};
const CROP_RGB = {
  0: [116, 146, 80], 1: [205, 168, 86], 2: [214, 192, 124], 3: [92, 138, 62], 4: [108, 86, 64], 5: [200, 178, 128], 6: [122, 142, 58],
  7: [78, 108, 58], 8: [106, 138, 138], 9: [126, 174, 74], 10: [183, 176, 96], 11: [154, 90, 64], 12: [110, 122, 62], 13: [182, 176, 122],
  14: [62, 110, 52], 15: [52, 52, 52], 16: [140, 140, 140], 17: [150, 150, 110], 18: [130, 130, 130], 19: [150, 140, 125],
};
const VERTICAL_STYLE = {
  churchTower: ['#7a1f1f', 'church'], spire: ['#7a1f1f', 'spire'], onionDome: ['#2f6b3f', 'dome'], campanile: ['#7a1f1f', 'campanile'],
  minaret: ['#7a1f1f', 'minaret'], pagoda: ['#7a1f1f', 'pagoda'], windmill: ['#1f3f7a', 'mill'], postMill: ['#1f3f7a', 'mill'],
  waterTower: ['#444', 'water tower'], elevator: ['#444', 'elevator'], lighthouse: ['#b8860b', 'light'], pylonLine: ['#555', ''],
  chimney: ['#333', 'stack'], headframe: ['#333', 'headframe'], mast: ['#555', 'mast'], radome: ['#555', 'radome'],
};

function shadeAt(hAt, x, z, e, exaggeration) {
  const dx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e) * exaggeration, dz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e) * exaggeration;
  // sun from the north-west, 40° up (+x east, +z north: the light comes from -x, +z)
  const nx = -dx, ny = 1, nz = -dz, len = Math.hypot(nx, ny, nz);
  const lx = -0.54, ly = 0.64, lz = 0.54;
  return Math.max(0.25, (nx * lx + ny * ly + nz * lz) / len);
}

function rasterInto(ctx, rect, half, build, groundAt, { exaggeration, step = 1 }) {
  const { field } = build;
  const wpx = rect.w ?? rect.size, hpx = rect.h ?? rect.size;
  const mPerPx = (2 * half) / Math.max(wpx, hpx);
  const img = ctx.createImageData(wpx, hpx);
  const cover = { cls: 0, crop: 31, fieldId: 0, woods: 0, hedge: 0, wet: 0, rock: 0, scree: 0, snow: 0, settle: 0, road: 0, edgeU: 1e9, edgeV: 1e9 };
  const water = { wet: 0, level: 0, kind: 0 };
  const hAt = (x, z) => (Math.max(Math.abs(x), Math.abs(z)) <= 512 ? groundAt(x, z) : build.sample(x, z));
  for (let py = 0; py < hpx; py += step) {
    const z = half * (hpx / Math.max(wpx, hpx)) - (py + 0.5) * mPerPx;
    for (let px = 0; px < wpx; px += step) {
      const x = -half * (wpx / Math.max(wpx, hpx)) + (px + 0.5) * mPerPx;
      const h = hAt(x, z);
      const e = Math.max(4, mPerPx);
      const sx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e), sz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
      const slope = Math.atan(Math.hypot(sx, sz)) * 180 / Math.PI;
      field.coverAt(x, z, cover, slope, h);
      let rgb = cover.cls === 0 || (cover.cls === 1 && cover.crop !== 31) ? CROP_RGB[cover.crop] ?? CLASS_RGB[0] : CLASS_RGB[cover.cls] ?? [255, 0, 255];
      if (cover.cls === 7) {
        field.waterAt(x, z, water);
        rgb = water.kind === 1 ? [46, 86, 118] : water.kind === 5 ? [96, 132, 150] : [62, 104, 136];
      }
      // per-field tone, so the parcels read
      const tone = cover.fieldId ? 0.9 + 0.2 * (((cover.fieldId * 2654435761) >>> 0) % 1000) / 1000 : 1;
      const s = cover.cls === 7 ? 1 : shadeAt(hAt, x, z, e, exaggeration) * 1.1 * tone;
      for (let qy = 0; qy < step && py + qy < hpx; qy++) for (let qx = 0; qx < step && px + qx < wpx; qx++) {
        const k = ((py + qy) * wpx + (px + qx)) * 4;
        img.data[k] = Math.min(255, rgb[0] * s); img.data[k + 1] = Math.min(255, rgb[1] * s); img.data[k + 2] = Math.min(255, rgb[2] * s); img.data[k + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, rect.x, rect.y);
  return { mPerPx, toPx: (x, z) => [rect.x + wpx / 2 + x / mPerPx, rect.y + hpx / 2 - z / mPerPx] };
}

function drawPlanOverlays(ctx, map, build, { labels = true, far = false } = {}) {
  const { plan } = build;
  const P = map.toPx;
  // roads (dike roads over their dykes)
  for (const r of plan.roads) {
    ctx.beginPath();
    r.xs.forEach((x, i) => { const [px, py] = P(x, r.zs[i]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.strokeStyle = r.kind === 'dikeRoad' ? '#5a4a32' : '#3a3226';
    ctx.lineWidth = far ? 1 : Math.max(1.2, (r.widthM + 3) / map.mPerPx);
    ctx.stroke();
    ctx.strokeStyle = r.kind === 'track' ? '#cdbb92' : '#efe6cf';
    ctx.lineWidth = far ? 0.6 : Math.max(0.7, r.widthM / map.mPerPx);
    ctx.stroke();
  }
  // tree rows
  if (!far) {
    ctx.fillStyle = '#1f4a22';
    for (const row of plan.rows) for (let i = 0; i < row.xs.length; i++) { const [px, py] = P(row.xs[i], row.zs[i]); ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
  // buildings
  if (!far) {
    for (const b of plan.buildings) {
      const [px, py] = P(b.x, b.z);
      ctx.save(); ctx.translate(px, py); ctx.rotate(b.yaw);
      ctx.fillStyle = b.kind === 'barn' || b.kind === 'depot' ? '#7b3b2a' : '#c9b9a0';
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 0.6;
      const w = Math.max(2, b.width / map.mPerPx), d = Math.max(2.5, b.depth / map.mPerPx);
      ctx.fillRect(-w / 2, -d / 2, w, d); ctx.strokeRect(-w / 2, -d / 2, w, d);
      ctx.restore();
    }
  }
  // settlements
  ctx.font = far ? '10px sans-serif' : '12px sans-serif';
  for (const s of plan.settlements) {
    const [px, py] = P(s.x, s.z);
    if (px < 0 || py < 0 || px > W || py > H) continue;
    if (far || !s.near) {
      ctx.fillStyle = s.near ? '#5a3f2a' : '#7a6a5a';
      ctx.beginPath(); ctx.arc(px, py, far ? 2.6 : 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(60,40,20,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(px, py, s.radiusM / map.mPerPx, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (labels && s.near && s.kind !== 'farm') {
      ctx.fillStyle = '#1a120a';
      ctx.fillText(`${s.name ?? s.kind} (${s.buildings})`, px + 6, py - 6);
    }
  }
  // verticals
  for (const v of plan.verticals) {
    const [px, py] = P(v.x, v.z);
    if (px < 0 || py < 0 || px > W || py > H) continue;
    const [colour, label] = VERTICAL_STYLE[v.kind] ?? ['#000', v.kind];
    ctx.fillStyle = colour; ctx.strokeStyle = colour; ctx.lineWidth = 1.6;
    if (v.kind === 'pylonLine') { ctx.fillRect(px - 1.5, py - 1.5, 3, 3); continue; }
    if (v.kind === 'windmill' || v.kind === 'postMill') {
      ctx.beginPath(); ctx.moveTo(px - 5, py - 5); ctx.lineTo(px + 5, py + 5); ctx.moveTo(px + 5, py - 5); ctx.lineTo(px - 5, py + 5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(px - 0.8, py - 3, 1.6, 6); ctx.fillRect(px - 2.5, py - 1.5, 5, 1.4);
    }
    if (v.name && labels) { ctx.fillStyle = colour; ctx.font = 'bold 12px sans-serif'; ctx.fillText(v.name, px + 7, py + 4); ctx.font = far ? '10px sans-serif' : '12px sans-serif'; }
    else if (!far && label && labels && v.settlement === null) { ctx.fillStyle = colour; ctx.font = '10px sans-serif'; ctx.fillText(label, px + 6, py + 10); ctx.font = '12px sans-serif'; }
  }
}

function drawSquare(ctx, map, { label = true } = {}) {
  const [x0, y0] = map.toPx(-512, 512), [x1, y1] = map.toPx(512, -512);
  ctx.strokeStyle = '#c0161b'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  if (label) { ctx.fillStyle = '#c0161b'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('the battlefield (the red line, 512 m)', x0 + 4, y0 - 6); }
}

function drawFrame(ctx, rect, title, half, map) {
  const w = rect.w ?? rect.size, h = rect.h ?? rect.size;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(rect.x + 8, rect.y + 8, ctx.measureText(title).width + 16, 22);
  ctx.fillStyle = '#111'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(title, rect.x + 16, rect.y + 24);
  // scale bar and north
  const bar = half > 5000 ? 5000 : 1000, px = bar / map.mPerPx;
  const bx = rect.x + 16, by = rect.y + h - 20;
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(bx - 6, by - 16, px + 60, 26);
  ctx.fillStyle = '#111'; ctx.fillRect(bx, by, px, 4); ctx.font = '12px sans-serif'; ctx.fillText(`${bar / 1000} km`, bx + px + 6, by + 6);
  ctx.font = 'bold 14px sans-serif'; ctx.fillText('N ↑', rect.x + w - 44, rect.y + 24);
}

function drawSkyline(ctx, rect, { near, far, old, eyes, verticals, centre }) {
  const top = { x: rect.x, y: rect.y, w: rect.w, h: 300 };
  ctx.fillStyle = '#f6f4ef'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = '#222'; ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  const all = [...near.elev, ...far.elev, ...(old ?? [])];
  const yMax = Math.max(3, Math.min(32, Math.ceil(Math.max(...all) + 0.6))), yMin = Math.min(-0.6, Math.floor(Math.min(...near.elev) - 0.2));
  ctx.save(); ctx.beginPath(); ctx.rect(top.x, top.y, top.w, top.h); ctx.clip();
  const px = (b) => top.x + 40 + (b / 360) * (top.w - 56), py = (e) => top.y + 30 + (1 - (e - yMin) / (yMax - yMin)) * (top.h - 60);
  // the C1 band
  ctx.fillStyle = 'rgba(80,160,80,0.12)';
  const b0 = py(Math.min(yMax, ENVELOPE.C1[1])), b1 = py(ENVELOPE.C1[0]);
  ctx.fillRect(px(0), b0, px(360) - px(0), b1 - b0);
  ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.font = '11px sans-serif'; ctx.fillStyle = '#555';
  for (let e = Math.ceil(yMin); e <= yMax; e += yMax > 16 ? 4 : yMax > 8 ? 2 : 1) { ctx.beginPath(); ctx.moveTo(px(0), py(e)); ctx.lineTo(px(360), py(e)); ctx.stroke(); ctx.fillText(`${e}°`, top.x + 8, py(e) + 4); }
  for (const [b, l] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [360, 'N']]) { ctx.fillText(l, px(b) - 4, top.y + top.h - 12); }
  const line = (elev, colour, width, dash) => {
    ctx.beginPath(); ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash ?? []);
    elev.forEach((e, i) => { const x = px((i / elev.length) * 360), y = py(e); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
  };
  if (old) line(old, '#999', 1.2, [5, 4]);
  line(far.elev, '#3a6ea5', 1.2);
  line(near.elev, '#1b1b1b', 1.5);
  for (const v of verticals) {
    if (!v.name) continue;
    const dx = v.x - centre.x, dz = v.z - centre.z, d = Math.hypot(dx, dz);
    const az = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
    const e = Math.atan2(v.top - d * d / (2 * 7_300_000) - centre.y, d) * 180 / Math.PI;
    ctx.fillStyle = '#7a1f1f'; ctx.beginPath(); ctx.arc(px(az), py(e), 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = '10px sans-serif'; ctx.fillText(v.name.split(',')[0], px(az) + 4, py(e) - 4);
  }
  ctx.restore();
  ctx.fillStyle = '#111'; ctx.font = 'bold 13px sans-serif';
  ctx.fillText('Skyline from the centre eye: near ≤ 4 km (black), far 4–80 km (blue), the old ring (dashed); C1 band green', top.x + 10, top.y + 18);
  // the eight EYE8 views, each over its own 100° of compass
  const cellW = (rect.w - 20) / 4, cellH = (rect.h - top.h - 30) / 2;
  eyes.forEach((eye, k) => {
    const cx = rect.x + 10 + (k % 4) * cellW, cy = rect.y + top.h + 20 + Math.floor(k / 4) * cellH;
    ctx.strokeStyle = '#bbb'; ctx.strokeRect(cx + 0.5, cy + 0.5, cellW - 6, cellH - 6);
    const n = eye.sky.elev.length, span = 100;
    const vals = [];
    for (let i = 0; i < n; i++) { const az = (i / n) * 360, off = ((az - eye.faceDeg + 540) % 360) - 180; if (Math.abs(off) <= span / 2) vals.push([off, eye.sky.elev[i]]); }
    vals.sort((a, b) => a[0] - b[0]);
    const eMin = -1, eMax = Math.max(4, Math.ceil(Math.max(...vals.map((v) => v[1])) + 0.5));
    const ex = (o) => cx + 6 + ((o + span / 2) / span) * (cellW - 18), ey = (e) => cy + 20 + (1 - (e - eMin) / (eMax - eMin)) * (cellH - 34);
    ctx.fillStyle = 'rgba(120,170,220,0.25)'; ctx.fillRect(cx + 1, cy + 1, cellW - 8, ey(0) - cy);
    ctx.fillStyle = 'rgba(110,140,80,0.5)';
    ctx.beginPath(); ctx.moveTo(ex(-span / 2), ey(eMin));
    for (const [o, e] of vals) ctx.lineTo(ex(o), ey(e));
    ctx.lineTo(ex(span / 2), ey(eMin)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1.2; ctx.beginPath();
    vals.forEach(([o, e], i) => { if (i) ctx.lineTo(ex(o), ey(e)); else ctx.moveTo(ex(o), ey(e)); }); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${eye.name} (median ${eye.stats.p50.toFixed(2)}°)`, cx + 6, cy + 14);
  });
}

/**
 * The EYE8 spots with the census's clearance (visual-census-views.mjs selectBorderSite's order: insets 80, 70, 90, 60,
 * 100 m and offsets along the edge): the first spot whose own ground ahead does not rise over the eye — an eye never
 * stands against a bank or inside a slope.
 */
function clearEyeSpots(ground) {
  const base = eye8Spots((x, z) => ground.getHeightAt(x, z));
  return base.map((eye) => {
    const a = eye.faceDeg * Math.PI / 180, fx = Math.sin(a), fz = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a);
    const corner = eye.name.startsWith('corner');
    for (const inset of [80, 70, 90, 60, 100]) for (const off of corner ? [0] : [0, 40, -40, 80, -80, 120, -120]) {
      const k = 512 - inset;
      const x = corner ? Math.sign(fx) * k : fx * k + px * off, z = corner ? Math.sign(fz) * k : fz * k + pz * off;
      const y = ground.getHeightAt(x, z) + 2.5;
      let blocked = false;
      for (let d = 6; d <= 140 && !blocked; d += 4) for (const da of [-0.6, 0, 0.6]) {
        const ex = x + Math.sin(a + da) * d, ez = z + Math.cos(a + da) * d;
        if (Math.max(Math.abs(ex), Math.abs(ez)) > 512) continue;
        if (Math.atan2(ground.getHeightAt(ex, ez) - y, d) > 0.14) { blocked = true; break; }
      }
      if (!blocked) return { ...eye, x, z, y };
    }
    return eye;
  });
}

const SEASON_LEAF = { spring: 0.7, summer: 1, autumn: 0.75, lateAutumn: 0.3, winter: 0.04 };
/** The preview's building palettes by kit (walls, roofs; the walls' and roofs' heights): the place's own materials. */
const BUILDING_PALETTES = {
  // Zeeland: red-brown brick farmhouses under dark glazed tiles, the long schuur barns black-tarred under thatch or dark
  // tile, white-rendered cottages here and there
  polder: {
    farmhouse: { wall: [142, 78, 58], roof: [58, 52, 50], wallH: 6, roofH: 6 },
    barn: { wall: [48, 44, 40], roof: [92, 78, 58], wallH: 4.5, roofH: 9 },
    granary: { wall: [52, 46, 42], roof: [88, 74, 56], wallH: 4.5, roofH: 7 },
    cottage: { wall: [150, 86, 64], roof: [154, 74, 46], wallH: 5, roofH: 5 },
    tavern: { wall: [214, 206, 192], roof: [62, 56, 54], wallH: 6.5, roofH: 5.5 },
    woodshed: { wall: [60, 54, 48], roof: [70, 64, 58], wallH: 3.5, roofH: 3 },
    default: { wall: [150, 88, 66], roof: [66, 58, 54], wallH: 5.5, roofH: 5.5 },
  },
  kolkhoz: {
    default: { wall: [222, 218, 206], roof: [168, 150, 104], wallH: 3.2, roofH: 4 },
    barn: { wall: [120, 104, 84], roof: [150, 136, 96], wallH: 4, roofH: 5 },
  },
  savoyard: { default: { wall: [130, 124, 116], roof: [86, 84, 82], wallH: 6, roofH: 4 } },
};

/** Reference photographs of each place (the gauntlet's real set, ~/cot-launch-state/gauntlet-refs-20261012/real). */
const REFERENCES = {
  polders: [['real_scheldt_polders_2.jpg', 'Zeeland: a tower mill on the dyke over the creek, bare trees, low far horizon'],
    ['real_zeeland_1.jpg', 'Zeeland: a dyke road toward the Oosterschelde']],
  alpine: [['real_mont_cenis_1.jpg', 'Col du Mont-Cenis: the lake under snow below the Petit Mont-Cenis, March']],
  verdant: [['real_prokhorovka_1.jpg', 'Prokhorovka: the forest-steppe'], ['real_prokhorovka_2.jpg', 'Prokhorovka']],
};
const REF_DIR = path.join(process.env.HOME ?? '', 'cot-launch-state/gauntlet-refs-20261012/real');

/** The eye-level sheet: the place's reference photographs, then four EYE8 views at tank eye height (CPU preview). */
export async function renderEyes(id, build, ground, outDir, { fog, names = ['edge-n', 'edge-s', 'corner-ne', 'edge-w'], elev } = {}) {
  const { renderEyeBuffer, CROP_RGB: CR, CLASS_RGB: CL } = await import('./hinterland-eye.mjs');
  const { loadImage } = await import('@napi-rs/canvas');
  const W = 1800, EH = 300, REF_H = 320;
  const refs = REFERENCES[id] ?? [];
  const canvas = createCanvas(W, (refs.length ? REF_H + 10 : 0) + EH * names.length + 10 * (names.length + 1));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ece9e1'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y0 = 10, x0 = 10;
  for (const [file, caption] of refs) {
    try {
      const img = await loadImage(path.join(REF_DIR, file));
      const w = Math.round(img.width * (REF_H / img.height));
      ctx.drawImage(img, x0, y0, w, REF_H);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x0 + 6, y0 + REF_H - 26, Math.min(w - 12, ctx.measureText(caption).width + 20), 20);
      ctx.fillStyle = '#111'; ctx.font = '12px sans-serif'; ctx.fillText(`reference — ${caption}`, x0 + 12, y0 + REF_H - 12);
      x0 += w + 10;
    } catch { /* (a missing reference leaves its slot empty) */ }
  }
  if (refs.length) y0 += REF_H + 10;
  const { field, spec, plan } = build;
  const cover = { cls: 0, crop: 31, fieldId: 0, woods: 0, hedge: 0, wet: 0, rock: 0, scree: 0, snow: 0, settle: 0, road: 0, edgeU: 1e9, edgeV: 1e9, conifer: false };
  const geo = { strata: 0, rock: 0, snow: 0, sand: 0, rockHex: 0, forest: -1, gully: 0 };
  const water = { wet: 0, level: 0, kind: 0 };
  const conifer = (spec.region.vegetation.species[0]?.[0] ?? '') .match(/pine|spruce|fir|cedar/) !== null;
  const surfaceAt = (x, z) => (Math.max(Math.abs(x), Math.abs(z)) <= 512 ? ground.getHeightAt(x, z) : build.sample(x, z));
  // (the battlefield inside the red line is the game's own material: the preview leaves it a neutral tone, unjudged)
  const coverAt = (x, z, slope, h) => {
    cover.inside = Math.max(Math.abs(x), Math.abs(z)) <= 512;
    if (!cover.inside) field.coverAt(x, z, cover, slope, h);
    cover.conifer = conifer; return cover;
  };
  const colourOf = (c, x, z) => {
    if (c.cls === 7) { field.waterAt(x, z, water); return water.kind === 1 ? [56, 92, 116] : water.kind === 5 ? [108, 132, 140] : [74, 106, 124]; }
    if (c.cls === 5 || c.snow > 0.55) return [236, 240, 246];
    if (c.cls === 3 || c.cls === 4) {
      field.geologyAt(x, z, geo);
      const r = (geo.rockHex >> 16) & 255, g = (geo.rockHex >> 8) & 255, b = geo.rockHex & 255;
      const band = 0.9 + 0.12 * Math.sin(geo.strata * 6.283) * Math.min(1, 40 / (1 + Math.hypot(x, z) / 60));
      return c.cls === 4 ? [r * 1.15, g * 1.15, b * 1.12] : [r * band, g * band, b * band];
    }
    const tone = c.fieldId ? 0.9 + 0.2 * (((c.fieldId * 2654435761) >>> 0) % 1000) / 1000 : 1;
    const rgb = c.cls === 0 || (c.cls === 1 && c.crop !== 31) ? CR[c.crop] ?? CL[0] : CL[c.cls] ?? [255, 0, 255];
    return [rgb[0] * tone, rgb[1] * tone, rgb[2] * tone];
  };
  const autumn = spec.season === 'autumn' || spec.season === 'lateAutumn' || /autumn|october|november/i.test(spec.place);
  // the woods on a lazy lattice (8 m to 3 km, 32 m to 16 km), bilinear so a wood's edge thins
  const lat = (cell, half) => ({ cell, half, n: Math.ceil((2 * half) / cell) + 1, v: null });
  const L1 = lat(8, 3072), L2 = lat(32, 16384);
  const wc = { ...cover };
  const cell = (L, i, j) => {
    L.v ??= new Float32Array(L.n * L.n).fill(-1);
    const k = j * L.n + i;
    if (L.v[k] < 0) { const x = -L.half + i * L.cell, z = -L.half + j * L.cell; field.coverAt(x, z, wc, 2); L.v[k] = wc.cls === 7 ? 0 : wc.woods; }
    return L.v[k];
  };
  const woodsAt = (x, z) => {
    if (Math.max(Math.abs(x), Math.abs(z)) < 512) return 0;
    const L = Math.abs(x) < L1.half - 16 && Math.abs(z) < L1.half - 16 ? L1 : L2;
    const fx = (x + L.half) / L.cell, fz = (z + L.half) / L.cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i + 1 >= L.n || j + 1 >= L.n) return 0;
    const tx = fx - i, tz = fz - j;
    return (cell(L, i, j) * (1 - tx) + cell(L, i + 1, j) * tx) * (1 - tz) + (cell(L, i, j + 1) * (1 - tx) + cell(L, i + 1, j + 1) * tx) * tz;
  };
  const eyes = clearEyeSpots(ground);
  for (const name of names) {
    const eye = eyes.find((e) => e.name === name);
    const buf = renderEyeBuffer({ w: W - 20, h: EH, eye, elev, fog, surfaceAt, coverAt, colourOf, woodsAt, conifer, canopyM: spec.region.vegetation.canopyM || 18,
      trees: plan.trees ?? [], verticals: plan.verticals, buildings: plan.buildings, autumn, seasonLeaf: SEASON_LEAF[spec.season] ?? 1,
      palette: BUILDING_PALETTES[spec.kit ?? ''] ?? null });
    const img = ctx.createImageData(buf.w, buf.h); img.data.set(buf.data);
    ctx.putImageData(img, 10, y0);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(16, y0 + 6, 300, 20);
    ctx.fillStyle = '#111'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${name}, 2.5 m, looking ${Math.round(eye.faceDeg)}° (CPU preview)`, 22, y0 + 21);
    y0 += EH + 10;
  }
  const file = path.join(outDir, `${id}-eyes.png`);
  writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}

export async function renderPlan(id, { outDir, draft = true, eyeViews = true } = {}) {
  const world = await loadWorld();
  const [{ resolveHinterlandSpec }, { withSelectedHinterland }, { buildHinterland }, { samplePyramid }] = await Promise.all([
    import('../src/world/hinterland/spec.ts'), import('../src/world/hinterland/select.ts'),
    import('../src/world/hinterland/pipeline.ts'), import('../src/world/hinterland/pyramid.ts'),
  ]);
  const cfg = withSelectedHinterland(world.maps.getMapConfig(id), draft ? '?hinterland=1' : '');
  const spec = resolveHinterlandSpec(cfg);
  if (!spec) throw new Error(`${id}: no hinterland block or lab draft`);
  const ground = world.terrain.createHeightField(1337, cfg);
  const build = buildHinterland(spec, 1337, ground);
  build.sample = (x, z) => samplePyramid(build.pyramid, x, z);
  const row = measureBuild(build, ground, { eyes: 'none', id });
  const ring = await measureRing(world, id, { eyes: 'centre', field: ground });
  const ringSky = ring.centreSky ?? null;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ece9e1'; ctx.fillRect(0, 0, W, H);
  const flat = spec.outland.flat;
  const groundAt = (x, z) => ground.getHeightAt(x, z);
  const planMap = rasterInto(ctx, PLAN, PLAN.half, build, groundAt, { exaggeration: flat ? 6 : 2 });
  drawPlanOverlays(ctx, planMap, build);
  drawSquare(ctx, planMap);
  drawFrame(ctx, PLAN, `${id}: the hinterland plan (${spec.region.id}) — 5.5 km`, PLAN.half, planMap);
  const overMap = rasterInto(ctx, OVER, OVER.half, build, groundAt, { exaggeration: flat ? 4 : 1.2, step: 2 });
  drawPlanOverlays(ctx, overMap, build, { far: true });
  drawSquare(ctx, overMap, { label: false });
  drawFrame(ctx, OVER, 'the far band — 32 km', OVER.half, overMap);

  // skylines: the centre eye (near, far, the old ring), and the EYE8 eyes
  const objects = skylineObjects(build);
  const surface = (x, z) => (Math.max(Math.abs(x), Math.abs(z)) <= 512 ? groundAt(x, z) : build.sample(x, z));
  const step = (d) => (d < 1500 ? 6 : d < 6000 ? d * 0.006 : d * 0.012);
  const eyes = eye8Spots(groundAt).map((eye) => {
    const sky = marchSkyline(surface, eye, { bearings: 720, minM: 30, maxM: 6000, step, objects });
    return { ...eye, sky, stats: skylineStats(sky) };
  });
  const centre = { x: 0, z: 0, y: groundAt(0, 0) + 3 };
  const verticals = build.plan.verticals.filter((v) => v.name && v.kind !== 'pylonLine').map((v) => ({ ...v, top: build.sample(v.x, v.z) + v.heightM }));
  drawSkyline(ctx, SKY, { near: row.skyline.near, far: row.skyline.far, old: ringSky, eyes, verticals, centre });

  // the caption
  ctx.fillStyle = '#111'; ctx.font = '12px sans-serif';
  const caption = `${spec.place.slice(0, 210)}${spec.place.length > 210 ? '…' : ''}`;
  ctx.fillText(caption, PLAN.x + 10, H - 4);
  const stats = `C1 ${row.centre.p50.toFixed(2)}° (old ${ring.centre.p50.toFixed(2)}°) · C2 ${row.outlandRise.toFixed(1)} m · C4 ${row.centre.summits} summits · C6 ${(row.c6 * 100).toFixed(0)} % · `
    + `${build.plan.settlements.filter((s) => s.near).length} near settlements, ${build.plan.buildings.length} buildings, ${build.plan.verticals.length} verticals · CPU build ${Math.round(build.ms.total)} ms`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(PLAN.x + 8, PLAN.y + 36, ctx.measureText(stats).width + 16, 20);
  ctx.fillStyle = '#111'; ctx.fillText(stats, PLAN.x + 16, PLAN.y + 50);
  const file = path.join(outDir, `${id}-plan.png`);
  writeFileSync(file, canvas.toBuffer('image/png'));
  if (eyeViews) {
    const tall = build.plan && spec.landforms.some((l) => l.heightM > 200);
    await renderEyes(id, build, ground, outDir, { fog: spec.fogDensity, elev: tall ? [-3, 22] : [-1.5, 6] });
  }
  return { file, row, ring, build: { ms: build.ms, settlements: build.plan.settlements.length, buildings: build.plan.buildings.length, verticals: build.plan.verticals.length } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const ids = (arg('map') ?? 'polders').split(',');
  const outDir = arg('out') ?? path.join(process.env.HOME, 'cot-launch-state/streams/horizons');
  mkdirSync(outDir, { recursive: true });
  for (const id of ids) {
    const { file, row, ring, build } = await renderPlan(id, { outDir });
    console.log(`${id}: ${file} — C1 new ${row.centre.p50.toFixed(2)}° old ${ring.centre.p50.toFixed(2)}°, C2 ${row.outlandRise.toFixed(1)} m, C4 ${row.centre.summits}, C6 ${(row.c6 * 100).toFixed(0)}%; ${JSON.stringify(build)}`);
  }
}
