import * as THREE from 'three';
import { KIT } from './profiles/kit.js';
import { vehicleAmbientFloorHook } from './materials.js';

// Shared physical-ghillie authoring process.
//
// A suit is a separately suspended equipment mesh, never a paint alias and
// never an armor bucket.  Each vehicle supplies its own cloth outlines,
// carrier height, running-gear hem and working-station openings.  The common
// builder owns deterministic ripples, ragged cell edges, connected cut-net
// texture, overlapping foliage and merged draw-call-safe output.

const noise01 = (n, salt = 0) => {
  const v = Math.sin((n + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

function insidePoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-6) + xi)) inside = !inside;
  }
  return inside;
}

function makeGeometry(positions, uvs) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function clothTop(panel, suitSeed) {
  const {
    x0, x1, z0, z1, nx = 18, nz = 30, yAt, outline = null, holes = [], seed = 0,
  } = panel;
  const positions = [];
  const uvs = [];
  const vertex = (x, z) => {
    const ripple = Math.sin(x * 7.7 + z * 5.9 + seed) * 0.010
      + Math.cos(x * 3.7 - z * 7.3 + suitSeed * 0.31) * 0.006;
    return [x, yAt(x, z) + ripple, z];
  };
  const tri = (a, b, c) => {
    for (const p of [a, b, c]) {
      positions.push(...p);
      uvs.push(p[0] * 0.72, p[2] * 0.72);
    }
  };
  for (let iz = 0; iz < nz; iz++) {
    const za = THREE.MathUtils.lerp(z0, z1, iz / nz);
    const zb = THREE.MathUtils.lerp(z0, z1, (iz + 1) / nz);
    for (let ix = 0; ix < nx; ix++) {
      const xa = THREE.MathUtils.lerp(x0, x1, ix / nx);
      const xb = THREE.MathUtils.lerp(x0, x1, (ix + 1) / nx);
      const cx = (xa + xb) * 0.5;
      const cz = (za + zb) * 0.5;
      if (outline && !insidePoly(cx, cz, outline)) continue;
      if (holes.some((hole) => insidePoly(cx, cz, hole))) continue;
      // Deterministically tear a few perimeter-adjacent cells.  The carrier
      // remains connected while its silhouette stops reading machine-cut.
      const edge = ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1;
      if (edge && noise01(ix + iz * nx + seed, suitSeed) < 0.23) continue;
      const a = vertex(xa, za); const b = vertex(xb, za);
      const c = vertex(xb, zb); const d = vertex(xa, zb);
      tri(a, c, b); tri(a, d, c);
    }
  }
  return makeGeometry(positions, uvs);
}

function clothSide(panel, suitSeed) {
  const {
    side, z0, z1, nz = 30, ny = 9, topAt, bottomAt, outAt, seed = 0,
  } = panel;
  const positions = [];
  const uvs = [];
  const vertex = (z, t) => {
    const top = topAt(z);
    const bottom = bottomAt(z);
    return [
      side * (outAt(z, t) + Math.sin(z * 5.3 + t * 8.1 + seed) * 0.008),
      THREE.MathUtils.lerp(bottom, top, t)
        + Math.sin(z * 6.7 + t * 4.9 + suitSeed * 0.23) * 0.008,
      z,
    ];
  };
  const tri = (a, b, c) => {
    for (const p of [a, b, c]) {
      positions.push(...p);
      uvs.push(p[2] * 0.72, p[1] * 0.72);
    }
  };
  for (let iz = 0; iz < nz; iz++) {
    const za = THREE.MathUtils.lerp(z0, z1, iz / nz);
    const zb = THREE.MathUtils.lerp(z0, z1, (iz + 1) / nz);
    for (let iy = 0; iy < ny; iy++) {
      if (iy === 0 && noise01(iz + seed, suitSeed + side) < 0.19) continue;
      const ta = iy / ny; const tb = (iy + 1) / ny;
      const a = vertex(za, ta); const b = vertex(zb, ta);
      const c = vertex(zb, tb); const d = vertex(za, tb);
      if (side > 0) { tri(a, b, c); tri(a, c, d); }
      else { tri(a, c, b); tri(a, d, c); }
    }
  }
  return makeGeometry(positions, uvs);
}

function clothFace(panel, suitSeed) {
  const {
    z, zAt = null, x0, x1, y0, y1, nx = 16, ny = 9, outline = null, holes = [], seed = 0,
  } = panel;
  const positions = [];
  const uvs = [];
  const vertex = (x, y) => [x, y,
    (zAt ? zAt(x, y) : z) + Math.sin(x * 7.3 + y * 6.1 + seed) * 0.010
      + Math.cos(x * 4.1 - y * 8.3 + suitSeed * 0.27) * 0.006];
  const tri = (a, b, c) => {
    for (const p of [a, b, c]) {
      positions.push(...p);
      uvs.push(p[0] * 0.72, p[1] * 0.72);
    }
  };
  for (let iy = 0; iy < ny; iy++) {
    const ya = THREE.MathUtils.lerp(y0, y1, iy / ny);
    const yb = THREE.MathUtils.lerp(y0, y1, (iy + 1) / ny);
    for (let ix = 0; ix < nx; ix++) {
      const xa = THREE.MathUtils.lerp(x0, x1, ix / nx);
      const xb = THREE.MathUtils.lerp(x0, x1, (ix + 1) / nx);
      const cx = (xa + xb) * 0.5; const cy = (ya + yb) * 0.5;
      if (outline && !insidePoly(cx, cy, outline)) continue;
      if (holes.some((hole) => insidePoly(cx, cy, hole))) continue;
      const edge = ix === 0 || iy === 0 || ix === nx - 1 || iy === ny - 1;
      if (edge && noise01(ix + iy * nx + seed, suitSeed) < 0.20) continue;
      const a = vertex(xa, ya); const b = vertex(xb, ya);
      const c = vertex(xb, yb); const d = vertex(xa, yb);
      tri(a, b, c); tri(a, c, d);
    }
  }
  return makeGeometry(positions, uvs);
}

function leafGeometry(scale, seed, style) {
  const { slab } = KIT;
  const wide = style === 'ulcans' ? 0.090 : style === 'nakidka' ? 0.075 : 0.064;
  const long = style === 'ulcans' ? 0.130 : style === 'nakidka' ? 0.145 : 0.165;
  const w = wide * scale * (0.82 + noise01(seed, 2) * 0.35);
  const d = long * scale * (0.82 + noise01(seed, 3) * 0.38);
  const h = 0.014 + noise01(seed, 4) * 0.012;
  const skew = (noise01(seed, 5) - 0.5) * 0.34;
  return slab(
    [-w * 0.58, 0, -d], [w, 0, -d * (0.18 + skew)],
    [w * 0.18, 0, d], [-w * (0.62 - skew), 0, d * 0.10],
    [-w * 0.58, h, -d], [w, h, -d * (0.18 + skew)],
    [w * 0.18, h, d], [-w * (0.62 - skew), h, d * 0.10],
  );
}

