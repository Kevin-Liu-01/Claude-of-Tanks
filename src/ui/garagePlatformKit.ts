import * as THREE from 'three';

import type { GarageVariant } from '../game/garageVariants.ts';
import { GARAGE_PLATFORM_GEOMETRY } from '../game/garagePresentationPose.ts';
import { KitBuilder, kitRandom } from './garageKitGeometry.ts';
import { garageKitSkin } from './garageKitSkins.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';

/**
 * K6, the platform (garage r9). The turntable's contract does not change (deck r 6.0, base r 6.35, top 0.36 m, the
 * hero pose): this kit dresses it.
 *
 * - The DECK: a segmented steel deck painted once per session at Garage idle (1024 px albedo, 512 px normal): three
 *   concentric plate rings, radial seams every 15 degrees, countersunk bolt rows, a machined hub plate, anti-slip
 *   texture, worn datum marks, and faint track-pad scuffs only along the hero's track axis. Every Garage shares it,
 *   tinted by its platformTint.
 * - The SLEWING RING: a dark 30 mm gap and a polished steel ring at r 6.0, so the deck reads as turning in a fixed collar.
 * - The COLLAR (r 6.0-6.35, its side face and top bevel): one finish per Garage, cached per Garage. The black and
 *   yellow hazard stripe survives only in Verdant, as worn chevrons on yellow epoxy.
 * - 48 warm LED pucks set in the collar top (atlas lenses), replacing the emissive torus rim.
 * - A cable-trench cover from the collar to the control pedestal, a small lectern with a touchscreen, front-left at
 *   r ~7.5 m, outside the hero's halo.
 *
 * Budget: 3,000 triangles beside the stage (outside the pack cap), no new programs (the collar rides the vertex-colour
 * key, the pucks and the touchscreen the DISPLAY-LIT key, the deck the standard map + normal key).
 */

const GARAGE_PLATFORM_DECK_R = GARAGE_PLATFORM_GEOMETRY.deckRadiusM;
const GARAGE_PLATFORM_BASE_R = GARAGE_PLATFORM_GEOMETRY.baseRadiusM;
const GARAGE_PLATFORM_TOP_Y = GARAGE_PLATFORM_GEOMETRY.topYM;

type GaragePlatformCollarKind =
  | 'epoxy-chevron' | 'galvanised' | 'granite' | 'brick-rail' | 'grating-trench' | 'steel-plate' | 'wet-steel';

interface GaragePlatformCollar {
  readonly kind: GaragePlatformCollarKind;
  /** Collar body and its accent (chevrons, bands, the rail). */
  readonly body: number;
  readonly accent: number;
  /** A low plinth band below the collar (concrete, setts), or null. */
  readonly plinth: number | null;
  /** Banked dust or snow against the windward side (sand, red dust). */
  readonly drift: number | null;
  readonly note: string;
}

