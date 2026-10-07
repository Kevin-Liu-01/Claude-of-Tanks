// src/world/maps/regional/sarajevoLight.ts — the Sarajevo kit's light buildings (Ruinspires, the city under siege
// 1992-1996; the map-revival lane mr1, valley round 2, 2026-10-07). The valley's light-building families stood in the
// generic kit (a Nissen hut, steel guard posts, a camp office) among the street rows' plastered blocks; here is each
// family's Sarajevo version. Every one stays inside its family's footprint and height and keeps the family's collision
// (structureKit DESTRUCTIBLE_BUILDING_TYPES: placement, cover and the layout brief never move). Each speaks the street
// rows' language of the siege (sarajevoParts.ts): shell pocks round a scorched centre, UNHCR sheeting over the windows
// the blasts emptied, sandbagged doors and windows, soot over the burnt openings, rubble at the foot.
//   guardpost        the shelled kiosk: a K67 newspaper kiosk (Saša Mächtig's fibreglass module), holed, its glass gone
//   transformershed  the pocked transformer kiosk: a trafostanica under a sheet roof, one steel door blown off
//   securityoffice   the sandbagged checkpoint: a militia post on its plinth, its windows bagged to slits, a boom at its door
//   servicegarage    the gutted garage: an auto-servis, one bay blown in and burnt out, the roof broken over it
//   corneroffice     the burnt corner shop: an Austro-Hungarian corner house, its two shops burnt out under the flats
//   quonsethut       the lock-up garages (the Nissen hut leaves the valley): an estate's row of four under a slab roof
// A light building is one instanced draw in one material: the kit's render. Its parts are built and weathered as the
// street rows' are (house.ts, weather.ts), then gathered into one vertex-coloured set (lightParts below): the fine
// joinery left out (a phone never builds it, and the instance has no fine-detail range), no lit window (the blackout;
// and an emissive light building would install the fixture shader on the kit's shared render), nothing below ground.
import * as THREE from 'three';
import {
  LocalFrame, PartSink, REGIONAL_BUCKETS, bodyFaces, faceBox, facePoint, normalize3, rgb, shade, streamFrom,
  type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, withWear, type HouseDialect, type HouseFrame, type HouseSpec, type Opening } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { DEFAULT_WEATHER, pickWeatherTints, weatherRegionalParts } from './weather.ts';
import type { ArchitectureStyle, LightVariant } from './types.ts';
import {
  AH_FRAME, DOOR_LEAVES, HESSIAN, IRON, ROLL_SHUTTER, choose, sandbagWindow, shellHole, shellPocks, unhcrSheet, type Keep,
} from './sarajevoParts.ts';

// ------------------------------------------------------------------------------------------------ the gathering

/**
 * What each bucket shows under the one render: a weathered wall keeps its vertex colour; the masonry and the roof tile,
 * drawn in the render's print, carry their own print's mean against it; the voids, the glass and bare timber take
 * their own material's colour.
 */
const UNDER: Partial<Record<RegionalBucket, Rgb>> = { regionalStone: [0.7, 0.67, 0.62], regionalRoof: [0.55, 0.22, 0.14] };
const FLAT: Partial<Record<RegionalBucket, Rgb>> = {
  dark: [0.035, 0.03, 0.028], glass: [0.09, 0.1, 0.11], wood: [0.36, 0.27, 0.19], curtain: [0.42, 0.36, 0.28], straw: [0.62, 0.53, 0.36],
};
const KEEP_ATTRIBUTES: ReadonlySet<string> = new Set(['position', 'normal', 'uv', 'color']);

/** A built and weathered part set as one material's parts (see the header). */
function lightParts(parts: RegionalParts, uvScale: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const bucket of REGIONAL_BUCKETS) {
    for (const g of parts[bucket] ?? []) {
      if (g.userData.fine) { g.dispose(); continue; }
      const pos = g.getAttribute('position') as THREE.BufferAttribute, n = pos.count;
      const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
      if (!col) {
        const c = FLAT[bucket] ?? [0.5, 0.5, 0.5], a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) a.set(c, i * 3);
        g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
      } else {
        const k = UNDER[bucket];
        if (k) for (let i = 0; i < n; i++) col.setXYZ(i, col.getX(i) * k[0], col.getY(i) * k[1], col.getZ(i) * k[2]);
      }
      for (const name of Object.keys(g.attributes)) if (!KEEP_ATTRIBUTES.has(name)) g.deleteAttribute(name);
      for (let i = 0; i < n; i++) if (pos.getY(i) < 0) pos.setY(i, 0);
      if (uvScale !== 1) {
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
      }
      g.userData = {};
      out.push(g);
    }
  }
  return out;
}

/**
 * Build one light building as the street rows build: the house builder's siege wear and facade craft on their own
 * streams, the building's tints and weathering from the style's palette, then the parts gathered (lightParts).
 * `body` draws its choices from `look`; the build stream `rng` seeds the rest.
 */
function lightBuild(rng: () => number, style: ArchitectureStyle, body: (sink: PartSink, look: () => number) => void): THREE.BufferGeometry[] {
  const sink = new PartSink([rng() * 7.31, rng() * 5.17]);
  const look = streamFrom(Math.floor(rng() * 4294967296));
  const wearSeed = Math.floor(rng() * 4294967296);
  withWear({
    amount: style.wear ?? 0.5, rng: streamFrom(wearSeed), spall: streamFrom((wearSeed ^ 0x9e3779b9) >>> 0),
    facade: { tier: 'desktop', rng: streamFrom((wearSeed ^ 0x6a09e667) >>> 0) },
  }, () => body(sink, look));
  const palette = style.weather ?? DEFAULT_WEATHER;
  const parts = weatherRegionalParts(sink.finish(), pickWeatherTints(palette, rng),
    { damp: palette.damp, moss: palette.moss, mossTint: palette.mossTint });
  return lightParts(parts, style.surfaces.relief?.plasterUv ?? 1);
}

// ------------------------------------------------------------------------------------------------ the siege's marks