function addTopFoliage(outA, outB, panel, cfg, seedBase) {
  const { xform } = KIT;
  const stepX = cfg.style === 'nakidka' ? 0.38 : cfg.style === 'ulcans' ? 0.34 : 0.30;
  const stepZ = cfg.style === 'nakidka' ? 0.42 : 0.34;
  let n = 0;
  for (let z = panel.z0 + stepZ * 0.5; z < panel.z1; z += stepZ) {
    for (let x = panel.x0 + stepX * 0.5; x < panel.x1; x += stepX) {
      const seed = seedBase + n++;
      const px = x + (noise01(seed, 6) - 0.5) * stepX * 0.58;
      const pz = z + (noise01(seed, 7) - 0.5) * stepZ * 0.58;
      if (panel.outline && !insidePoly(px, pz, panel.outline)) continue;
      if ((panel.holes || []).some((hole) => insidePoly(px, pz, hole))) continue;
      if (noise01(seed, 8) > cfg.density) continue;
      const target = seed % 3 ? outA : outB;
      const count = cfg.style === 'leafy' ? 3 : 2;
      for (let k = 0; k < count; k++) {
        const s = (0.66 + noise01(seed, 20 + k) * 0.44) * cfg.leafScale;
        target.push(xform(leafGeometry(s, seed + k * 31, cfg.style),
          px + (noise01(seed, 30 + k) - 0.5) * 0.12,
          panel.yAt(px, pz) + 0.018 + k * 0.010,
          pz + (noise01(seed, 40 + k) - 0.5) * 0.12,
          (noise01(seed, 50 + k) - 0.5) * 0.16,
          noise01(seed, 60 + k) * Math.PI,
          (noise01(seed, 70 + k) - 0.5) * 0.15));
      }
    }
  }
}

function addSideFoliage(outA, outB, panel, cfg, seedBase) {
  const { xform } = KIT;
  const stepZ = cfg.style === 'nakidka' ? 0.40 : 0.32;
  let n = 0;
  for (let z = panel.z0 + stepZ * 0.5; z < panel.z1; z += stepZ) {
    for (const t0 of [0.18, 0.48, 0.78]) {
      const seed = seedBase + n++;
      if (noise01(seed, 9) > cfg.density) continue;
      const t = THREE.MathUtils.clamp(t0 + (noise01(seed, 10) - 0.5) * 0.18, 0.08, 0.94);
      const y = THREE.MathUtils.lerp(panel.bottomAt(z), panel.topAt(z), t);
      const x = panel.outAt(z, t) + 0.012;
      const target = seed % 3 ? outA : outB;
      for (let k = 0; k < (cfg.style === 'leafy' ? 3 : 2); k++) {
        const s = (0.62 + noise01(seed, 21 + k) * 0.46) * cfg.leafScale;
        target.push(xform(leafGeometry(s, seed + k * 37, cfg.style),
          panel.side * x,
          y + (noise01(seed, 31 + k) - 0.5) * 0.10,
          z + (noise01(seed, 41 + k) - 0.5) * 0.12,
          noise01(seed, 51 + k) * 0.6,
          0,
          panel.side * (Math.PI / 2 + (noise01(seed, 61 + k) - 0.5) * 0.22)));
      }
    }
  }
}

function addFaceFoliage(outA, outB, panel, cfg, seedBase) {
  const { xform } = KIT;
  const sx = 0.31; const sy = 0.26;
  let n = 0;
  for (let y = panel.y0 + sy * 0.5; y < panel.y1; y += sy) {
    for (let x = panel.x0 + sx * 0.5; x < panel.x1; x += sx) {
      const seed = seedBase + n++;
      const px = x + (noise01(seed, 11) - 0.5) * 0.13;
      const py = y + (noise01(seed, 12) - 0.5) * 0.10;
      if (panel.outline && !insidePoly(px, py, panel.outline)) continue;
      if ((panel.holes || []).some((hole) => insidePoly(px, py, hole))) continue;
      if (noise01(seed, 13) > cfg.density) continue;
      const target = seed % 2 ? outA : outB;
      const s = (0.66 + noise01(seed, 14) * 0.42) * cfg.leafScale;
      const pz = panel.zAt ? panel.zAt(px, py) : panel.z;
      target.push(xform(leafGeometry(s, seed, cfg.style), px, py, pz + 0.014,
        Math.PI / 2, noise01(seed, 15) * 0.25,
        (noise01(seed, 16) - 0.5) * 0.50));
    }
  }
}

function makeCloth(P, cfg, hex, key) {
  const mat = P.mats.canvasCloth.clone();
  mat.color.setHex(hex);
  mat.roughness = 1;
  mat.metalness = 0;
  mat.envMapIntensity = 0.08;
  mat.onBeforeCompile = vehicleAmbientFloorHook;
  mat.customProgramCacheKey = () => `vehicle-ghillie-${cfg.id}-${key}`;
  return mat;
}

function makeNet(P, cfg, owner) {
  const mat = makeCloth(P, cfg, 0xffffff, `${owner}-net`);
  let texture = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = cfg.netColor;
    ctx.lineWidth = cfg.style === 'ulcans' ? 1.8 : 1.25;
    ctx.lineCap = 'round';
    for (let row = 0; row < 12; row++) {
      const base = (row + 0.5) * 128 / 12 + (noise01(row, cfg.seed) - 0.5) * 5;
      ctx.beginPath(); ctx.moveTo(-4, base);
      for (let step = 0; step <= 12; step++) {
        const x = step * 11;
        ctx.lineTo(x, base + (noise01(row * 17 + step, cfg.seed + 2) - 0.5) * 9);
      }
      ctx.stroke();
    }
    for (let col = 0; col < 11; col++) {
      const base = (col + 0.5) * 128 / 11 + (noise01(col, cfg.seed + 4) - 0.5) * 6;
      ctx.beginPath(); ctx.moveTo(base, -4);
      for (let step = 0; step <= 12; step++) {
        const y = step * 11;
        ctx.lineTo(base + (noise01(col * 19 + step, cfg.seed + 6) - 0.5) * 10, y);
      }
      ctx.stroke();
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    mat.map = texture;
    mat.transparent = true;
    mat.alphaTest = 0.10;
    mat.side = THREE.DoubleSide;
    mat.needsUpdate = true;
  }
  return { mat, texture };
}

