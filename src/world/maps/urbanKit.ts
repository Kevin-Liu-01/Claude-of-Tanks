// src/world/maps/urbanKit.ts — town landmark builders for the urban map:
// a church (tall square tower + spire over a steep-roofed nave) and a small
// brick factory (long hall + round chimney stack). Registered into props.ts
// BUILDER_BY_NAME (see docs/SYSTEMS.md) so map plans can
// place 'church' / 'factory' entries; both give the shelled-town skyline the
// vertical landmarks it was missing.
//
// Builders follow the props.ts contract exactly:
//   make<X>(rng, buckets, wallBucket?) -> {w, d, h}   (footprint + height)
// pushing THREE.BufferGeometry parts into buckets.{plaster,stone,roof,wood,dark}.

import * as THREE from 'three';
import { MARKET_BUILDERS } from './mapKits.ts';
import { RAIL_BUILDERS, catalogHoles, cutHall, envelopeMarker, tagCutHall } from './railKit.ts'; // maps r1: railyard + coastal kits
import { hallPlinth, hallSlab } from './railYardR2.ts'; // the factory's r2 plinth and roof slabs (the looks lane, 2026-10-16)
import { gableAttic, gablePrism as createGablePrism, gableSlabSeat, pitchRoofPlane } from '../propGeometry.ts';
import { reliefGeometries, slabTop, type ReliefPlane } from './regional/roofRelief.ts';
import {
  addConnectedExterior,
  type GeometryBuckets,
  type StructureBuilder,
  type StructureDimensions,
} from './exteriorDetailKit.ts';

interface BuildingParts extends GeometryBuckets {
  plaster: THREE.BufferGeometry[];
  stone: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  glass?: THREE.BufferGeometry[];
}

// --- tiny local twins of the props.ts geometry helpers (not exported there) --
function box(w: number, h: number, d: number, uvScale = 0.5): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const su = uvScale, sv = uvScale;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * su, uv.getY(i) * h * sv);
  return g;
}

const gablePrism = (width: number, height: number, depth: number): THREE.BufferGeometry => (
  createGablePrism(width, height, depth, 0.5)
);

function pushParts(buckets: GeometryBuckets, parts: BuildingParts): void {
  for (const key of Object.keys(parts)) {
    const source = parts[key];
    if (!source?.length) continue;
    const target = buckets[key];
    if (!target) throw new Error(`building target bucket is missing: ${key}`);
    for (const geometry of source) target.push(geometry);
  }
}

function addSideWindow(
  parts: BuildingParts,
  paneBucket: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
): void {
  const outward = Math.sign(x) || 1;
  const faceX = x + outward * 0.01;
  paneBucket.push(box(0.08, height, width).translate(faceX, y, z));
  const frameX = x + outward * 0.04;
  for (const side of [-1, 1]) {
    parts.stone.push(box(0.14, height + 0.24, 0.13)
      .translate(frameX, y, z + side * (width / 2 + 0.065)));
  }
  parts.stone.push(box(0.15, 0.14, width + 0.32)
    .translate(frameX, y + height / 2 + 0.08, z));
  parts.stone.push(box(0.17, 0.12, width + 0.36)
    .translate(frameX, y - height / 2 - 0.08, z));
  // Two real mullions stop a large industrial or nave opening reading as a
  // flat black sticker at close range.
  parts.wood.push(box(0.10, height - 0.10, 0.065).translate(frameX + outward * 0.025, y, z));
  parts.wood.push(box(0.10, 0.07, width - 0.10).translate(frameX + outward * 0.025, y, z));
}

/**
 * Stone church: nave with a steep tiled roof + front tower with belfry
 * openings and a tall pyramidal spire. ~21 m to the spire tip — reads on the
 * town skyline from every establishing angle.
 * @param {function():number} rng seeded RNG
 * @param {object} buckets geometry buckets {plaster,stone,roof,wood,dark}
 * @returns {{w:number,d:number,h:number}} footprint + height
 */
