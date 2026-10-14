// tools/hinterland-eye.mjs — an eye-level preview of a hinterland on the CPU (HL-2b, the horizons stream, 2026-10-13).
//
// Not the game's renderer: a look at the land's form and layering at tank eye height before any GPU time, judged
// beside a reference photograph of the place. The ground is a voxel-space march (each column's ray steps out to 80 km,
// filling the rows its rising angle uncovers, front to back, with a depth buffer): the field's height and cover, lit by a
// key from the south-west, the woods as a canopy layer over the slope (its height rolling crown by crown, thinning at its
// edge, lit on its sunward side); then every planned tree, tower, mill, pylon and building is drawn as a silhouette of
// its kind against that depth (a poplar a narrow column, a broadleaf a rounded crown, a church its tower and spire, a
// mill its sails), far to near. Everything is hazed by the battlefield's own law (hazeLaw.ts: Beer–Lambert by the true
// distance through an exponential layer, the per-channel extinction that turns distance blue, the in-scatter toward the
// sky at the horizon), with the earth's curvature.
const EARTH_R = 7_300_000;
const CHROMA = [0.9, 1.0, 1.14];
const SUN = [-0.55, 0.62, -0.56]; // from the south-west, 38° up (x east, y up, z north)

function smoothstep(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
function hash(x, z) { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); }
const SUN_RGB = [1.0, 0.96, 0.88], SKY_RGB = [0.56, 0.66, 0.86];
/** Light on a surface: the key (its Lambert term times its visibility) plus the sky's blue fill in the shade. */
function lightRgb(rgb, lit, vis, out) {
  for (let c = 0; c < 3; c++) out[c] = rgb[c] * (SUN_RGB[c] * 0.82 * lit * vis + SKY_RGB[c] * 0.5);
  return out;
}
/** A wood's crowns: the nearest crown dome over a jittered 9 m lattice (its height share and its slope for the light). */
const CROWN = [0, 0, 0];
function crownAt(x, z) {
  const cell = 9, cx0 = Math.floor(x / cell), cz0 = Math.floor(z / cell);
  let best = 0, gx = 0, gz = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = cx0 + i, cz = cz0 + j;
    const px = (cx + 0.15 + 0.7 * hash(cx, cz)) * cell, pz = (cz + 0.15 + 0.7 * hash(cz + 3.1, cx - 1.7)) * cell;
    const r = 5.5 + 3 * hash(cx - 7.3, cz + 2.2), hgt = 0.72 + 0.28 * hash(cx + 5.5, cz + 9.9);
    const dx = x - px, dz = z - pz, q = (dx * dx + dz * dz) / (r * r);
    if (q >= 1) continue;
    const v = hgt * Math.sqrt(1 - q);
    if (v > best) { best = v; const k = -hgt / (r * r * Math.sqrt(1 - q)); gx = dx * k; gz = dz * k; }
  }
  CROWN[0] = best; CROWN[1] = gx; CROWN[2] = gz;
  return CROWN;
}

const CROP_RGB = {
  0: [112, 140, 78], 1: [196, 162, 88], 2: [206, 186, 122], 3: [94, 132, 64], 4: [104, 84, 64], 5: [190, 170, 124], 6: [118, 136, 60],
  7: [80, 106, 60], 8: [104, 132, 132], 9: [122, 168, 74], 10: [178, 170, 96], 11: [150, 90, 64], 12: [108, 118, 64], 13: [176, 170, 120],
  14: [64, 108, 54], 15: [56, 56, 56], 16: [140, 140, 140], 17: [146, 146, 110], 18: [128, 128, 128], 19: [148, 138, 124],
};
const CLASS_RGB = {
  0: [176, 160, 100], 1: [116, 144, 80], 2: [52, 78, 46], 3: [128, 124, 118], 4: [156, 150, 140], 5: [236, 240, 245],
  6: [212, 186, 138], 7: [70, 104, 124], 8: [160, 146, 130], 9: [200, 192, 170], 10: [84, 80, 76], 11: [92, 118, 96], 12: [140, 134, 104],
};