function addMerged(P, parent, geos, mat, name, extras = []) {
  if (!geos.length) {
    mat.dispose();
    for (const extra of extras) extra?.dispose?.();
    return;
  }
  const geo = KIT.mergeAll(geos);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  P.disposables.push(geo, mat, ...extras.filter(Boolean));
}

const t64HullY = (_x, z) => {
  if (z < -2.6) return 1.43;
  if (z < 1.55) return 1.39;
  if (z < 2.55) return 1.40 - (z - 1.55) * 0.20;
  return 1.20 - (z - 2.55) * 0.22;
};
const ptHullY = (_x, z) => {
  if (z < -2.0) return 1.61;
  if (z < 1.2) return 1.54;
  if (z < 2.4) return 1.54 - (z - 1.2) * 0.14;
  return 1.37 - (z - 2.4) * 0.17;
};
// PT-91A turret carrier surface. The old blanket used one y=0.88 plane,
// leaving up to 0.6 m of daylight over the cast shoulders and front wedge.
// This profile mirrors buildPT91Twardy's authored dome, ERAWA cheeks, flank
// bins and bustle while preserving the ghillie's small suspended air layer.
const pt91DomeProfile = Object.freeze([
  [0.03, 0.81], [0.38, 0.80], [0.72, 0.755], [1.00, 0.64],
  [1.18, 0.46], [1.26, 0.24],
]);
const pt91DomeY = (x, z) => {
  const r = Math.hypot(x, (z + 0.08) / 0.98);
  if (r <= pt91DomeProfile[0][0]) return pt91DomeProfile[0][1];
  for (let i = 1; i < pt91DomeProfile.length; i++) {
    const [r1, y1] = pt91DomeProfile[i];
    if (r <= r1) {
      const [r0, y0] = pt91DomeProfile[i - 1];
      return THREE.MathUtils.lerp(y0, y1, (r - r0) / (r1 - r0));
    }
  }
  return 0.20;
};
const pt91TurretCoverY = (x, z) => {
  const ax = Math.abs(x);
  let support = pt91DomeY(x, z);
  if (z < -1.04 && ax < 0.86) support = Math.max(support, 0.64); // bustle roof
  if (z >= -1.08 && z < -0.18 && ax > 0.82) support = Math.max(support, 0.61); // flank bins
  if (z >= 0.16 && z < 1.24 && ax > 0.24) {
    support = Math.max(support, 0.69 - Math.max(0, z - 0.62) * 0.065); // ERAWA wedge
  }
  return support + 0.030;
};
const pt91TurretSideTopY = (z) => {
  if (z < -1.05) return 0.67;
  if (z < -0.18) return 0.64;
  if (z < 0.58) return 0.66;
  return 0.66 - (z - 0.58) * 0.34;
};
const pt91TurretSideX = (z, t) => {
  let armorX;
  if (z < -1.05) armorX = 0.83;
  else if (z < 0.55) armorX = 1.31;
  else armorX = THREE.MathUtils.lerp(1.28, 0.78,
    THREE.MathUtils.clamp((z - 0.55) / 0.45, 0, 1));
  return armorX + (1 - t) * 0.032;
};
const pt91TurretFrontZ = (x, y) => 1.58
  - Math.max(0, Math.abs(x) - 0.20) * 0.61
  - Math.max(0, 0.40 - y) * 0.08;
const profileY = (stations, z) => {
  if (z <= stations[0][0]) return stations[0][1];
  for (let i = 1; i < stations.length; i++) {
    const [z1, y1] = stations[i];
    if (z <= z1) {
      const [z0, y0] = stations[i - 1];
      return THREE.MathUtils.lerp(y0, y1, (z - z0) / (z1 - z0));
    }
  }
  return stations.at(-1)[1];
};
const strv103aHullY = (_x, z) => profileY([
  [-3.20, 1.89], [-2.00, 1.93], [0.62, 1.90], [1.55, 1.75],
  [2.36, 1.62], [2.98, 1.52], [3.45, 1.54],
], z);
const strv103bHullY = (_x, z) => profileY([
  [-3.72, 1.57], [-2.75, 1.79], [0.75, 1.85], [1.60, 1.63],
  [2.61, 1.53], [3.22, 1.55],
], z);
const strv122HullY = (_x, z) => {
  const armorY = z < 1.45 ? 1.76 : 1.76 - (z - 1.45) * 0.12;
  // The Swedish cover is tied to a shallow support frame above the bow.
  // This clearance keeps the front drape outside the live 2A5-family shoe
  // wrap while still following the glacis angle.
  return armorY + 0.15;
};
const t84HullY = (_x, z) => {
  if (z < -4.25) return 1.40;
  if (z < 0.55) return 1.45;
  return 1.45 - (z - 0.55) * 0.15;
};
const oplotHullY = (_x, z) => (z < 1.45 ? 1.51 : 1.51 - (z - 1.45) * 0.15);
const abramsHullY = (x, z) => {
  const armorY = z < 2.0 ? 1.49 : 1.49 - (z - 2.0) * 0.17;
  // ULCANS is a supported multispectral screen, not a skin-tight paint
  // layer.  Its battens keep the deck span clear of the 1.51 m return run;
  // the outboard lift is higher where the cloth crosses the fender line.
  return armorY + (Math.abs(x) > 1.04 ? 0.18 : 0.08);
};
// Leopard 2A6 UA fitted camouflage carrier. The original blanket used a
// single y=.98 roof and z=2.72 face, leaving visible daylight over the 2A6M
// wedge. These profiles follow the authored roof tiers and the ruled cheek
// surface used by the UA ERA package. Values are turret-local metres.
const leo2A6UAFrontLowerZ = (x) => profileY([
  [0.32, 2.70], [0.40, 2.64], [0.94, 2.26], [1.30, 1.96],
], Math.abs(x));
const leo2A6UAFrontUpperZ = (x) => profileY([
  [0.32, 2.02], [0.55, 1.87], [0.90, 1.62], [1.08, 1.40], [1.30, 1.16],
], Math.abs(x));
const leo2A6UAFrontArmorZ = (x, y) => THREE.MathUtils.lerp(
  leo2A6UAFrontLowerZ(x),
  leo2A6UAFrontUpperZ(x),
  THREE.MathUtils.clamp((y - 0.16) / 0.46, 0, 1),
);
const leo2A6UAFrontNetZ = (x, y) => leo2A6UAFrontArmorZ(x, y) + 0.065;
const leo2A6UAFrontRoofY = (x, z) => {
  const armorY = profileY([
    [0.46, 0.655], [0.72, 0.620], [1.20, 0.535], [1.68, 0.425], [2.18, 0.430],
  ], z);
  return armorY - Math.max(0, Math.abs(x) - 0.92) * 0.035 + 0.026;
};
const leo2A6UAMidRoofY = (x, z) => {
  const armorY = z < -0.96 ? 0.78 : 0.75;
  return armorY - Math.max(0, Math.abs(x) - 0.72) * 0.055 + 0.026;
};
const leo2A6UARearRoofY = (_x, z) => profileY([
  [-3.34, 0.62], [-3.02, 0.64], [-2.30, 0.66], [-1.58, 0.78],
], z) + 0.026;
const jpzE100HullY = (_x, z) => {
  if (z > 0.76) return 1.94;
  if (z > -0.50) return 2.76 + (0.76 - z) * 0.15;
  if (z > -1.20) return 2.95 + (-0.50 - z) * 0.30;
  if (z > -3.00) return 3.16 + (-1.20 - z) * 0.078;
  return 3.30;
};

