// Outdoor Garage hardstands (2026-10-10). The owner: "make garages look a lot lot better, more detailed ... better
// textures"; wave 357: "giant bevelled castle flagstones", "car-park lane dashes painted on concrete, lawn and sand",
// "no flat orange sand or mown lawn as a work yard"; the coordinator: each Garage its own floor (concrete, compacted
// earth, sand-blown slab, snow-packed). The stock paving texture stretched one 1K tile over the whole 29 x 24 m apron,
// so every paver came out about 3.6 m wide.
//
// Each outdoor pack now draws its own hardstand albedo, one texel layout over the apron:
//   - sawn concrete slabs at a real 4.8 m pitch with joints, spalls and patch repairs, or compacted earth with ruts;
//   - the working history: track lanes from the pack's approach road with their cleat marks, the grime ring the
//     turntable traffic leaves, oil and hydraulic stains, tyre arcs;
//   - the region: sand drifting into the joints, packed snow with slush lanes, salt bloom and rust, coal dust,
//     tar-sealed cracks, soot, wet laterite and puddles, red dust.
// One shared normal canvas per floor kind (slab joints or earth) completes it, so the hardstand keeps the stock
// map + normal material program. No paint: no bay boxes, dashes or stencils. Plain Node (receipts) has no canvas.
import * as THREE from 'three';

import type { GarageVariant } from '../game/garageVariants.ts';
import type { GarageHardstandDetailKind } from './garageHardstandProgram.ts';

const APRON_W_M = 29;
const APRON_D_M = 24;
const CANVAS_W = 1024;
const CANVAS_H = Math.round((CANVAS_W * APRON_D_M) / APRON_W_M);
const PX_PER_M = CANVAS_W / APRON_W_M;
const SLABS_X = 6;
const SLABS_Z = 5;
/** The earth and snow floors' fine relief normal repeats every 6.4 m across the apron. */
const EARTH_NORMAL_TILE_M = 6.4;

export type GarageHardstandStyle =
  | 'slab-field' | 'slab-sand' | 'slab-snow' | 'slab-urban' | 'slab-quay'
  | 'slab-cinder' | 'earth-wet' | 'slab-rock' | 'earth-dust' | 'slab-soot'
  | 'earth-sand' | 'earth-snow' | 'gravel-snow' | 'earth-slag';

/** Each Garage's own working floor. */
export const GARAGE_HARDSTAND_STYLES: Readonly<Record<GarageVariant['architecture'], GarageHardstandStyle>> =
  Object.freeze({
    // worn concrete where a city, a quay or a railway would pour it; compacted ground everywhere else (wave 377:
    // "pale slabs on sand"; the coordinator: earth, gravel, worn concrete, slag, snow)
    field_shed: 'slab-field',
    shade_depot: 'earth-sand',
    repair_bunker: 'earth-snow',
    brick_arsenal: 'slab-urban',
    naval_drydock: 'slab-quay',
    rail_roundhouse: 'slab-cinder',
    rain_canopy: 'earth-wet',
    rock_cavern: 'gravel-snow',
    recovery_yard: 'earth-dust',
    factory_line: 'earth-slag',
  });

interface StylePalette {
  readonly kind: 'slab' | 'earth';
  /** Base colour (sRGB). */
  readonly base: readonly [number, number, number];
  /** Slab-to-slab tone spread and fine speckle strength. */
  readonly spread: number;
  readonly speckle: number;
  readonly seed: number;
}

const PALETTES: Readonly<Record<GarageHardstandStyle, StylePalette>> = Object.freeze({
  'slab-field': { kind: 'slab', base: [146, 146, 138], spread: 0.05, speckle: 0.08, seed: 11 },
  'slab-sand': { kind: 'slab', base: [190, 172, 142], spread: 0.045, speckle: 0.07, seed: 23 },
  'slab-snow': { kind: 'slab', base: [138, 142, 146], spread: 0.05, speckle: 0.07, seed: 37 },
  'slab-urban': { kind: 'slab', base: [140, 139, 135], spread: 0.06, speckle: 0.08, seed: 41 },
  'slab-quay': { kind: 'slab', base: [138, 134, 126], spread: 0.055, speckle: 0.08, seed: 53 },
  'slab-cinder': { kind: 'slab', base: [124, 120, 114], spread: 0.06, speckle: 0.1, seed: 67 },
  'earth-wet': { kind: 'earth', base: [122, 88, 62], spread: 0.08, speckle: 0.12, seed: 71 },
  'slab-rock': { kind: 'slab', base: [128, 132, 136], spread: 0.05, speckle: 0.08, seed: 83 },
  'earth-dust': { kind: 'earth', base: [164, 104, 74], spread: 0.07, speckle: 0.12, seed: 97 },
  'slab-soot': { kind: 'slab', base: [106, 102, 98], spread: 0.06, speckle: 0.09, seed: 101 },
  'earth-sand': { kind: 'earth', base: [184, 160, 120], spread: 0.06, speckle: 0.14, seed: 113 },
  'earth-snow': { kind: 'earth', base: [208, 214, 220], spread: 0.05, speckle: 0.06, seed: 127 },
  'gravel-snow': { kind: 'earth', base: [128, 128, 126], spread: 0.07, speckle: 0.2, seed: 131 },
  'earth-slag': { kind: 'earth', base: [76, 71, 66], spread: 0.07, speckle: 0.18, seed: 139 },
});

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canvas coordinates of an apron point (pack frame metres; the turntable at the origin). flipY puts z = -12 on top. */
function px(xM: number, zM: number): [number, number] {
  return [((xM + APRON_W_M / 2) / APRON_W_M) * CANVAS_W, ((zM + APRON_D_M / 2) / APRON_D_M) * CANVAS_H];
}

/**
 * Monsoon's standing water (garage round 7, place-truth; the critic panel, 2026-10-14: "a dry, sunny dirt yard with no
 * wet sheen, puddles"): the laterite yard's puddles in the view's frame (side, depth, radius m, squash, along the view's
 * depth axis or across it), most in the camera's foreground and beside the hero, two lying in the hull ruts.
 * Each is a main pool and two lobes. The albedo darkens them under a dried rim; the wet mask (garageHardstandWetMask)
 * lets the graded floor program polish them flat and glossy.
 */
const MONSOON_PUDDLES: ReadonlyArray<readonly [number, number, number, number, boolean]> = [
  [-4.6, -9.2, 1.7, 0.55, true], [3.9, -10.6, 1.15, 0.6, false], [6.8, -7.2, 1.9, 0.5, true], [-8.2, -5.4, 1.35, 0.6, false],
  [1.2, -12.4, 0.85, 0.7, true], [-1.9, -7.6, 0.6, 0.7, false], [9.2, -2.8, 1.45, 0.55, true], [-10.6, 1.2, 1.7, 0.5, false],
  [10.8, 3.6, 1.2, 0.6, true], [-6.2, 6.8, 1.0, 0.65, false], [5.2, 8.2, 1.5, 0.55, true], [-1.4, 9.8, 0.9, 0.7, false],
  // the ruts the hulls leave between the causeway and the turntable, water lying in them
  [-2.4, -11.6, 0.7, 0.32, true], [2.2, -13.0, 0.6, 0.3, true],
];