/** A frame turned `a` about +Y: x across, y up, z along the heading. */
function yawFrame(a: number): LocalFrame {
  return new LocalFrame([Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], [Math.sin(a), 0, Math.cos(a)], [0, 0, 0]);
}

/**
 * A flat slab from a to b (a torn shutter, a slab of render, a bent bar) `width` across the `across` direction, its face
 * turned toward `facing`: a free piece, every face kept.
 */
function slabAlong(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, width: number, depth: number, across: Vec3, facing: Vec3,
  opts: EmitOptions): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (len < 1e-3) return;
  const ay: Vec3 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len];
  let out = normalize3([across[1] * ay[2] - across[2] * ay[1], across[2] * ay[0] - across[0] * ay[2], across[0] * ay[1] - across[1] * ay[0]]);
  if (out[0] * facing[0] + out[1] * facing[1] + out[2] * facing[2] < 0) out = [-out[0], -out[1], -out[2]];
  sink.member(bucket, a, b, width, depth, out, { ...opts, exposed: true }, 0);
}

/**
 * Rubble at a wall's foot: lumps of masonry and render with a few charred bits, heaped against the wall over `w`
 * centred on `u`, no lump reaching farther than `reach` out from it, the big lumps by the wall, the small ones flung
 * farther.
 */
function rubbleFoot(sink: PartSink, face: Face, u: number, w: number, reach: number, look: () => number, n: number): void {
  for (let k = 0; k < n; k++) {
    const roll = look(), du = (look() - 0.5) * w, fling = Math.pow(look(), 1.5);
    // (a lump's yawed footprint reaches 0.75 of its size from its centre; a short reach takes smaller lumps)
    const size = Math.min((0.18 + look() * 0.36) * (1 - 0.55 * fling), (reach - 0.03) / 1.15);
    const extent = 0.75 * size, out = Math.max(0.02 + extent * 0.4, Math.min(reach - extent, 0.1 + reach * fling));
    const hgt = size * (0.42 + look() * 0.38);
    const bucket: RegionalBucket = roll < 0.48 ? 'stone' : roll < 0.86 ? 'plaster' : 'dark';
    sink.box(bucket, facePoint(face, u + du, hgt / 2, out), [size / 2, hgt / 2, size * (0.3 + look() * 0.25)], { decor: true },
      yawFrame(look() * Math.PI), { ny: true });
  }
  // a slab of render come away, leaning on the heap against the wall
  const lean = facePoint(face, u + (look() - 0.5) * w * 0.5, 0, Math.min(reach - 0.1, 0.55));
  const top = facePoint(face, u + (look() - 0.5) * w * 0.3, 0.55 + look() * 0.3, 0.06);
  slabAlong(sink, 'plaster', lean, top, 0.5 + look() * 0.35, 0.07, face.u, face.out, { decor: true });
}

/** A sandbag wall from a to b (building-local x, z), `courses` high from y0, the bags in stretcher bond. */
function sandbagRun(sink: PartSink, a: readonly [number, number], b: readonly [number, number], courses: number,
  look: () => number, y0 = 0): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.3) return;
  const ux = dx / len, uz = dz / len;
  const frame = new LocalFrame([ux, 0, uz], [0, 1, 0], [-uz, 0, ux], [0, 0, 0]);
  const BAG = 0.58, H = 0.15, D = 0.34;
  for (let c = 0; c < courses; c++) {
    const off = c % 2 ? BAG / 2 : 0, batter = Math.min(0.06, c * 0.012);
    for (let t = off + BAG / 2; t <= len - BAG / 2 + 0.06; t += BAG) {
      const k = 0.8 + look() * 0.28;
      sink.box('structureWood', [a[0] + ux * t, y0 + H * (c + 0.5), a[1] + uz * t], [BAG / 2 - 0.018, H / 2 - 0.006, D / 2 - batter],
        { decor: true, colour: [HESSIAN[0] * k, HESSIAN[1] * k, HESSIAN[2] * k] }, frame, { ny: true });
    }
  }
}

/** A face's wall area between y0 and y1 inside its corners, for shell pocks. */
function wallRect(face: Face, y0: number, y1: number, inset = 0.25): Keep {
  return { u0: -face.width / 2 + inset, u1: face.width / 2 - inset, y0, y1 };
}

/** The openings of one face as holes to keep shell pocks out of (absolute heights). */
function keepsOf(openings: readonly Opening[], name: Opening['face'], frame: HouseFrame): Keep[] {
  return openings.filter((o) => o.face === name).map((o) => {
    const y0 = frame.floors[o.storey] + o.y0;
    return { u0: o.u - o.w / 2 - 0.25, u1: o.u + o.w / 2 + 0.25, y0: y0 - 0.2, y1: y0 + o.h + 0.45 };
  });
}

/** What a light building's dialect does with each window (set per opening by its builder). */
type Treatment = 'sheet' | 'sandbag' | 'glass' | 'vent';
const VENT: Rgb = rgb(0x4d554c);

/**
 * The light buildings' dialect: a plain casement whose glass the blasts took (dark), UNHCR sheeting over it, or bags to
 * a slit; a steel vent; a door, a roll-shuttered shop or a steel up-and-over garage door.
 */