/** One collar finish per Garage (the per-garage briefs' PLATFORM COLLAR lines). */
export const GARAGE_PLATFORM_COLLARS: Readonly<Record<GarageVariant['architecture'], GaragePlatformCollar>> = Object.freeze({
  field_shed: { kind: 'epoxy-chevron', body: 0xc9a436, accent: 0x1c1d1e, plinth: null, drift: null, note: 'yellow epoxy, worn black chevrons' },
  shade_depot: { kind: 'galvanised', body: 0x9a9890, accent: 0xb59a6a, plinth: 0xa89a80, drift: 0xd2b888, note: 'sand-blasted galvanised steel on a concrete plinth, tan chevrons' },
  repair_bunker: { kind: 'wet-steel', body: 0x2c3234, accent: 0x5a6266, plinth: 0x3a4042, drift: null, note: 'heated deck: wet dark steel, a melt margin' },
  brick_arsenal: { kind: 'granite', body: 0x8e8b86, accent: 0x6e6c68, plinth: 0x7c7a74, drift: null, note: 'dressed granite rim like a fountain basin, a sett ring' },
  naval_drydock: { kind: 'galvanised', body: 0x9aa0a0, accent: 0x7a5038, plinth: 0x8a8c88, drift: null, note: 'galvanised steel with salt bloom and rust streaks' },
  rail_roundhouse: { kind: 'brick-rail', body: 0x7a3e2e, accent: 0x7a7e82, plinth: 0x3a3634, drift: null, note: 'brick-faced collar with a circular running rail' },
  rain_canopy: { kind: 'grating-trench', body: 0x4a5048, accent: 0x2e3a3a, plinth: 0x6a6c64, drift: null, note: 'a steel-grating drainage trench holding water' },
  rock_cavern: { kind: 'granite', body: 0x7e8488, accent: 0x5e6468, plinth: 0x6a7074, drift: null, note: 'heated melt ring with granite setts showing' },
  recovery_yard: { kind: 'galvanised', body: 0x9a948c, accent: 0xa5603e, plinth: 0x8a6a54, drift: 0xb06a44, note: 'galvanised steel with red dust banked to windward' },
  factory_line: { kind: 'steel-plate', body: 0x4a4e52, accent: 0x5a6aa0, plinth: 0x3a3836, drift: null, note: 'heavy plate, heat-tinted edges, bolt heads, slag spatter' },
});

const SEGMENTS = 96;
const PUCKS = 48;

/**
 * The collar for one Garage, built in the stage frame (the turntable's centre at the origin, y up), cached per Garage
 * by the caller. `trackYaw` turns the trench cover and pedestal with the hero's frame: they sit front-left of the
 * camera's view (`pedestalAngle` radians about the turntable).
 */