interface PuddleLobe { readonly x: number; readonly z: number; readonly r: number; readonly squash: number; readonly angle: number }

function monsoonPuddleLobes(): PuddleLobe[] {
  const lobes: PuddleLobe[] = [];
  MONSOON_PUDDLES.forEach(([side, depth, r, squash, alongDepth], index) => {
    // the apron canvas is in the pack's x/z (garageViewPoint: x = (side - depth) / sqrt 2, z = -(side + depth) / sqrt 2)
    const x = (side - depth) * Math.SQRT1_2, z = -(side + depth) * Math.SQRT1_2;
    const angle = alongDepth ? Math.PI / 4 : -Math.PI / 4;
    lobes.push({ x, z, r, squash, angle });
    for (const k of [0, 1]) {
      const turn = angle + (index * 2.4 + k * 2.2), reach = r * (0.55 + 0.1 * k);
      lobes.push({ x: x + Math.cos(turn) * reach, z: z + Math.sin(turn) * reach * squash, r: r * (0.55 - 0.1 * k), squash, angle: angle + 0.4 * (k - 0.5) });
    }
  });
  return lobes;
}

/**
 * The yard's wet mask (garageHardstandGradedHook's standing water): white in the puddles, a faint damp halo round them,
 * on the apron canvas's frame and wrapping. Null for every dry yard and in plain Node.
 */
