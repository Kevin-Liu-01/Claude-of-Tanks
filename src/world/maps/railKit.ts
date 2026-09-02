// src/world/maps/railKit.ts — industrial + maritime landmark builders for the
// maps r1 battlefields (railyard, coastal). Registered into props.ts
// BUILDER_BY_NAME through maps/urbanKit.ts URBAN_BUILDERS (same zero-props.ts-
// change contract as the desert bazaar kit):
//   make<X>(rng, buckets, wallBucket?) -> {w, d, h}
// pushing THREE.BufferGeometry into buckets.{plaster,stone,roof,wood,dark,
// glass,baked}. 'stone' is BRICK on railyard (sourcedTextures swap), 'baked'
// is the matte vertex-colored bucket (containers, tar decks).

import * as THREE from 'three';
import {
  box, gablePrism as createGablePrism, jitterUV, scaleUV,
} from '../propGeometry.ts';
import type {
  GeometryBuckets,
  StructureBuilder,
  StructureDimensions,
} from './exteriorDetailKit.ts';

const gablePrism = (width: number, height: number, depth: number): THREE.BufferGeometry => (
  createGablePrism(width, height, depth, 0.5)
);

/** Flat vertex paint (with slight per-vertex value jitter) for the matte
 * vertex-colored 'baked' bucket — the container/tar-deck material. */
function paintGeo(
  geo: THREE.BufferGeometry,
  rng: () => number,
  r: number,
  g: number,
  b: number,
  jitter = 0.06,
): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 1 + (rng() - 0.5) * jitter * 2;
    col[i * 3] = Math.min(1, r * v);
    col[i * 3 + 1] = Math.min(1, g * v);
    col[i * 3 + 2] = Math.min(1, b * v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// =============================================================================
// RAIL YARD BUILDERS
// =============================================================================

/**
 * Brick freight warehouse: long hall, shallow gable in grey sheeting, big
 * timber sliding doors on the street face, clerestory window band, roof
 * ridge vents. The rail yard's bread-and-butter block.
 */
export function makeWarehouse(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const parts: GeometryBuckets = {
    plaster: [], stone: [], roof: [], wood: [], dark: [], baked: [],
  };
  if (buckets.glass) parts.glass = [];
  const pane = parts.glass || parts.dark;
  const w = 13.5 + rng() * 3, d = 21 + rng() * 5, wallH = 5.4 + rng() * 0.8, roofH = 1.9;
  parts.stone.push(box(w + 0.4, 1.1, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.55).translate(0, wallH / 2, 0));
  parts.stone.push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts.stone.push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  const slope = Math.hypot(w / 2 + 0.4, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + 0.4);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.13, d + 0.7, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + 0.2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  // ridge vents (dark monitor boxes along the ridge line)
  for (let k = 0; k < 3; k++) {
    const vz = -d / 3 + k * (d / 3);
    parts.dark.push(box(0.8, 0.55, 2.6).translate(0, wallH + roofH + 0.22, vz));
  }
  // sliding freight doors (street face +z): timber leaves on a dark rail
  for (const dx of [-w * 0.22, w * 0.22]) {
    parts.wood.push(box(3.1, 3.6, 0.14, 0.8).translate(dx, 1.8, d / 2 + 0.09));
    parts.dark.push(box(3.5, 0.16, 0.10).translate(dx, 3.85, d / 2 + 0.12));
  }
  // clerestory band both long walls
  for (let k = 0; k < 5; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / 5);
    for (const side of [-1, 1]) {
      if (rng() < 0.15) continue;
      pane.push(box(0.08, 1.0, 1.6).translate(side * (w / 2 + 0.05), wallH - 1.05, zz));
      parts.wood.push(box(0.12, 0.10, 1.75).translate(side * (w / 2 + 0.06), wallH - 1.65, zz));
    }
  }
  // loading dock apron + a couple of pallets/crates
  const dock = box(w * 0.7, 0.7, 2.2, 0.6);
  dock.translate(0, 0.35, d / 2 + 1.25);
  parts.stone.push(jitterUV(dock, rng));
  for (let k = 0, n = 2 + ((rng() * 3) | 0); k < n; k++) {
    const cs = 0.6 + rng() * 0.5;
    const crate = box(cs, cs, cs, 1.0);
    crate.rotateY(rng() * Math.PI * 0.5);
    crate.translate((rng() - 0.5) * w * 0.6, 0.7 + cs / 2, d / 2 + 1.0 + rng() * 0.8);
    parts.wood.push(jitterUV(crate, rng));
  }
  for (const key of Object.keys(parts)) {
    const source = parts[key];
    const target = buckets[key];
    if (source && target) for (const geometry of source) target.push(geometry);
  }
  return { w: w + 0.4, d: d + 3.0, h: wallH + roofH + 0.8 };
}