function lightDialect(look: () => number, treat: ReadonlyMap<Opening, Treatment>, style: {
  frame: Rgb; leaf: Rgb; leafKind: 'panel' | 'plank' | 'glazed'; gate: Rgb; sign: Rgb | null;
}): HouseDialect {
  const casement: WindowStyle = {
    frame: style.frame, frameWidth: 0.07, frameOut: 0.05, bars: 'two', surround: null, sill: { bucket: 'stone', out: 0.1 }, shutters: null,
  };
  return {
    window: (s, face, o, y0) => {
      const y = y0 + o.y0, t = treat.get(o) ?? 'glass';
      if (t === 'vent') {
        const back = s.recess > 0 ? -s.recess : 0;
        faceBox(s, 'structureMetal', face, o.u, y + o.h / 2, back + 0.03, o.w, o.h, 0.03, { colour: VENT, decor: true });
        for (let k = 1; k < 4; k++) faceBox(s, 'structureMetal', face, o.u, y + o.h * k / 4, back + 0.06, o.w - 0.06, 0.035, 0.04, { colour: shade(VENT, 0.7), decor: true });
        return;
      }
      windowUnit(s, face, o.u, y, o.w, o.h, t === 'sheet' ? { ...casement, bars: 'none' } : casement, look, 0);
      if (t === 'sheet') unhcrSheet(s, face, o.u, y, o.w, o.h, look);
      if (t === 'sandbag') sandbagWindow(s, face, o.u, y, o.w, o.h, look);
    },
    door: (s, face, o, y0) => {
      const y = y0 + o.y0, back = s.recess > 0 ? -s.recess : 0;
      if (o.kind === 'gate') {
        // a steel garage door: the leaf at the back of the reveal, its pressed ribs, the handle
        faceBox(s, 'structureMetal', face, o.u, y + o.h / 2, back + 0.025, o.w, o.h, 0.03, { colour: style.gate, decor: true });
        for (let k = 1; k < 5; k++) faceBox(s, 'structureMetal', face, o.u, y + o.h * k / 5, back + 0.05, o.w - 0.1, 0.05, 0.03, { colour: shade(style.gate, 0.82), decor: true });
        faceBox(s, 'structureMetal', face, o.u, y + 0.95, back + 0.07, 0.2, 0.06, 0.04, { colour: IRON, decor: true });
        return;
      }
      if (o.kind === 'shopfront') {
        // the shop shut for the siege: the glazing over the stall riser, the roll shutter down most of the way, the sign
        windowUnit(s, face, o.u, y + 0.55, o.w, o.h - 0.55, { ...casement, bars: 'two', sill: null }, look, 0);
        const sh = (o.h - 0.1) * (0.45 + look() * 0.45);
        faceBox(s, 'structureMetal', face, o.u, y + o.h - sh / 2, back + 0.11, o.w + 0.04, sh, 0.03, { colour: ROLL_SHUTTER, decor: true });
        if (style.sign) faceBox(s, 'structureWood', face, o.u, y + o.h + 0.32, 0.05, o.w + 0.4, 0.5, 0.06, { colour: style.sign, decor: true });
        return;
      }
      doorUnit(s, face, o.u, y, o.w, o.h, { leaf: style.leaf, frame: { bucket: 'stone', width: 0.12, out: 0.05 }, transom: false,
        steps: null, leafKind: style.leafKind }, y);
    },
  };
}

/** The tar on a flat roof inside its parapet (a decor sheet over the slab's top). */
function tarRoof(sink: PartSink, frame: HouseFrame, edge: number): void {
  const b = frame.bodies[frame.bodies.length - 1], y = frame.eaveY + frame.spec.roof.thickness + 0.012;
  const x0 = b.x0 - frame.spec.roof.eave + edge, x1 = b.x1 + frame.spec.roof.eave - edge;
  const z0 = b.z0 - frame.spec.roof.verge + edge, z1 = b.z1 + frame.spec.roof.verge - edge;
  sink.quad('structureMetal', [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], { colour: [0.075, 0.07, 0.065], decor: true });
}

const TREAT = (pairs: Array<[Opening, Treatment]>): Map<Opening, Treatment> => new Map(pairs);

// ------------------------------------------------------------------------------------------------ the buildings
// Each body fills its family's own collision body (the family's build, which stays the collision: structureKit
// regionalLightVariant), and what the family's collision holds outside it (posts, a dock, a porch) stands there as a
// part of the variant too: a shot or a hull meets what it sees.

/** The K67's fibreglass: the red, orange and yellow of the kiosks on every Yugoslav street corner. */
const K67_PAINTS: readonly Rgb[] = [0xb4402e, 0xc8682e, 0xc99a34].map(rgb);

/**
 * The shelled kiosk (the guard post's family: its body 3.2 x 3.2 x 3.8): a K67 newspaper kiosk, one rounded fibreglass
 * module on its concrete pad, the counter light and the side lights blown out, one side sheeted over, a shell hole in
 * the other, splinter scars across it all; sandbags banked against its back and one side, its sign board high on two
 * posts and scorched, rubble before the counter.
 */