/** A tree's colour by species, its tone and the season (autumn turns the broadleaves and the poplars). */
function treeRgb(species, tone, autumn) {
  const conifer = species === 'pine' || species === 'spruce' || species === 'fir' || species === 'cedar' || species === 'cypress';
  if (conifer) return [38 + 14 * tone, 58 + 14 * tone, 40 + 6 * tone];
  if (autumn) {
    // October: the poplars yellowing first, the willows silver-green, the oaks still green to bronze
    if (species === 'poplar') return [96 + 110 * tone, 112 + 70 * tone, 44 + 10 * tone];
    if (species === 'willow') return [118 + 30 * tone, 128 + 24 * tone, 86 + 6 * tone];
    return [72 + 70 * tone, 92 + 34 * tone, 46 + 6 * tone];
  }
  if (species === 'willow') return [104 + 20 * tone, 124 + 18 * tone, 82];
  if (species === 'poplar') return [60 + 26 * tone, 92 + 24 * tone, 46 + 8 * tone];
  return [56 + 26 * tone, 84 + 24 * tone, 44 + 8 * tone];
}

/**
 * Render one eye view into an RGBA buffer {w, h, data}. `surfaceAt(x, z)` is the ground (the battlefield inside the
 * square, the pyramid past it); `coverAt(x, z, slope, h)` returns a cover sample with its class, crop, woods, snow, rock.
 */