/**
 * Container row: 5-6 shipping boxes in a ragged rank, a couple stacked two
 * high — the yard's signature hard cover. Vertex-painted (rust red, sea blue,
 * olive, tan) on the matte 'baked' bucket; corrugation is left to the grime
 * shader at this scale.
 */
export function makeContainerRow(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const target = buckets.baked || buckets.dark;
  // LINEAR-space vertex colors (the 'baked' material multiplies them raw):
  // sRGB-looking values rendered as pastel candy — these are authored dark
  const COLS = [
    [0.130, 0.022, 0.014], // rust red
    [0.022, 0.048, 0.085], // sea blue
    [0.038, 0.052, 0.024], // olive drab
    [0.150, 0.100, 0.045], // sand tan
    [0.060, 0.014, 0.010], // oxide brown
  ];
  const n = 5 + ((rng() * 2) | 0);
  const CL = 6.1, CW = 2.44, CH = 2.6;
  let x = -((n - 1) * (CW + 0.5)) / 2;
  for (let k = 0; k < n; k++) {
    const c = COLS[(rng() * COLS.length) | 0];
    const yaw = (rng() - 0.5) * 0.08;
    const zOff = (rng() - 0.5) * 1.4;
    const g = box(CW, CH, CL, 0.4);
    paintGeo(g, rng, c[0], c[1], c[2]);
    g.rotateY(yaw);
    g.translate(x, CH / 2, zOff);
    target.push(g);
    if (rng() < 0.45) { // second tier
      const c2 = COLS[(rng() * COLS.length) | 0];
      const g2 = box(CW, CH, CL, 0.4);
      paintGeo(g2, rng, c2[0], c2[1], c2[2]);
      g2.rotateY(yaw + (rng() - 0.5) * 0.05);
      g2.translate(x + (rng() - 0.5) * 0.2, CH * 1.5 + 0.02, zOff + (rng() - 0.5) * 0.5);
      target.push(g2);
    }
    x += CW + 0.4 + rng() * 0.5;
  }
  const w = n * (CW + 0.5) + 0.6;
  return { w, d: CL + 2.2, h: CH * 2 + 0.2 };
}

/**
 * Rail-served gantry crane: two braced leg towers, a deep bridge girder
 * spanning them, trolley + hook block and a cabin — the yard's skyline
 * landmark (~12.5 m).
 */