function shelledKiosk(rng: () => number, style: ArchitectureStyle): THREE.BufferGeometry[] {
  return lightBuild(rng, style, (s, look) => {
    const paint = choose(look(), K67_PAINTS);
    const half = 1.3, rad = 0.38, y0 = 0.12, H = 2.5;
    s.span('stone', -1.6, 0, -1.6, 1.6, y0, 1.6);
    // the module: a rounded square, its corners in three steps (counter-clockwise seen from above)
    const ring = (inset: number, y: number): Vec3[] => {
      const out: Vec3[] = [];
      for (const [sx, sz, t0] of [[1, 1, 90], [1, -1, 0], [-1, -1, -90], [-1, 1, -180]] as const) {
        for (let i = 0; i <= 3; i++) {
          const th = (t0 - 30 * i) * Math.PI / 180;
          out.push([sx * (half - rad) + Math.cos(th) * (rad - inset), y, sz * (half - rad) + Math.sin(th) * (rad - inset)]);
        }
      }
      return out;
    };
    s.prism('structureMetal', ring(0, y0), [0, 1, 0], H, { colour: paint });
    // the roof's raised lid
    s.prism('structureMetal', ring(0.05, y0 + H), [0, 1, 0], 0.08, { colour: shade(paint, 1.06) });
    const faces = bodyFaces(2 * half, 2 * half), flat = half - rad;
    // the lights: rounded openings on three sides (the counter in front), the door behind; the glass is gone
    const light = (face: Face, u: number, y: number, w: number, h: number, r: number) => {
      const pts: Vec3[] = [];
      for (const [cu, cy, a0] of [[u + w / 2 - r, y + r, -90], [u + w / 2 - r, y + h - r, 0], [u - w / 2 + r, y + h - r, 90], [u - w / 2 + r, y + r, 180]] as const) {
        for (let i = 0; i <= 2; i++) {
          const a = (a0 + 45 * i) * Math.PI / 180;
          pts.push(facePoint(face, cu + Math.cos(a) * r, cy + Math.sin(a) * r, 0.012));
        }
      }
      s.polygon('dark', pts, { decor: true });
    };
    light(faces.front, 0, 1.15, 1.7, 1.15, 0.18);
    light(faces.right, 0, 1.15, 1.6, 1.15, 0.18);
    light(faces.left, 0, 1.15, 1.6, 1.15, 0.18);
    light(faces.back, 0.25, y0 + 0.08, 0.8, 2.02, 0.12);
    // the counter shelf under the front light, a newspaper rack's frame inside it
    faceBox(s, 'stone', faces.front, 0, 1.12, 0.14, 1.74, 0.06, 0.28, { decor: true });
    faceBox(s, 'structureMetal', faces.front, -0.4, 1.55, -0.02, 0.05, 0.62, 0.04, { colour: IRON, decor: true });
    // the left light sheeted over; a shell holed the right side under its light
    unhcrSheet(s, faces.left, 0, 1.15, 1.6, 1.15, look);
    shellHole(s, faces.right, 0.3, 0.64, 0.25, look, 'plaster');
    // splinter scars across the fibreglass (the chipped gelcoat shows pale)
    const lightKeep = (u0: number, u1: number): Keep[] => [{ u0, u1, y0: 1.03, y1: 2.4 }];
    shellPocks(s, faces.front, { u0: -flat, u1: flat, y0: 0.2, y1: 2.55 }, 24, lightKeep(-0.92, 0.92), look, 'plaster');
    shellPocks(s, faces.right, { u0: -flat, u1: flat, y0: 0.2, y1: 2.55 }, 20, [...lightKeep(-0.87, 0.87), { u0: -0.15, u1: 0.75, y0: 0.3, y1: 1.0 }], look, 'plaster');
    shellPocks(s, faces.back, { u0: -flat, u1: flat, y0: 1.3, y1: 2.55 }, 10, lightKeep(-0.25, 0.75), look, 'plaster');
    // the sign board on its two posts, scorched along its foot
    const top = y0 + H + 0.08;
    for (const x of [-0.8, 0.8]) s.span('structureMetal', x - 0.035, top, -0.035, x + 0.035, top + 0.62, 0.035, { colour: IRON, decor: true });
    s.span('structureMetal', -1.1, top + 0.62, -0.045, 1.1, top + 1.1, 0.045,
      { colour: [0.72, 0.71, 0.66], colourAt: (p) => (p[1] < top + 0.78 ? [0.16, 0.14, 0.13] : [0.72, 0.71, 0.66]), decor: true });
    s.span('structureMetal', -1.1, top + 0.82, 0.045, 1.1, top + 0.96, 0.056, { colour: shade(paint, 0.9), decor: true });
    // sandbags banked against the back and the left side; the rubble before the counter
    sandbagRun(s, [-1.45, -1.46], [1.5, -1.46], 5, look);
    sandbagRun(s, [-1.46, -1.1], [-1.46, 0.8], 4, look);
    rubbleFoot(s, faces.front, 0.3, 2.0, 0.6, look, 8);
  });
}

/**
 * The pocked transformer kiosk (the transformer shed's family: its body 5.4 x 5.0 x 3.4): a trafostanica of rendered
 * block under a rusted sheet roof, its two steel doors in the gable front, one blown off and leant against the wall by
 * its doorway, the louvred vents high in the sides, a danger plate, the cable run up its back; pocked all over, holed
 * high on one side.
 */
function transformerKiosk(rng: () => number, style: ArchitectureStyle): THREE.BufferGeometry[] {
  return lightBuild(rng, style, (s, look) => {
    const doorL: Opening = { face: 'front', storey: 0, kind: 'door', u: -1.0, w: 1.1, y0: 0, h: 2.4 };
    const doorR: Opening = { face: 'front', storey: 0, kind: 'door', u: 1.0, w: 1.1, y0: 0, h: 2.4, state: 'burnt' };
    const ventR: Opening = { face: 'right', storey: 0, kind: 'window', u: 0, w: 1.0, y0: 2.5, h: 0.55 };
    const ventL: Opening = { face: 'left', storey: 0, kind: 'window', u: 0, w: 1.0, y0: 2.5, h: 0.55 };
    const spec: HouseSpec = {
      w: 5.4, d: 5.0, plinth: null, storeys: [{ h: 3.4, wall: 'plaster' }],
      roof: { kind: 'gable', pitchDeg: 18, eave: 0.2, verge: 0.16, thickness: 0.1, bucket: 'structureMetal' },
      roofColour: rgb(0x7c4a36), openings: [doorL, doorR, ventR, ventL], chimneys: [], gutters: null, verge: null, reveal: 0.14,
    };
    const steel = rgb(0x5b6b5a);
    const frame = buildHouse(s, spec, lightDialect(look, TREAT([[ventR, 'vent'], [ventL, 'vent']]),
      { frame: AH_FRAME, leaf: steel, leafKind: 'plank', gate: steel, sign: null }));
    const f = frame.faces;
    // the standing door's louvres and its danger plate (a red bolt on white)
    for (let k = 0; k < 4; k++) faceBox(s, 'structureMetal', f.front, doorL.u, 1.55 + k * 0.17, -0.09, 0.78, 0.04, 0.04, { colour: shade(steel, 0.72), decor: true });
    faceBox(s, 'structureMetal', f.front, doorL.u, 1.2, -0.085, 0.3, 0.3, 0.02, { colour: [0.8, 0.79, 0.74], decor: true });
    faceBox(s, 'structureMetal', f.front, doorL.u + 0.02, 1.2, -0.068, 0.06, 0.2, 0.012, { colour: [0.55, 0.06, 0.04], decor: true });
    // the blown door leant against the wall beside its doorway, the cable run up the back into the eaves
    slabAlong(s, 'structureMetal', facePoint(f.front, 2.15, 0, 0.55), facePoint(f.front, 2.15, 2.2, 0.06), 1.0, 0.035, f.front.u, f.front.out,
      { colour: shade(steel, 0.55), decor: true });
    faceBox(s, 'structureMetal', f.back, 1.4, 1.7, 0.05, 0.12, 3.4, 0.1, { colour: [0.06, 0.06, 0.06], decor: true });
    // the siege: pocks on every face, a shell hole high in the left side, the rubble under the blown door
    const keeps = (name: Opening['face']) => keepsOf(spec.openings, name, frame);
    shellPocks(s, f.front, wallRect(f.front, 0.2, 3.25), 26, [...keeps('front'), { u0: 1.6, u1: 2.7, y0: 0, y1: 2.4 }], look);
    shellPocks(s, f.right, wallRect(f.right, 0.2, 3.25), 20, keeps('right'), look);
    shellPocks(s, f.left, wallRect(f.left, 0.2, 3.25), 14, [...keeps('left'), { u0: 0.7, u1: 1.9, y0: 1.0, y1: 2.2 }], look);
    shellPocks(s, f.back, wallRect(f.back, 0.2, 3.25), 10, [{ u0: 1.2, u1: 1.6, y0: 0, y1: 3.4 }], look);
    shellHole(s, f.left, 1.3, 1.6, 0.36, look);
    rubbleFoot(s, f.front, doorR.u, 1.5, 0.6, look, 9);
  });
}