export const GHILLIE_SUIT_CONFIGS = Object.freeze({
  jpz_e100: {
    id: 'jpz_e100', seed: 1700, style: 'leafy', density: 0.86, leafScale: 1.02,
    light: 0x697853, dark: 0x33452f, netColor: 'rgba(37,52,33,0.82)',
    hull: {
      top: [{
        x0: -1.10, x1: 1.10, z0: -3.76, z1: 2.82, nx: 24, nz: 54,
        yAt: (x, z) => jpzE100HullY(x, z) + 0.055,
        outline: [[-0.88, -3.76], [0.88, -3.76], [1.02, -2.90], [1.04, 0.72],
          [1.10, 1.16], [1.08, 2.34], [0.86, 2.82], [-0.86, 2.82],
          [-1.08, 2.34], [-1.10, 1.16], [-1.04, 0.72], [-1.02, -2.90]],
        // Keep the complete cannon recoil lane, hatches and remote station
        // serviceable. The side blankets supply the dense visual coverage.
        holes: [rect(-0.55, 0.55, 0.48, 2.94), rect(0.20, 1.00, -1.55, -0.55),
          rect(-0.98, -0.24, -2.28, -1.45)],
        seed: 301,
      }],
      side: [-1, 1].map((side) => ({
        side, z0: -3.68, z1: 2.58, nz: 46, ny: 10,
        topAt: (z) => jpzE100HullY(0, z) + 0.03,
        bottomAt: (z) => 1.55 + Math.sin(z * 2.7) * 0.030,
        // The cloth hangs from the cage and skirt battens, outside both the
        // linked track corridor and the structural casemate side.
        outAt: (_z, t) => 1.56 + (1 - t) * 0.040,
        seed: 311 + side,
      })),
    },
  },
  ua_t64bv: {
    id: 'ua_t64bv', seed: 640, style: 'leafy', density: 0.92, leafScale: 1.04,
    light: 0x6f7d48, dark: 0x33452d, netColor: 'rgba(38,54,29,0.76)',
    hull: {
      top: [{ x0: -1.50, x1: 1.50, z0: -3.12, z1: 3.18, nx: 24, nz: 48,
        yAt: t64HullY,
        outline: [[-1.08, -3.12], [1.08, -3.12], [1.50, -2.70], [1.50, 2.35], [0.95, 3.18], [-0.95, 3.18], [-1.50, 2.35], [-1.50, -2.70]],
        holes: [rect(-1.38, 1.38, -1.92, 1.20), rect(-0.22, 0.22, 0.94, 1.52)], seed: 3 }],
      side: [-1, 1].map((side) => ({ side, z0: -2.72, z1: 2.55, nz: 38, ny: 9,
        topAt: (z) => t64HullY(0, z), bottomAt: (z) => 0.69 + Math.sin(z * 3.1) * 0.035,
        outAt: (_z, t) => 1.72 + (1 - t) * 0.055, seed: 10 + side })),
      face: [{ z: 3.31, x0: -1.05, x1: 1.05, y0: 0.70, y1: 1.20, nx: 14, ny: 6,
        outline: [[-0.88, 0.70], [0.88, 0.70], [1.05, 0.90], [0.82, 1.20], [-0.82, 1.20], [-1.05, 0.90]], seed: 17 }],
    },
    turret: {
      top: [{ x0: -1.16, x1: 1.16, z0: -1.65, z1: 1.10, nx: 20, nz: 26,
        yAt: () => 0.78,
        outline: [[-0.72, -1.65], [0.72, -1.65], [1.16, -0.78], [1.12, 0.54], [0.66, 1.10], [-0.66, 1.10], [-1.12, 0.54], [-1.16, -0.78]],
        holes: [rect(-0.96, -0.36, -0.42, 0.22), rect(0.18, 0.76, -0.40, 0.18), rect(-0.67, -0.20, 0.62, 1.12)], seed: 29 }],
      side: [-1, 1].map((side) => ({ side, z0: -1.55, z1: 0.83, nz: 24, ny: 7,
        topAt: () => 0.73, bottomAt: (z) => 0.10 + Math.sin(z * 4.2) * 0.025,
        outAt: (z, t) => (z < -0.70 ? 1.02 : 1.25) + (1 - t) * 0.035, seed: 37 + side })),
      face: [{ z: 1.20, x0: -1.12, x1: 1.12, y0: 0.08, y1: 0.70, nx: 18, ny: 8,
        outline: [[-0.82, 0.08], [0.82, 0.08], [1.12, 0.36], [0.78, 0.70], [-0.78, 0.70], [-1.12, 0.36]],
        holes: [rect(-0.42, 0.42, 0.04, 0.64), rect(-0.72, -0.20, 0.48, 0.76)], seed: 43 }],
    },
  },
  pt91_twardy: {
    id: 'pt91_twardy', seed: 911, style: 'leafy', density: 0.86, leafScale: 0.92,
    light: 0x71835a, dark: 0x374a35, netColor: 'rgba(43,58,35,0.76)',
    hull: {
      top: [{ x0: -1.55, x1: 1.55, z0: -3.15, z1: 3.22, nx: 24, nz: 48,
        yAt: ptHullY,
        outline: [[-1.10, -3.15], [1.10, -3.15], [1.55, -2.70], [1.55, 2.40], [1.00, 3.22], [-1.00, 3.22], [-1.55, 2.40], [-1.55, -2.70]],
        holes: [rect(-1.43, 1.43, -1.82, 1.42), rect(-0.24, 0.24, 0.96, 1.52)], seed: 5 }],
      side: [-1, 1].map((side) => ({ side, z0: -2.65, z1: 2.58, nz: 38, ny: 9,
        topAt: (z) => ptHullY(0, z), bottomAt: (z) => 0.63 + Math.sin(z * 2.8) * 0.035,
        outAt: (_z, t) => 1.80 + (1 - t) * 0.045, seed: 13 + side })),
      face: [{ z: 3.48, x0: -1.08, x1: 1.08, y0: 0.82, y1: 1.28, nx: 14, ny: 6,
        outline: [[-0.88, 0.82], [0.88, 0.82], [1.08, 1.00], [0.78, 1.28], [-0.78, 1.28], [-1.08, 1.00]], seed: 19 }],
    },
    turret: {
      top: [{ x0: -1.17, x1: 1.17, z0: -1.65, z1: 1.25, nx: 26, nz: 34,
        yAt: pt91TurretCoverY,
        outline: [[-0.82, -1.65], [0.82, -1.65], [1.17, -0.72], [1.10, 0.52], [0.62, 1.25], [-0.62, 1.25], [-1.10, 0.52], [-1.17, -0.72]],
        holes: [rect(-0.94, -0.34, -0.46, 0.14), rect(0.24, 0.82, -0.42, 0.10),
          rect(-0.48, 0.48, 0.52, 1.30), rect(0.28, 0.78, 0.48, 1.02)], seed: 31 }],
      side: [-1, 1].map((side) => ({ side, z0: -1.58, z1: 1.00, nz: 28, ny: 8,
        topAt: pt91TurretSideTopY, bottomAt: (z) => 0.13 + Math.sin(z * 4.0) * 0.025,
        outAt: pt91TurretSideX, seed: 41 + side })),
      face: [{ z: 1.45, x0: -1.15, x1: 1.15, y0: 0.10, y1: 0.72, nx: 18, ny: 8,
        zAt: pt91TurretFrontZ,
        outline: [[-0.76, 0.10], [0.76, 0.10], [1.15, 0.34], [0.78, 0.72], [-0.78, 0.72], [-1.15, 0.34]],
        holes: [rect(-0.44, 0.44, 0.02, 0.67)], seed: 47 }],
    },
  },
  strv103a: {
    id: 'strv103a', seed: 1031, style: 'leafy', density: 0.82, leafScale: 0.90,
    light: 0x667a43, dark: 0x32452b, netColor: 'rgba(39,55,31,0.80)',
    hull: {
      top: [{ x0: -1.66, x1: 1.66, z0: -3.30, z1: 3.46, nx: 26, nz: 52,
        yAt: strv103aHullY,
        outline: [[-1.30, -3.30], [1.30, -3.30], [1.66, -2.65], [1.65, 2.40], [1.16, 3.46], [-1.16, 3.46], [-1.65, 2.40], [-1.66, -2.65]],
        holes: [rect(-0.27, 0.27, 0.78, 3.58), rect(0.03, 0.91, -1.30, 0.12), rect(-0.90, -0.28, -1.22, -0.46)], seed: 71 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.12, z1: 2.78, nz: 42, ny: 7,
        topAt: (z) => strv103aHullY(0, z) - 0.02,
        bottomAt: (z) => 1.34 + Math.sin(z * 2.7) * 0.028,
        outAt: (_z, t) => 1.84 + (1 - t) * 0.030, seed: 79 + side })),
    },
  },
  strv103: {
    id: 'strv103', seed: 1032, style: 'leafy', density: 0.88, leafScale: 0.92,
    light: 0x65783f, dark: 0x304329, netColor: 'rgba(37,53,29,0.80)',
    hull: {
      top: [{ x0: -1.66, x1: 1.66, z0: -3.76, z1: 3.24, nx: 26, nz: 54,
        yAt: strv103bHullY,
        outline: [[-1.42, -3.76], [1.42, -3.76], [1.66, -2.70], [1.64, 2.35], [0.92, 3.24], [-0.92, 3.24], [-1.64, 2.35], [-1.66, -2.70]],
        holes: [rect(-0.28, 0.28, 0.76, 3.36), rect(-0.22, 0.92, -0.88, 0.20), rect(-0.98, -0.30, -1.44, -0.72)], seed: 87 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.58, z1: 2.72, nz: 44, ny: 7,
        topAt: (z) => strv103bHullY(0, z) - 0.02,
        bottomAt: (z) => 1.31 + Math.sin(z * 2.5) * 0.026,
        outAt: (_z, t) => 1.87 + (1 - t) * 0.028, seed: 93 + side })),
    },
  },
  strv122: {
    id: 'strv122', seed: 1220, style: 'leafy', density: 0.78, leafScale: 0.92,
    disabled: true,
    light: 0x657845, dark: 0x31422d, netColor: 'rgba(39,53,31,0.80)',
    hull: {
      top: [{ x0: -1.72, x1: 1.72, z0: -3.62, z1: 3.70, nx: 26, nz: 54,
        yAt: strv122HullY,
        outline: [[-1.36, -3.62], [1.36, -3.62], [1.72, -3.10], [1.72, 2.68], [1.10, 3.70], [-1.10, 3.70], [-1.72, 2.68], [-1.72, -3.10]],
        holes: [rect(-1.47, 1.47, -2.35, 1.42), rect(-0.24, 0.24, 1.04, 1.72)], seed: 101 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.10, z1: 3.05, nz: 42, ny: 8,
        topAt: (z) => strv122HullY(0, z), bottomAt: (z) => 1.54 + Math.sin(z * 2.4) * 0.025,
        outAt: (_z, t) => 1.91 + (1 - t) * 0.035, seed: 109 + side })),
    },
    turret: {
      top: [{ x0: -1.48, x1: 1.48, z0: -3.12, z1: 1.42, nx: 24, nz: 38,
        yAt: () => 1.08,
        outline: [[-1.08, -3.12], [1.08, -3.12], [1.48, -2.10], [1.42, 0.55], [0.90, 1.42], [-0.90, 1.42], [-1.42, 0.55], [-1.48, -2.10]],
        holes: [rect(-1.10, -0.38, -0.72, 0.10), rect(0.14, 0.88, -0.65, 0.12), rect(-0.36, 0.36, 0.62, 1.50)], seed: 117 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.02, z1: 0.92, nz: 32, ny: 8,
        topAt: () => 1.02, bottomAt: (z) => 0.10 + Math.sin(z * 3.1) * 0.024,
        outAt: (z, t) => (z < -1.65 ? 1.38 : 1.70) + (1 - t) * 0.030, seed: 125 + side })),
      face: [{ z: 1.55, x0: -1.38, x1: 1.38, y0: 0.02, y1: 0.92, nx: 20, ny: 9,
        outline: [[-1.02, 0.02], [1.02, 0.02], [1.38, 0.40], [0.96, 0.92], [-0.96, 0.92], [-1.38, 0.40]],
        holes: [rect(-0.50, 0.50, -0.04, 0.82)], seed: 133 }],
    },
  },
  t84: {
    id: 't84', seed: 840, style: 'leafy', density: 0.84, leafScale: 0.92,
    foliage: false,
    light: 0x68784d, dark: 0x35452f, netColor: 'rgba(42,56,34,0.80)',
    hull: {
      top: [{ x0: -1.56, x1: 1.56, z0: -4.60, z1: 2.08, nx: 24, nz: 52,
        yAt: t84HullY,
        outline: [[-1.18, -4.60], [1.18, -4.60], [1.56, -4.05], [1.56, 1.52], [1.04, 2.08], [-1.04, 2.08], [-1.56, 1.52], [-1.56, -4.05]],
        holes: [rect(-1.36, 1.36, -2.42, 0.86), rect(-0.22, 0.22, 0.72, 1.42)], seed: 141 }],
      side: [-1, 1].map((side) => ({ side, z0: -4.15, z1: 1.78, nz: 42, ny: 8,
        topAt: (z) => t84HullY(0, z), bottomAt: (z) => 1.18 + Math.sin(z * 2.7) * 0.025,
        outAt: (_z, t) => 1.82 + (1 - t) * 0.040, seed: 149 + side })),
    },
    turret: {
      top: [{ x0: -1.16, x1: 1.16, z0: -1.96, z1: 1.62, nx: 20, nz: 30,
        yAt: () => 0.89,
        outline: [[-0.80, -1.96], [0.80, -1.96], [1.16, -1.02], [1.13, 0.86], [0.68, 1.62], [-0.68, 1.62], [-1.13, 0.86], [-1.16, -1.02]],
        holes: [rect(-0.94, -0.28, -0.54, 0.18), rect(0.18, 0.86, -0.52, 0.18), rect(-0.34, 0.34, 0.78, 1.70)], seed: 157 }],
      side: [-1, 1].map((side) => ({ side, z0: -1.88, z1: 1.08, nz: 26, ny: 7,
        topAt: () => 0.82, bottomAt: (z) => -0.03 + Math.sin(z * 3.6) * 0.025,
        outAt: (z, t) => (z < -0.85 ? 1.04 : 1.31) + (1 - t) * 0.035, seed: 165 + side })),
      face: [{ z: 1.94, x0: -1.12, x1: 1.12, y0: -0.06, y1: 0.72, nx: 18, ny: 8,
        outline: [[-0.80, -0.06], [0.80, -0.06], [1.12, 0.30], [0.76, 0.72], [-0.76, 0.72], [-1.12, 0.30]],
        holes: [rect(-0.46, 0.46, -0.10, 0.65)], seed: 173 }],
    },
  },
  ua_t84_oplot_m: {
    id: 'ua_t84_oplot_m', seed: 8420, style: 'leafy', density: 0.90, leafScale: 0.96,
    disabled: true,
    light: 0x708055, dark: 0x354830, netColor: 'rgba(43,59,35,0.82)',
    hull: {
      top: [{ x0: -1.65, x1: 1.65, z0: -3.42, z1: 3.46, nx: 26, nz: 52,
        yAt: oplotHullY,
        outline: [[-1.24, -3.42], [1.24, -3.42], [1.65, -2.94], [1.65, 2.62], [1.04, 3.46], [-1.04, 3.46], [-1.65, 2.62], [-1.65, -2.94]],
        holes: [rect(-1.48, 1.48, -2.08, 1.36), rect(-0.24, 0.24, 1.04, 1.58)], seed: 181 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.10, z1: 3.02, nz: 42, ny: 8,
        topAt: (z) => oplotHullY(0, z), bottomAt: (z) => 1.20 + Math.sin(z * 2.7) * 0.025,
        outAt: (_z, t) => 1.95 + (1 - t) * 0.045, seed: 189 + side })),
    },
    turret: {
      top: [{ x0: -1.46, x1: 1.46, z0: -2.12, z1: 2.10, nx: 24, nz: 34,
        yAt: () => 0.91,
        outline: [[-1.00, -2.12], [1.00, -2.12], [1.46, -1.14], [1.44, 1.18], [0.74, 2.10], [-0.74, 2.10], [-1.44, 1.18], [-1.46, -1.14]],
        holes: [rect(-1.05, -0.32, -0.60, 0.18), rect(0.24, 0.96, -0.62, 0.16), rect(-0.40, 0.40, 1.08, 2.18)], seed: 197 }],
      side: [-1, 1].map((side) => ({ side, z0: -2.04, z1: 1.42, nz: 28, ny: 8,
        topAt: () => 0.84, bottomAt: (z) => 0.04 + Math.sin(z * 3.4) * 0.024,
        outAt: (z, t) => (z < -1.08 ? 1.18 : 1.63) + (1 - t) * 0.034, seed: 205 + side })),
      face: [{ z: 2.28, x0: -1.32, x1: 1.32, y0: 0.00, y1: 0.80, nx: 20, ny: 8,
        outline: [[-0.92, 0.00], [0.92, 0.00], [1.32, 0.34], [0.84, 0.80], [-0.84, 0.80], [-1.32, 0.34]],
        holes: [rect(-0.50, 0.50, -0.04, 0.72)], seed: 213 }],
    },
  },
  m1a2_sepv3: {
    id: 'm1a2_sepv3', seed: 123, style: 'ulcans', density: 0.76, leafScale: 0.96,
    light: 0x7a795b, dark: 0x3d4636, netColor: 'rgba(50,55,43,0.82)',
    hull: {
      top: [{ x0: -1.66, x1: 1.66, z0: -3.62, z1: 3.62, nx: 26, nz: 54,
        yAt: abramsHullY,
        outline: [[-1.22, -3.62], [1.22, -3.62], [1.66, -3.12], [1.66, 2.65], [1.04, 3.62], [-1.04, 3.62], [-1.66, 2.65], [-1.66, -3.12]],
        holes: [rect(-1.57, 1.57, -2.85, 1.72), rect(-0.27, 0.27, 0.92, 1.65), rect(-1.52, -0.65, -3.58, -2.15)], seed: 9 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.08, z1: 3.04, nz: 42, ny: 9,
        topAt: (z) => abramsHullY(0, z), bottomAt: (z) => 0.72 + Math.sin(z * 2.5) * 0.030,
        // ULCANS hangs from stand-off battens outside the skirt rather than
        // lying in the live SEPv3 shoe/pin envelope (outer x ~= 1.72 m).
        // Keep the lower hem farther out so suspension travel cannot pull a
        // shoe through the cloth while the upper edge still reads attached.
        outAt: (_z, t) => 1.92 + (1 - t) * 0.090, seed: 21 + side })),
      face: [{ z: 3.93, x0: -1.10, x1: 1.10, y0: 0.96, y1: 1.31, nx: 14, ny: 5,
        outline: [[-0.88, 0.96], [0.88, 0.96], [1.10, 1.12], [0.72, 1.31], [-0.72, 1.31], [-1.10, 1.12]],
        holes: [rect(-0.78, -0.42, 1.04, 1.29), rect(0.42, 0.78, 1.04, 1.29)], seed: 29 }],
    },
    turret: {
      top: [{ x0: -1.42, x1: 1.42, z0: -3.35, z1: 1.12, nx: 24, nz: 38,
        yAt: () => 0.88,
        outline: [[-1.05, -3.35], [1.05, -3.35], [1.42, -2.32], [1.36, 0.38], [0.86, 1.12], [-0.86, 1.12], [-1.36, 0.38], [-1.42, -2.32]],
        holes: [rect(-1.26, -0.48, -0.86, 0.02), rect(-0.52, 0.05, 0.06, 0.55), rect(0.16, 0.83, -0.64, 0.06), rect(-1.28, -0.70, -2.92, -1.70), rect(0.68, 1.30, -2.84, -1.62)], seed: 37 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.20, z1: 0.80, nz: 32, ny: 8,
        topAt: () => 0.80, bottomAt: (z) => 0.02 + Math.sin(z * 3.2) * 0.024,
        outAt: (z, t) => (z < -1.65 ? 1.52 : 1.68) + (1 - t) * 0.028, seed: 51 + side })),
      face: [{ z: 1.38, x0: -1.36, x1: 1.36, y0: -0.02, y1: 0.76, nx: 20, ny: 8,
        outline: [[-1.00, -0.02], [1.00, -0.02], [1.36, 0.40], [0.96, 0.76], [-0.96, 0.76], [-1.36, 0.40]],
        holes: [rect(-0.52, 0.52, -0.06, 0.68), rect(-1.22, -0.78, 0.44, 0.78), rect(0.78, 1.22, 0.44, 0.78)], seed: 61 }],
    },
  },
  ua_m1a1: {
    id: 'ua_m1a1', seed: 1101, style: 'leafy', density: 0.94, leafScale: 1.02,
    light: 0x737b4d, dark: 0x35472f, netColor: 'rgba(39,54,32,0.84)',
    hull: {
      top: [{ x0: -1.68, x1: 1.68, z0: -3.62, z1: 3.62, nx: 28, nz: 56,
        yAt: abramsHullY,
        outline: [[-1.22, -3.62], [1.22, -3.62], [1.68, -3.12], [1.68, 2.65], [1.04, 3.62], [-1.04, 3.62], [-1.68, 2.65], [-1.68, -3.12]],
        holes: [rect(-1.58, 1.58, -2.88, 1.72), rect(-0.30, 0.30, 0.86, 1.70)], seed: 221 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.18, z1: 3.08, nz: 44, ny: 10,
        topAt: (z) => abramsHullY(0, z), bottomAt: (z) => 0.72 + Math.sin(z * 2.6) * 0.034,
        outAt: (_z, t) => 1.94 + (1 - t) * 0.10, seed: 229 + side })),
      face: [{ z: 3.94, x0: -1.12, x1: 1.12, y0: 0.96, y1: 1.33, nx: 16, ny: 6,
        outline: [[-0.90, 0.96], [0.90, 0.96], [1.12, 1.12], [0.74, 1.33], [-0.74, 1.33], [-1.12, 1.12]],
        holes: [rect(-0.80, -0.40, 1.03, 1.31), rect(0.40, 0.80, 1.03, 1.31)], seed: 237 }],
    },
    // A second carrier drapes over the full field-cage envelope rather than
    // clipping into the Abrams cheeks. It follows the turret rig and keeps a
    // generous center opening for gun elevation and recoil.
    turret: {
      top: [{ x0: -2.10, x1: 2.10, z0: -3.42, z1: 2.66, nx: 34, nz: 48,
        yAt: (x, z) => 1.38 + Math.cos(x * 1.2) * 0.012 - Math.max(0, z - 1.5) * 0.10,
        outline: [[-1.72, -3.42], [1.72, -3.42], [2.10, -2.82], [2.02, 1.80], [1.58, 2.66], [0.54, 2.66], [0.54, 1.82], [-0.54, 1.82], [-0.54, 2.66], [-1.58, 2.66], [-2.02, 1.80], [-2.10, -2.82]],
        holes: [rect(-0.54, 0.54, 1.62, 2.74), rect(-0.48, 0.48, 0.80, 1.70)], seed: 245 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.38, z1: 2.46, nz: 42, ny: 10,
        topAt: (z) => 1.36 - Math.max(0, z - 1.5) * 0.09,
        bottomAt: (z) => 0.12 + Math.sin(z * 3.0) * 0.032,
        outAt: (_z, t) => 2.10 + (1 - t) * 0.045, seed: 253 + side })),
      face: [{ z: 2.72, x0: -1.98, x1: 1.98, y0: 0.16, y1: 1.18, nx: 28, ny: 10,
        outline: [[-1.88, 0.16], [1.88, 0.16], [1.98, 0.82], [1.48, 1.18], [0.54, 1.18], [0.54, 0.24], [-0.54, 0.24], [-0.54, 1.18], [-1.48, 1.18], [-1.98, 0.82]],
        holes: [rect(-0.56, 0.56, 0.12, 1.22)], seed: 261 }],
    },
  },
  leo2a6_ua: {
    id: 'leo2a6_ua', seed: 2606, style: 'leafy', density: 0.99, leafScale: 1.04,
    light: 0x747b50, dark: 0x34452f, netColor: 'rgba(38,53,32,0.86)',
    hull: {
      top: [
        { x0: -1.86, x1: 1.86, z0: -3.54, z1: -1.28, nx: 30, nz: 24,
          yAt: (x, z) => 1.91 + Math.cos(x * 1.7 + z) * 0.016,
          outline: [[-1.42, -3.54], [1.42, -3.54], [1.86, -3.12], [1.86, -1.28], [-1.86, -1.28], [-1.86, -3.12]],
          holes: [rect(-1.18, -0.35, -3.18, -2.08), rect(0.35, 1.18, -3.18, -2.08)], seed: 271 },
        { x0: -1.88, x1: 1.88, z0: 1.24, z1: 3.18, nx: 30, nz: 22,
          yAt: (x, z) => 1.77 - Math.max(0, z - 2.08) * 0.30 + Math.cos(x * 2.0) * 0.012,
          outline: [[-1.88, 1.24], [1.88, 1.24], [1.84, 2.66], [1.18, 3.18], [-1.18, 3.18], [-1.84, 2.66]],
          holes: [rect(0.35, 0.92, 1.25, 1.75)], seed: 277 },
      ],
      side: [-1, 1].map((side) => ({ side, z0: -3.34, z1: 3.28, nz: 50, ny: 11,
        topAt: (z) => z > 2.08 ? 1.76 - (z - 2.08) * 0.28 : 1.78,
        bottomAt: (z) => 0.69 + Math.sin(z * 3.1) * 0.034,
        outAt: (_z, t) => 2.25 + (1 - t) * 0.055, seed: 283 + side })),
      face: [{ z: 3.16, x0: -0.90, x1: 0.90, y0: 0.82, y1: 1.40, nx: 14, ny: 8,
        outline: [[-0.76, 0.82], [0.76, 0.82], [0.90, 1.00], [0.72, 1.40], [-0.72, 1.40], [-0.90, 1.00]],
        holes: [], seed: 291 }],
    },
    turret: {
      top: [
        { x0: -1.34, x1: 1.34, z0: -3.34, z1: -1.54, nx: 26, nz: 18,
          yAt: leo2A6UARearRoofY,
          outline: [[-1.02, -3.34], [1.02, -3.34], [1.34, -3.00], [1.30, -1.54], [-1.30, -1.54], [-1.34, -3.00]],
          holes: [rect(-1.17, -0.46, -2.24, -1.30), rect(0.34, 1.04, -2.08, -1.18)],
          seatGapM: 0.026, seat: 'bustle-roof', seed: 299 },
        { x0: -1.03, x1: 1.03, z0: -1.58, z1: 0.54, nx: 24, nz: 22,
          yAt: leo2A6UAMidRoofY,
          outline: [[-0.86, -1.58], [0.86, -1.58], [1.03, -0.94], [1.00, 0.54], [-1.00, 0.54], [-1.03, -0.94]],
          holes: [rect(-0.94, -0.34, -0.92, -0.22), rect(0.30, 0.94, -0.80, -0.08),
            rect(0.32, 0.96, 0.02, 0.52)],
          seatGapM: 0.026, seat: 'main-roof', seed: 303 },
        ...[-1, 1].map((side) => ({
          x0: side < 0 ? -1.30 : 0.22, x1: side < 0 ? -0.22 : 1.30,
          z0: 0.46, z1: 2.18, nx: 13, nz: 20,
          yAt: leo2A6UAFrontRoofY,
          outline: side < 0
            ? [[-1.02, 0.46], [-0.28, 0.46], [-0.22, 2.18], [-0.54, 2.18], [-1.30, 1.42]]
            : [[0.28, 0.46], [1.02, 0.46], [1.30, 1.42], [0.54, 2.18], [0.22, 2.18]],
          holes: side > 0 ? [rect(0.36, 0.96, 0.46, 0.82)] : [],
          seatGapM: 0.026, seat: 'front-crown', seed: 311 + side,
        })),
      ],
      side: [-1, 1].map((side) => ({ side, z0: -3.44, z1: 2.28, nz: 44, ny: 11,
        topAt: (z) => 0.96 - Math.max(0, z - 1.15) * 0.11,
        bottomAt: (z) => 0.02 + Math.sin(z * 3.4) * 0.030,
        outAt: (_z, t) => 1.89 + (1 - t) * 0.045, seed: 307 + side })),
      face: [-1, 1].map((side) => ({
        z: 0, zAt: leo2A6UAFrontNetZ,
        x0: side < 0 ? -1.32 : 0.34, x1: side < 0 ? -0.34 : 1.32,
        y0: 0.16, y1: 0.62, nx: 14, ny: 8,
        outline: side < 0
          ? [[-1.30, 0.16], [-0.36, 0.16], [-0.34, 0.62], [-1.24, 0.62]]
          : [[0.36, 0.16], [1.30, 0.16], [1.24, 0.62], [0.34, 0.62]],
        holes: [], seatGapM: 0.065, seat: 'cheek-era-face', seed: 317 + side,
      })),
    },
    gun: {
      top: [{ x0: -0.22, x1: 0.22, z0: 0.48, z1: 5.72, nx: 8, nz: 46,
        yAt: (x, z) => 0.17 + Math.cos(z * 3.0 + x) * 0.012,
        outline: [[-0.18, 0.48], [0.18, 0.48], [0.22, 1.55], [0.15, 5.72], [-0.15, 5.72], [-0.22, 1.55]], seed: 331 }],
      side: [-1, 1].map((side) => ({ side, z0: 0.50, z1: 5.72, nz: 44, ny: 5,
        topAt: () => 0.16, bottomAt: () => -0.16,
        outAt: (z, t) => (z < 2.30 ? 0.22 : 0.16) + (1 - t) * 0.018,
        seed: 337 + side })),
    },
  },
});