export function makeGantry(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const span = 15 + rng() * 2, legH = 9.5 + rng() * 1.2, girderH = 1.35;
  const mk = (geometry: THREE.BufferGeometry): void => { buckets.dark.push(geometry); };
  for (const s of [-1, 1]) { // A-frame leg towers
    const lx = s * span / 2;
    for (const dz of [-1.7, 1.7]) {
      const leg = box(0.42, legH, 0.42, 1.0);
      leg.translate(lx, legH / 2, dz);
      mk(leg);
    }
    // cross braces (X read from a distance is carried by two diagonals)
    for (const dir of [-1, 1]) {
      const br = box(0.16, Math.hypot(legH * 0.55, 3.4), 0.16, 1.0);
      br.rotateX(dir * Math.atan2(3.4, legH * 0.55));
      br.translate(lx, legH * 0.45, 0);
      mk(br);
    }
    const foot = box(1.4, 0.5, 4.6, 0.8);
    foot.translate(lx, 0.22, 0);
    buckets.stone.push(jitterUV(foot, rng));
    // Cap beam joins both A-frame legs to the central bridge. Previously the
    // girder visually hovered between the two z-offset towers.
    const cap = box(0.62, 0.42, 4.0, 0.8);
    cap.translate(lx, legH + 0.14, 0);
    mk(cap);
  }
  // bridge girder + rail, overhanging one side
  const gird = box(span + 4.5, girderH, 1.5, 0.7);
  gird.translate(0.8, legH + girderH / 2, 0);
  mk(gird);
  const rail = box(span + 4.5, 0.14, 0.2, 1.0);
  rail.translate(0.8, legH - 0.07, 0);
  mk(rail);
  // trolley + cable + hook block
  const tx = (rng() - 0.5) * span * 0.6;
  const trolley = box(1.5, 0.7, 1.9, 1.0);
  trolley.translate(tx, legH + girderH + 0.3, 0);
  mk(trolley);
  const drop = 2.2 + rng() * 2.6;
  const cable = box(0.05, drop, 0.05, 2.0);
  cable.translate(tx, legH - drop / 2, 0);
  mk(cable);
  const hook = box(0.55, 0.75, 0.4, 1.0);
  hook.translate(tx, legH - drop - 0.35, 0);
  mk(hook);
  // operator cabin under the girder
  const cab = box(1.6, 1.5, 1.6, 0.8);
  cab.translate(-span / 2 + 1.4, legH - 0.9, 1.3);
  mk(cab);
  // Twin hangers physically seat the operator cabin under the girder.
  for (const x of [-span / 2 + 0.95, -span / 2 + 1.85]) {
    const hanger = box(0.12, 0.42, 0.12, 1.0);
    hanger.translate(x, legH + 0.15, 0.62);
    mk(hanger);
  }
  if (buckets.glass) {
    const gl = box(1.4, 0.7, 0.06);
    gl.translate(-span / 2 + 1.4, legH - 0.65, 2.11);
    buckets.glass.push(gl);
  }
  return { w: span + 5, d: 5.4, h: legH + girderH + 0.8 };
}

/** Riveted water tower: cylindrical tank on four braced legs + conical cap. */
export function makeWaterTower(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const legH = 7.2 + rng() * 0.8, tankH = 3.4, tankR = 2.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = box(0.3, legH + 0.4, 0.3, 1.2);
    // Feet flare away from the tower centre while the tops converge beneath
    // the vessel. The old signs did the inverse, making the support cage read
    // upside down from every Garage and battlefield angle.
    leg.rotateZ(sx * 0.045);
    leg.rotateX(sz * -0.045);
    leg.translate(sx * 1.7, legH / 2, sz * 1.7);
    buckets.dark.push(leg);
  }
  for (const yy of [legH * 0.4, legH * 0.75]) { // ring braces
    for (const rot of [0, Math.PI / 2]) {
      const br = box(3.9, 0.14, 0.14, 1.2);
      br.rotateY(rot);
      br.translate(0, yy, 0);
      buckets.dark.push(br);
    }
  }
  const tank = new THREE.CylinderGeometry(tankR, tankR, tankH, 12, 1);
  scaleUV(tank, 6, 2);
  tank.translate(0, legH + tankH / 2, 0);
  buckets.plaster.push(jitterUV(tank, rng));
  const cap = new THREE.ConeGeometry(tankR + 0.25, 1.1, 12, 1);
  scaleUV(cap, 3, 1);
  cap.translate(0, legH + tankH + 0.55, 0);
  buckets.roof.push(cap);
  const pipe = box(0.22, legH, 0.22, 2.0);
  pipe.translate(0.6, legH / 2, 0);
  buckets.dark.push(pipe);
  return { w: 5.4, d: 5.4, h: legH + tankH + 1.2 };
}

/** Standalone round brick smokestack (~17 m) on a square plinth — the
 * overcast skyline needs verticals even where no factory slot landed. */