/**
 * The sandbagged checkpoint (the security office's family: its body 7.2 x 8.6 x 4.8): a militia post of one tall
 * storey on a stone plinth under a flat roof, its front windows bagged to slits and bags piled under them, its sides
 * sheeted, bagged or burnt out, the back boarded; a boom across the door between two posts, an L of bags on the roof,
 * a bank against one side; pocks on every face, rubble at a back corner.
 */
function checkpoint(rng: () => number, style: ArchitectureStyle): THREE.BufferGeometry[] {
  return lightBuild(rng, style, (s, look) => {
    const win = (face: Opening['face'], u: number, state?: Opening['state']): Opening =>
      ({ face, storey: 0, kind: 'window', u, w: 1.15, y0: 0.95, h: 1.35, ...(state ? { state } : {}) });
    const door: Opening = { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.1, y0: 0, h: 2.35 };
    const fl = win('front', -2.3), fr = win('front', 2.3);
    const r1 = win('right', -2.8), r2 = win('right', 0, 'burnt'), r3 = win('right', 2.8);
    const l1 = win('left', -2.8), l2 = win('left', 0), l3 = win('left', 2.8);
    const b1: Opening = { face: 'back', storey: 0, kind: 'window', u: -1.8, w: 1.0, y0: 1.0, h: 1.1, state: 'boarded' };
    const b2: Opening = { face: 'back', storey: 0, kind: 'window', u: 1.8, w: 1.0, y0: 1.0, h: 1.1 };
    const spec: HouseSpec = {
      w: 7.2, d: 8.6, plinth: { h: 0.45, out: 0.04, bucket: 'stone' }, storeys: [{ h: 3.65, wall: 'plaster' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.0, verge: 0.0, thickness: 0.24, bucket: 'plaster', parapet: 0.45 },
      openings: [door, fl, fr, r1, r2, r3, l1, l2, l3, b1, b2], chimneys: [], gutters: null, verge: null, reveal: 0.16,
    };
    const frame = buildHouse(s, spec, lightDialect(look, TREAT([[fl, 'sandbag'], [fr, 'sandbag'], [r1, 'sheet'], [r3, 'sandbag'],
      [l1, 'sheet'], [l2, 'sandbag'], [l3, 'sheet'], [b2, 'sheet']]), { frame: rgb(0xd6d2c6), leaf: rgb(0x56635a), leafKind: 'plank', gate: rgb(0x56635a), sign: null }));
    const f = frame.faces, floor = 0.45;
    tarRoof(s, frame, 0.22);
    // the post's plate over the door
    faceBox(s, 'structureMetal', f.front, 0, floor + 2.68, 0.03, 1.5, 0.36, 0.04, { colour: rgb(0x2a4a86), decor: true });
    faceBox(s, 'structureMetal', f.front, 0, floor + 2.68, 0.055, 1.3, 0.08, 0.012, { colour: [0.8, 0.8, 0.76], decor: true });
    // the boom across the door lane between its two posts, striped red and white
    for (const x of [-1.55, 1.55]) s.span('structureMetal', x - 0.08, 0, 5.4, x + 0.08, 1.18, 5.56, { colour: [0.42, 0.43, 0.41], decor: true });
    for (let k = 0; k < 6; k++) {
      const x0 = -1.47 + k * 0.49;
      s.span('structureMetal', x0, 0.98, 5.43, x0 + 0.49, 1.08, 5.53, { colour: k % 2 ? [0.78, 0.77, 0.73] : [0.55, 0.07, 0.05], decor: true });
    }
    // bags piled under the front windows, the roof's position, the bank against the right side
    for (const u of [-2.3, 2.3]) sandbagRun(s, [u - 0.95, 4.47], [u + 0.95, 4.47], 4, look);
    const roofY = frame.eaveY + spec.roof.thickness;
    sandbagRun(s, [-3.3, 3.85], [-1.0, 3.85], 3, look, roofY);
    sandbagRun(s, [-3.18, 3.6], [-3.18, 1.6], 3, look, roofY);
    sandbagRun(s, [3.77, -2.2], [3.77, 1.8], 5, look);
    // the siege: pocks on every face, rubble at the back corner
    const keeps = (name: Opening['face']) => keepsOf(spec.openings, name, frame);
    const rect = (face: Face) => wallRect(face, floor + 0.15, frame.eaveY - 0.15);
    shellPocks(s, f.front, rect(f.front), 28, [...keeps('front'), { u0: -0.9, u1: 0.9, y0: floor + 2.4, y1: floor + 2.95 }], look);
    shellPocks(s, f.right, rect(f.right), 22, keeps('right'), look);
    shellPocks(s, f.left, rect(f.left), 16, keeps('left'), look);
    shellPocks(s, f.back, rect(f.back), 12, keeps('back'), look);
    rubbleFoot(s, f.back, -2.6, 1.6, 0.55, look, 7);
  });
}

/**
 * The gutted garage (the service garage's family: its body 9.6 x 11.2 x 5.8): an auto-servis of rendered block under a
 * flat roof, its two vehicle bays in front, one blown in and burnt out (its shutter torn down, the soot over it, the
 * roof broken above it), the other shut and dented; the sign band scorched, the office window, the side door and
 * windows, high strip windows sheeted at the back; the loading dock behind, drums by the side, rubble spilled from the
 * burnt bay.
 */
function guttedGarage(rng: () => number, style: ArchitectureStyle): THREE.BufferGeometry[] {
  return lightBuild(rng, style, (s, look) => {
    const bayA: Opening = { face: 'front', storey: 0, kind: 'gate', u: -2.55, w: 3.4, y0: 0, h: 3.6, state: 'burnt' };
    const bayB: Opening = { face: 'front', storey: 0, kind: 'gate', u: 2.0, w: 3.4, y0: 0, h: 3.6 };
    const office: Opening = { face: 'front', storey: 0, kind: 'window', u: 4.25, w: 0.6, y0: 1.3, h: 1.0 };
    const sideDoor: Opening = { face: 'right', storey: 0, kind: 'door', u: -4.0, w: 0.95, y0: 0, h: 2.15 };
    const side1: Opening = { face: 'right', storey: 0, kind: 'window', u: -1.9, w: 1.2, y0: 1.0, h: 1.25 };
    const side2: Opening = { face: 'right', storey: 0, kind: 'window', u: 1.8, w: 1.6, y0: 3.2, h: 0.9 };
    const left1: Opening = { face: 'left', storey: 0, kind: 'window', u: -2.4, w: 1.8, y0: 3.2, h: 0.9, state: 'burnt' };
    const left2: Opening = { face: 'left', storey: 0, kind: 'window', u: 2.2, w: 1.8, y0: 3.2, h: 0.9 };
    const back1: Opening = { face: 'back', storey: 0, kind: 'window', u: -1.0, w: 2.2, y0: 3.2, h: 0.9 };
    const back2: Opening = { face: 'back', storey: 0, kind: 'window', u: 2.6, w: 2.2, y0: 3.2, h: 0.9 };
    const spec: HouseSpec = {
      w: 9.6, d: 11.2, plinth: null, storeys: [{ h: 5.0, wall: 'plaster3' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.0, verge: 0.0, thickness: 0.3, bucket: 'plaster3', parapet: 0.5 },
      openings: [bayA, bayB, office, sideDoor, side1, side2, left1, left2, back1, back2], chimneys: [], gutters: null, verge: null, reveal: 0.2,
    };
    const shutter = rgb(0x6f7470);
    const frame = buildHouse(s, spec, lightDialect(look, TREAT([[office, 'sheet'], [side1, 'glass'], [side2, 'sheet'], [left2, 'sheet'],
      [back1, 'sheet'], [back2, 'glass']]), { frame: rgb(0xb9b6ad), leaf: rgb(0x4d5a63), leafKind: 'plank', gate: shutter, sign: null }));
    const f = frame.faces, top = frame.eaveY + spec.roof.thickness;
    tarRoof(s, frame, 0.22);
    // the roof broken over the burnt bay: the void through the slab, two bent bars over it
    const hole: Vec3[] = [];
    for (let i = 0; i < 9; i++) {
      const a = -i / 9 * Math.PI * 2, r = 1.2 + look() * 0.5;
      hole.push([-2.55 + Math.cos(a) * r * 1.2, top + 0.02, 3.6 + Math.sin(a) * r]);
    }
    s.polygon('dark', hole, { decor: true });
    for (const dx of [-0.5, 0.4]) {
      slabAlong(s, 'structureMetal', [-2.55 + dx, top + 0.03, 2.5], [-2.55 + dx + 0.3, top + 0.55, 3.4], 0.03, 0.03, [1, 0, 0], [0, 1, 0],
        { colour: [0.22, 0.13, 0.08], decor: true });
    }
    // the burnt bay's shutter torn from its box and hanging out of the opening, black
    slabAlong(s, 'structureMetal', facePoint(f.front, bayA.u - 0.9, 3.5, 0.06), facePoint(f.front, bayA.u - 0.2, 1.4, 0.75), 1.6, 0.04, f.front.u,
      [0, 0.5, 0.86], { colour: [0.1, 0.09, 0.085], decor: true });
    // the sign band across the front over the bays, scorched over the burnt one
    faceBox(s, 'structureMetal', f.front, 2.3, 4.15, 0.04, 4.9, 0.55, 0.05, { colour: [0.78, 0.8, 0.82], decor: true });
    faceBox(s, 'structureMetal', f.front, 2.3, 4.15, 0.07, 4.5, 0.15, 0.012, { colour: rgb(0x2b5a9a), decor: true });
    faceBox(s, 'structureMetal', f.front, -2.55, 4.15, 0.04, 3.7, 0.55, 0.05, { colour: [0.09, 0.08, 0.075], decor: true });
    // the loading dock behind (the family's own reaches there), tyres on it; the drums by the side
    s.span('stone', -4.55, 0, -6.95, -1.95, 0.95, -5.6);
    for (let k = 0; k < 3; k++) s.cylinder('structureMetal', [-2.6, 0.95 + k * 0.2, -6.3], 'y', 0.19, 0.31, 8, { colour: [0.05, 0.05, 0.05], decor: true });
    for (const [x, z, c] of [[5.12, 3.0, 0x6a3a2a], [5.12, 2.3, 0x2f4c6a], [5.08, 1.6, 0x6a3a2a]] as const) {
      s.cylinder('structureMetal', [x, 0, z], 'y', 0.88, 0.29, 8, { colour: rgb(c), decor: true });
    }
    // the siege: pocks, the rubble spilled out of the burnt bay
    const keeps = (name: Opening['face']) => keepsOf(spec.openings, name, frame);
    shellPocks(s, f.front, wallRect(f.front, 0.15, 4.8), 32, [...keeps('front'), { u0: -4.8, u1: 4.8, y0: 3.8, y1: 4.5 }], look);
    shellPocks(s, f.right, wallRect(f.right, 0.15, 4.8), 22, keeps('right'), look);
    shellPocks(s, f.left, wallRect(f.left, 0.15, 4.8), 18, keeps('left'), look);
    shellPocks(s, f.back, wallRect(f.back, 1.1, 4.8), 10, keeps('back'), look);
    rubbleFoot(s, f.front, bayA.u, 3.0, 0.85, look, 12);
  });
}

/**
 * The burnt corner shop (the corner office's family: its body 8.4 x 8.4 x 6.6): an Austro-Hungarian corner house, a
 * storey of flats over its shops under a cornice and parapet, the two shops at the corner burnt out (their glazing gone,
 * their signs scorched, black shutters torn half down, the soot up the wall to the flats), the flats' corner windows
 * burnt too, the others sheeted or bagged; the house door bagged across its foot; a street lamp and a sign post on the
 * pavement before it; a shell hole high in the side, the rubble heaped at the corner.
 */
function burntCornerShop(rng: () => number, style: ArchitectureStyle): THREE.BufferGeometry[] {
  return lightBuild(rng, style, (s, look) => {
    const o = (face: Opening['face'], storey: number, kind: Opening['kind'], u: number, w: number, y0: number, h: number,
      state?: Opening['state']): Opening => ({ face, storey, kind, u, w, y0, h, ...(state ? { state } : {}) });
    // the corner stands at +x +z: the front's shop at its right end, the side's at its left (the faces seen from outside)
    const shopF = o('front', 0, 'shopfront', 2.2, 3.1, 0, 3.15, 'burnt');
    const shopR = o('right', 0, 'shopfront', -2.25, 3.0, 0, 3.15, 'burnt');
    const door = o('front', 0, 'door', -2.55, 1.2, 0, 2.7);
    const gw = o('front', 0, 'window', -0.55, 1.0, 0.95, 1.75);
    const rw1 = o('right', 0, 'window', 1.35, 1.0, 0.95, 1.75), rw2 = o('right', 0, 'window', 3.2, 0.9, 0.95, 1.75);
    const upper: Opening[] = [];
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const n = face === 'front' || face === 'right' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const u = -4.2 + 1.35 + (8.4 - 2.7) * i / (n - 1);
        // the corner's windows burnt (the front's right end, the side's left end)
        const corner = (face === 'front' && i === n - 1) || (face === 'right' && i === 0);
        upper.push(o(face, 1, 'window', u, 1.1, 0.7, 1.7, corner ? 'burnt' : undefined));
      }
    }
    const back0 = o('back', 0, 'window', 1.6, 1.0, 0.95, 1.6, 'boarded');
    const left0 = o('left', 0, 'window', -1.5, 1.0, 0.95, 1.6);
    const spec: HouseSpec = {
      w: 8.4, d: 8.4, plinth: null, storeys: [{ h: 3.7, wall: 'plaster' }, { h: 2.9, wall: 'plaster' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.0, verge: 0.0, thickness: 0.2, bucket: 'plaster', parapet: 0.45 },
      openings: [shopF, shopR, door, gw, rw1, rw2, back0, left0, ...upper], chimneys: [], gutters: null, verge: null, reveal: 0.18,
    };
    const treat: Array<[Opening, Treatment]> = [[gw, 'sandbag'], [rw1, 'sheet'], [rw2, 'sandbag'], [left0, 'sheet']];
    upper.forEach((w, i) => { if (!w.state) treat.push([w, i % 3 === 0 ? 'sheet' : 'glass']); });
    const frame = buildHouse(s, spec, lightDialect(look, TREAT(treat),
      { frame: AH_FRAME, leaf: choose(look(), DOOR_LEAVES), leafKind: 'panel', gate: ROLL_SHUTTER, sign: null }));
    const f = frame.faces, eave = frame.eaveY;
    tarRoof(s, frame, 0.22);
    // the cornice under the parapet and the string course between the storeys, round all four faces
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const face = f[name];
      faceBox(s, 'stone', face, 0, eave - 0.12, 0.08, face.width + 0.32, 0.24, 0.16, { decor: true });
      faceBox(s, 'stone', face, 0, 3.7, 0.04, face.width + 0.16, 0.16, 0.08, { decor: true });
    }
    // the burnt shops' signs, scorched, a black shutter torn half down in each
    for (const shop of [shopF, shopR]) {
      const face = f[shop.face];
      faceBox(s, 'structureWood', face, shop.u, shop.h + 0.32, 0.05, shop.w + 0.4, 0.5, 0.06, { colour: [0.08, 0.07, 0.065], decor: true });
      slabAlong(s, 'structureMetal', facePoint(face, shop.u - shop.w * 0.3, shop.h - 0.05, -0.05), facePoint(face, shop.u + shop.w * 0.1, 1.35, 0.3),
        shop.w * 0.55, 0.03, face.u, face.out, { colour: [0.12, 0.1, 0.09], decor: true });
    }
    // the house door bagged across its foot
    sandbagRun(s, [door.u - 0.85, 4.47], [door.u + 0.85, 4.47], 4, look);
    // the pavement's cast-iron lamp and a sign post (where the family's porch posts stand)
    const iron: Rgb = [0.1, 0.11, 0.1];
    s.cylinder('structureMetal', [-3.85, 0, 5.24], 'y', 3.4, 0.07, 6, { colour: iron, decor: true }, 0.05);
    s.span('structureMetal', -3.85, 3.36, 5.24 - 0.04, -3.4, 3.42, 5.24 + 0.04, { colour: iron, decor: true });
    s.span('structureMetal', -3.52, 3.12, 5.24 - 0.1, -3.32, 3.36, 5.24 + 0.1, { colour: [0.2, 0.22, 0.2], decor: true });
    s.cylinder('structureMetal', [-1.25, 0, 5.24], 'y', 2.9, 0.045, 6, { colour: [0.35, 0.36, 0.34], decor: true });
    s.span('structureMetal', -1.25 - 0.36, 2.45, 5.2, -1.25 + 0.36, 2.75, 5.28, { colour: rgb(0x2a4a86), decor: true });
    // the siege: pocks up both storeys, a shell hole high in the side, the rubble heaped at the corner
    const keeps = (name: Opening['face']) => keepsOf(spec.openings, name, frame);
    shellPocks(s, f.front, wallRect(f.front, 0.2, eave - 0.3), 34, keeps('front'), look);
    shellPocks(s, f.right, wallRect(f.right, 0.2, eave - 0.3), 30, [...keeps('right'), { u0: 0.75, u1: 2.2, y0: 4.55, y1: 6.05 }], look);
    shellPocks(s, f.left, wallRect(f.left, 0.2, eave - 0.3), 12, keeps('left'), look);
    shellPocks(s, f.back, wallRect(f.back, 0.2, eave - 0.3), 10, keeps('back'), look);
    shellHole(s, f.right, 1.47, 5.25, 0.42, look);
    rubbleFoot(s, f.front, 3.0, 2.2, 0.5, look, 9);
    rubbleFoot(s, f.right, -3.0, 2.2, 0.45, look, 9);
  });
}