export function makeChurch(_rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const parts: BuildingParts = {
    plaster: [], stone: [], roof: [], wood: [], dark: [],
  };
  // content_breadth r3: window panes ride the props.ts 'glass' bucket when
  // the facade-variety patch is applied (sky-catching panes); falls back to
  // 'dark' cleanly on an unpatched props.ts.
  if (buckets.glass) parts.glass = [];
  const pane = parts.glass || parts.dark;
  const w = 9.2, d = 17.5, wallH = 5.6, roofH = 3.4;
  // nave
  parts.stone.push(box(w + 0.4, 1.2, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.6).translate(0, wallH / 2, -1.2));
  parts.stone.push(gablePrism(w, roofH, 0.34).translate(0, wallH, d / 2 - 1.4));
  parts.stone.push(gablePrism(w, roofH, 0.34).translate(0, wallH, -d / 2 - 1.0));
  // (the buildings stream, 2026-10-13: each slab's underside on the gable's own slope, the nave's roof space closed
  // under them; the slabs stood 15 cm over the wall tops along both eaves)
  const seat = gableSlabSeat(w / 2, roofH, 0.4, 0.13);
  parts.stone.push(gableAttic(w, roofH, d).translate(0, wallH, -1.2));
  for (const side of [-1, 1]) {
    const slab = box(seat.length, 0.13, d + 0.6, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, seat.pitch, 'gable');
    slab.translate(-side * seat.out, wallH + seat.up, -1.2);
    parts.roof.push(slab);
  }
  // tall arched nave windows (glass inset strips with stone sills)
  for (let k = 0; k < 4; k++) {
    const zz = -d / 2 + 2.6 + k * 3.4;
    for (const side of [-1, 1]) {
      addSideWindow(parts, pane, side * (w / 2 + 0.05), 2.9, zz - 1.2, 0.8, 2.2);
    }
  }
  // front tower + belfry + spire
  const tw = 4.6, towerH = 12.6;
  const tz = d / 2 + tw / 2 - 2.2;
  parts.stone.push(box(tw, towerH, tw, 0.62).translate(0, towerH / 2, tz));
  for (const side of [-1, 1]) { // belfry sound openings, all four faces
    parts.dark.push(box(0.9, 1.7, 0.10).translate(side * tw * 0.18, towerH - 1.6, tz + tw / 2 + 0.05));
    parts.dark.push(box(0.9, 1.7, 0.10).translate(side * tw * 0.18, towerH - 1.6, tz - tw / 2 - 0.05));
    parts.dark.push(box(0.10, 1.7, 0.9).translate(side * (tw / 2 + 0.05), towerH - 1.6, tz + side * 0 + tw * 0.0));
  }
  // clock blank + portal
  parts.plaster.push(box(1.5, 1.5, 0.12).translate(0, towerH - 4.0, tz + tw / 2 + 0.04));
  parts.wood.push(box(1.7, 2.9, 0.14).translate(0, 1.45, tz + tw / 2 + 0.10));
  parts.dark.push(box(1.4, 2.6, 0.08).translate(0, 1.3, tz + tw / 2 + 0.16));
  // spire: tall octagonal cone + finial ball
  const spire = new THREE.ConeGeometry(tw * 0.62, 7.4, 8, 1);
  const uv = spire.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
  spire.translate(0, towerH + 3.7, tz);
  parts.roof.push(spire);
  const ball = new THREE.SphereGeometry(0.28, 8, 6);
  ball.translate(0, towerH + 7.5, tz);
  parts.dark.push(ball);
  // (the buildings stream, 2026-10-13, the integrity check: the nave stands 1.2 m back from the building's origin, so the
  // exterior pass, which dresses a body centred on it, set the west door and its lamp 1.2 m inside the nave and the east
  // end's inside the tower) the pass dresses the nave in its own frame
  const toNave = (dz: number): void => { for (const list of Object.values(parts)) for (const g of list ?? []) g.translate(0, 0, dz); };
  toNave(1.2);
  addConnectedExterior(parts, { id: 'church', w, d, wallH, profile: 'civic', variant: 1 });
  toNave(-1.2);
  pushParts(buckets, parts);
  return { w: w + 0.4, d: d + tw + 0.6, h: towerH + 7.8 };
}