export function makeStack(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const stackH = 15.5 + rng() * 3;
  const plinth = box(3.2, 1.6, 3.2, 0.7);
  plinth.translate(0, 0.7, 0);
  buckets.stone.push(jitterUV(plinth, rng));
  const stack = new THREE.CylinderGeometry(0.72, 1.15, stackH, 10, 1);
  scaleUV(stack, 4, 8);
  stack.translate(0, 1.4 + stackH / 2, 0);
  buckets.stone.push(jitterUV(stack, rng));
  const crown = new THREE.CylinderGeometry(0.92, 0.78, 1.0, 10, 1);
  crown.translate(0, 1.4 + stackH + 0.4, 0);
  buckets.dark.push(crown);
  return { w: 3.4, d: 3.4, h: stackH + 2.6 };
}

/** Open-sided loading shed: platform, posts, mono-pitch roof, crate stacks. */
export function makeShed(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 9 + rng() * 2, d = 6.4, ph = 3.4 + rng() * 0.4;
  const plat = box(w, 0.55, d, 0.6);
  plat.translate(0, 0.27, 0);
  buckets.stone.push(jitterUV(plat, rng));
  for (const [sx, sz] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) {
    const post = box(0.22, ph, 0.22, 1.2);
    post.translate(sx * (w / 2 - 0.5), 0.55 + ph / 2, sz * (d / 2 - 0.5));
    buckets.wood.push(jitterUV(post, rng));
  }
  const roof = box(w + 0.8, 0.12, d + 0.8, 0.35);
  roof.rotateX(-0.09);
  roof.translate(0, 0.55 + ph + 0.06, 0);
  buckets.roof.push(jitterUV(roof, rng));
  for (let k = 0, n = 3 + ((rng() * 4) | 0); k < n; k++) {
    const cs = 0.55 + rng() * 0.5;
    const crate = box(cs, cs, cs, 1.0);
    crate.rotateY(rng() * Math.PI * 0.5);
    crate.translate((rng() - 0.5) * (w - 2.2), 0.55 + cs / 2, (rng() - 0.5) * (d - 2.2));
    buckets.wood.push(jitterUV(crate, rng));
  }
  return { w: w + 0.8, d: d + 0.8, h: ph + 1.0 };
}

// =============================================================================
// COASTAL BUILDERS
// =============================================================================

/** Whitewashed lighthouse: tapered tower, gallery ring, dark lantern and red
 * cap (~15 m) — the fishing village's vertical landmark. */
export function makeLighthouse(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const towH = 11.5 + rng() * 1.5;
  const base = new THREE.CylinderGeometry(2.4, 2.7, 1.2, 12, 1);
  scaleUV(base, 5, 1);
  base.translate(0, 0.5, 0);
  buckets.stone.push(jitterUV(base, rng));
  const tow = new THREE.CylinderGeometry(1.35, 1.95, towH, 12, 1);
  scaleUV(tow, 5, 4);
  tow.translate(0, 1.1 + towH / 2, 0);
  buckets.plaster.push(jitterUV(tow, rng));
  // gallery ring + rail posts
  const gal = new THREE.CylinderGeometry(1.95, 1.95, 0.18, 12, 1);
  gal.translate(0, 1.1 + towH + 0.09, 0);
  buckets.dark.push(gal);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const post = box(0.07, 0.9, 0.07, 2.0);
    post.translate(Math.cos(a) * 1.8, 1.1 + towH + 0.6, Math.sin(a) * 1.8);
    buckets.dark.push(post);
  }
  // lantern: glass drum + red cap
  const lant = new THREE.CylinderGeometry(1.0, 1.0, 1.5, 10, 1);
  lant.translate(0, 1.1 + towH + 0.95, 0);
  (buckets.glass || buckets.dark).push(lant);
  const cap = new THREE.ConeGeometry(1.25, 1.0, 10, 1);
  cap.translate(0, 1.1 + towH + 2.1, 0);
  buckets.roof.push(cap);
  const door = box(0.9, 1.8, 0.1, 1.0);
  door.translate(0, 0.9, 1.95);
  buckets.wood.push(door);
  return { w: 5.6, d: 5.6, h: towH + 3.4 };
}

/** Timber boat shed: low gabled plank hall with a wide slipway mouth and an
 * upturned dinghy alongside. */