export function buildGaragePlatformCollar(architecture: GarageVariant['architecture'], params: { readonly pedestalAngle: number;
  readonly windAngle?: number }): ReturnType<KitBuilder['build']> {
  const collar = GARAGE_PLATFORM_COLLARS[architecture] ?? GARAGE_PLATFORM_COLLARS.field_shed;
  const b = new KitBuilder(kitRandom(0x9a17 + architecture.length * 131), garageKitSkin(architecture));
  b.aoHeight = 0.4;
  b.aoStrength = 0.22;
  const r0 = GARAGE_PLATFORM_DECK_R, r1 = GARAGE_PLATFORM_BASE_R, top = GARAGE_PLATFORM_TOP_Y;
  const lift = 0.006; // the collar shell stands just proud of the podium's own side
  const bevel = 0.05;
  const at = (r: number, y: number, a: number): [number, number, number] => [Math.cos(a) * r, y, Math.sin(a) * r];
  // side radius at height y (the podium tapers from r1 at the floor to r0 at the top)
  const sideR = (y: number): number => r1 + (r0 - r1) * (y / top) + lift;
  const bodyColor = new THREE.Color(collar.body);
  const accent = new THREE.Color(collar.accent);
  const tone = new THREE.Color();
  const random = b.rng;
  for (let s = 0; s < SEGMENTS; s += 1) {
    const a0 = (s / SEGMENTS) * Math.PI * 2, a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const out: [number, number, number] = [Math.cos(am), 0.2, Math.sin(am)];
    let sideTone = bodyColor.clone();
    let bevelTone = bodyColor.clone();
    switch (collar.kind) {
      case 'epoxy-chevron': {
        // chevrons: alternate segments lean, worn back toward the yellow epoxy
        const dark = Math.floor(s / 2) % 2 === 0;
        sideTone = (dark ? accent : bodyColor).clone().lerp(bodyColor, dark ? 0.12 + random() * 0.18 : random() * 0.05);
        bevelTone = bodyColor.clone().multiplyScalar(0.92 + random() * 0.06);
        break;
      }
      case 'galvanised': {
        sideTone = bodyColor.clone().multiplyScalar(0.88 + random() * 0.14);
        if (collar.accent !== collar.body && s % 8 < 2 && architecture === 'shade_depot') sideTone.lerp(accent, 0.5);
        if (architecture === 'naval_drydock' && random() < 0.25) sideTone.lerp(accent, 0.3 + random() * 0.2); // rust bleed
        bevelTone = bodyColor.clone().multiplyScalar(1.02 + random() * 0.05);
        break;
      }
      case 'granite': {
        const block = Math.floor(s / 3);
        tone.copy(bodyColor).offsetHSL(0, 0, ((block * 7919) % 13) / 13 * 0.08 - 0.04);
        sideTone = tone.clone();
        bevelTone = tone.clone().multiplyScalar(1.05);
        break;
      }
      case 'brick-rail': {
        sideTone = bodyColor.clone().offsetHSL(0, 0, ((s * 37) % 11) / 11 * 0.08 - 0.04);
        bevelTone = new THREE.Color(0x4a4644);
        break;
      }
      case 'grating-trench': {
        sideTone = bodyColor.clone().multiplyScalar(0.9 + random() * 0.1);
        bevelTone = bodyColor.clone();
        break;
      }
      case 'steel-plate': {
        sideTone = bodyColor.clone().multiplyScalar(0.92 + random() * 0.1);
        bevelTone = bodyColor.clone().lerp(accent, 0.25 + random() * 0.15).lerp(new THREE.Color(0xb08a4a), random() * 0.2); // heat tint
        break;
      }
      case 'wet-steel':
      default: {
        sideTone = bodyColor.clone().multiplyScalar(0.85 + random() * 0.1);
        bevelTone = bodyColor.clone().multiplyScalar(0.8);
        break;
      }
    }
    // chevron segments lean: their upper edge is shifted along the ring
    const lean = collar.kind === 'epoxy-chevron' ? (Math.PI * 2 / SEGMENTS) * 0.9 : 0;
    const yb = 0.02, yt = top - bevel;
    b.polygon([at(sideR(yb), yb, a0), at(sideR(yb), yb, a1), at(sideR(yt), yt, a1 + lean), at(sideR(yt), yt, a0 + lean)], sideTone, out);
    // the top bevel up to the slewing ring
    b.polygon([at(sideR(yt), yt, a0), at(sideR(yt), yt, a1), at(r0 + 0.04, top + lift, a1), at(r0 + 0.04, top + lift, a0)], bevelTone, [Math.cos(am), 1, Math.sin(am)]);
    // the slewing ring: a dark gap and a polished ring at the deck's edge
    b.polygon([at(r0 + 0.04, top + lift, a0), at(r0 + 0.04, top + lift, a1), at(r0 + 0.01, top + lift, a1), at(r0 + 0.01, top + lift, a0)], 0xb4b8ba, [0, 1, 0]);
    b.polygon([at(r0 + 0.01, top + lift * 0.5, a0), at(r0 + 0.01, top + lift * 0.5, a1), at(r0 - 0.02, top + lift * 0.5, a1), at(r0 - 0.02, top + lift * 0.5, a0)], 0x0d0e0f, [0, 1, 0]);
    if (collar.plinth !== null) {
      b.polygon([at(r1 + 0.06, 0.0, a0), at(r1 + 0.06, 0.0, a1), at(sideR(0.02) + 0.01, 0.025, a1), at(sideR(0.02) + 0.01, 0.025, a0)], collar.plinth, [Math.cos(am), 1, Math.sin(am)]);
    }
  }
  // the brick collar carries a circular running rail on its top bevel
  if (collar.kind === 'brick-rail') {
    for (let s = 0; s < SEGMENTS; s += 1) {
      const a0 = (s / SEGMENTS) * Math.PI * 2, a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
      const rr = r0 + 0.17;
      b.polygon([at(rr - 0.035, top - 0.012, a0), at(rr - 0.035, top - 0.012, a1), at(rr + 0.035, top - 0.012, a1), at(rr + 0.035, top - 0.012, a0)], 0xa8acae, [0, 1, 0]);
    }
  }
  // the grating trench holding water round the plinth
  if (collar.kind === 'grating-trench') {
    for (let s = 0; s < SEGMENTS; s += 1) {
      const a0 = (s / SEGMENTS) * Math.PI * 2, a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
      b.polygon([at(r1 + 0.06, 0.012, a0), at(r1 + 0.06, 0.012, a1), at(r1 + 0.42, 0.012, a1), at(r1 + 0.42, 0.012, a0)], s % 2 ? 0x2a3030 : 0x384040, [0, 1, 0]);
    }
  }
  // heavy plate bolt heads round the bevel
  if (collar.kind === 'steel-plate' || collar.kind === 'galvanised') {
    for (let k = 0; k < 36; k += 1) {
      const a = (k / 36) * Math.PI * 2;
      const p = at(sideR(top - bevel - 0.04) + 0.005, top - bevel - 0.04, a);
      b.at(p[0], p[1], p[2], -a + Math.PI / 2, () => b.box(0, 0, 0, 0.04, 0.03, 0.02, collar.body, { bevel: 0, noBottom: true }));
    }
  }
  // banked drift on the windward side
  if (collar.drift !== null) {
    const wind = params.windAngle ?? 0.8;
    for (let s = 0; s < SEGMENTS; s += 1) {
      const a0 = (s / SEGMENTS) * Math.PI * 2, a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
      const w0 = Math.max(0, Math.cos(a0 - wind)), w1 = Math.max(0, Math.cos(a1 - wind));
      if (w0 + w1 < 0.2) continue;
      b.polygon([at(sideR(0.0) + 0.42 * w0 + 0.05, 0.01, a0), at(sideR(0.0) + 0.42 * w1 + 0.05, 0.01, a1),
        at(sideR(0.1 * w1), 0.1 * w1 + 0.01, a1), at(sideR(0.1 * w0), 0.1 * w0 + 0.01, a0)], collar.drift, [Math.cos(a0), 1, Math.sin(a0)]);
    }
  }
  // 48 warm LED pucks set in the collar's face just under its top bevel, each lens lying on the sloped side
  const warm = garageDisplayRect('glow.warm');
  {
    const y = top - bevel - 0.035, d = 0.024;
    const r = sideR(y) + 0.003;
    const slopeR = sideR(y + 0.02) - sideR(y - 0.02), slopeY = 0.04;
    const slopeLength = Math.hypot(slopeR, slopeY);
    for (let k = 0; k < PUCKS; k += 1) {
      const a = (k / PUCKS) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const tx = -sn * d, tz = c * d; // along the ring
      const ur = (slopeR / slopeLength) * d, uy = (slopeY / slopeLength) * d; // up the sloped face
      const at2 = (dr: number, dy: number, t: number): [number, number, number] => [c * (r + dr) + tx * t, y + dy, sn * (r + dr) + tz * t];
      b.face(at2(-ur, -uy, 1), at2(-ur, -uy, -1), at2(ur, uy, -1), at2(ur, uy, 1), warm); // wound to face outward
    }
  }
  // the cable-trench cover and the control pedestal with its touchscreen, front-left
  {
    const a = params.pedestalAngle;
    const c = Math.cos(a), sn = Math.sin(a);
    b.push().rotateY(-a + Math.PI / 2);
    // in this frame the pedestal's radial direction is +Z
    for (let k = 0; k < 3; k += 1) b.box(0, 0.012, r1 + 0.15 + k * 0.4, 0.34, 0.024, 0.38, 0x50555a, { bevel: 0.004, noBottom: true });
    b.box(0, 0.04, 7.5, 0.5, 0.08, 0.4, b.skin.concrete, { bevel: 0.01, noBottom: true });
    b.box(0, 0.55, 7.5, 0.26, 0.95, 0.22, 0x2a2e32, { bevel: 0.015 });
    b.push().translate(0, 1.08, 7.42).rotateX(-0.55).rotateY(Math.PI);
    b.box(0, 0, 0, 0.44, 0.3, 0.05, 0x1c1f22, { bevel: 0.01 });
    b.uprightFace(0, 0, 0.026, 0.38, 0.24, garageDisplayRect('readout.armor.abrams'));
    b.pop();
    b.pop();
    void c; void sn;
  }
  return b.build();
}