export function renderEyeBuffer({ w, h, eye, fovDeg = 100, elev = [-1.5, 6], fog = 0.00062, surfaceAt, coverAt, colourOf, woodsAt,
  canopyM = 18, conifer = false, trees = [], verticals = [], buildings = [], autumn = false, skyTop = [92, 140, 196], skyHorizon = [196, 210, 222] }) {
  const data = new Uint8ClampedArray(w * h * 4);
  const depth = new Float32Array(w * h).fill(Infinity);
  const sigma = fog * 0.42;
  const sky = (e) => { const t = Math.max(0, Math.min(1, (e + 1) / 12)); return [skyHorizon[0] + (skyTop[0] - skyHorizon[0]) * t, skyHorizon[1] + (skyTop[1] - skyHorizon[1]) * t, skyHorizon[2] + (skyTop[2] - skyHorizon[2]) * t]; };
  const target = sky(0.3).map((c) => c * 0.96);
  const rowOf = (e) => (1 - (e - elev[0]) / (elev[1] - elev[0])) * h;
  const colOf = (az) => ((((az - eye.faceDeg + 540) % 360) - 180) / fovDeg + 0.5) * w;
  /** The haze law over a path of `d` metres up to a point `top` metres high. */
  const haze = (rgb, d, top, out) => {
    const a0 = eye.y / 400, a1 = Math.max(0, top) / 400;
    const mean = Math.abs(a0 - a1) < 1e-3 ? Math.exp(-0.5 * (a0 + a1)) : (Math.exp(-a1) - Math.exp(-a0)) / (a0 - a1);
    for (let c = 0; c < 3; c++) { const T = Math.exp(-sigma * d * Math.max(0.05, mean) * CHROMA[c]); out[c] = rgb[c] * T + target[c] * (1 - T); }
    return out;
  };
  const tmp = [0, 0, 0];
  /** The key light's visibility at a point (a march toward the sun over the surface: the ranges cast their shadows). */
  const sunH = Math.hypot(SUN[0], SUN[2]), sunRise = SUN[1] / sunH, sx0 = SUN[0] / sunH, sz0 = SUN[2] / sunH;
  const sunVisibility = (x, z, y) => {
    for (let t = 6; t < 5000; t *= 1.22) {
      const hy = surfaceAt(x + sx0 * t, z + sz0 * t);
      if (hy > y + t * sunRise + 0.5) return 0.15;
    }
    return 1;
  };
  // ---- the ground and the woods' canopy
  for (let col = 0; col < w; col++) {
    const az = (eye.faceDeg + ((col + 0.5) / w - 0.5) * fovDeg) * Math.PI / 180;
    const sx = Math.sin(az), sz = Math.cos(az);
    let low = h;
    for (let d = 8; d < 80000 && low > 0; d += Math.max(1.5, d * 0.005)) {
      const x = eye.x + sx * d, z = eye.z + sz * d;
      const g = surfaceAt(x, z);
      // the canopy: a layer over the slope, rolling crown by crown, thinning at the wood's edge (the woods from the
      // caller's lattice: the cover itself is read only where a step shows)
      const wd = woodsAt ? woodsAt(x, z) : 0;
      let top = g, canopy = 0, cgx = 0, cgz = 0;
      if (wd > 0.05) {
        // rounded, broken crowns over the slope; lower toward the wood's edge (its thinner, younger fringe)
        const cr = crownAt(x, z);
        const edge = smoothstep(0.05, 0.9, wd);
        canopy = canopyM * (0.55 + 0.45 * cr[0]) * edge * (cr[0] > 0 ? 1 : 0.6);
        cgx = cr[1] * canopyM * 0.45 * edge; cgz = cr[2] * canopyM * 0.45 * edge;
        top = g + canopy;
      }
      const drop = d * d / (2 * EARTH_R);
      const e = Math.atan2(top - drop - eye.y, d) * 180 / Math.PI;
      const row = Math.max(0, Math.floor(rowOf(e)));
      if (row >= low) continue;
      const ee = Math.max(1.5, d * 0.004);
      const nx = -(surfaceAt(x + ee, z) - surfaceAt(x - ee, z)) / (2 * ee), nz = -(surfaceAt(x, z + ee) - surfaceAt(x, z - ee)) / (2 * ee);
      const len = Math.hypot(nx, 1, nz);
      const slope = Math.atan(Math.hypot(nx, nz)) * 180 / Math.PI;
      const cover = canopy > 0 ? null : coverAt(x, z, slope, g);
      let rgb;
      const vis = sunVisibility(x, z, top);
      if (canopy > 0) {
        // lit on its sunward side: the crowns' own slope over the ground's
        const ax = nx - cgx, az2 = nz - cgz;
        const lit = Math.max(0, (ax * SUN[0] + SUN[1] + az2 * SUN[2]) / Math.hypot(ax, 1, az2));
        const base = treeRgb(conifer ? 'pine' : 'oak', 0.3 + 0.5 * hash(Math.floor(x / 9), Math.floor(z / 9)), autumn);
        rgb = lightRgb(base, lit, vis, [0, 0, 0]);
      } else if (cover.inside) {
        rgb = lightRgb([118, 122, 108], Math.max(0, (nx * SUN[0] + SUN[1] + nz * SUN[2]) / len), vis, [0, 0, 0]);
      } else {
        const alb = colourOf(cover, x, z);
        const lit = Math.max(0, (nx * SUN[0] + SUN[1] + nz * SUN[2]) / len);
        rgb = cover.cls === 7 ? [alb[0] * 0.95, alb[1] * 0.95, alb[2] * 0.95] : lightRgb(alb, lit, vis, [0, 0, 0]);
      }
      haze(rgb, d, top - drop, tmp);
      for (let r = row; r < low; r++) {
        const k4 = (r * w + col) * 4;
        data[k4] = tmp[0]; data[k4 + 1] = tmp[1]; data[k4 + 2] = tmp[2]; data[k4 + 3] = 255;
        depth[r * w + col] = d;
      }
      low = row;
    }
    for (let r = 0; r < low; r++) {
      const e = elev[1] - (r / h) * (elev[1] - elev[0]), c = sky(e), k4 = (r * w + col) * 4;
      data[k4] = c[0]; data[k4 + 1] = c[1]; data[k4 + 2] = c[2]; data[k4 + 3] = 255;
    }
  }
  // ---- the silhouettes, far to near, against the depth
  const items = [];
  const project = (x, z) => {
    const dx = x - eye.x, dz = z - eye.z, d = Math.hypot(dx, dz);
    const az = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
    const col = colOf(az);
    return { d, col };
  };
  for (const t of trees) { const p = project(t.x, t.z); if (p.d > 30 && p.d < 9000 && p.col > -20 && p.col < w + 20) items.push({ kind: 'tree', t, ...p }); }
  for (const v of verticals) { const p = project(v.x, v.z); if (p.d > 30 && p.d < 30000 && p.col > -40 && p.col < w + 40) items.push({ kind: v.kind, t: v, ...p }); }
  for (const b of buildings) { const p = project(b.x, b.z); if (p.d > 30 && p.d < 6000 && p.col > -20 && p.col < w + 20) items.push({ kind: 'building', t: b, ...p }); }
  items.sort((a, b) => b.d - a.d);
  const pxPerM = (d) => (w / fovDeg) * (180 / Math.PI) / d; // pixels per metre across at distance d
  const plot = (c, r, d, rgb, top) => {
    if (c < 0 || c >= w || r < 0 || r >= h) return;
    const k = r * w + c;
    if (depth[k] < d) return;
    haze(rgb, d, top, tmp);
    data[k * 4] = tmp[0]; data[k * 4 + 1] = tmp[1]; data[k * 4 + 2] = tmp[2];
    depth[k] = d;
  };
  /** Fill a shape given by its half-width (m) at each height (m) over its base. */
  const fillShape = (item, baseY, heightM, halfAt, rgbAt) => {
    const { d, col } = item;
    const drop = d * d / (2 * EARTH_R);
    const ppm = pxPerM(d);
    const rowBase = rowOf(Math.atan2(baseY - drop - eye.y, d) * 180 / Math.PI);
    const rowTop = rowOf(Math.atan2(baseY + heightM - drop - eye.y, d) * 180 / Math.PI);
    const r0 = Math.max(0, Math.floor(rowTop)), r1 = Math.min(h - 1, Math.ceil(rowBase));
    for (let r = r0; r <= r1; r++) {
      const y = ((rowBase - r) / Math.max(1e-6, rowBase - rowTop)) * heightM;
      if (y < 0 || y > heightM) continue;
      const half = halfAt(y);
      if (half <= 0) continue;
      const hp = Math.max(0.5, half * ppm);
      for (let c = Math.floor(col - hp); c <= Math.ceil(col + hp); c++) {
        const u = (c - col) / hp; // -1..1 across
        if (Math.abs(u) > 1) continue;
        const rgb = rgbAt(y, u);
        if (rgb) plot(c, r, d, rgb, baseY + y);
      }
    }
  };
  for (const item of items) {
    const t = item.t;
    const baseY = surfaceAt(t.x, t.z);
    if (item.kind === 'tree') {
      const H = t.heightM, R = t.crownM, poplar = t.species === 'poplar';
      const conifer = t.species === 'pine' || t.species === 'spruce' || t.species === 'fir' || t.species === 'cedar' || t.species === 'cypress';
      const base = treeRgb(t.species, t.tone, autumn);
      const trunk = poplar ? 0.12 : conifer ? 0.08 : 0.3;
      fillShape(item, baseY, H, (y) => {
        if (y < H * trunk) return Math.max(0.25, R * 0.12);
        const f = (y - H * trunk) / (H * (1 - trunk));
        if (conifer) return R * (1 - f) * 1.1;
        if (poplar) return R * Math.sqrt(Math.max(0, 1 - (2 * f - 0.85) ** 2)) * (0.9 + 0.1 * Math.sin(f * 9 + t.x));
        return R * Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)) * (0.92 + 0.12 * Math.sin(f * 7 + t.z));
      }, (y, u) => {
        if (y < H * trunk) return [70, 60, 50];
        const k = 0.62 + 0.38 * (0.5 - 0.5 * u) + 0.12 * (y / H); // lit from the sun's side (the left of a southward look)
        return [base[0] * k, base[1] * k, base[2] * k];
      });
    } else if (item.kind === 'churchTower' || item.kind === 'spire' || item.kind === 'campanile' || item.kind === 'minaret' || item.kind === 'onionDome' || item.kind === 'lighthouse') {
      const H = t.heightM, W = Math.max(3, t.halfM * 0.9);
      const body = item.kind === 'minaret' || item.kind === 'lighthouse' ? 0.88 : item.kind === 'onionDome' ? 0.72 : 0.66;
      const wall = item.kind === 'lighthouse' ? [222, 216, 206] : item.kind === 'onionDome' ? [226, 222, 210] : [150, 104, 84];
      fillShape(item, baseY, H, (y) => {
        if (y < H * body) return W * (item.kind === 'lighthouse' ? 1 - 0.3 * y / H : 1);
        const f = (y - H * body) / (H * (1 - body));
        if (item.kind === 'onionDome') return W * 1.25 * Math.sin(Math.PI * Math.min(1, f * 1.15)) + (f > 0.85 ? 0.3 : 0);
        return W * (1 - f) * 0.95;
      }, (y, u) => {
        const k = 0.65 + 0.35 * (0.5 - 0.5 * u);
        const c = y > H * body ? (item.kind === 'onionDome' ? [70, 120, 80] : [60, 62, 70]) : wall;
        return [c[0] * k, c[1] * k, c[2] * k];
      });
    } else if (item.kind === 'windmill' || item.kind === 'postMill') {
      const H = t.heightM, hub = H * 0.82;
      fillShape(item, baseY, H * 0.86, (y) => (y < hub ? 4.6 - 1.6 * (y / hub) : 2.8), (y, u) => { const k = 0.65 + 0.35 * (0.5 - 0.5 * u); return [228 * k, 224 * k, 214 * k]; });
      // the sails: two crossed blades through the hub, turned into the wind
      const { d, col } = item, ppm = pxPerM(d), drop = d * d / (2 * EARTH_R);
      const hubRow = rowOf(Math.atan2(baseY + hub - drop - eye.y, d) * 180 / Math.PI);
      const L = 12 * ppm, ang = 0.6 + (t.x % 1);
      for (const a of [ang, ang + Math.PI / 2]) {
        for (let s = -L; s <= L; s += 0.5) plot(Math.round(col + Math.cos(a) * s), Math.round(hubRow - Math.sin(a) * s), d - 1, [70, 62, 54], baseY + hub);
      }
    } else if (item.kind === 'pylonLine' || item.kind === 'mast' || item.kind === 'headframe' || item.kind === 'chimney' || item.kind === 'waterTower' || item.kind === 'elevator') {
      const H = t.heightM;
      const lattice = item.kind === 'pylonLine' || item.kind === 'mast' || item.kind === 'headframe';
      fillShape(item, baseY, H, (y) => {
        if (item.kind === 'waterTower') return y > H * 0.7 ? 5.5 : 1.6;
        if (item.kind === 'elevator') return 7;
        if (item.kind === 'chimney') return 2.4 - 0.8 * y / H;
        if (item.kind === 'pylonLine' && Math.abs(y - H * 0.82) < 0.9) return 7;
        return lattice ? 3.2 * (1 - 0.8 * y / H) : 2;
      }, (y, u) => (lattice ? (Math.abs(u) > 0.7 || (Math.floor(y * 0.7) % 3 === 0) ? [70, 72, 74] : null) : [128, 120, 112]));
    } else if (item.kind === 'building') {
      const Wb = Math.max(t.width, t.depth) * 0.5, Hb = t.kind === 'barn' ? 8 : 6.5, roof = t.kind === 'barn' ? 6 : 4.5;
      fillShape(item, baseY, Hb + roof, (y) => (y < Hb ? Wb : Wb * (1 - (y - Hb) / roof)), (y, u) => {
        // two faces: the sunlit gable and the side in shade
        const k = u < 0.25 ? 1 : 0.68;
        const c = y > Hb ? [128, 66, 52] : [196, 184, 166];
        return [c[0] * k, c[1] * k, c[2] * k];
      });
    } else if (item.kind === 'castle') {
      fillShape(item, baseY, t.heightM, () => 18, (y, u) => { const k = 0.7 + 0.3 * (0.5 - 0.5 * u); return [150 * k, 146 * k, 136 * k]; });
    }
  }
  return { w, h, data };
}

export { CROP_RGB, CLASS_RGB };