/**
 * The lock-up garages (the Nissen hut's family: its body 6.8 x 11.5 x 3.7; the Nissen hut leaves the valley): an
 * estate's row of four block garages under one slab roof and its upstand, their steel up-and-over doors in four faded
 * paints, one blown in and burnt out, one banked with sandbags; the bins' shelter against the end wall (where the
 * family's porch stands); pocks along the row, rubble before the burnt door.
 */
function lockupGarages(rng: () => number, style: ArchitectureStyle): THREE.BufferGeometry[] {
  return lightBuild(rng, style, (s, look) => {
    const doors: Opening[] = [-4.31, -1.44, 1.44, 4.31].map((u, i) =>
      ({ face: 'right', storey: 0, kind: 'gate', u, w: 2.4, y0: 0, h: 2.3, ...(i === 2 ? { state: 'burnt' as const } : {}) }));
    const spec: HouseSpec = {
      w: 6.8, d: 11.5, plinth: null, storeys: [{ h: 3.0, wall: 'plaster3' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.0, verge: 0.0, thickness: 0.2, bucket: 'plaster3', parapet: 0.45 },
      openings: doors, chimneys: [], gutters: null, verge: null, reveal: 0.1,
    };
    // each door its own faded paint (the dialect paints the first; the others are painted over it below)
    const paints: readonly Rgb[] = [0x5d6b52, 0x6b4a36, 0x6f7470, 0x3f5d74].map(rgb);
    const frame = buildHouse(s, spec, lightDialect(look, TREAT([]), { frame: AH_FRAME, leaf: paints[0], leafKind: 'plank', gate: paints[0], sign: null }));
    const f = frame.faces;
    tarRoof(s, frame, 0.22);
    doors.forEach((d, i) => {
      if (d.state || i === 0) return;
      faceBox(s, 'structureMetal', f.right, d.u, d.h / 2, -0.055, d.w - 0.04, d.h - 0.04, 0.012, { colour: paints[i], decor: true });
    });
    // the fourth door banked with sandbags
    sandbagRun(s, [3.7, -3.0], [3.7, -5.6], 3, look);
    // the bins' shelter against the +z end wall: two block cheeks, a low front, a sheet roof, the bins in its shade
    s.span('plaster3', -1.8, 0, 5.75, -1.6, 2.0, 6.65);
    s.span('plaster3', 1.6, 0, 5.75, 1.8, 2.0, 6.65);
    s.span('plaster3', -1.6, 0, 6.45, 1.6, 0.9, 6.65);
    s.span('structureMetal', -1.85, 2.0, 5.75, 1.85, 2.06, 6.7, { colour: rgb(0x6c6a62), decor: true });
    for (const x of [-0.8, 0.2]) s.span('dark', x, 0, 5.9, x + 0.7, 1.1, 6.35, { decor: true });
    // the siege: pocks along the row and the ends, the rubble before the burnt door
    shellPocks(s, f.right, wallRect(f.right, 0.15, 2.9), 26, keepsOf(spec.openings, 'right', frame), look);
    shellPocks(s, f.back, wallRect(f.back, 0.15, 2.9), 10, [], look);
    shellPocks(s, f.front, wallRect(f.front, 0.15, 2.9), 10, [{ u0: -2.0, u1: 2.0, y0: 0, y1: 2.2 }], look);
    shellPocks(s, f.left, wallRect(f.left, 0.15, 2.9), 14, [], look);
    rubbleFoot(s, f.right, doors[2].u, 2.0, 0.42, look, 9);
  });
}

/** The kit's light-family variants (types.ts LightVariant), swapped in by props.ts on a map that adopts the kit. */
export const SARAJEVO_LIGHT_VARIANTS: Readonly<Record<string, LightVariant>> = Object.freeze({
  guardpost: { mat: 'regionalPlaster', pal: [0xb4402e, 0xd8d2c4, 0x2c2a28], parts: shelledKiosk },
  transformershed: { mat: 'regionalPlaster', pal: [0xc9c1b0, 0x5b6b5a, 0x33302c], parts: transformerKiosk },
  securityoffice: { mat: 'regionalPlaster', pal: [0xc8c6b6, 0x8c7b58, 0x33302c], parts: checkpoint },
  servicegarage: { mat: 'regionalPlaster3', pal: [0x9a9890, 0x6c6457, 0x2b2a28], parts: guttedGarage },
  corneroffice: { mat: 'regionalPlaster', pal: [0xd2c3a0, 0xa89c88, 0x2a2420], parts: burntCornerShop },
  quonsethut: { mat: 'regionalPlaster3', pal: [0x9f9c94, 0x5d6b52, 0x2b2a28], parts: lockupGarages },
});
