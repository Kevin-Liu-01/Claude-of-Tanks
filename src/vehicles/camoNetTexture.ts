// src/vehicles/camoNetTexture.ts — the garnished camouflage net the suits and the decor's nets wear, in the colours of
// the theatre the vehicle is painted for (tank-accessories round 5, 2026-10-08). Shared by the suits (ghillieSuit.ts)
// and the decor's rolled and draped nets (decorations.ts); three.js only, so the decor can use it without importing the
// fleet.
import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------------------------
// Theatre (round 5, 2026-10-08; wave 253: "the desert Abrams wears green nets, green leaves ... against sand paint";
// the coordinator: derive net, garnish and leaf colours from the vehicle's camouflage scheme and theatre). Nets are
// issued per theatre: woodland garnish in greens and browns, desert in sand and khaki, snow in white and grey. The
// theatre is read from the scheme this build wears: the wheel paint tracks the active pattern's tonal family
// (materials.ts wheelToneOf), so a desert, winter or woodland coat says which net the crew carries.
// ---------------------------------------------------------------------------------------------------------------

export type SuitTheatre = 'woodland' | 'desert' | 'snow';

/** The theatre of an sRGB scheme colour (the wheel paint): pale and grey is snow, warm and light is desert. */
export function suitTheatreOf(color: THREE.Color): SuitTheatre {
  const c = color.clone().convertLinearToSRGB();
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.l > 0.6 && hsl.s < 0.3) return 'snow';
  const hue = hsl.h * 360;
  if (hue >= 22 && hue <= 58 && hsl.l > 0.33 && hsl.s > 0.12) return 'desert';
  return 'woodland';
}

export interface NetPalette {
  /** Cord, sRGB. */
  readonly cord: readonly [number, number, number];
  /** Garnish tones, sRGB, darkest to lightest, with their shares. */
  readonly strips: ReadonlyArray<readonly [readonly [number, number, number], number]>;
  /** Share of garnish tufts that are cut boughs (the rest are burlap strip bunches). */
  readonly boughs: number;
  /** A bough's colour pulled toward the theatre (dry scrub in the desert). */
  readonly boughTint: readonly [number, number, number];
}

export const NET_PALETTES: Readonly<Record<SuitTheatre, NetPalette>> = Object.freeze({
  woodland: {
    cord: [44, 47, 34],
    strips: [[[36, 41, 29], 0.18], [[50, 60, 37], 0.26], [[68, 77, 46], 0.22], [[84, 76, 53], 0.14], [[63, 54, 39], 0.2]],
    boughs: 0.32, boughTint: [0.86, 0.9, 0.82],
  },
  desert: {
    cord: [96, 84, 62],
    strips: [[[104, 84, 58], 0.14], [[128, 104, 72], 0.2], [[150, 126, 90], 0.24], [[176, 154, 114], 0.26], [[194, 174, 134], 0.16]],
    boughs: 0.14, boughTint: [1.25, 0.95, 0.62],
  },
  snow: {
    cord: [112, 112, 106],
    strips: [[[150, 148, 140], 0.12], [[178, 178, 170], 0.18], [[204, 204, 198], 0.26], [[228, 228, 222], 0.3], [[214, 216, 222], 0.14]],
    boughs: 0, boughTint: [1, 1, 1],
  },
});


// ---------------------------------------------------------------------------------------------------------------
// The garnished net (round 5). Wave 253: "a uniform black square grid ... reading as wire fencing rather than a draped,
// garnished net", "one flat alpha-cut sheet of thick, blobby green strands ... no knots, garnish strips, folds or
// contact points"; the coordinator: "in close-ups, show cord thickness and knots, with density varying across the
// net". A knotted cord net on an uneven lattice carries bunches of cut cloth strips knotted in at the crew's density —
// thick in patches, bare net between — in the theatre's tones, taken by patch so the garnish reads as broad mottling,
// not confetti. A height map (the cloth's bump slot) raises the cords, knots and strips, so the net has relief in a
// close-up. The tile repeats exactly; a carrier draws it at NET_TILE_M per repeat with a per-panel offset.
// ---------------------------------------------------------------------------------------------------------------

export const NET_TEXTURE_PX = 512;
/** Metres of net per texture repeat (a leafy net): about 6 cm meshes, 3-6 cm strips. */
export const NET_TILE_M = 1.25;
const netCache = new Map<string, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null>();