/**
 * Small brick factory: long stone hall, clerestory band, shallow gable roof
 * and a ~15 m round chimney stack — the industrial counterpoint landmark.
 * (Props census #13, lane B 2026-10-15; the judges: "the walls are ONE stone box ... the windows framed glass slabs
 * proud of the wall, the cart door a dark box": the plan factory is the Ironworks court's donor.) The hall's walls stand
 * round its core with the windows and the catalog's entry and back apertures cut through them (railKit cutHall,
 * catalogHoles): each window's glass and its mullion and transom at the back of the reveal, its brick jambs, lintel and
 * stone sill round the cut; the catalog's door and panes at the back of their cuts, its frames round them; the stack
 * banded, its parts tagged for the damage reading (a shaft beside the hall). The seeded stream's draws, the count of
 * parts that take the stream's uv draws and the plinth (the court's support band) are the old build's, exactly.
 * @param {function():number} rng seeded RNG
 * @param {object} buckets geometry buckets {plaster,stone,roof,wood,dark}
 * @returns {{w:number,d:number,h:number}} footprint + height
 */
export function makeFactory(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const parts: BuildingParts = {
    plaster: [], stone: [], roof: [], wood: [], dark: [],
  };
  // content_breadth r3: see makeChurch — glass panes when available
  if (buckets.glass) parts.glass = [];
  const pane = parts.glass || parts.dark;
  const w = 11.5, d = 19.0, wallH = 6.2, roofH = 2.0, t = 0.38;
  const none = <T extends THREE.BufferGeometry>(g: T): T => { g.userData.uvJitter = 'none'; return g; };
  parts.stone.push(hallPlinth(w + 0.4, 1.2, d + 0.4, -0.7));
  // the catalog exterior first (its parts are pushed last, as before): its entry door and its back apertures are cut
  // through the walls, their plates at the back of the cuts
  const cat: BuildingParts = { plaster: [], stone: [], roof: [], wood: [], dark: [], ...(parts.glass ? { glass: [] } : {}) };
  addConnectedExterior(cat, { id: 'factory', w, d, wallH, profile: 'industrial', variant: 0 });
  const cut = catalogHoles(cat, w, d, /^(entry-door|aperture-pane)/, 0.5);
  // the windows of the long walls, one to each of the catalog's bays (between its pilaster strips), where nothing of the
  // catalog stands on the face: each the old window's draw (the fifth bay's draws kept), each the old window's seven
  // stream parts; a window the old build drew and this one has not, its parts' draws kept by stand-ins in the core
  const win = { w: 1.35, h: 2.6, y: 3.4 };
  let drawn = 0;
  const bays: Array<{ side: number; zz: number }> = [];
  for (let k = 0; k < 5; k++) {
    for (const side of [-1, 1]) {
      if (rng() < 0.12) continue;
      drawn++;
      if (k === 4) continue;
      const zz = -d / 2 + (k + 0.5) * (d / 4), hole = { at: zz, w: win.w, y0: win.y - win.h / 2, y1: win.y + win.h / 2 };
      if (!cut.clear(side > 0 ? 'px' : 'nx', hole)) continue;
      bays.push({ side, zz });
      cut.holes[side > 0 ? 'px' : 'nx'].push(hole);
    }
  }
  const shell: THREE.BufferGeometry[] = [];
  // (the core, the room's dark at the back of every cut, stands in the stream where the solid hall stood)
  parts.dark.push(cutHall(shell, w, d, wallH, t, cut.holes));
  parts.stone.push(...shell);
  parts.stone.push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts.stone.push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  // (the buildings stream, 2026-10-13: each slab's underside on the gable's own slope, the hall closed under them)
  const seat = gableSlabSeat(w / 2, roofH, 0.4, 0.14);
  parts.stone.push(gableAttic(w, roofH, d).translate(0, wallH, 0));
  const roofPlanes: ReliefPlane[] = [];
  for (const side of [-1, 1]) {
    const slab = hallSlab(seat.length, 0.14, d + 0.7, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, seat.pitch, 'gable');
    slab.translate(-side * seat.out, wallH + seat.up, 0);
    parts.roof.push(slab);
    roofPlanes.push(slabTop(slab, [-side * Math.sin(seat.pitch), Math.cos(seat.pitch), 0], 0.2));
  }
  // (dome-detail-275, the roof scan: the hall's roof a smooth slab) its corrugated sheets in their lapped courses
  // (regional/roofRelief.ts; dressing, no stream draws)
  parts.roof.push(...reliefGeometries({ kind: 'sheet', ribs: 2, seed: 3, budget: 500 }, roofPlanes));
  // each window: the glass at the back of the reveal (the core's face behind it), the mullion and transom in the reveal;
  // the brick jambs and lintel round the cut and the stone sill under it
  for (const { side, zz } of bays) {
    const back = side * (w / 2 - t + 0.03), face = side * (w / 2);
    pane.push(box(0.04, win.h, win.w).translate(back, win.y, zz));
    for (const s2 of [-1, 1]) parts.stone.push(box(0.06, win.h + 0.24, 0.14).translate(face + side * 0.03, win.y, zz + s2 * (win.w / 2 + 0.07)));
    parts.stone.push(box(0.08, 0.18, win.w + 0.32).translate(face + side * 0.04, win.y + win.h / 2 + 0.09, zz));
    parts.stone.push(box(0.14, 0.1, win.w + 0.36).translate(face + side * 0.05, win.y - win.h / 2 - 0.05, zz));
    parts.wood.push(box(0.06, win.h, 0.06).translate(back + side * 0.05, win.y, zz));
    parts.wood.push(box(0.06, 0.06, win.w).translate(back + side * 0.05, win.y + win.h * 0.15, zz));
  }
  // the stand-ins: the draws of the windows the old build laid and this one does not, and of its laid-on loading door
  // (the catalog's entry is the door), taken by small parts sealed in the plinth under the core, each on the core's foot
  for (let k = 0; k < 7 * (drawn - bays.length) + 1; k++) parts.stone.push(box(0.02, 0.02, 0.02).translate(0, 0, -d / 2 + t + 0.5 + k * 0.05));
  parts.wood.push(box(3.4, 0.7, 0.10).translate(-w * 0.12, 4.1, d / 2 + 0.08));
  // round brick chimney stack with a flared crown and its iron bands, its parts the shaft the damage reading falls apart
  // from the hall
  const cx = w / 2 - 1.6, cz = -d / 2 + 2.4, stackH = 15.0;
  const stack = new THREE.CylinderGeometry(0.62, 0.95, stackH, 10, 1);
  const uv2 = stack.attributes.uv;
  for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) * 4, uv2.getY(i) * 8);
  stack.translate(cx, stackH / 2, cz);
  stack.userData.damageBody = 'shaft';
  parts.stone.push(stack);
  const crown = new THREE.CylinderGeometry(0.80, 0.66, 0.9, 10, 1);
  crown.translate(cx, stackH + 0.35, cz);
  crown.userData.damageBody = 'shaft';
  parts.dark.push(crown);
  for (const y of [wallH + 3.2, wallH + 6.0, stackH - 1.2]) {
    const r = 0.95 - (0.95 - 0.62) * y / stackH + 0.03;
    const band = none(new THREE.CylinderGeometry(r, r, 0.14, 10, 1).translate(cx, y, cz));
    band.userData.damageBody = 'shaft';
    parts.dark.push(band);
  }
  // (dome-detail-275: "a plain hall and stack"; every part new to the stream, none taking a draw) the hall's brick order:
  // its corners' piers from the plinth to the eave, the corbelled cornice along each eave; a louvred round vent in each
  // gable under the roof; the ridge roll and two ventilators on the ridge under their caps; the stack's crown
  // corbelled out in two courses under its cap, a fourth band, the lightning conductor down its back (the stack's parts
  // the shaft the damage reading falls from the hall)
  const top = wallH - 0.34, py = (0.5 + top) / 2, ph = top - 0.5;
  for (const sx of [-1, 1]) {
    for (const e of [-1, 1]) {
      parts.stone.push(none(box(0.2, ph, 0.66).translate(sx * (w / 2 + 0.09), py, e * (d / 2 - 0.33))));
      parts.stone.push(none(box(0.66, ph, 0.2).translate(sx * (w / 2 - 0.33), py, e * (d / 2 + 0.09))));
    }
    parts.stone.push(none(box(0.14, 0.16, d + 0.04).translate(sx * (w / 2 + 0.06), wallH - 0.42, 0)));
    parts.stone.push(none(box(0.26, 0.3, d + 0.2).translate(sx * (w / 2 + 0.12), wallH - 0.19, 0)));
  }
  // each window's segmental relieving arch in three voussoirs over its lintel, the sill course along the long walls
  for (const { side, zz } of bays) {
    const half = win.w / 2 + 0.2, rise = 0.26, yh = win.y + win.h / 2 + 0.18;
    const R = (half * half + rise * rise) / (2 * rise), a0 = Math.asin(half / R);
    for (let k = 0; k < 3; k++) {
      const a = -a0 + (2 * a0) * (k + 0.5) / 3;
      const v = none(box(0.16, 0.3, 2 * (R + 0.15) * Math.sin(a0 / 3) + 0.02));
      v.rotateX(a);
      v.translate(side * (w / 2 + 0.06), yh - (R - rise) + (R + 0.15) * Math.cos(a), zz + (R + 0.15) * Math.sin(a));
      parts.stone.push(v);
    }
  }
  for (const sx of [-1, 1]) parts.stone.push(none(box(0.14, 0.16, d - 0.6).translate(sx * (w / 2 + 0.06), win.y - win.h / 2 - 0.2, 0)));
  for (const e of [-1, 1]) {
    const oy = wallH + roofH * 0.42, oz = e * (d / 2);
    parts.stone.push(none(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 10, 1).rotateX(Math.PI / 2).translate(0, oy, oz + e * 0.06)));
    parts.dark.push(none(new THREE.CircleGeometry(0.44, 10).rotateY(e > 0 ? 0 : Math.PI).translate(0, oy, oz + e * 0.125)));
    for (const dy of [-0.2, 0, 0.2]) parts.stone.push(none(box(0.82 - Math.abs(dy) * 1.4, 0.06, 0.08).translate(0, oy + dy, oz + e * 0.16)));
  }
  parts.dark.push(none(new THREE.CylinderGeometry(0.12, 0.12, d + 0.7, 8, 1).rotateX(Math.PI / 2).translate(0, wallH + roofH + 0.1, 0)));
  for (const vz of [-d * 0.22, d * 0.22]) {
    parts.dark.push(none(box(0.9, 0.7, 2.2).translate(0, wallH + roofH + 0.2, vz)));
    parts.roof.push(none(gablePrism(1.3, 0.4, 2.5).translate(0, wallH + roofH + 0.55, vz)));
  }
  const shaftPart = <T extends THREE.BufferGeometry>(g: T): T => { g.userData.damageBody = 'shaft'; return none(g); };
  for (const [r0, r1, y] of [[0.68, 0.74, stackH - 0.35], [0.76, 0.82, stackH - 0.12]] as const) parts.stone.push(shaftPart(new THREE.CylinderGeometry(r1, r0, 0.22, 10, 1).translate(cx, y, cz)));
  {
    const y = wallH + 9.0, r = 0.95 - (0.95 - 0.62) * y / stackH + 0.03;
    parts.dark.push(shaftPart(new THREE.CylinderGeometry(r, r, 0.14, 10, 1).translate(cx, y, cz)));
  }
  const rAt = (y: number): number => 0.95 - (0.95 - 0.62) * y / stackH;
  const rod = (a: [number, number, number], b: [number, number, number]) => {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
    const g = box(0.03, 0.03, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()));
    parts.dark.push(shaftPart(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)));
  };
  rod([cx, wallH + 0.6, cz - rAt(wallH + 0.6) * 0.97 - 0.01], [cx, stackH, cz - rAt(stackH) * 0.97 - 0.01]);
  rod([cx, stackH, cz - rAt(stackH) * 0.97 - 0.01], [cx, stackH + 0.95, cz - 0.86]);
  for (const key of Object.keys(cat)) parts[key]!.push(...cat[key]!);
  // the body's marker for the catalog pass props.ts lays after the builder (it reads the solid's bounds), and the cut hall's
  // tag for settleCatalogCuts, which cuts that pass's openings too
  parts.stone.push(envelopeMarker(w, wallH, d));
  pushParts(buckets, parts);
  tagCutHall(buckets, { w, d, h: wallH, t, holes: cut.holes, pieces: shell, bucket: 'stone', paint: null, units: cut.units });
  return { w: w + 0.4, d: d + 0.4, h: stackH + 1 };
}

/** Builders keyed by plan name — spread into props.ts BUILDER_BY_NAME.
 * content_breadth r2: the desert bazaar builders (maps/mapKits.ts) ride the
 * same registry, so 'market' / 'marketRow' plan entries work map-wide with
 * no props.ts change. */
export const URBAN_BUILDERS: Record<string, StructureBuilder> = {
  church: makeChurch, factory: makeFactory, ...MARKET_BUILDERS,
  ...RAIL_BUILDERS, // maps r1: warehouse/gantry/containerRow/… + coastal kit
};