export function makeBoatshed(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 7.4 + rng() * 1.2, d = 9.5 + rng() * 1.5, wallH = 2.8, roofH = 1.7;
  const base = box(w + 0.3, 0.5, d + 0.3, 0.7);
  base.translate(0, -0.05, 0);
  buckets.stone.push(jitterUV(base, rng));
  const hall = box(w, wallH, d, 0.6);
  hall.translate(0, wallH / 2 + 0.2, 0);
  buckets.wood.push(jitterUV(hall, rng));
  buckets.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH + 0.2, d / 2 - 0.15));
  buckets.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH + 0.2, -d / 2 + 0.15));
  const slope = Math.hypot(w / 2 + 0.4, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + 0.4);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.11, d + 0.7, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + 0.2), wallH + 0.2 + roofH / 2 + 0.05, 0);
    buckets.roof.push(slab);
  }
  // slipway mouth (dark opening) + ramp planks on the street face
  const mouth = box(w * 0.55, wallH * 0.8, 0.1);
  mouth.translate(0, wallH * 0.45 + 0.2, d / 2 + 0.06);
  buckets.dark.push(mouth);
  const ramp = box(w * 0.5, 0.1, 2.6, 0.8);
  ramp.rotateX(0.06);
  ramp.translate(0, 0.16, d / 2 + 1.4);
  buckets.wood.push(jitterUV(ramp, rng));
  // upturned dinghy alongside
  {
    const hull = new THREE.SphereGeometry(1, 9, 6);
    scaleUV(hull, 2, 1);
    hull.scale(2.0, 0.55, 0.75);
    hull.rotateY((rng() - 0.5) * 0.5);
    hull.translate(w / 2 + 1.3, 0.5, -d * 0.2);
    buckets.wood.push(jitterUV(hull, rng));
  }
  return { w: w + 3.0, d: d + 2.6, h: wallH + roofH + 0.6 };
}

/** Net-drying racks + stacked crab pots and fish crates — a working quay
 * plot that fills a village slot without another cottage. */
export function makeNetYard(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const w = 8.5, d = 6.5;
  for (let r = 0; r < 2; r++) { // net rack rows: posts + two rails + hung mesh
    const rz = -d / 2 + 1.4 + r * 3.2;
    for (const sx of [-1, 0, 1]) {
      const post = box(0.14, 2.2, 0.14, 1.4);
      post.rotateZ((rng() - 0.5) * 0.05);
      post.translate(sx * (w / 2 - 1.1), 1.1, rz);
      buckets.wood.push(jitterUV(post, rng));
    }
    for (const ry of [1.35, 2.05]) {
      const rail = box(w - 2.0, 0.08, 0.08, 1.4);
      rail.translate(0, ry, rz);
      buckets.wood.push(jitterUV(rail, rng));
    }
    // hung net: thin dark sagging sheet
    const net = box(w - 2.4, 1.15, 0.04, 1.0);
    net.rotateX((rng() - 0.5) * 0.10);
    net.translate(0, 1.35, rz + 0.10);
    buckets.dark.push(net);
  }
  // crab pots (dark slatted cubes) + pale fish crates
  for (let k = 0, n = 4 + ((rng() * 4) | 0); k < n; k++) {
    const cs = 0.45 + rng() * 0.3;
    const pot = box(cs, cs * 0.8, cs, 1.2);
    pot.rotateY(rng() * Math.PI);
    pot.translate((rng() - 0.5) * (w - 2), cs * 0.4, d / 2 - 0.9 - rng() * 1.2);
    (rng() < 0.5 ? buckets.dark : buckets.wood).push(pot);
  }
  return { w, d, h: 2.4 };
}

/** Builders keyed by plan name — spread into URBAN_BUILDERS (props.ts
 * BUILDER_BY_NAME contract, see maps/urbanKit.ts). */
export const RAIL_BUILDERS: Record<string, StructureBuilder> = {
  warehouse: makeWarehouse,
  containerRow: makeContainerRow,
  gantry: makeGantry,
  watertower: makeWaterTower,
  stack: makeStack,
  shed: makeShed,
  lighthouse: makeLighthouse,
  boatshed: makeBoatshed,
  netyard: makeNetYard,
};