/** The painter's own seeded stream (mulberry32). */
function garnishStreamOf(seed: number): () => number {
  let a = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintGarnishedNet(ctx: CanvasRenderingContext2D, hctx: CanvasRenderingContext2D, S: number, pal: NetPalette, seed: number): void {
  const rng = garnishStreamOf(seed);
  const wrap9 = (draw: (ox: number, oy: number) => void): void => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(ox, oy); };
  // the crew's garnish density and the tone patches: periodic fields (whole cycles per tile), so the tile still wraps
  const field = (n: number, maxA: number) => {
    const f: Array<{ a: number; b: number; p: number; w: number }> = [];
    for (let k = 0; k < n; k++) f.push({ a: 1 + Math.floor(rng() * maxA), b: Math.floor(rng() * 5) - 2, p: rng() * Math.PI * 2, w: 0.5 + rng() * 0.5 });
    return (x: number, y: number): number => {
      let d = 0, ws = 0;
      for (const q of f) { d += q.w * Math.sin(((q.a * x + q.b * y) / S) * Math.PI * 2 + q.p); ws += q.w; }
      return d / ws;
    };
  };
  const densityField = field(4, 3), toneField = field(3, 3);
  const density = (x: number, y: number): number => THREE.MathUtils.clamp(0.36 + 0.9 * densityField(x, y), 0, 1);
  const N = 20, cell = S / N;
  const px: number[] = [], py: number[] = [];
  for (let i = 0; i < N; i++) { px.push(0.75 + rng() * 0.5); py.push(0.75 + rng() * 0.5); }
  const sx = px.reduce((a, b) => a + b, 0), sy = py.reduce((a, b) => a + b, 0);
  const colAt: number[] = [], rowAt: number[] = [];
  for (let i = 0, ax = 0, ay = 0; i < N; i++) { colAt.push((ax / sx) * S); rowAt.push((ay / sy) * S); ax += px[i]; ay += py[i]; }
  const jit: Array<[number, number]> = [];
  for (let i = 0; i < N * N; i++) jit.push([(rng() - 0.5) * cell * 0.4, (rng() - 0.5) * cell * 0.4]);
  const knot = (i: number, j: number): [number, number] => {
    const wi = ((i % N) + N) % N, wj = ((j % N) + N) % N;
    const [jx, jy] = jit[wi * N + wj];
    return [colAt[wi] + jx + Math.floor(i / N) * S, rowAt[wj] + jy + Math.floor(j / N) * S];
  };
  const rgb = (c: readonly number[], a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const grey = (v: number): string => `rgb(${v | 0},${v | 0},${v | 0})`;
  ctx.clearRect(0, 0, S, S);
  hctx.fillStyle = 'rgb(0,0,0)';
  hctx.fillRect(0, 0, S, S);
  ctx.lineCap = 'round';
  hctx.lineCap = 'round';
  // the cord net
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const a = knot(i, j);
    for (const [di, dj] of [[1, 0], [0, 1]] as const) {
      if (rng() < 0.04) continue;
      const b = knot(i + di, j + dj), sag = (rng() - 0.3) * 2.5, w = 1.2 + rng() * 0.6, shade = 0.85 + rng() * 0.3;
      wrap9((ox, oy) => {
        const path = (g: CanvasRenderingContext2D): void => {
          g.beginPath(); g.moveTo(a[0] + ox, a[1] + oy);
          g.quadraticCurveTo((a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + sag + oy, b[0] + ox, b[1] + oy);
        };
        ctx.strokeStyle = rgb(pal.cord.map((v) => v * shade)); ctx.lineWidth = w; path(ctx); ctx.stroke();
        hctx.strokeStyle = grey(110); hctx.lineWidth = w + 1; path(hctx); hctx.stroke();
        hctx.strokeStyle = grey(175); hctx.lineWidth = Math.max(0.8, w - 0.8); path(hctx); hctx.stroke();
      });
    }
  }
  // garnish bunches at the knots
  const tones = pal.strips;
  const pickTone = (): readonly [number, number, number] => {
    let r = rng(), acc = 0;
    for (const [c, w] of tones) { acc += w; if (r < acc) return c; }
    return tones[0][0];
  };
  const patchTone = (x: number, y: number): readonly [number, number, number] => {
    const u = (toneField(x, y) + 1) / 2;
    return tones[Math.min(tones.length - 1, Math.floor(Math.pow(u, 0.9) * tones.length))][0];
  };
  const order: Array<[number, number, number]> = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) order.push([i, j, rng()]);
  order.sort((p, q) => p[2] - q[2]);
  const ribbon = (k: [number, number], ang: number, len: number, wid: number, tone: number[], bend: number,
    twist: number, twists: number, ragged: number): void => {
    const cx = Math.cos(ang), cy = Math.sin(ang), nx = -cy, ny = cx;
    const steps = 12, pts: Array<[number, number, number]> = [];
    for (let t = 0; t <= steps; t++) {
      const u = t / steps, tw = Math.abs(Math.cos(twist + u * twists * Math.PI));
      const w = wid * (0.55 + 0.45 * Math.min(1, u * 3.5)) * (0.45 + 0.55 * tw);
      pts.push([k[0] + cx * u * len + nx * bend * u * u, k[1] + cy * u * len + ny * bend * u * u, w / 2]);
    }
    const tails: Array<[number, number]> = [];
    for (let q = 0; q < 4; q++) tails.push([(q / 3 - 0.5) * wid * 0.9 + (rng() - 0.5) * wid * 0.3, wid * (0.15 + rng() * ragged)]);
    const edge = (t: number, sgn: number): [number, number] => {
      const [x, y, hw] = pts[t], a = pts[Math.max(0, t - 1)], b = pts[Math.min(steps, t + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [x - (dy / l) * hw * sgn, y + (dx / l) * hw * sgn];
    };
    const heightTone = 140 + rng() * 70;
    wrap9((ox, oy) => {
      ctx.beginPath();
      for (let t = 0; t <= steps; t++) { const [x, y] = edge(t, 1); if (t === 0) ctx.moveTo(x + ox, y + oy); else ctx.lineTo(x + ox, y + oy); }
      const [ex, ey] = pts[steps];
      for (const [o, l] of tails) {
        ctx.lineTo(ex + nx * o + cx * l + ox, ey + ny * o + cy * l + oy);
        ctx.lineTo(ex + nx * (o - wid * 0.12) + ox, ey + ny * (o - wid * 0.12) + oy);
      }
      for (let t = steps; t >= 0; t--) { const [x, y] = edge(t, -1); ctx.lineTo(x + ox, y + oy); }
      ctx.closePath();
      ctx.fillStyle = rgb(tone); ctx.fill();
      ctx.lineWidth = 0.8; ctx.strokeStyle = rgb(tone.map((v) => v * 0.62), 0.45); ctx.stroke();
      // the ribbon's far half turns to the light
      ctx.beginPath();
      for (let t = 3; t <= steps; t++) { const [x, y] = edge(t, 0.45); if (t === 3) ctx.moveTo(x + ox, y + oy); else ctx.lineTo(x + ox, y + oy); }
      ctx.lineWidth = Math.max(1, wid * 0.22); ctx.strokeStyle = rgb(tone.map((v) => Math.min(255, v * 1.22)), 0.35); ctx.stroke();
      hctx.beginPath();
      for (let t = 0; t <= steps; t++) { const [x, y] = pts[t]; if (t === 0) hctx.moveTo(x + ox, y + oy); else hctx.lineTo(x + ox, y + oy); }
      hctx.lineWidth = wid * 0.7; hctx.strokeStyle = grey(heightTone); hctx.stroke();
    });
  };
  for (const [i, j] of order) {
    const k = knot(i, j);
    const d = density(k[0], k[1]);
    if (rng() > Math.pow(d, 2.2) * 1.05) continue;
    const count = 2 + Math.floor(rng() * (1 + d * 3.5));
    const base = rng() < 0.8 ? patchTone(k[0], k[1]) : pickTone();
    const fan0 = rng() < 0.7 ? Math.PI / 2 + (rng() - 0.5) * 1.1 : rng() * Math.PI * 2;
    const spread = 0.5 + rng() * 1.1;
    for (let q = 0; q < count; q++) {
      const vf = 0.84 + rng() * 0.26;
      const tone = (rng() < 0.85 ? base : pickTone()).map((v) => v * vf);
      const ang = fan0 + (count > 1 ? (q / (count - 1) - 0.5) * spread : 0) + (rng() - 0.5) * 0.35;
      ribbon(k, ang, cell * (2.0 + rng() * 4.2), 9 + rng() * 15, tone, (rng() - 0.5) * cell * 2.4, rng() * Math.PI,
        0.3 + rng() * 1.4, rng() < 0.5 ? 0.6 : 0.25);
    }
    const r = 1.6 + rng() * 1.2 + count * 0.3, rot = rng() * Math.PI;
    wrap9((ox, oy) => {
      ctx.beginPath(); ctx.ellipse(k[0] + ox, k[1] + oy, r * 1.2, r, rot, 0, Math.PI * 2);
      ctx.fillStyle = rgb(pal.cord.map((v) => v * 0.9)); ctx.fill();
      hctx.beginPath(); hctx.arc(k[0] + ox, k[1] + oy, r, 0, Math.PI * 2); hctx.fillStyle = grey(235); hctx.fill();
    });
  }
}

/** The garnished net and its height map for a theatre (cached per theatre and seed; null without a DOM). */
export function garnishedNetTextures(theatre: SuitTheatre, seed: number): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null {
  const key = `${theatre}:${seed}`;
  if (netCache.has(key)) return netCache.get(key)!;
  let out: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null = null;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas'), height = document.createElement('canvas');
      canvas.width = canvas.height = height.width = height.height = NET_TEXTURE_PX;
      const ctx = canvas.getContext('2d'), hctx = height.getContext('2d');
      if (ctx && hctx) {
        paintGarnishedNet(ctx, hctx, NET_TEXTURE_PX, NET_PALETTES[theatre], seed);
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        const bump = new THREE.CanvasTexture(height);
        for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
        map.name = `ghillieNet:${key}`;
        bump.name = `ghillieNetHeight:${key}`;
        out = { map, bump };
      }
    } catch {
      out = null;
    }
  }
  // without a DOM nothing is painted, and nothing is remembered (a later build with a canvas paints it)
  if (typeof document !== 'undefined') netCache.set(key, out);
  return out;
}


/** The theatre of a scheme given as an sRGB hex colour (a paint visual's base). */
export function theatreOfHex(hex: string): SuitTheatre {
  return suitTheatreOf(new THREE.Color(hex));
}