export function garageHardstandWetMask(style: GarageHardstandStyle): THREE.CanvasTexture | null {
  if (style !== 'earth-wet' || typeof document === 'undefined') return null;
  const scale = 0.25;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CANVAS_W * scale);
  canvas.height = Math.round(CANVAS_H * scale);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (const lobe of monsoonPuddleLobes()) {
    const [x, y] = px(lobe.x, lobe.z);
    for (const [reach, core, halo] of [[1.5, 0.3, 0.0], [1.0, 1.0, 0.85]] as const) {
      const r = Math.max(1, lobe.r * reach * PX_PER_M * scale);
      g.save();
      g.translate(x * scale, y * scale);
      g.rotate(lobe.angle);
      g.scale(1, lobe.squash);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, `rgba(255,255,255,${core})`);
      grad.addColorStop(0.62, `rgba(255,255,255,${halo})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.globalCompositeOperation = 'lighten';
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.userData.garageHardstandWetMask = style;
  return texture;
}

const rgba = (c: readonly [number, number, number], a: number): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;

function drawHardstand(
  g: CanvasRenderingContext2D,
  style: GarageHardstandStyle,
  approach: { readonly x: number; readonly z: number },
): void {
  const palette = PALETTES[style];
  const rng = mulberry(20261010 + palette.seed * 7919);
  const [br, bgc, bb] = palette.base;
  const earth = palette.kind === 'earth';
  const snow = style === 'earth-snow' || style === 'gravel-snow' || style === 'slab-snow' || style === 'slab-rock';
  g.fillStyle = `rgb(${br},${bgc},${bb})`;
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const blot = (xM: number, zM: number, rM: number, inner: string, outer: string, squash = 1, angle = rng() * Math.PI): void => {
    const [x, y] = px(xM, zM);
    const r = Math.max(1, rM * PX_PER_M);
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.scale(1, squash);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.6, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  // wrap-aware blot: the pads beyond the apron sample the canvas wrapped, so marks near an edge repeat across it
  const blotWrapped = (xM: number, zM: number, rM: number, inner: string, outer: string, squash = 1): void => {
    const angle = rng() * Math.PI;
    for (const dx of [-APRON_W_M, 0, APRON_W_M]) {
      for (const dz of [-APRON_D_M, 0, APRON_D_M]) {
        const x = xM + dx, z = zM + dz;
        if (x < -APRON_W_M / 2 - rM || x > APRON_W_M / 2 + rM || z < -APRON_D_M / 2 - rM || z > APRON_D_M / 2 + rM) continue;
        blot(x, z, rM, inner, outer, squash, angle);
      }
    }
  };
  // a coarse value-noise field (wraps with the canvas) that clumps the loose material: gravelly patches beside smooth
  const FX = 16, FZ = 14;
  const field = Float32Array.from({ length: FX * FZ }, () => rng());
  const density = (x: number, y: number): number => {
    const fx = (x / CANVAS_W) * FX, fy = (y / CANVAS_H) * FZ;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (cx: number, cy: number): number => field[(((cy % FZ) + FZ) % FZ) * FX + (((cx % FX) + FX) % FX)];
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  /**
   * Loose material at several sizes (2026-10-11, waves 393 and 394: "a flat plane sprinkled with uniform same-sized
   * flecks, like terrazzo or confetti"): irregular stones turned every way, far more small than large, clumped by the
   * density field and faint, so they read as grit and gravel in the ground rather than paint on it.
   */
  const aggregate = (count: number, colours: readonly string[], sizePx: readonly [number, number],
    alpha: readonly [number, number], clump = 0.75): void => {
    for (let i = 0; i < count; i++) {
      const x = rng() * CANVAS_W, y = rng() * CANVAS_H;
      if (rng() > 1 - clump + clump * density(x, y)) continue;
      const t = rng();
      const r = sizePx[0] + (sizePx[1] - sizePx[0]) * t * t;
      g.fillStyle = `rgba(${colours[Math.floor(rng() * colours.length)]},${(alpha[0] + (alpha[1] - alpha[0]) * rng()).toFixed(3)})`;
      g.beginPath(); g.ellipse(x, y, r, r * (0.4 + 0.55 * rng()), rng() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  };

  // --- the floor itself -----------------------------------------------------------------------------------------
  const slabW = CANVAS_W / SLABS_X, slabH = CANVAS_H / SLABS_Z;
  if (palette.kind === 'slab') {
    // each pour cures to its own tone, a little lighter toward its centre (trowel and cure)
    for (let i = 0; i < SLABS_X; i++) {
      for (let j = 0; j < SLABS_Z; j++) {
        const tone = 1 + (rng() - 0.5) * 1.4 * palette.spread;
        const c: [number, number, number] = [br * tone, bgc * tone, bb * tone];
        const grad = g.createRadialGradient(
          (i + 0.5) * slabW, (j + 0.5) * slabH, slabW * 0.1, (i + 0.5) * slabW, (j + 0.5) * slabH, slabW * 0.75);
        grad.addColorStop(0, rgba([c[0] * 1.02, c[1] * 1.02, c[2] * 1.02], 1));
        grad.addColorStop(1, rgba([c[0] * 0.97, c[1] * 0.97, c[2] * 0.97], 1));
        g.fillStyle = grad;
        g.fillRect(i * slabW, j * slabH, slabW, slabH);
      }
    }
  }
  // low-frequency mottling at two scales (both kinds); the big soft blots are few and faint (waves 408 and 419: "large
  // soft dark blotches that read as dirty shadow artifacts")
  // GA.03 (the critic panel, 2026-10-14: "the foreground floor ... reads as smeared blotch"): fainter again, the detail
  // layer carries the surface now
  for (let i = 0; i < (earth ? 260 : 140); i++) {
    const dark = rng() < 0.5;
    const big = rng() < 0.12;
    const a = (earth ? 0.055 : 0.032) * (big ? 0.4 : 1);
    blotWrapped((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M, big ? 2.5 + rng() * 4 : 0.5 + rng() * 1.8,
      dark ? `rgba(30,26,22,${a})` : `rgba(255,248,236,${a * 0.8})`, dark ? `rgba(30,26,22,${a * 0.4})` : `rgba(255,248,236,${a * 0.3})`,
      0.45 + rng() * 0.55);
  }
  // grit and aggregate in the surface (not on it): faint for concrete, coarser in earth
  if (earth) {
    aggregate(5200, ['30,26,22', '250,244,232'], [0.6, 2.2], [0.03, 0.1], 0.8);
  } else {
    aggregate(4200, ['28,26,24', '246,242,236'], [0.5, 1.8], [0.03, 0.08], 0.6);
  }

  if (palette.kind === 'slab') {
    // patch repairs: later pours a shade off their slab, edges worn rather than ruled (wave 408 read the old ruled,
    // 7 %-darker rectangles as "a dark square patch")
    for (let i = 0; i < 6; i++) {
      const w = (1.2 + rng() * 2.4) * PX_PER_M, h = (0.8 + rng() * 1.8) * PX_PER_M;
      const x = rng() * (CANVAS_W - w), y = rng() * (CANVAS_H - h);
      const shade = rng() < 0.5 ? 0.965 : 1.03;
      g.fillStyle = rgba([br * shade, bgc * shade, bb * shade], 0.4);
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(30,28,26,0.07)';
      g.lineWidth = 1;
      g.strokeRect(x, y, w, h);
    }
    // hairline cracks wandering from slab corners
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = Math.round(rng() * SLABS_X) * slabW + (rng() - 0.5) * 20;
      let y = Math.round(rng() * SLABS_Z) * slabH + (rng() - 0.5) * 20;
      let heading = rng() * Math.PI * 2;
      g.strokeStyle = `rgba(24,22,20,${(0.16 + rng() * 0.16).toFixed(2)})`;
      g.lineWidth = 0.7 + rng() * 0.7;
      g.beginPath(); g.moveTo(x, y);
      const steps = 6 + Math.floor(rng() * 14);
      for (let step = 0; step < steps; step++) {
        heading += (rng() - 0.5) * 0.9;
        x += Math.cos(heading) * (6 + rng() * 10);
        y += Math.sin(heading) * (6 + rng() * 10);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // sawn joints, sealed and dirty rather than ruled black lines (wave 398: "plaza-sized flagstones"); the grid wraps
    for (let i = 0; i <= SLABS_X; i++) {
      const x = Math.round(i * slabW);
      g.fillStyle = 'rgba(30,28,26,0.36)'; g.fillRect(x - 1, 0, 2, CANVAS_H);
      g.fillStyle = 'rgba(40,36,32,0.08)'; g.fillRect(x - 4, 0, 8, CANVAS_H);
    }
    for (let j = 0; j <= SLABS_Z; j++) {
      const y = Math.round(j * slabH);
      g.fillStyle = 'rgba(30,28,26,0.36)'; g.fillRect(0, y - 1, CANVAS_W, 2);
      g.fillStyle = 'rgba(40,36,32,0.08)'; g.fillRect(0, y - 4, CANVAS_W, 8);
    }
    for (let i = 0; i < 120; i++) {
      const alongX = rng() < 0.5;
      const x = alongX ? rng() * CANVAS_W : Math.round(Math.floor(rng() * (SLABS_X + 1)) * slabW);
      const y = alongX ? Math.round(Math.floor(rng() * (SLABS_Z + 1)) * slabH) : rng() * CANVAS_H;
      g.fillStyle = 'rgba(30,27,24,0.3)';
      g.beginPath(); g.ellipse(x, y, 2 + rng() * 5, 1.5 + rng() * 3, rng() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  }

  // --- the working history ---------------------------------------------------------------------------------------
  // the grime ring the turntable traffic leaves (heaviest where hulls swing on and off)
  for (let i = 0; i < 130; i++) {
    const a = rng() * Math.PI * 2;
    const r = 6.6 + rng() * 3.4;
    blot(Math.cos(a) * r, Math.sin(a) * r, 0.7 + rng() * 1.4, 'rgba(26,23,20,0.12)', 'rgba(26,23,20,0.05)', 0.6);
  }
  /**
   * Wheel and track paths (2026-10-11, wave 398: "repeated tread decals", "no wear"): the hulls come up the approach
   * road onto the turntable and the trucks swing round it to the bays, so the yard carries a few curved, compacted
   * paths of different widths that fade in and out, not straight painted lanes. Each rut is a soft halo, a compacted
   * body and a darker centre; loose ground keeps a pale berm thrown up beside it.
   */
  const toward = Math.atan2(approach.x, approach.z);
  const dir = (angle: number): [number, number] => [Math.sin(angle), Math.cos(angle)];
  // packed snow under tracks is a compacted blue-grey with grit, read against the white (the re-judge, 2026-10-15: "no
  // ... packed track ruts")
  const rutDark = earth ? (snow ? '104,112,122' : '42,30,22') : '26,24,22';
  const berm = snow ? '246,250,252' : style === 'earth-sand' ? '232,212,176' : style === 'earth-dust' ? '214,160,124' : '';
  const wheelPath = (
    p0: readonly [number, number], p1: readonly [number, number], p2: readonly [number, number],
    gauge: number, width: number, strength: number,
  ): void => {
    const samples: Array<[number, number, number, number]> = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, u = 1 - t;
      const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
      const z = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
      const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
      const dz = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
      const len = Math.hypot(dx, dz) || 1;
      samples.push([x, z, -dz / len, dx / len]);
    }
    const stroke = (offset: number, widthM: number, colour: string, alpha: number): void => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = Math.max(1, widthM * PX_PER_M);
      // fade in and out along the path: alpha in short pieces
      for (let i = 0; i < samples.length - 1; i++) {
        const t = i / (samples.length - 1);
        const fade = Math.min(1, t / 0.18, (1 - t) / 0.18) * (0.75 + 0.25 * Math.sin(i * 0.7 + offset));
        const [x0, z0, nx0, nz0] = samples[i];
        const [x1, z1, nx1, nz1] = samples[i + 1];
        const [ax, ay] = px(x0 + nx0 * offset, z0 + nz0 * offset);
        const [bx, by] = px(x1 + nx1 * offset, z1 + nz1 * offset);
        g.strokeStyle = `rgba(${colour},${(alpha * fade).toFixed(3)})`;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    };
    // soft compacted bands rather than ruled lines (wave 408: "faint painted circle arcs")
    const press = snow ? 1.5 : 1; // snow takes a deeper, plainer print
    for (const side of [-1, 1]) {
      const offset = side * gauge / 2;
      stroke(offset, width * 2.3, rutDark, strength * 0.24 * press);
      stroke(offset, width, rutDark, strength * 0.5 * press);
      stroke(offset + side * width * 0.12, width * 0.45, rutDark, strength * 0.22 * press);
      if (berm) stroke(offset + side * (width * 1.05), width * 0.7, berm, strength * 0.3 * press);
      // the track links' grousers printed across the band
      if (earth) {
        g.lineCap = 'butt';
        g.lineWidth = Math.max(1, 0.05 * PX_PER_M);
        for (let i = 2; i < samples.length - 2; i++) {
          const t = i / (samples.length - 1);
          const fade = Math.min(1, t / 0.2, (1 - t) / 0.2);
          const [x, z, nx, nz] = samples[i];
          const [ax, ay] = px(x + nx * (offset - width * 0.45), z + nz * (offset - width * 0.45));
          const [bx, by] = px(x + nx * (offset + width * 0.45), z + nz * (offset + width * 0.45));
          g.strokeStyle = `rgba(${rutDark},${(strength * 0.3 * press * fade).toFixed(3)})`;
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        }
      }
    }
  };
  const [ax, az] = dir(toward);
  // hulls up the approach road onto the turntable
  wheelPath([ax * 16, az * 16], [ax * 11 + az * 0.9, az * 11 - ax * 0.9], [ax * 6.9, az * 6.9], 2.85, 0.62, earth ? 0.32 : 0.2);
  // and round it to the bays either side
  for (const turn of [-1, 1]) {
    const [bx, bz] = dir(toward + turn * 0.55);
    const [cx, cz] = dir(toward + turn * 1.55);
    const [ex, ez] = dir(toward + turn * 2.35);
    wheelPath([bx * 15, bz * 15], [cx * 10.5, cz * 10.5], [ex * 16, ez * 16], 2.85, 0.6, earth ? 0.26 : 0.16);
  }
  // a wheeled truck's tighter line across one side of the yard
  {
    const turn = rng() < 0.5 ? -1 : 1;
    const [bx, bz] = dir(toward + turn * 0.9);
    const [cx, cz] = dir(toward + turn * 1.9);
    const [ex, ez] = dir(toward + turn * 2.9);
    wheelPath([bx * 16, bz * 16], [cx * 12.5, cz * 12.5], [ex * 16, ez * 16], 1.95, 0.32, earth ? 0.24 : 0.14);
  }
  // footfall round the turntable and the bays' approaches: small prints in short trails, scuffed in loose ground
  for (let trail = 0; trail < 42; trail++) {
    const a = rng() * Math.PI * 2;
    const r = 6.7 + rng() * (rng() < 0.6 ? 1.4 : 6);
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    let heading = rng() * Math.PI * 2;
    const steps = 4 + Math.floor(rng() * 9);
    for (let step = 0; step < steps; step++) {
      heading += (rng() - 0.5) * 0.4;
      const side = step % 2 ? 1 : -1;
      const fx = x + Math.cos(heading + Math.PI / 2) * 0.1 * side, fz = z + Math.sin(heading + Math.PI / 2) * 0.1 * side;
      const [px0, py0] = px(fx, fz);
      g.fillStyle = `rgba(${rutDark},${(earth ? 0.16 : 0.08).toFixed(3)})`;
      g.beginPath(); g.ellipse(px0, py0, 0.13 * PX_PER_M, 0.055 * PX_PER_M, -heading, 0, Math.PI * 2); g.fill();
      x += Math.cos(heading) * 0.36; z += Math.sin(heading) * 0.36;
    }
  }
  // oil, hydraulic fluid and coolant: the dark history of every pack pulled and every road wheel changed
  for (let i = 0; i < 40; i++) {
    const xM = (rng() - 0.5) * APRON_W_M, zM = (rng() - 0.5) * APRON_D_M;
    if (Math.hypot(xM, zM) < 6.4) continue;
    const r = 0.22 + rng() * (rng() < 0.22 ? 1.5 : 0.65);
    blotWrapped(xM, zM, r, snow ? 'rgba(60,58,56,0.3)' : 'rgba(14,12,11,0.42)', 'rgba(18,16,14,0.14)', 0.5 + rng() * 0.5);
    if (rng() < 0.4) blotWrapped(xM + (rng() - 0.5) * r, zM + (rng() - 0.5) * r, r * 0.5, 'rgba(48,36,22,0.2)', 'rgba(48,36,22,0.07)');
  }
  // rust: bleeding from where steel stood (stands, racks, bollards)
  for (let i = 0; i < 16; i++) {
    blotWrapped((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M, 0.18 + rng() * 0.5,
      'rgba(120,64,30,0.22)', 'rgba(120,64,30,0.07)', 0.4 + rng() * 0.6);
  }
  /** A crust of fine cracks in the dry ground away from the traffic: short branching runs, faint. */
  const crustCracks = (count: number, colour: string): void => {
    g.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      let x = rng() * CANVAS_W, y = rng() * CANVAS_H;
      if (density(x, y) > 0.55) continue;
      let heading = rng() * Math.PI * 2;
      g.strokeStyle = `rgba(${colour},${(0.1 + rng() * 0.12).toFixed(3)})`;
      g.lineWidth = 0.6 + rng() * 0.6;
      g.beginPath(); g.moveTo(x, y);
      for (let step = 0; step < 3 + Math.floor(rng() * 6); step++) {
        heading += (rng() - 0.5) * 1.6;
        x += Math.cos(heading) * (4 + rng() * 9); y += Math.sin(heading) * (4 + rng() * 9);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  /** Blown material banked along the yard's edges and round the turntable base. */
  const drifts = (colour: string, alpha: number, edgeM: number, ring: boolean): void => {
    for (let i = 0; i < 70; i++) {
      const edge = Math.floor(rng() * 4);
      const t = (rng() - 0.5);
      const inset = rng() * edgeM;
      const xM = edge < 2 ? t * APRON_W_M : (edge === 2 ? -1 : 1) * (APRON_W_M / 2 - inset);
      const zM = edge < 2 ? (edge === 0 ? -1 : 1) * (APRON_D_M / 2 - inset) : t * APRON_D_M;
      blot(xM, zM, 0.8 + rng() * 2.2, `rgba(${colour},${alpha})`, `rgba(${colour},${alpha * 0.4})`, 0.35 + rng() * 0.3,
        edge < 2 ? 0 : Math.PI / 2);
    }
    if (ring) {
      for (let i = 0; i < 40; i++) {
        const a = rng() * Math.PI * 2, r = 6.45 + rng() * 0.45;
        blot(Math.cos(a) * r, Math.sin(a) * r, 0.5 + rng() * 0.7, `rgba(${colour},${alpha})`, `rgba(${colour},${alpha * 0.4})`, 0.5, a + Math.PI / 2);
      }
    }
  };

  // --- the region ----------------------------------------------------------------------------------------------
  const scatter = (count: number, rMin: number, rMax: number, inner: string, outer: string, squash: [number, number] = [0.4, 1]): void => {
    for (let i = 0; i < count; i++) {
      blotWrapped((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M, rMin + rng() * (rMax - rMin), inner, outer,
        squash[0] + rng() * (squash[1] - squash[0]));
    }
  };
  const alongJoints = (count: number, width: number, inner: string, outer: string): void => {
    for (let i = 0; i < count; i++) {
      const horizontal = rng() < 0.5;
      const t = rng();
      const xM = horizontal ? (t - 0.5) * APRON_W_M : (Math.round(rng() * SLABS_X) / SLABS_X - 0.5) * APRON_W_M;
      const zM = horizontal ? (Math.round(rng() * SLABS_Z) / SLABS_Z - 0.5) * APRON_D_M : (t - 0.5) * APRON_D_M;
      blotWrapped(xM, zM, width * (0.6 + rng()), inner, outer, 0.25);
    }
  };
  switch (style) {
    case 'slab-sand': {
      // sand blown across the slabs: drifts banked into the joints and the downwind slab edges, a pale bleach
      alongJoints(170, 0.55, 'rgba(214,186,140,0.5)', 'rgba(214,186,140,0.18)');
      scatter(60, 0.8, 2.6, 'rgba(222,196,152,0.3)', 'rgba(222,196,152,0.1)', [0.25, 0.6]);
      drifts('222,196,152', 0.3, 2.2, false);
      break;
    }
    case 'slab-snow':
    case 'slab-rock': {
      // packed snow over the slabs, banked into the joints and round the edges, the paths churned grey
      const snowColour = style === 'slab-snow' ? '232,238,242' : '214,222,230';
      scatter(style === 'slab-snow' ? 120 : 70, 0.9, 3.4, `rgba(${snowColour},0.6)`, `rgba(${snowColour},0.28)`, [0.4, 0.9]);
      alongJoints(120, 0.45, `rgba(${snowColour},0.66)`, `rgba(${snowColour},0.28)`);
      drifts(snowColour, 0.55, 2.4, true);
      break;
    }
    case 'slab-quay': {
      // a little salt in the joints, standing water, rust bleeding from quay steel (waves 408 and 419: the old white bloom
      // and drying rings read as "frost or snow crust" and "painted circle arcs")
      alongJoints(130, 0.35, 'rgba(226,224,214,0.16)', 'rgba(226,224,214,0.05)');
      for (let i = 0; i < 14; i++) {
        const xM = (rng() - 0.5) * APRON_W_M, zM = (rng() - 0.5) * APRON_D_M, r = 0.6 + rng() * 1.6;
        blotWrapped(xM, zM, r, 'rgba(40,46,50,0.26)', 'rgba(40,46,50,0.1)', 0.5 + rng() * 0.4);
        rng(); // (the ring's angle; its stroke is gone)
      }
      scatter(44, 0.2, 0.8, 'rgba(126,66,34,0.3)', 'rgba(126,66,34,0.08)', [0.2, 0.5]);
      break;
    }
    case 'slab-urban': {
      // tar-sealed cracks and asphalt patches where the arsenal's yard has been dug up and made good
      g.strokeStyle = 'rgba(20,20,22,0.45)';
      g.lineWidth = 2.4;
      for (let i = 0; i < 16; i++) {
        let x = rng() * CANVAS_W, y = rng() * CANVAS_H, heading = rng() * Math.PI * 2;
        g.beginPath(); g.moveTo(x, y);
        for (let step = 0; step < 12; step++) {
          heading += (rng() - 0.5) * 0.7;
          x += Math.cos(heading) * 12; y += Math.sin(heading) * 12;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      // asphalt reinstatements over trenches: narrow, a shade darker, their edges soft (a dark rectangle read as a decal)
      for (let i = 0; i < 4; i++) {
        const w = (0.8 + rng() * 1.2) * PX_PER_M, h = (2 + rng() * 4) * PX_PER_M;
        const x = rng() * (CANVAS_W - w), y = rng() * (CANVAS_H - h);
        g.fillStyle = 'rgba(70,70,72,0.32)';
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(70,70,72,0.14)';
        g.fillRect(x - 3, y - 3, w + 6, h + 6);
      }
      break;
    }
    case 'slab-cinder': {
      // coal dust and cinders worked into the slabs from the rail roads
      scatter(90, 0.6, 2.4, 'rgba(26,24,24,0.24)', 'rgba(26,24,24,0.08)');
      aggregate(2600, ['14,13,13', '120,70,44'], [0.6, 2.6], [0.1, 0.3], 0.85);
      break;
    }
    case 'slab-soot': {
      // foundry soot, scale and quench water stains; steel plates let into the floor where heavy loads stand
      scatter(110, 0.8, 3.0, 'rgba(16,15,15,0.26)', 'rgba(16,15,15,0.08)');
      for (let i = 0; i < 5; i++) {
        const w = (1.4 + rng() * 1.6) * PX_PER_M, h = (1.4 + rng() * 1.6) * PX_PER_M;
        const x = rng() * (CANVAS_W - w), y = rng() * (CANVAS_H - h);
        g.fillStyle = 'rgba(70,70,72,0.85)';
        g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(16,16,18,0.6)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
        blot(((x + w / 2) / CANVAS_W - 0.5) * APRON_W_M, ((y + h / 2) / CANVAS_H - 0.5) * APRON_D_M,
          w / PX_PER_M * 0.6, 'rgba(110,60,30,0.2)', 'rgba(110,60,30,0.06)');
      }
      break;
    }
    case 'earth-wet': {
      // monsoon laterite: the puddles (MONSOON_PUDDLES) dark under lighter dried rims, the wet ground darker round them,
      // gravel worked into the ruts
      for (const lobe of monsoonPuddleLobes()) {
        blot(lobe.x, lobe.z, lobe.r * 1.5, 'rgba(96,68,48,0.26)', 'rgba(96,68,48,0.08)', lobe.squash, lobe.angle);
        blot(lobe.x, lobe.z, lobe.r * 1.18, 'rgba(176,132,96,0.2)', 'rgba(176,132,96,0.06)', lobe.squash, lobe.angle);
        blot(lobe.x, lobe.z, lobe.r, 'rgba(38,33,29,0.62)', 'rgba(48,38,31,0.4)', lobe.squash, lobe.angle);
      }
      aggregate(2600, ['150,140,128', '60,44,34'], [0.6, 2.8], [0.1, 0.28], 0.85);
      break;
    }
    case 'earth-dust': {
      // compacted redrock earth: gravel in patches, a dry crust between the paths, pale dust blown along the edges
      scatter(80, 0.8, 3.0, 'rgba(206,140,100,0.2)', 'rgba(206,140,100,0.06)', [0.3, 0.7]);
      aggregate(3000, ['120,96,84', '214,170,140'], [0.6, 3.2], [0.12, 0.3], 0.85);
      crustCracks(260, '92,52,34');
      drifts('214,160,124', 0.26, 2.0, false);
      break;
    }
    case 'earth-sand': {
      // compacted wadi sand: gravel worked in, wind ripples, blown drifts banked at the apron's edges
      aggregate(2800, ['98,86,70', '232,214,178'], [0.6, 3.0], [0.1, 0.26], 0.85);
      g.strokeStyle = 'rgba(150,124,86,0.18)';
      g.lineWidth = 1.2;
      for (let i = 0; i < 140; i++) {
        const [x, y] = px((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M);
        const length = (0.8 + rng() * 2.2) * PX_PER_M;
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + length / 2, y + (rng() - 0.5) * 8, x + length, y + (rng() - 0.5) * 4);
        g.stroke();
      }
      crustCracks(120, '120,96,62');
      drifts('232,212,176', 0.34, 2.6, true);
      break;
    }
    case 'earth-snow': {
      // packed snow: glazed ice where it melted and froze, grit and soot, drifts banked at the edges and the podium
      scatter(40, 0.5, 1.8, 'rgba(176,196,214,0.32)', 'rgba(176,196,214,0.1)', [0.4, 0.8]);
      scatter(24, 0.3, 1.0, 'rgba(118,112,104,0.1)', 'rgba(118,112,104,0.03)'); // grit, not grey smears (the re-judge)
      aggregate(1600, ['80,78,74'], [0.5, 1.8], [0.06, 0.18], 0.85);
      drifts('250,252,255', 0.6, 2.8, true);
      break;
    }
    case 'gravel-snow': {
      // crushed-rock hardstand with old snow lying in its hollows and banked at the edges
      aggregate(5600, ['70,70,66', '120,120,116', '180,180,176'], [0.7, 3.4], [0.16, 0.42], 0.75);
      scatter(70, 0.6, 2.6, 'rgba(232,238,244,0.56)', 'rgba(232,238,244,0.16)', [0.35, 0.8]);
      drifts('236,242,246', 0.55, 2.6, true);
      break;
    }
    case 'earth-slag': {
      // the foundry's slag and cinder yard: crushed slag, rust from scrap, soot, oil and quench water
      aggregate(5200, ['130,126,120', '24,22,22', '132,72,40'], [0.7, 3.2], [0.16, 0.4], 0.75);
      scatter(70, 0.8, 3.0, 'rgba(16,15,15,0.28)', 'rgba(16,15,15,0.08)');
      scatter(30, 0.3, 1.0, 'rgba(120,64,32,0.26)', 'rgba(120,64,32,0.07)', [0.3, 0.7]);
      break;
    }
    case 'slab-field':
    default: {
      // a field motor pool: moss and grass in the joints, mud carried in on the tracks
      alongJoints(150, 0.28, 'rgba(70,92,48,0.4)', 'rgba(70,92,48,0.1)');
      scatter(40, 0.6, 1.8, 'rgba(78,58,38,0.26)', 'rgba(78,58,38,0.07)');
      break;
    }
  }
}

/**
 * One pack's hardstand albedo (the caller owns and disposes it): the style's floor, history and region over the
 * 29 x 24 m apron, the track lanes pointing down this pack's approach road. Null where no canvas exists (plain Node).
 */
export function garageHardstandAlbedo(
  style: GarageHardstandStyle,
  approach: { readonly x: number; readonly z: number },
  anisotropy = 4,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  drawHardstand(g, style, approach);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // the pads beyond the apron read the canvas mirrored, so its content runs on across every edge instead of jumping to
  // the opposite side's (wave 408: a straight seam through Frosthollow's K2 pad); the joint grid is symmetric
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.userData.garageHardstandStyle = style;
  return texture;
}

type HardstandNormalKind = 'slab' | 'earth' | 'snow';
const sharedNormals = new Map<HardstandNormalKind, THREE.CanvasTexture>();

/**
 * The shared hardstand normal for a floor kind (never disposed by a pack): sawn joints and fine aggregate for slabs on
 * the apron's own layout, irregular ground relief for earth and a softer field for packed snow. The relief is smooth
 * noise with no discrete shapes, so its mip chain averages toward flat with distance instead of aliasing.
 */
export function garageHardstandNormal(kind: HardstandNormalKind, anisotropy = 4): THREE.CanvasTexture | null {
  const cached = sharedNormals.get(kind);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  // Slabs: the joints on the apron's own layout (repeat 1). Earth and snow: a tileable 6.4 m field of irregular relief
  // repeated across the apron. Wave 393 read round pebble bumps as "a repeating dimpled cratered-foam texture", so the
  // relief is octaves of value noise only, with no discrete round features, at a low amplitude; packed snow takes just
  // its two broad octaves.
  const W = kind === 'slab' ? CANVAS_W : 512;
  const H = kind === 'slab' ? CANVAS_H : 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const rng = mulberry(kind === 'slab' ? 404 : kind === 'snow' ? 1212 : 808);
  const height = new Float32Array(W * H);
  // value noise on periodic grids (cells divide the canvas exactly, so the tile wraps seamlessly), smoothstepped
  const octave = (cell: number, amplitude: number): void => {
    const gw = Math.round(W / cell), gh = Math.round(H / cell);
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    for (let y = 0; y < H; y++) {
      const fy = (y / H) * gh, iy = Math.floor(fy), ty0 = fy - iy, ty = ty0 * ty0 * (3 - 2 * ty0);
      for (let x = 0; x < W; x++) {
        const fx = (x / W) * gw, ix = Math.floor(fx), tx0 = fx - ix, tx = tx0 * tx0 * (3 - 2 * tx0);
        const at = (cx: number, cy: number): number => grid[((cy + gh) % gh) * gw + ((cx + gw) % gw)];
        const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
        height[y * W + x] += amplitude * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
      }
    }
  };
  if (kind === 'slab') {
    // the pours' broad undulation only, low (v3 stills, 2026-10-14: at 0.5 and 0.6 it lit the slabs into a frost-like
    // ripple over the detail layer's aggregate and broom finish)
    octave(Math.round(W / 341), 0.18);
    octave(Math.round(W / 114), 0.12);
    const slabW = W / SLABS_X, slabH = H / SLABS_Z;
    for (let i = 0; i <= SLABS_X; i++) {
      const x0 = Math.round(i * slabW);
      for (let x = x0 - 2; x <= x0 + 2; x++) {
        const xx = (x + W) % W;
        const depth = 2.4 * (1 - Math.abs(x - x0) / 3);
        for (let y = 0; y < H; y++) height[y * W + xx] -= depth;
      }
    }
    for (let j = 0; j <= SLABS_Z; j++) {
      const y0 = Math.round(j * slabH);
      for (let y = y0 - 2; y <= y0 + 2; y++) {
        const yy = (y + H) % H;
        const depth = 2.4 * (1 - Math.abs(y - y0) / 3);
        for (let x = 0; x < W; x++) height[yy * W + x] -= depth;
      }
    }
  } else if (kind === 'snow') {
    octave(64, 1.2);
    octave(16, 0.35);
  } else {
    // ground relief from broad swells down to grit, each octave a different size, none a repeating round shape
    octave(128, 1.6);
    octave(32, 0.8);
    octave(8, 0.4);
    octave(2, 0.2);
  }
  const image = g.createImageData(W, H);
  const strength = kind === 'slab' ? 1.6 : kind === 'snow' ? 0.5 : 0.75;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const h = (xx: number, yy: number): number => height[((yy + H) % H) * W + ((xx + W) % W)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const at = (y * W + x) * 4;
      // canvas rows run down while the texture's v runs up (flipY), so the green channel takes +dy
      image.data[at] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      image.data[at + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
      image.data[at + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      image.data[at + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (kind !== 'slab') texture.repeat.set(APRON_W_M / EARTH_NORMAL_TILE_M, APRON_D_M / EARTH_NORMAL_TILE_M);
  texture.anisotropy = anisotropy;
  texture.userData.sharedGarageHardstandNormal = kind;
  sharedNormals.set(kind, texture);
  return texture;
}

/** The apron and its texel layout, for receipts. */
export const GARAGE_HARDSTAND = Object.freeze({
  widthM: APRON_W_M, depthM: APRON_D_M, canvasW: CANVAS_W, canvasH: CANVAS_H,
  slabPitchM: Object.freeze([APRON_W_M / SLABS_X, APRON_D_M / SLABS_Z] as const),
});

/** Which floor kind a style draws (slab joints or earth). */
export function garageHardstandKind(style: GarageHardstandStyle): 'slab' | 'earth' {
  return PALETTES[style].kind;
}

/**
 * Which detail layer a style's floor takes (garageHardstandProgram.ts; GA.03, the critic panel: "a detail layer per ground
 * type"): broomed concrete with aggregate and crazing on every slab yard, wind ripples on the wadi's sand, sastrugi on
 * packed snow, packed angular stone on the pass's gravel and the slag yard, pebbled compacted fines on earth.
 */
export function garageHardstandDetailKind(style: GarageHardstandStyle): GarageHardstandDetailKind {
  if (PALETTES[style].kind === 'slab') return 'concrete';
  if (style === 'earth-sand') return 'sand';
  if (style === 'earth-snow') return 'snow';
  if (style === 'gravel-snow' || style === 'earth-slag') return 'gravel';
  return 'earth';
}

/** Which shared relief normal a style takes: slab joints, earth relief, or soft packed snow. */
export function garageHardstandNormalKind(style: GarageHardstandStyle): HardstandNormalKind {
  if (PALETTES[style].kind === 'slab') return 'slab';
  return style === 'earth-snow' ? 'snow' : 'earth';
}

const sharedFacilityAlbedos = new Map<'steel' | 'panel' | 'concrete', THREE.CanvasTexture>();

/**
 * Shared near-white albedos for the outdoor service facilities (never disposed by a pack; the instance colours tint
 * them). Wave 357: "a tangle of flat navy, yellow and cyan beams", "blank maroon boxes", "a European red-brick deck".
 * Every box face maps the whole tile, so wear drawn along the tile's borders lands on every edge of every part:
 *   - steel: weathered paint with rain streaks down the member, chips to primer and rust bleeding from the ends;
 *   - panel: orange-peel enamel with chipped edges, scratches and grime toward the foot;
 *   - concrete: cast concrete with formwork joints, blowholes, chipped arrises and water staining (replaces brick).
 */
export function garageFacilityAlbedo(kind: 'steel' | 'panel' | 'concrete', anisotropy = 4): THREE.CanvasTexture | null {
  const cached = sharedFacilityAlbedos.get(kind);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const rng = mulberry(kind === 'steel' ? 501 : kind === 'panel' ? 602 : 703);
  const base = kind === 'concrete' ? 214 : 236;
  g.fillStyle = `rgb(${base},${base},${base - (kind === 'concrete' ? 4 : 0)})`;
  g.fillRect(0, 0, S, S);
  // fine body texture: orange peel, mill scale or aggregate
  for (let i = 0; i < (kind === 'concrete' ? 9000 : 6000); i++) {
    const light = rng() < 0.5;
    const a = kind === 'concrete' ? 0.12 : 0.06;
    g.fillStyle = light ? `rgba(255,255,255,${(a * rng()).toFixed(3)})` : `rgba(20,20,20,${(a * rng()).toFixed(3)})`;
    g.fillRect(rng() * S, rng() * S, 1 + (rng() < 0.2 ? 1 : 0), 1);
  }
  const edgeWear = (count: number, color: () => string, depth: number): void => {
    for (let i = 0; i < count; i++) {
      const edge = Math.floor(rng() * 4);
      const t = rng() * S;
      const inset = Math.pow(rng(), 2.2) * depth;
      const x = edge === 0 ? t : edge === 1 ? t : edge === 2 ? inset : S - inset;
      const y = edge === 0 ? inset : edge === 1 ? S - inset : t;
      g.fillStyle = color();
      g.beginPath(); g.ellipse(x, y, 1 + rng() * 3.5, 0.8 + rng() * 2, rng() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  };
  if (kind === 'steel') {
    // rain and grime streaks running down the member
    for (let i = 0; i < 60; i++) {
      const x = rng() * S, w = 1 + rng() * 3, y0 = rng() * S * 0.3, len = S * (0.3 + rng() * 0.7);
      const grad = g.createLinearGradient(0, y0, 0, y0 + len);
      grad.addColorStop(0, 'rgba(40,36,32,0)');
      grad.addColorStop(0.3, `rgba(40,36,32,${(0.05 + rng() * 0.08).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(40,36,32,0)');
      g.fillStyle = grad;
      g.fillRect(x, y0, w, len);
    }
    // rust bleeding from the ends, chips to primer along every edge
    for (const y of [0, S]) {
      for (let i = 0; i < 14; i++) {
        const x = rng() * S, r = 4 + rng() * 14;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(122,62,28,0.42)');
        grad.addColorStop(1, 'rgba(122,62,28,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    // edge wear kept light: every face of every member shows this texture whole (wave 402: "blank ragged-edged panels")
    edgeWear(170, () => (rng() < 0.6 ? `rgba(60,40,30,${(0.18 + rng() * 0.25).toFixed(2)})` : `rgba(130,70,34,${(0.18 + rng() * 0.2).toFixed(2)})`), 6);
  } else if (kind === 'panel') {
    // scratches, then chips to dark primer along the edges and a grimy foot
    g.strokeStyle = 'rgba(30,30,30,0.18)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 40; i++) {
      const x = rng() * S, y = rng() * S, a = rng() * Math.PI, l = 4 + rng() * 22;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    const foot = g.createLinearGradient(0, S * 0.7, 0, S);
    foot.addColorStop(0, 'rgba(46,40,34,0)');
    foot.addColorStop(1, 'rgba(46,40,34,0.32)');
    g.fillStyle = foot;
    g.fillRect(0, S * 0.7, S, S * 0.3);
    edgeWear(150, () => `rgba(34,32,30,${(0.18 + rng() * 0.25).toFixed(2)})`, 5);
  } else {
    // formwork joints, blowholes, water staining from the top, chipped arrises
    g.strokeStyle = 'rgba(80,80,78,0.35)';
    g.lineWidth = 1.2;
    for (const y of [S / 3, (2 * S) / 3]) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(40,40,40,${(0.3 + rng() * 0.4).toFixed(2)})`;
      g.beginPath(); g.arc(rng() * S, rng() * S, 0.6 + rng() * 1.6, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 16; i++) {
      const x = rng() * S, w = 6 + rng() * 22, len = S * (0.2 + rng() * 0.6);
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(70,66,60,0.22)');
      grad.addColorStop(1, 'rgba(70,66,60,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, w, len);
    }
    edgeWear(360, () => `rgba(150,150,146,${(0.4 + rng() * 0.4).toFixed(2)})`, 6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.userData.sharedGarageFacilityAlbedo = kind;
  sharedFacilityAlbedos.set(kind, texture);
  return texture;
}

/** The corrugated sheet's repeat in metres: eight trapezoidal ribs across, one sheet length down. */
export const GARAGE_SHEETING_TILE_M = 2;
const sharedSheeting = new Map<'albedo' | 'normal', THREE.CanvasTexture>();

/**
 * Trapezoidal steel sheeting for shelter roofs and wall cladding (the redesign, 2026-10-11: "halls, shelters ... built
 * like real buildings"): a tileable 2 x 2 m sheet, eight ribs across, ribs running along V. The albedo carries only its
 * weathering (rain streaks down the pans, rust at the laps and fixings, dust in the troughs) so the pack's paint tints
 * it; the normal map carries the rib profile. Shared by every Garage and never disposed by a pack.
 */
export function garageSheeting(kind: 'albedo' | 'normal', anisotropy = 4): THREE.CanvasTexture | null {
  const cached = sharedSheeting.get(kind);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const S = 256;
  const RIBS = 8;
  const pitch = S / RIBS;
  // the rib profile across one pitch: crest 0..5, down-slope 5..9, pan 9..27, up-slope 27..31 (px of 32)
  const profileSlope = (x: number): number => {
    const t = ((x % pitch) + pitch) % pitch;
    if (t < 5) return 0;
    if (t < 9) return 1;
    if (t < 27) return 0;
    return -1;
  };
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const rng = mulberry(kind === 'albedo' ? 811 : 812);
  if (kind === 'normal') {
    const image = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const slope = profileSlope(x);
        // slopes tilt the normal across the sheet; the lap at the sheet's head is a small step
        const nx = slope * 0.62;
        const lap = y < 3 ? 0.5 : y < 5 ? -0.25 : 0;
        const len = Math.hypot(nx, lap, 1);
        const i = (y * S + x) * 4;
        image.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
        image.data[i + 1] = Math.round(((lap / len) * 0.5 + 0.5) * 255);
        image.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
        image.data[i + 3] = 255;
      }
    }
    g.putImageData(image, 0, 0);
  } else {
    g.fillStyle = 'rgb(232,232,230)';
    g.fillRect(0, 0, S, S);
    // the slopes catch less paint wear than the crests and pans: a faint tone per facet
    for (let rib = 0; rib < RIBS; rib++) {
      const x0 = rib * pitch;
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x0, 0, 5, S);
      g.fillStyle = 'rgba(30,30,30,0.08)'; g.fillRect(x0 + 5, 0, 4, S); g.fillRect(x0 + 27, 0, 4, S);
    }
    // rain streaks down the pans, from fixings and the lap
    for (let i = 0; i < 70; i++) {
      const rib = Math.floor(rng() * RIBS);
      const x = rib * pitch + 10 + rng() * 15, w = 1 + rng() * 2.5, y0 = rng() * S, len = S * (0.15 + rng() * 0.6);
      const grad = g.createLinearGradient(0, y0, 0, y0 + len);
      const dark = rng() < 0.7;
      const color = dark ? '52,46,40' : '128,74,40';
      grad.addColorStop(0, `rgba(${color},${(0.08 + rng() * 0.12).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = grad;
      for (const wrap of [0, -S]) g.fillRect(x, y0 + wrap, w, len);
    }
    // fixings: a pair of screw heads on every crest at the lap and mid-sheet, each with a rust halo
    for (const y of [12, S / 2 + 12]) {
      for (let rib = 0; rib < RIBS; rib++) {
        const x = rib * pitch + 2.5;
        const halo = g.createRadialGradient(x, y, 0, x, y, 6);
        halo.addColorStop(0, `rgba(120,64,30,${(0.18 + rng() * 0.2).toFixed(2)})`);
        halo.addColorStop(1, 'rgba(120,64,30,0)');
        g.fillStyle = halo; g.fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle = 'rgba(70,70,70,0.7)'; g.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    // the lap: a darker band where the next sheet overlaps, rust bleeding from it
    g.fillStyle = 'rgba(40,36,32,0.22)'; g.fillRect(0, 0, S, 4);
    for (let i = 0; i < 22; i++) {
      const x = rng() * S, len = 6 + rng() * 26;
      const grad = g.createLinearGradient(0, 4, 0, 4 + len);
      grad.addColorStop(0, 'rgba(126,66,30,0.3)');
      grad.addColorStop(1, 'rgba(126,66,30,0)');
      g.fillStyle = grad; g.fillRect(x, 4, 1.5 + rng() * 3, len);
    }
    // blotchy weathering at two scales
    for (let i = 0; i < 40; i++) {
      const x = rng() * S, y = rng() * S, r = 10 + rng() * 40;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const light = rng() < 0.4;
      grad.addColorStop(0, light ? 'rgba(255,255,250,0.07)' : 'rgba(46,42,38,0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  if (kind === 'albedo') texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.userData.sharedGarageSheeting = kind;
  sharedSheeting.set(kind, texture);
  return texture;
}

let sharedContactShadow: THREE.CanvasTexture | null = null;

let sharedShade: THREE.CanvasTexture | null = null;

/**
 * The shade a sail or a canopy throws on the ground (Sirocco, the re-judge 2026-10-15: "the sail casts no shade"): a flat
 * dark core to within a few per cent of its edge, then a short soft penumbra, laid on the cast outline's own UVs. Shared
 * by every Garage and never disposed by a pack.
 */
export function garageShadeTexture(): THREE.CanvasTexture | null {
  if (sharedShade) return sharedShade;
  if (typeof document === 'undefined') return null;
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const image = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const edge = Math.min(x + 0.5, S - x - 0.5, y + 0.5, S - y - 0.5) / S; // 0 at the edge, 0.5 at the centre
      const a = Math.min(1, edge / 0.07);
      const i = (y * S + x) * 4;
      image.data[i] = 0; image.data[i + 1] = 0; image.data[i + 2] = 0;
      image.data[i + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
  }
  g.putImageData(image, 0, 0);
  sharedShade = new THREE.CanvasTexture(canvas);
  sharedShade.userData.sharedGarageShade = true;
  return sharedShade;
}

/**
 * A soft contact-shadow blot for kit standing on the ground (2026-10-11, wave 394: "add contact shadow under every
 * figure and prop"): dark at the centre, gone at the rim, with a squarer core so it suits crates as well as drums.
 * Shared by every Garage and never disposed by a pack.
 */
export function garageContactShadowTexture(): THREE.CanvasTexture | null {
  if (sharedContactShadow) return sharedContactShadow;
  if (typeof document === 'undefined') return null;
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const image = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1;
      // a superellipse distance: squarer than a circle
      const d = Math.pow(Math.pow(Math.abs(u), 3) + Math.pow(Math.abs(v), 3), 1 / 3);
      const a = Math.max(0, 1 - d);
      const i = (y * S + x) * 4;
      image.data[i] = 0; image.data[i + 1] = 0; image.data[i + 2] = 0;
      image.data[i + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
  }
  g.putImageData(image, 0, 0);
  sharedContactShadow = new THREE.CanvasTexture(canvas);
  sharedContactShadow.userData.sharedGarageContactShadow = true;
  return sharedContactShadow;
}