/**
 * Paint the segmented steel deck (albedo at `size`, normal at size / 2). Deterministic and shared by every Garage (the
 * deck's tint comes from each Garage's platformTint). `trackAxisRad` lays the faint track-pad scuffs along the hero's
 * track axis only (in the texture's own frame). The painter works in row slices (`step(budgetMs)`), so the stage paints
 * it across a few idle callbacks, never on the boot or switch path.
 */
export function createGarageDeckPainter(size = 1024, trackAxisRad = 0): {
  readonly albedo: Uint8ClampedArray; readonly normal: Uint8ClampedArray; readonly size: number;
  step(budgetMs: number): boolean;
} {
  const random = kitRandom(0xdec4);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const ns = size / 2;
  const normal = new Uint8ClampedArray(ns * ns * 4);
  const C = size / 2;
  const pxPerM = size / (GARAGE_PLATFORM_DECK_R * 2);
  const ring0 = 1.1 * pxPerM, ring1 = 3.0 * pxPerM, ring2 = 4.6 * pxPerM;
  const seamEvery = Math.PI / 12; // 15 degrees
  const cosT = Math.cos(trackAxisRad), sinT = Math.sin(trackAxisRad);
  const NOISE = 64, MASK = NOISE - 1;
  const noise = new Float32Array(NOISE * NOISE);
  for (let i = 0; i < noise.length; i += 1) noise[i] = random();
  const plateTone = new Float32Array(4 * 24);
  for (let i = 0; i < plateTone.length; i += 1) plateTone[i] = (random() - 0.5) * 0.045;
  const smooth = (x: number, y: number, inv: number): number => {
    const fx = x * inv, fy = y * inv;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const r0 = (iy & MASK) * NOISE, r1 = ((iy + 1) & MASK) * NOISE;
    const a = noise[r0 + (ix & MASK)], b2 = noise[r0 + ((ix + 1) & MASK)];
    const c = noise[r1 + (ix & MASK)], d = noise[r1 + ((ix + 1) & MASK)];
    const top = a + (b2 - a) * tx;
    return top + ((c + (d - c) * tx) - top) * ty;
  };
  // countersunk bolt rows on the plate rings, bucketed by cell
  const cell = 16, cells = Math.ceil(size / cell);
  const boltCells: Array<number[] | undefined> = new Array(cells * cells);
  for (const r of [ring0 - 6, ring1 - 8, ring1 + 8, ring2 - 8, ring2 + 8, C - 10]) {
    const count = Math.round((2 * Math.PI * r) / 26);
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2;
      const bx = C + Math.cos(a) * r, by = C + Math.sin(a) * r;
      const key = Math.floor(by / cell) * cells + Math.floor(bx / cell);
      (boltCells[key] ||= []).push(bx, by);
    }
  }
  const boltR = 2.6 * size / 1024, boltR2 = boltR * boltR;
  const gauge = 1.45 * pxPerM, pad = 0.32 * pxPerM;
  let row = 0, normalRow = 0;
  const paintRow = (y: number): void => {
    for (let x = 0; x < size; x += 1) {
      const dx = x - C, dy = y - C;
      const r = Math.sqrt(dx * dx + dy * dy);
      const i = y * size + x;
      let v = 0.27 + (smooth(x, y, 1 / 3) - 0.5) * 0.05 + (smooth(x, y, 1 / 37) - 0.5) * 0.05;
      let h = smooth(x, y, 0.5) * 0.3;
      let d = Math.abs(r - ring0); if (d < 1.6) { v -= 0.09 * (1 - d / 1.6); h -= 1.2 * (1 - d / 1.6); }
      d = Math.abs(r - ring1); if (d < 1.6) { v -= 0.09 * (1 - d / 1.6); h -= 1.2 * (1 - d / 1.6); }
      d = Math.abs(r - ring2); if (d < 1.6) { v -= 0.09 * (1 - d / 1.6); h -= 1.2 * (1 - d / 1.6); }
      if (r > ring0 + 2) {
        const a = Math.atan2(dy, dx) + Math.PI;
        const sector = Math.floor(a / seamEvery);
        const along = a - sector * seamEvery;
        const ds = Math.min(along, seamEvery - along) * r;
        if (ds < 1.4) { v -= 0.08 * (1 - ds / 1.4); h -= 1.0 * (1 - ds / 1.4); }
        const band = r < ring1 ? 1 : r < ring2 ? 2 : 3;
        v += plateTone[band * 24 + (sector % 24)];
      } else {
        v += 0.04 + Math.sin(r * 1.7) * 0.012; // the machined hub plate's turning marks
      }
      const near = boltCells[Math.floor(y / cell) * cells + Math.floor(x / cell)];
      if (near) for (let k = 0; k < near.length; k += 2) {
        const ex = x - near[k], ey = y - near[k + 1];
        const e2 = ex * ex + ey * ey;
        if (e2 < boltR2) { v -= 0.05; h -= 0.8 * (1 - Math.sqrt(e2) / boltR); }
      }
      // the worn datum ring
      if (Math.abs(r - 0.86 * C) < 2.2 && smooth(x, y, 0.25) > 0.3) v += 0.16;
      // track-pad scuffs only along the hero's track axis, at the track gauge
      const along = dx * cosT + dy * sinT, across = -dx * sinT + dy * cosT;
      if (Math.abs(along) < C * 0.9) {
        const dp = Math.min(Math.abs(across - gauge), Math.abs(across + gauge));
        if (dp < pad) v -= 0.035 * (1 - dp / pad) * (0.6 + smooth(x, y, 1 / 6) * 0.4);
      }
      if (r > 0.8 * C) v -= ((r - 0.8 * C) / (0.2 * C)) * 0.04; // grime toward the edge
      height[i] = h;
      const g = (v < 0 ? 0 : v > 1 ? 1 : v) * 255;
      const o = i * 4;
      albedo[o] = g; albedo[o + 1] = g * 1.01; albedo[o + 2] = g * 1.03; albedo[o + 3] = 255;
    }
  };
  const hAt = (x: number, y: number): number => height[(y < 0 ? 0 : y >= size ? size - 1 : y) * size + (x < 0 ? 0 : x >= size ? size - 1 : x)];
  const paintNormalRow = (y: number): void => {
    for (let x = 0; x < ns; x += 1) {
      const sx = x * 2, sy = y * 2;
      const nx = (hAt(sx - 2, sy) - hAt(sx + 2, sy)) * 0.6;
      const ny = (hAt(sx, sy - 2) - hAt(sx, sy + 2)) * 0.6;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * ns + x) * 4;
      normal[o] = (nx * inv * 0.5 + 0.5) * 255;
      normal[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      normal[o + 2] = (inv * 0.5 + 0.5) * 255;
      normal[o + 3] = 255;
    }
  };
  const clock = (): number => performance.now();
  return {
    albedo, normal, size,
    step(budgetMs: number): boolean {
      const until = clock() + budgetMs;
      while (row < size) {
        paintRow(row);
        row += 1;
        if ((row & 15) === 0 && clock() > until) return false;
      }
      while (normalRow < ns) {
        // a normal row needs the albedo rows two either side, all painted by now
        paintNormalRow(normalRow);
        normalRow += 1;
        if ((normalRow & 15) === 0 && clock() > until) return false;
      }
      return true;
    },
  };
}

/** Paint the whole deck in one go (tools and receipts). */
export function paintGarageDeckTextures(size = 1024, trackAxisRad = 0): { albedo: Uint8ClampedArray; normal: Uint8ClampedArray; size: number } {
  const painter = createGarageDeckPainter(size, trackAxisRad);
  while (!painter.step(1e9)) { /* paint every row */ }
  return { albedo: painter.albedo, normal: painter.normal, size };
}
