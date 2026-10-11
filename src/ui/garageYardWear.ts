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

const APRON_W_M = 29;
const APRON_D_M = 24;
const CANVAS_W = 1024;
const CANVAS_H = Math.round((CANVAS_W * APRON_D_M) / APRON_W_M);
const PX_PER_M = CANVAS_W / APRON_W_M;
const SLABS_X = 6;
const SLABS_Z = 5;

export type GarageHardstandStyle =
  | 'slab-field' | 'slab-sand' | 'slab-snow' | 'slab-urban' | 'slab-quay'
  | 'slab-cinder' | 'earth-wet' | 'slab-rock' | 'earth-dust' | 'slab-soot';

/** Each Garage's own working floor. */
export const GARAGE_HARDSTAND_STYLES: Readonly<Record<GarageVariant['architecture'], GarageHardstandStyle>> =
  Object.freeze({
    field_shed: 'slab-field',
    shade_depot: 'slab-sand',
    repair_bunker: 'slab-snow',
    brick_arsenal: 'slab-urban',
    naval_drydock: 'slab-quay',
    rail_roundhouse: 'slab-cinder',
    rain_canopy: 'earth-wet',
    rock_cavern: 'slab-rock',
    recovery_yard: 'earth-dust',
    factory_line: 'slab-soot',
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
  'slab-quay': { kind: 'slab', base: [132, 136, 136], spread: 0.055, speckle: 0.08, seed: 53 },
  'slab-cinder': { kind: 'slab', base: [124, 120, 114], spread: 0.06, speckle: 0.1, seed: 67 },
  'earth-wet': { kind: 'earth', base: [122, 88, 62], spread: 0.08, speckle: 0.12, seed: 71 },
  'slab-rock': { kind: 'slab', base: [128, 132, 136], spread: 0.05, speckle: 0.08, seed: 83 },
  'earth-dust': { kind: 'earth', base: [164, 104, 74], spread: 0.07, speckle: 0.12, seed: 97 },
  'slab-soot': { kind: 'slab', base: [106, 102, 98], spread: 0.06, speckle: 0.09, seed: 101 },
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

  // --- the floor itself -----------------------------------------------------------------------------------------
  const slabW = CANVAS_W / SLABS_X, slabH = CANVAS_H / SLABS_Z;
  if (palette.kind === 'slab') {
    // each pour cures to its own tone, lighter toward its centre (trowel and cure)
    for (let i = 0; i < SLABS_X; i++) {
      for (let j = 0; j < SLABS_Z; j++) {
        const tone = 1 + (rng() - 0.5) * 2 * palette.spread;
        const c: [number, number, number] = [br * tone, bgc * tone, bb * tone];
        const grad = g.createRadialGradient(
          (i + 0.5) * slabW, (j + 0.5) * slabH, slabW * 0.1, (i + 0.5) * slabW, (j + 0.5) * slabH, slabW * 0.75);
        grad.addColorStop(0, rgba([c[0] * 1.03, c[1] * 1.03, c[2] * 1.03], 1));
        grad.addColorStop(1, rgba([c[0] * 0.95, c[1] * 0.95, c[2] * 0.95], 1));
        g.fillStyle = grad;
        g.fillRect(i * slabW, j * slabH, slabW, slabH);
      }
    }
  }
  // low-frequency mottling (both kinds), then aggregate and grit speckle
  for (let i = 0; i < (palette.kind === 'earth' ? 220 : 120); i++) {
    const dark = rng() < 0.5;
    const a = palette.kind === 'earth' ? 0.09 : 0.05;
    blotWrapped((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M, 0.6 + rng() * 2.6,
      dark ? `rgba(30,26,22,${a})` : `rgba(255,248,236,${a * 0.8})`, dark ? `rgba(30,26,22,${a * 0.4})` : `rgba(255,248,236,${a * 0.3})`,
      0.5 + rng() * 0.5);
  }
  for (let i = 0; i < 26000; i++) {
    const x = rng() * CANVAS_W, y = rng() * CANVAS_H;
    const light = rng() < 0.45;
    g.fillStyle = light ? `rgba(250,246,238,${(palette.speckle * (0.4 + rng())).toFixed(3)})`
      : `rgba(18,16,14,${(palette.speckle * (0.5 + rng())).toFixed(3)})`;
    const s = rng() < 0.9 ? 1 : 2;
    g.fillRect(x, y, s, s);
  }

  if (palette.kind === 'slab') {
    // patch repairs: crisp-edged later pours, a shade off their slab
    for (let i = 0; i < 7; i++) {
      const w = (1.2 + rng() * 2.4) * PX_PER_M, h = (0.8 + rng() * 1.8) * PX_PER_M;
      const x = rng() * (CANVAS_W - w), y = rng() * (CANVAS_H - h);
      const shade = rng() < 0.5 ? 0.9 : 1.06;
      g.fillStyle = rgba([br * shade, bgc * shade, bb * shade], 0.85);
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(30,28,26,0.35)';
      g.lineWidth = 1.2;
      g.strokeRect(x, y, w, h);
    }
    // hairline cracks wandering from slab corners
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = Math.round(rng() * SLABS_X) * slabW + (rng() - 0.5) * 20;
      let y = Math.round(rng() * SLABS_Z) * slabH + (rng() - 0.5) * 20;
      let heading = rng() * Math.PI * 2;
      g.strokeStyle = `rgba(24,22,20,${(0.22 + rng() * 0.2).toFixed(2)})`;
      g.lineWidth = 0.8 + rng() * 0.9;
      g.beginPath(); g.moveTo(x, y);
      const steps = 6 + Math.floor(rng() * 14);
      for (let s = 0; s < steps; s++) {
        heading += (rng() - 0.5) * 0.9;
        x += Math.cos(heading) * (6 + rng() * 10);
        y += Math.sin(heading) * (6 + rng() * 10);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // sawn joints with a lighter arris and spalled chips; the grid wraps exactly at the canvas edges
    for (let i = 0; i <= SLABS_X; i++) {
      const x = Math.round(i * slabW);
      g.fillStyle = 'rgba(22,20,18,0.62)'; g.fillRect(x - 1.5, 0, 3, CANVAS_H);
      g.fillStyle = 'rgba(235,232,224,0.16)'; g.fillRect(x + 1.5, 0, 1, CANVAS_H);
    }
    for (let j = 0; j <= SLABS_Z; j++) {
      const y = Math.round(j * slabH);
      g.fillStyle = 'rgba(22,20,18,0.62)'; g.fillRect(0, y - 1.5, CANVAS_W, 3);
      g.fillStyle = 'rgba(235,232,224,0.16)'; g.fillRect(0, y + 1.5, CANVAS_W, 1);
    }
    for (let i = 0; i < 140; i++) {
      const alongX = rng() < 0.5;
      const x = alongX ? rng() * CANVAS_W : Math.round(Math.floor(rng() * (SLABS_X + 1)) * slabW);
      const y = alongX ? Math.round(Math.floor(rng() * (SLABS_Z + 1)) * slabH) : rng() * CANVAS_H;
      g.fillStyle = 'rgba(30,27,24,0.45)';
      g.beginPath(); g.ellipse(x, y, 2 + rng() * 5, 1.5 + rng() * 3, rng() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  }

  // --- the working history ---------------------------------------------------------------------------------------
  // the grime ring the turntable traffic leaves (heaviest where hulls swing on and off)
  for (let i = 0; i < 150; i++) {
    const a = rng() * Math.PI * 2;
    const r = 6.6 + rng() * 3.4;
    blot(Math.cos(a) * r, Math.sin(a) * r, 0.7 + rng() * 1.4, 'rgba(26,23,20,0.15)', 'rgba(26,23,20,0.06)', 0.6);
  }
  // track lanes from the approach road onto the turntable: two bands at the hull's track gauge with cleat marks
  const toward = Math.atan2(approach.x, approach.z);
  const along = { x: Math.sin(toward), z: Math.cos(toward) };
  const across = { x: along.z, z: -along.x };
  const gauge = 2.85, band = 0.62;
  const earth = palette.kind === 'earth';
  for (const offset of [-0.35, 0.4]) {
    for (const side of [-1, 1]) {
      const lateral = side * gauge / 2 + offset;
      for (let s = 6.4; s < 19; s += 0.06) {
        const fade = Math.min(1, (s - 6.4) / 1.4);
        const wobble = Math.sin(s * 0.55 + side + offset * 3) * 0.08;
        const cx = along.x * s + across.x * (lateral + wobble);
        const cz = along.z * s + across.z * (lateral + wobble);
        const [x, y] = px(cx, cz);
        g.save();
        g.translate(x, y);
        g.rotate(-toward);
        g.fillStyle = earth ? `rgba(40,26,18,${(0.16 * fade).toFixed(3)})` : `rgba(28,25,22,${(0.11 * fade).toFixed(3)})`;
        g.fillRect(-band * PX_PER_M / 2, -0.04 * PX_PER_M, band * PX_PER_M, 0.08 * PX_PER_M + 1);
        g.restore();
      }
      for (let s = 6.6; s < 18.5; s += 0.17) {
        const cx = along.x * s + across.x * lateral;
        const cz = along.z * s + across.z * lateral;
        const [x, y] = px(cx, cz);
        g.save();
        g.translate(x, y);
        g.rotate(-toward);
        g.fillStyle = earth ? 'rgba(34,22,14,0.2)' : 'rgba(20,18,16,0.13)';
        g.fillRect(-(band - 0.1) * PX_PER_M / 2, -0.03 * PX_PER_M, (band - 0.1) * PX_PER_M, 0.055 * PX_PER_M);
        g.restore();
      }
    }
  }
  // tyre arcs from the wheeled support vehicles (fuel bowsers, trucks) swinging across the yard
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const [cx, cy] = px((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M);
    const r = (5 + rng() * 9) * PX_PER_M;
    const a0 = rng() * Math.PI * 2;
    for (const lane of [-0.95, 0.95]) {
      g.strokeStyle = earth ? 'rgba(36,24,16,0.16)' : 'rgba(22,20,18,0.12)';
      g.lineWidth = 0.32 * PX_PER_M;
      g.beginPath(); g.arc(cx, cy, r + lane * PX_PER_M, a0, a0 + 0.6 + rng() * 0.9); g.stroke();
    }
  }
  // oil, hydraulic fluid and coolant: the dark history of every pack pulled and every road wheel changed
  for (let i = 0; i < 46; i++) {
    const xM = (rng() - 0.5) * APRON_W_M, zM = (rng() - 0.5) * APRON_D_M;
    if (Math.hypot(xM, zM) < 6.4) continue;
    const r = 0.22 + rng() * (rng() < 0.22 ? 1.5 : 0.65);
    blotWrapped(xM, zM, r, 'rgba(14,12,11,0.46)', 'rgba(18,16,14,0.17)', 0.5 + rng() * 0.5);
    if (rng() < 0.4) blotWrapped(xM + (rng() - 0.5) * r, zM + (rng() - 0.5) * r, r * 0.5, 'rgba(48,36,22,0.22)', 'rgba(48,36,22,0.08)');
  }
  // rust: bleeding from where steel stood (stands, racks, bollards)
  for (let i = 0; i < 18; i++) {
    blotWrapped((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M, 0.18 + rng() * 0.5,
      'rgba(120,64,30,0.26)', 'rgba(120,64,30,0.08)', 0.4 + rng() * 0.6);
  }

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
      alongJoints(170, 0.55, 'rgba(214,186,140,0.55)', 'rgba(214,186,140,0.2)');
      scatter(60, 0.8, 2.6, 'rgba(222,196,152,0.32)', 'rgba(222,196,152,0.1)', [0.25, 0.6]);
      for (let i = 0; i < 900; i++) {
        const [x, y] = px((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M);
        g.fillStyle = 'rgba(206,176,128,0.35)';
        g.fillRect(x, y, 2 + rng() * 6, 1);
      }
      break;
    }
    case 'slab-snow':
    case 'slab-rock': {
      // packed snow over the slabs, grey slush where tracks and tyres churned it, a white crust at the edges
      const snow = style === 'slab-snow' ? 'rgba(232,238,242,' : 'rgba(214,222,230,';
      scatter(style === 'slab-snow' ? 120 : 70, 0.9, 3.4, `${snow}0.62)`, `${snow}0.3)`, [0.4, 0.9]);
      alongJoints(120, 0.45, `${snow}0.7)`, `${snow}0.3)`);
      for (let s = 6.4; s < 19; s += 0.08) {
        for (const side of [-1, 1]) {
          const lateral = side * gauge / 2;
          const [x, y] = px(along.x * s + across.x * lateral, along.z * s + across.z * lateral);
          g.fillStyle = 'rgba(70,74,78,0.1)';
          g.beginPath(); g.ellipse(x, y, band * PX_PER_M * 0.6, 0.12 * PX_PER_M, -toward, 0, Math.PI * 2); g.fill();
        }
      }
      break;
    }
    case 'slab-quay': {
      // salt bloom crusting along joints and in drying puddle rings, rust bleeding from quay steel, standing water
      alongJoints(130, 0.35, 'rgba(236,236,228,0.42)', 'rgba(236,236,228,0.12)');
      for (let i = 0; i < 14; i++) {
        const xM = (rng() - 0.5) * APRON_W_M, zM = (rng() - 0.5) * APRON_D_M, r = 0.6 + rng() * 1.6;
        blotWrapped(xM, zM, r, 'rgba(40,46,50,0.3)', 'rgba(40,46,50,0.12)', 0.5 + rng() * 0.4);
        const [x, y] = px(xM, zM);
        g.strokeStyle = 'rgba(236,236,226,0.28)';
        g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, y, r * PX_PER_M, r * PX_PER_M * 0.7, rng() * Math.PI, 0, Math.PI * 2); g.stroke();
      }
      scatter(30, 0.2, 0.7, 'rgba(126,66,34,0.32)', 'rgba(126,66,34,0.1)', [0.2, 0.5]);
      break;
    }
    case 'slab-urban': {
      // tar-sealed cracks and asphalt patches where the arsenal's yard has been dug up and made good
      g.strokeStyle = 'rgba(20,20,22,0.55)';
      g.lineWidth = 2.6;
      for (let i = 0; i < 16; i++) {
        let x = rng() * CANVAS_W, y = rng() * CANVAS_H, heading = rng() * Math.PI * 2;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 12; s++) {
          heading += (rng() - 0.5) * 0.7;
          x += Math.cos(heading) * 12; y += Math.sin(heading) * 12;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const w = (2 + rng() * 3) * PX_PER_M, h = (1.2 + rng() * 2) * PX_PER_M;
        const x = rng() * (CANVAS_W - w), y = rng() * (CANVAS_H - h);
        g.fillStyle = 'rgba(46,46,48,0.78)';
        g.fillRect(x, y, w, h);
        for (let k = 0; k < 400; k++) {
          g.fillStyle = `rgba(${rng() < 0.5 ? '90,90,92' : '20,20,22'},0.35)`;
          g.fillRect(x + rng() * w, y + rng() * h, 1, 1);
        }
      }
      break;
    }
    case 'slab-cinder': {
      // coal dust and cinders worked into the slabs from the rail roads
      scatter(90, 0.6, 2.4, 'rgba(26,24,24,0.26)', 'rgba(26,24,24,0.08)');
      for (let i = 0; i < 5000; i++) {
        const [x, y] = px((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M);
        g.fillStyle = rng() < 0.7 ? 'rgba(14,13,13,0.5)' : 'rgba(120,70,44,0.4)';
        g.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
      }
      break;
    }
    case 'slab-soot': {
      // foundry soot, scale and quench water stains; steel plates let into the floor where heavy loads stand
      scatter(110, 0.8, 3.0, 'rgba(16,15,15,0.28)', 'rgba(16,15,15,0.09)');
      for (let i = 0; i < 5; i++) {
        const w = (1.4 + rng() * 1.6) * PX_PER_M, h = (1.4 + rng() * 1.6) * PX_PER_M;
        const x = rng() * (CANVAS_W - w), y = rng() * (CANVAS_H - h);
        g.fillStyle = 'rgba(70,70,72,0.9)';
        g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(16,16,18,0.7)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
        g.fillStyle = 'rgba(150,150,152,0.6)';
        for (const [fx, fy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
          g.beginPath(); g.arc(x + fx * w, y + fy * h, 2.4, 0, Math.PI * 2); g.fill();
        }
        blot(((x + w / 2) / CANVAS_W - 0.5) * APRON_W_M, ((y + h / 2) / CANVAS_H - 0.5) * APRON_D_M,
          w / PX_PER_M * 0.6, 'rgba(110,60,30,0.22)', 'rgba(110,60,30,0.06)');
      }
      break;
    }
    case 'earth-wet': {
      // monsoon laterite: deep wet ruts along the lanes, puddles with lighter dried rims, gravel worked in
      for (let i = 0; i < 18; i++) {
        const xM = (rng() - 0.5) * APRON_W_M, zM = (rng() - 0.5) * APRON_D_M, r = 0.5 + rng() * 1.8;
        if (Math.hypot(xM, zM) < 6.6) continue;
        blotWrapped(xM, zM, r * 1.25, 'rgba(176,132,96,0.25)', 'rgba(176,132,96,0.08)', 0.45 + rng() * 0.3);
        blotWrapped(xM, zM, r, 'rgba(40,34,30,0.55)', 'rgba(52,40,32,0.3)', 0.45 + rng() * 0.3);
      }
      for (let i = 0; i < 7000; i++) {
        const [x, y] = px((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M);
        g.fillStyle = rng() < 0.5 ? 'rgba(150,140,128,0.45)' : 'rgba(60,44,34,0.4)';
        g.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
      }
      break;
    }
    case 'earth-dust': {
      // compacted redrock earth: gravel, dust blown pale across it, deep tyre-dust in the lanes
      scatter(80, 0.8, 3.0, 'rgba(206,140,100,0.22)', 'rgba(206,140,100,0.07)', [0.3, 0.7]);
      for (let i = 0; i < 9000; i++) {
        const [x, y] = px((rng() - 0.5) * APRON_W_M, (rng() - 0.5) * APRON_D_M);
        g.fillStyle = rng() < 0.55 ? 'rgba(120,96,84,0.5)' : 'rgba(214,170,140,0.4)';
        g.fillRect(x, y, 1 + rng() * 2.4, 1 + rng() * 2.4);
      }
      break;
    }
    case 'slab-field':
    default: {
      // a field motor pool: moss and grass in the joints, mud carried in on the tracks
      alongJoints(150, 0.28, 'rgba(70,92,48,0.45)', 'rgba(70,92,48,0.12)');
      scatter(40, 0.6, 1.8, 'rgba(78,58,38,0.28)', 'rgba(78,58,38,0.08)');
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.userData.garageHardstandStyle = style;
  return texture;
}

const sharedNormals = new Map<'slab' | 'earth', THREE.CanvasTexture>();

/**
 * The shared hardstand normal for a floor kind (never disposed by a pack): sawn joints and fine aggregate for slabs,
 * clods and rut ridges for earth, from a height field on the same apron layout.
 */
export function garageHardstandNormal(kind: 'slab' | 'earth', anisotropy = 4): THREE.CanvasTexture | null {
  const cached = sharedNormals.get(kind);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const rng = mulberry(kind === 'slab' ? 404 : 808);
  const height = new Float32Array(CANVAS_W * CANVAS_H);
  // fine noise: value noise at two octaves
  const octave = (cell: number, amplitude: number): void => {
    const gw = Math.ceil(CANVAS_W / cell) + 1, gh = Math.ceil(CANVAS_H / cell) + 1;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    for (let y = 0; y < CANVAS_H; y++) {
      const fy = y / cell, iy = Math.floor(fy), ty = fy - iy;
      for (let x = 0; x < CANVAS_W; x++) {
        const fx = x / cell, ix = Math.floor(fx), tx = fx - ix;
        const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1], c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
        height[y * CANVAS_W + x] += amplitude * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
      }
    }
  };
  octave(kind === 'slab' ? 3 : 4, kind === 'slab' ? 0.5 : 0.9);
  octave(kind === 'slab' ? 9 : 14, kind === 'slab' ? 0.6 : 1.6);
  if (kind === 'slab') {
    const slabW = CANVAS_W / SLABS_X, slabH = CANVAS_H / SLABS_Z;
    for (let i = 0; i <= SLABS_X; i++) {
      const x0 = Math.round(i * slabW);
      for (let x = x0 - 2; x <= x0 + 2; x++) {
        const xx = (x + CANVAS_W) % CANVAS_W;
        const depth = 2.4 * (1 - Math.abs(x - x0) / 3);
        for (let y = 0; y < CANVAS_H; y++) height[y * CANVAS_W + xx] -= depth;
      }
    }
    for (let j = 0; j <= SLABS_Z; j++) {
      const y0 = Math.round(j * slabH);
      for (let y = y0 - 2; y <= y0 + 2; y++) {
        const yy = (y + CANVAS_H) % CANVAS_H;
        const depth = 2.4 * (1 - Math.abs(y - y0) / 3);
        for (let x = 0; x < CANVAS_W; x++) height[yy * CANVAS_W + x] -= depth;
      }
    }
  }
  const image = g.createImageData(CANVAS_W, CANVAS_H);
  const strength = kind === 'slab' ? 1.6 : 2.2;
  for (let y = 0; y < CANVAS_H; y++) {
    for (let x = 0; x < CANVAS_W; x++) {
      const h = (xx: number, yy: number): number =>
        height[((yy + CANVAS_H) % CANVAS_H) * CANVAS_W + ((xx + CANVAS_W) % CANVAS_W)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const at = (y * CANVAS_W + x) * 4;
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
    edgeWear(420, () => (rng() < 0.6 ? `rgba(60,40,30,${(0.3 + rng() * 0.4).toFixed(2)})` : `rgba(130,70,34,${(0.3 + rng() * 0.3).toFixed(2)})`), 10);
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
    edgeWear(520, () => `rgba(34,32,30,${(0.35 + rng() * 0.45).toFixed(2)})`, 8);
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