export function addVehicleGhillieSuit(P) {
  const cfg = GHILLIE_SUIT_CONFIGS[P.spec.id];
  if (!cfg || cfg.disabled) return false;

  for (const [owner, parent] of [['hull', P.hullG], ['turret', P.turretG], ['gun', P.gunG]]) {
    const panels = cfg[owner];
    if (!panels) continue;
    const net = [];
    const light = [];
    const dark = [];
    let panelIndex = 0;
    for (const panel of panels.top || []) {
      net.push(clothTop(panel, cfg.seed));
      if (cfg.foliage !== false) {
        addTopFoliage(light, dark, panel, cfg, cfg.seed + panelIndex * 1000);
      }
      panelIndex++;
    }
    for (const panel of panels.side || []) {
      net.push(clothSide(panel, cfg.seed));
      if (cfg.foliage !== false) {
        addSideFoliage(light, dark, panel, cfg, cfg.seed + panelIndex * 1000);
      }
      panelIndex++;
    }
    for (const panel of panels.face || []) {
      net.push(clothFace(panel, cfg.seed));
      if (cfg.foliage !== false) {
        addFaceFoliage(light, dark, panel, cfg, cfg.seed + panelIndex * 1000);
      }
      panelIndex++;
    }

    const netPack = makeNet(P, cfg, owner);
    addMerged(P, parent, net, netPack.mat, `${cfg.id}_ghillie_${owner}_net`, [netPack.texture]);
    addMerged(P, parent, light, makeCloth(P, cfg, cfg.light, `${owner}-light`),
      `${cfg.id}_ghillie_${owner}_light`);
    addMerged(P, parent, dark, makeCloth(P, cfg, cfg.dark, `${owner}-dark`),
      `${cfg.id}_ghillie_${owner}_dark`);
  }
  return true;
}
