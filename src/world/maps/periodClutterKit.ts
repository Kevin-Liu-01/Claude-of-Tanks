// src/world/maps/periodClutterKit.ts — (b42, the scenery lane; wave 260: "a misplaced modern caravan" on Frosthollow)
// the roadside clutter of a map's own period. The props' modern roadside vocabulary (props.ts modernClutter: the
// reflector Jersey barrier, the orange traffic cone, the pad-mount transformer, the retroreflective road sign, the
// plastic-cable drum) stood on maps set in 1937-1945. A map whose identity gives it a period now draws, for every kind
// that came into use after it, that kind's period form at the very same seats: the kind's name, its record and its
// placement are unchanged (props.ts LOCAL_TYPES resolves the kind to the period form, as it does the coursed and the
// snow-loaded walls), and each period builder spends exactly the draws the modern builder spent from the shared
// destructible stream (brokenDraws.ts spentDraws), so every later pool keeps its geometry. Only the swapped kinds'
// own colliders follow their new geometry; the forms that stand as cover keep the modern forms' length and height.
//
// (the buildings lane, 2026-10-11; wave 406a) A map whose region never set the stock kinds by its tracks (the orange cone
// and the galvanised dustbin on a Jamuna char) draws the region's own forms for them at the same seats on the same law:
// the kolshi and the paddy basket, the jute bales and the jute stook, the Mekong's glazed jar, the oasis's buff jar and
// palm-leaf basket, the Naga carrying basket, the village's coopered tub (REGIONAL_CLUTTER_FORMS).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTRUCTIBLE_TYPES, type DestructiblePropType } from './inhabitKit.ts';
import { spentDraws } from './brokenDraws.ts';
import { deriveRuntimeStructureContactBand, type StructureCollisionRuntimeBand } from '../structureCollision.ts';

type Rng = () => number;
type Palette = readonly [number, number, number];

/**
 * Every map's setting year: the one table the props' period forms and the map-vehicles lane's fleets and hulk casts
 * both key off (agreed 2026-10-08; the coordinator ruled Saltmere Bay present day). From each map's identity
 * (REGIONAL-MAP-IDENTITIES, MAP-BEAUTIFICATION, MAP-LAYOUT-BRIEF's regional kits, its config, its audio scene's period)
 * and the vehicles its fleet is built from. Olympus Basin (mars) is the future: after 2022, its hulls next-generation.
 */
export const MAP_SETTING_YEAR: Readonly<Record<string, number>> = Object.freeze({
  blackglass: 1937, // Suzhou Creek, Shanghai, autumn 1937
  fjord: 1940, // Bjerkvik at the head of the Herjangsfjord, May 1940
  longleaf: 1941, // the Louisiana Maneuvers of 1941
  verdant: 1943, // Prokhorovka, 1943
  autumn: 1944, // a Norman river-ford market town under the piston fighters and bombers
  monsoon: 1944, // Kohima, 1944
  polders: 1944, // the Scheldt polders, autumn 1944
  reservoir: 1944, // the Rur dams, 1944-45
  alpine: 1945, // the Col du Mont-Cenis, April 1945
  foundry: 1945, // the Völklingen ironworks, March 1945
  winter: 1945, // the Podhale, January 1945
  steppe: 1958, // the Virgin Lands (the fleet's Moskvitch-423 and UAZ-450)
  railyard: 1962, // DB V60, VW T1, DKW Munga, Mercedes L319
  skybridge: 1965, // Glen Canyon Dam and Page, the Bureau of Reclamation's works (1957-66)
  titan_gorge: 1965, // Monument Valley, the Oljato chapter
  cliffbridge: 1972, // Ronda and the Tajo
  moon: 1972,
  copper_mesa: 1976, // Queenstown's mine (Holden HQ, Centurion, Leopard AS1)
  orchard: 1982, // the Chouf
  urban: 1984, // Steinburg
  frontier: 1984, // the Fulda Gap
  desert: 1985, // Sirocco Wadi
  whiteout: 1985, // DYE-M at Cape Dyer
  ruinspires: 1992, // Sarajevo under siege, 1992-96
  saltwind: 1992, // the Dalmatian bay
  badlands: 2008, // Wadi Rum
  oasis: 2010, // Siwa
  delta: 2010, // the Jamuna's chars
  mangrove: 2012, // Cà Mau
  caldera: 2015, // the Aso caldera
  airfield: 2022, // Hostomel
  coastal: 2024, // Saltmere Bay: present day (L'Aber Wrac'h and the Pays de Léon)
  mars: 2100, // Olympus Basin: the future
});

/**
 * When each modern roadside kind's form came into use: the New Jersey profile in reflector-fitted concrete (1955), the
 * moulded orange traffic cone (1958), the ground-level pad-mount transformer cabinet (1960), the retroreflective road
 * sign on a galvanised post (1960), PVC-sheathed cable on its drum (1955; the drum itself is older, its cable was
 * lead-sheathed).
 */
export const MODERN_KIND_INTRODUCED: Readonly<Record<string, number>> = Object.freeze({
  barrier: 1955, cone: 1958, transformer: 1960, roadsign: 1960, cablespool: 1955,
});

// ---- geometry helpers (the inhabit kit's conventions: one merged geometry with position, normal, uv and colour) ----

const _c = new THREE.Color();
function box(w: number, h: number, d: number, uvScale = 0.7): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) * uvScale, uv.getY(i) * h * uvScale);
  return g;
}
function cyl(r0: number, r1: number, h: number, seg = 7): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r0, r1, h, seg, 1);
}
/** Author in HSL (sRGB), store linear; `jit` jitters the lightness per vertex from the part's own stream. */
function P<T extends THREE.BufferGeometry>(geo: T, pal: Palette, jit: number, rng: Rng): T {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.setHSL(pal[0], pal[1], Math.max(0.02, pal[2] + (rng() - 0.5) * jit), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)), false);
  if (!merged) throw new Error('periodClutterKit: merge produced no geometry');
  for (const part of parts) part.dispose();
  return merged;
}
/** Rotate (x, then y, then z) and place a part. */
function put<T extends THREE.BufferGeometry>(g: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
}

const BARK: Palette = [0.075, 0.24, 0.24];
const END_GRAIN: Palette = [0.09, 0.32, 0.55];
const TIMBER: Palette = [0.08, 0.3, 0.33];
const TIMBER_PALE: Palette = [0.09, 0.28, 0.46];
const ENAMEL: Palette = [0.12, 0.08, 0.86];
const ENAMEL_RIM: Palette = [0.62, 0.42, 0.2];
const IRON: Palette = [0.6, 0.05, 0.13];
const STRIPE_RED: Palette = [0.0, 0.58, 0.38];
const STRIPE_WHITE: Palette = [0.1, 0.06, 0.84];
const CRATE_OLIVE: Palette = [0.2, 0.22, 0.3];
const STENCIL: Palette = [0.12, 0.1, 0.14];
const LEAD: Palette = [0.6, 0.04, 0.42];

// ---- the barrier's period form: a log barricade on cross trestles --------------------------------------------------

/** A log, its axis along +Z, centred, bark round it and its sawn ends pale. */
function log(radius: number, length: number, o: Rng): THREE.BufferGeometry[] {
  const out = [P(cyl(radius * 0.94, radius, length, 8).rotateX(Math.PI / 2), BARK, 0.1, o)];
  for (const end of [-1, 1]) out.push(P(cyl(radius * 0.92, radius * 0.92, 0.012, 8).rotateX(Math.PI / 2).translate(0, 0, end * length / 2), END_GRAIN, 0.08, o));
  return out;
}
/** A cross trestle (a sawbuck): two round legs crossed in an X across the barricade, their crotch at `crotch` m. */
function crossTrestle(z: number, crotch: number, o: Rng): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const spread = 0.52, leg = (crotch + 0.12) / Math.cos(spread) + 0.18;
  for (const side of [-1, 1]) {
    const g = P(cyl(0.055, 0.065, leg, 6), TIMBER, 0.1, o);
    put(g, 0, 0, 0, 0, 0, side * spread);
    out.push(g.translate(0, leg / 2 * Math.cos(spread) - 0.08, z + side * 0.03));
  }
  out.push(P(box(0.76, 0.06, 0.08), TIMBER, 0.08, o).translate(0, 0.22, z));
  return out;
}
/**
 * The barrier's period form (the coordinator, 2026-10-08: "a log barricade on cross trestles holding the barrier's
 * length and height"): three barked logs, two side by side in the trestles' crotches and one laid on them, 2.7 m long
 * and a metre high as the concrete barrier stands, on a cross trestle at either end.
 */
function bLogBarricade(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.barrier.build, rng, 0xb41c);
  const parts: THREE.BufferGeometry[] = [];
  const crotch = 0.55;
  for (const z of [-1.08, 1.08]) parts.push(...crossTrestle(z + (o() - 0.5) * 0.06, crotch, o));
  const r = 0.12 + o() * 0.02;
  // (the two lower logs splayed in the crotches to the concrete barrier's base width: its cover's footprint held)
  for (const [x, y] of [[-0.19, crotch + r * 0.45], [0.2, crotch + r * 0.45], [0.0, crotch + r * 2.05]] as const) {
    const length = 2.62 + o() * 0.12;
    for (const g of log(r * (0.92 + o() * 0.14), length, o)) parts.push(put(g, x, y, (o() - 0.5) * 0.08, 0, (o() - 0.5) * 0.04, 0));
  }
  return merge(parts);
}
/** The barricade broken: the trestles knocked flat, the logs rolled off apart, one snapped in two. */
function bLogBarricadeBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.barrier.broken!, rng, 0xb41d);
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-1.1, 1.0]) {
    for (const g of crossTrestle(0, 0.6, o)) parts.push(put(g, 0, 0.06, 0, Math.PI / 2 - 0.08, (o() - 0.5) * 0.6, 0).translate((o() - 0.5) * 0.6, 0, z));
  }
  for (let k = 0; k < 3; k++) {
    const r = 0.12 + o() * 0.02, snapped = k === 2;
    const pieces = snapped ? [1.2 + o() * 0.2, 1.1 + o() * 0.2] : [2.6 + o() * 0.12];
    for (const [i, length] of pieces.entries()) {
      for (const g of log(r, length, o)) {
        parts.push(put(g, (k - 1) * 0.55 + (o() - 0.5) * 0.3, r - 0.02, snapped ? (i - 0.5) * 1.4 : (o() - 0.5) * 0.3, 0, (o() - 0.5) * 0.5, 0));
      }
    }
  }
  return merge(parts);
}

// ---- the road sign's period form: an enamel fingerpost --------------------------------------------------------------

/** One finger board: a white enamel plate with its dark rim, pointed at its far end. */
function fingerBoard(length: number, o: Rng): THREE.BufferGeometry[] {
  const out = [P(box(length, 0.2, 0.03), ENAMEL, 0.04, o).translate(length / 2, 0, 0)];
  for (const y of [-0.105, 0.105]) out.push(P(box(length, 0.022, 0.034), ENAMEL_RIM, 0.04, o).translate(length / 2, y, 0));
  const tip = P(box(0.15, 0.15, 0.03), ENAMEL, 0.04, o);
  tip.rotateZ(Math.PI / 4);
  out.push(tip.translate(length, 0, 0));
  return out;
}
/**
 * The road sign's period form: a timber post under a small pyramid cap with two enamel finger boards at the top,
 * pointing the roads' two ways (the era's white enamel with its dark rim, the kind a crossroads in 1940s Europe
 * carried), and a small enamel place plate below them.
 */
function bFingerpost(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.roadsign.build, rng, 0x51f9);
  const parts: THREE.BufferGeometry[] = [P(box(0.12, 2.7, 0.12), TIMBER, 0.08, o).translate(0, 1.35, 0)];
  const cap = P(new THREE.ConeGeometry(0.11, 0.12, 4), TIMBER, 0.06, o);
  cap.rotateY(Math.PI / 4);
  parts.push(cap.translate(0, 2.76, 0));
  const a = (o() - 0.5) * 0.6;
  for (const [y, yaw, len] of [[2.5, a, 0.95 + o() * 0.2], [2.22, a + Math.PI + (o() - 0.5) * 0.9, 0.85 + o() * 0.2]] as const) {
    for (const g of fingerBoard(len, o)) parts.push(put(g, 0.07, 0, 0, 0, yaw, 0).translate(0, y, 0));
  }
  parts.push(P(box(0.34, 0.24, 0.025), ENAMEL, 0.04, o).translate(0, 1.85, 0.075));
  parts.push(P(box(0.36, 0.26, 0.02), ENAMEL_RIM, 0.04, o).translate(0, 1.85, 0.068));
  return merge(parts);
}

// ---- the cone's period form: a small striped trestle ---------------------------------------------------------------

/**
 * The traffic cone's period form: a small road-closure trestle — a red-and-white striped bar on two splayed legs at
 * either end, light enough to be knocked about as the cone was (its physics body is the cone's).
 */
function bStripedTrestle(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.cone.build, rng, 0xc0e2);
  const parts: THREE.BufferGeometry[] = [];
  const len = 0.6, h = 0.5;
  for (let k = 0; k < 4; k++) {
    parts.push(P(box(len / 4, 0.08, 0.05), k % 2 ? STRIPE_WHITE : STRIPE_RED, 0.04, o).translate(-len / 2 + (k + 0.5) * len / 4, h, 0));
  }
  for (const x of [-len / 2 + 0.04, len / 2 - 0.04]) {
    for (const side of [-1, 1]) {
      const legLen = h / Math.cos(0.3);
      const leg = P(box(0.035, legLen, 0.035), TIMBER_PALE, 0.08, o);
      put(leg, 0, 0, 0, side * 0.3, 0, 0);
      parts.push(leg.translate(x, legLen / 2 * Math.cos(0.3), side * legLen / 2 * Math.sin(0.3)));
    }
  }
  return merge(parts);
}

// ---- the transformer's period form: a stack of supply crates -------------------------------------------------------

/** A crate: a box of boards with corner battens and a stencilled band, `w` across, `h` high, `d` deep. */
function crate(w: number, h: number, d: number, o: Rng, olive: boolean): THREE.BufferGeometry[] {
  const pal = olive ? CRATE_OLIVE : TIMBER_PALE;
  const out = [P(box(w, h, d), pal, 0.08, o)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out.push(P(box(0.05, h + 0.01, 0.05), TIMBER, 0.06, o).translate(sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02)));
  }
  out.push(P(box(w * 0.6, h * 0.16, 0.006), STENCIL, 0.04, o).translate(0, h * 0.12, d / 2 + 0.004));
  return out;
}
/**
 * The pad-mount transformer's period form: supply crates stacked on a pair of timber skids on the cabinet's own
 * footprint and to its height — two crates below, one across them above — standing as cover where the cabinet stood.
 */
function bCrateStack(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.transformer.build, rng, 0xc8a7);
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.5, 0.5]) parts.push(P(box(0.12, 0.1, 0.95), TIMBER, 0.08, o).translate(x, 0.05, 0));
  const olive = o() < 0.6;
  for (const x of [-0.37, 0.37]) {
    for (const g of crate(0.72, 0.62, 0.92, o, olive)) parts.push(g.translate(x + (o() - 0.5) * 0.04, 0.41, (o() - 0.5) * 0.05));
  }
  const top = crate(0.95, 0.55, 0.7, o, !olive), yaw = (o() - 0.5) * 0.3;
  for (const g of top) parts.push(put(g, 0, 0, 0, 0, yaw, 0).translate((o() - 0.5) * 0.1, 0.995, (o() - 0.5) * 0.08));
  return merge(parts);
}
/** The crates burst: the top crate tumbled off whole, the others broken open into their boards, the skids left. */
function bCrateStackBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.transformer.broken!, rng, 0xc8a8);
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.5, 0.5]) parts.push(P(box(0.12, 0.1, 0.95), TIMBER, 0.08, o).translate(x, 0.05, 0));
  for (const g of crate(0.95, 0.55, 0.7, o, true)) parts.push(put(g, 0, 0, 0, 0.12, o() * Math.PI, 0.08).translate(1.0 + o() * 0.3, 0.3, 0.4 + (o() - 0.5) * 0.4));
  for (let k = 0; k < 10; k++) {
    const board = P(box(0.6 + o() * 0.3, 0.025, 0.12 + o() * 0.05), k % 3 ? TIMBER_PALE : CRATE_OLIVE, 0.08, o);
    parts.push(put(board, (o() - 0.5) * 2.0, 0.03 + (k % 4) * 0.03, (o() - 0.5) * 1.6, (o() - 0.5) * 0.2, o() * Math.PI, (o() - 0.5) * 0.15));
  }
  return merge(parts);
}

// ---- the cable drum: the drum stays, its cable lead-sheathed --------------------------------------------------------

/** The cable drum as the modern one is built, its cable lead-sheathed grey instead of black plastic. */
function bLeadCableDrum(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.cablespool.build, rng, 0xd2a0);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(P(cyl(0.18, 0.18, 1.0, 10).rotateZ(Math.PI / 2).translate(0, 0.68, 0), IRON, 0.08, o));
  for (const x of [-0.55, 0.55]) {
    parts.push(P(cyl(0.74, 0.74, 0.12, 12).rotateZ(Math.PI / 2).translate(x, 0.68, 0), TIMBER, 0.15, o));
    for (let i = 0; i < 4; i++) {
      const spoke = box(0.04, 1.18, 0.08);
      spoke.rotateX(i * Math.PI / 4);
      parts.push(P(spoke.translate(x + Math.sign(x) * 0.07, 0.68, 0), TIMBER, 0.1, o));
    }
  }
  parts.push(P(cyl(0.49, 0.49, 0.96, 12).rotateZ(Math.PI / 2).translate(0, 0.68, 0), LEAD, 0.06, o));
  return merge(parts);
}

// ---- the region's own forms -----------------------------------------------------------------------------------------
//
// (the buildings lane, 2026-10-11; wave 406a's critics on Jade River Delta: "orange traffic cones and grey plastic bins
// ... regionally absurd for a 2010 Jamuna char") The props' stock roadside kinds are a European road's: the moulded
// cone, the galvanised municipal dustbin, the reflector Jersey barrier, the pad-mount cabinet. A map whose region never
// set them by its tracks draws, for each such kind, the region's own form at the very same seats, as the period forms
// do: the kind's record (footprint, class, cover, physics) and its placement unchanged, and the builder spending exactly
// the stock builder's draws (spentDraws). A loose kind's form stands base at y = 0 and centred, about as tall as its
// body (the tumble turns about the record's mid-height).

/** Colour a turned part by its profile point (LatheGeometry lays its vertices point by point round each meridian). */
function Prow<T extends THREE.BufferGeometry>(geo: T, points: number, pal: (j: number) => Palette, jit: number, rng: Rng): T {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = pal(i % points);
    _c.setHSL(p[0], p[1], Math.max(0.02, p[2] + (rng() - 0.5) * jit), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
/** A turned body about +Y from (radius, height) points: a run up the outside faces out, a run back down inside faces in. */
function lathe(points: ReadonlyArray<readonly [number, number]>, seg: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
/** The outside radius of a turned profile at height y (its run up to the lip's top). */
function profileRadius(points: ReadonlyArray<readonly [number, number]>, y: number): number {
  for (let j = 1; j < points.length && points[j][1] >= points[j - 1][1]; j++) {
    const [r0, y0] = points[j - 1], [r1, y1] = points[j];
    if (y >= y0 && y <= y1) return y1 > y0 ? r0 + (r1 - r0) * (y - y0) / (y1 - y0) : Math.max(r0, r1);
  }
  return points[0][0];
}
/** A part from `start` to `end` along its own Y (a cylinder or a box made along Y, centred). */
function along<T extends THREE.BufferGeometry>(g: T, start: THREE.Vector3, end: THREE.Vector3): T {
  const dir = new THREE.Vector3().subVectors(end, start), length = dir.length();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.divideScalar(length)));
  return g.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
}

// -- the earthenware: the char's terracotta kolshi, the Mekong's glazed jar, the oasis's buff water jar ---------------

type PotStyle = {
  /** the turned profile: up the outside, over the lip, down inside to the mouth's floor (the last `inside` points) */
  profile: ReadonlyArray<readonly [number, number]>;
  inside: number;
  body: Palette; foot: Palette; lip: Palette; mouth: Palette;
  /** the foot's colour up to this profile point (the damp or unglazed base) */
  footTo: number;
  /** the lip's colour from this profile point (the glaze thinning at the rim, or the rim's wear) */
  lipFrom: number;
  /** painted rings round the shoulder (heights) and their paint */
  rings?: readonly number[]; ring?: Palette;
  /** two lugs at this height (the water jar's) */
  lugs?: number;
};
const KOLSHI: PotStyle = {
  // the Bengal kolshi: a round belly, the narrow neck and the flared lip; the water pot of every char homestead
  profile: [[0.002, 0], [0.1, 0.004], [0.165, 0.035], [0.225, 0.11], [0.262, 0.21], [0.272, 0.3], [0.258, 0.38],
    [0.22, 0.455], [0.16, 0.515], [0.118, 0.548], [0.104, 0.575], [0.11, 0.605], [0.138, 0.638], [0.15, 0.656],
    [0.14, 0.666], [0.112, 0.648], [0.09, 0.6], [0.002, 0.57]],
  inside: 3, footTo: 1, lipFrom: 12,
  body: [0.035, 0.55, 0.42], foot: [0.03, 0.46, 0.3], lip: [0.04, 0.5, 0.46], mouth: [0.03, 0.4, 0.12],
  rings: [0.395, 0.43], ring: [0.02, 0.35, 0.15],
};
const MEKONG_JAR: PotStyle = {
  // the Mekong's glazed stoneware water jar (lu): the broad shoulder, the short neck and the rolled lip, the dark glaze
  // stopping short of the raw foot
  profile: [[0.002, 0], [0.16, 0.004], [0.185, 0.04], [0.225, 0.14], [0.262, 0.27], [0.274, 0.37], [0.262, 0.45],
    [0.215, 0.53], [0.155, 0.578], [0.148, 0.6], [0.165, 0.618], [0.168, 0.64], [0.15, 0.652], [0.128, 0.628],
    [0.12, 0.6], [0.002, 0.57]],
  inside: 3, footTo: 1, lipFrom: 10,
  body: [0.075, 0.55, 0.19], foot: [0.07, 0.3, 0.45], lip: [0.08, 0.48, 0.27], mouth: [0.07, 0.4, 0.09],
};
const OASIS_JAR: PotStyle = {
  // the oasis's porous buff water jar: the tall ovoid body, the narrow neck, the two lugs at the shoulder
  profile: [[0.002, 0], [0.085, 0.004], [0.14, 0.04], [0.205, 0.13], [0.25, 0.25], [0.258, 0.34], [0.24, 0.43],
    [0.19, 0.51], [0.125, 0.56], [0.1, 0.59], [0.102, 0.625], [0.122, 0.645], [0.112, 0.656], [0.092, 0.635],
    [0.084, 0.6], [0.002, 0.58]],
  inside: 3, footTo: 1, lipFrom: 10,
  body: [0.095, 0.3, 0.56], foot: [0.09, 0.28, 0.45], lip: [0.1, 0.28, 0.62], mouth: [0.08, 0.3, 0.15],
  lugs: 0.45,
};
/** The traffic cone's regional form: an earthenware pot of the region's (its body is the cone's). */
function potForm(style: PotStyle, salt: number): (rng: Rng) => THREE.BufferGeometry {
  return (rng) => {
    const o = spentDraws(DESTRUCTIBLE_TYPES.cone.build, rng, salt);
    const { profile } = style, n = profile.length;
    const parts: THREE.BufferGeometry[] = [Prow(lathe(profile, 14), n, (j) => (j >= n - style.inside ? style.mouth
      : j <= style.footTo ? style.foot : j >= style.lipFrom ? style.lip : style.body), 0.06, o)];
    for (const y of style.rings ?? []) {
      const r = profileRadius(profile, y) + 0.003;
      parts.push(P(new THREE.CylinderGeometry(r - 0.004, r, 0.014, 14, 1, true).translate(0, y, 0), style.ring!, 0.04, o));
    }
    if (style.lugs !== undefined) {
      const r = profileRadius(profile, style.lugs);
      for (const side of [-1, 1]) parts.push(P(box(0.06, 0.05, 0.05).translate(side * (r + 0.018), style.lugs, 0), style.body, 0.05, o));
    }
    return merge(parts);
  };
}

// -- the woven baskets: the char's paddy basket, the Naga's conical carrier, the Mekong's tapered basket, the oasis's
// lidded palm-leaf basket ---------------------------------------------------------------------------------------------

type BasketStyle = {
  r0: number; r1: number; h: number; belly: number; courses: number;
  /** each course's palette (the weave's alternate rows, a coloured band) */
  course: (k: number) => Palette;
  inner: Palette;
  /** raised on four short legs under a square foot (the Naga basket's) */
  legs?: number;
  /** what it holds, heaped over the rim, or its conical lid */
  heap?: Palette; nuts?: boolean; lid?: Palette;
};
const PADDY_BASKET: BasketStyle = {
  // the char's bamboo basket (dhama) full of paddy: split bamboo plaited in courses, bellied, the rim rolled over
  r0: 0.25, r1: 0.3, h: 0.66, belly: 0.03, courses: 9,
  course: (k) => (k % 2 ? [0.1, 0.4, 0.42] : [0.11, 0.42, 0.56]), inner: [0.09, 0.35, 0.22], heap: [0.12, 0.6, 0.55],
};
const NAGA_BASKET: BasketStyle = {
  // the Naga carrying basket: a cone of split bamboo smoked dark over the hearth, on its square foot and four legs
  r0: 0.12, r1: 0.33, h: 0.72, belly: 0, courses: 10, legs: 0.09,
  course: (k) => (k % 2 ? [0.08, 0.34, 0.36] : [0.07, 0.4, 0.26]), inner: [0.07, 0.35, 0.14],
};
const MEKONG_BASKET: BasketStyle = {
  // the Mekong's tapered bamboo basket (can xe) with its coconuts
  r0: 0.17, r1: 0.3, h: 0.6, belly: 0, courses: 8,
  course: (k) => (k % 2 ? [0.11, 0.4, 0.5] : [0.12, 0.45, 0.6]), inner: [0.1, 0.35, 0.25], nuts: true,
};
const PALM_BASKET: BasketStyle = {
  // the oasis's coiled palm-leaf basket under its conical lid, its coils banded in dyed leaf
  r0: 0.24, r1: 0.27, h: 0.46, belly: 0.015, courses: 10,
  course: (k) => (k === 2 ? [0.99, 0.55, 0.4] : k === 6 ? [0.35, 0.42, 0.33] : k === 8 ? [0.05, 0.25, 0.18]
    : k % 2 ? [0.12, 0.38, 0.58] : [0.12, 0.4, 0.64]),
  inner: [0.1, 0.35, 0.3], lid: [0.12, 0.4, 0.62],
};
/** The dustbin's regional form: a woven basket of the region's (its body is the bin's). */
function basketForm(style: BasketStyle, salt: number): (rng: Rng) => THREE.BufferGeometry {
  return (rng) => {
    const o = spentDraws(DESTRUCTIBLE_TYPES.trashcan.build, rng, salt);
    const { r0, r1, h, belly, courses } = style, lift = style.legs ?? 0;
    const rAt = (t: number) => r0 + (r1 - r0) * t + belly * Math.sin(Math.PI * t);
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < courses; k++) {
      const t0 = k / courses, t1 = (k + 1) / courses;
      parts.push(P(new THREE.CylinderGeometry(rAt(t1), rAt(t0), h / courses, 16, 1, true).translate(0, lift + (t0 + t1) / 2 * h, 0),
        style.course(k), 0.08, o));
    }
    // the rim rolled over the top course; the base disc (facing down)
    parts.push(P(new THREE.TorusGeometry(rAt(1), 0.02, 5, 18).rotateX(Math.PI / 2).translate(0, lift + h, 0), style.course(1), 0.06, o));
    parts.push(P(lathe([[0.002, lift], [r0, lift]], 16), style.course(1), 0.06, o));
    if (style.lid) {
      const lid = P(new THREE.ConeGeometry(r1 + 0.025, 0.3, 16, 1).translate(0, lift + h + 0.15, 0), style.lid, 0.08, o);
      parts.push(lid, P(new THREE.CylinderGeometry(r1 + 0.012, r1 + 0.027, 0.04, 16, 1, true).translate(0, lift + h + 0.03, 0), [0.99, 0.55, 0.4], 0.05, o));
      parts.push(P(cyl(0.025, 0.03, 0.05, 6).translate(0, lift + h + 0.31, 0), [0.03, 0.45, 0.22], 0.05, o));
    } else {
      // the inner wall down to its floor (facing in, then up)
      const inner: Array<[number, number]> = [];
      for (let k = courses; k >= 0; k--) inner.push([rAt(k / courses) - 0.014, lift + Math.max(0.035, (k / courses) * h - 0.004)]);
      inner.push([0.002, lift + 0.035]);
      parts.push(P(lathe(inner, 16), style.inner, 0.06, o));
    }
    if (style.heap) parts.push(P(lathe([[rAt(1) - 0.02, lift + h - 0.06], [r1 * 0.62, lift + h - 0.005], [0.002, lift + h + 0.05]], 16), style.heap, 0.1, o));
    if (style.nuts) {
      for (const [x, y, z, green] of [[0.08, -0.03, 0.04, 1], [-0.09, -0.035, -0.04, 0], [0.0, 0.06, 0.0, 1]] as const) {
        parts.push(P(new THREE.SphereGeometry(0.1, 8, 6).scale(1, 0.92, 1).translate(x, lift + h + y, z),
          green ? [0.24, 0.45, 0.32] : [0.08, 0.45, 0.34], 0.06, o));
      }
    }
    if (lift) {
      // the square foot and the four legs under it
      for (const [x, z] of [[-0.075, -0.075], [0.075, -0.075], [-0.075, 0.075], [0.075, 0.075]] as const) {
        parts.push(P(box(0.03, lift + 0.02, 0.03).translate(x, (lift + 0.02) / 2, z), style.course(0), 0.06, o));
      }
      for (const [w, d, x, z] of [[0.19, 0.025, 0, -0.075], [0.19, 0.025, 0, 0.075], [0.025, 0.19, -0.075, 0], [0.025, 0.19, 0.075, 0]] as const) {
        parts.push(P(box(w, 0.025, d).translate(x, lift, z), style.course(1), 0.06, o));
      }
    }
    return merge(parts);
  };
}

// -- the village tub: the coopered tub with its lid weighted by a stone (the eastern plains' and hills' yards) ----------

/** The dustbin's form in a village of the eastern front and the Virgin Lands: a coopered tub, hooped, lidded, weighted. */
function bVillageTub(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.trashcan.build, rng, 0x7ab1);
  const parts: THREE.BufferGeometry[] = [];
  const n = 14, h = 0.64, rb = 0.26, rt = 0.3, tilt = Math.atan2(rt - rb, h), rMid = (rb + rt) / 2;
  for (let k = 0; k < n; k++) {
    // a stave: its foot on the base circle, leaning out to the rim; the two lugs stand proud above the rim
    const lug = k === 0 || k === n / 2, sh = lug ? h + 0.09 : h;
    const stave = box((2 * Math.PI * rMid) / n + 0.004, sh, 0.028);
    stave.rotateX(tilt).translate(0, sh / 2, rMid).rotateY((k / n) * Math.PI * 2);
    parts.push(P(stave, k % 2 ? [0.08, 0.3, 0.42] : [0.08, 0.32, 0.34], 0.08, o));
  }
  for (const y of [0.11, 0.52]) {
    parts.push(P(new THREE.TorusGeometry(rb + (rt - rb) * (y / h) + 0.02, 0.012, 4, 20).rotateX(Math.PI / 2).translate(0, y, 0), IRON, 0.05, o));
  }
  parts.push(P(lathe([[0.002, 0.004], [rb, 0.004]], 14), TIMBER, 0.06, o));
  // the lid of three planks cut round, resting inside the rim on its cleats, and the stone on it
  const R = rt - 0.035, lidY = h - 0.03;
  for (const z of [-0.18, 0, 0.18]) {
    const half = Math.sqrt(Math.max(0.01, R * R - (Math.abs(z) + 0.06) ** 2));
    parts.push(P(box(half * 2, 0.026, 0.17).translate(0, lidY, z), TIMBER_PALE, 0.08, o));
  }
  for (const x of [-0.11, 0.11]) parts.push(P(box(0.05, 0.022, R * 1.5).translate(x, lidY + 0.024, 0), TIMBER, 0.06, o));
  const stone = new THREE.DodecahedronGeometry(0.11, 0).scale(1.0, 0.68, 0.86);
  parts.push(P(stone.translate(0.02, lidY + 0.1, -0.02), [0.1, 0.05, 0.48], 0.12, o));
  return merge(parts);
}

// -- the jute: the char's bale stacks and the jute sticks set up to dry ------------------------------------------------

const HESSIAN: Palette = [0.1, 0.27, 0.5];
const HOOP: Palette = [0.06, 0.22, 0.2];
const FIBRE: Palette = [0.11, 0.42, 0.62];
const JUTE_STICK: Palette = [0.1, 0.16, 0.72];
/**
 * A pressed jute bale (the pucca bale of the presses, about 180 kg): coarse hessian over the pressed fibre, pillowed
 * between the five thin iron hoops that cinch it, tufts of fibre at its corners, the trader's diamond and letters
 * stencilled on its side; `w` across (x), `h` high, `l` long (z), centred.
 */
function juteBale(w: number, h: number, l: number, o: Rng): THREE.BufferGeometry[] {
  // (sixteen courses along it: the hoops stand on every third boundary from the middle, the pillows between them)
  const g = new THREE.BoxGeometry(w, h, l, 3, 3, 16), pitch = (l / 16) * 3;
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    const x = pos.getX(i) / (w / 2), y = pos.getY(i) / (h / 2), z = pos.getZ(i), v = z / (l / 2);
    const across = nx ? y : ny ? x : 0;
    const bulge = nz ? 0.03 * (1 - x * x) * (1 - y * y)
      : 0.042 * (1 - across * across) * (0.3 + 0.7 * Math.abs(Math.sin((Math.PI * z) / pitch))) * (1 - v ** 6);
    pos.setXYZ(i, pos.getX(i) + nx * bulge, pos.getY(i) + ny * bulge, pos.getZ(i) + nz * bulge);
    uv.setXY(i, uv.getX(i) * Math.max(w, l) * 0.7, uv.getY(i) * h * 0.7);
  }
  g.computeVertexNormals();
  const out: THREE.BufferGeometry[] = [P(g, HESSIAN, 0.13, o)];
  // the hoops round its girth where it is cinched
  const lift = 0.042 * 0.3 + 0.004;
  for (let k = -2; k <= 2; k++) {
    const z = k * pitch;
    for (const side of [-1, 1]) {
      out.push(P(box(w + 0.02, 0.008, 0.022).translate(0, side * (h / 2 + lift), z), HOOP, 0.06, o));
      out.push(P(box(0.008, h + 0.02, 0.022).translate(side * (w / 2 + lift), 0, z), HOOP, 0.06, o));
    }
  }
  // the fibre's tufts out at its corners
  for (let k = 0; k < 4; k++) {
    const sx = o() < 0.5 ? -1 : 1, sy = o() < 0.5 ? -1 : 1, sz = o() < 0.5 ? -1 : 1;
    const tuft = box(0.05 + o() * 0.04, 0.022, 0.035);
    out.push(P(put(tuft, sx * (w / 2 + 0.006), sy * (h / 2 - 0.008), sz * (l / 2 - 0.015), (o() - 0.5) * 0.6, o() * Math.PI, (o() - 0.5) * 0.6), FIBRE, 0.1, o));
  }
  // the stencil on its side in the middle pillow: the diamond's four edges and three letters under it
  const face = w / 2 + 0.042 * 0.95 + 0.003;
  const mark = (sy: number, sz: number, y: number, z: number, roll = 0) =>
    out.push(P(box(0.004, sy, sz).rotateX(roll).translate(face, y, z), STENCIL, 0.04, o));
  for (const [y, z, roll] of [[0.05, -0.05, -Math.PI / 4], [0.05, 0.05, Math.PI / 4], [-0.05, -0.05, Math.PI / 4], [-0.05, 0.05, -Math.PI / 4]] as const) {
    mark(0.016, 0.14, y + 0.03, z + pitch / 2, roll);
  }
  for (const [k, hgt] of [[0, 0.07], [1, 0.055], [2, 0.07]] as const) mark(hgt, 0.014, -0.1, pitch / 2 - 0.06 + k * 0.06);
  return out;
}
const BALE_W = 0.62, BALE_H = 0.47, BALE_L = 1.3;
/** Place a bale's parts: rolled about its own length, yawed about its centre, then set at (x, y, z). */
function placeBale(parts: THREE.BufferGeometry[], o: Rng, x: number, y: number, z: number, yaw: number, roll = 0): void {
  for (const g of juteBale(BALE_W, BALE_H, BALE_L, o)) parts.push(put(roll ? g.rotateZ(roll) : g, x, y, z, 0, yaw, 0));
}
/** Where the stack's four bales stand (x, y, z, yaw): two end to end below, two above set across their joint. */
const BALE_SEATS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-0.04, BALE_H / 2 + 0.022, -0.69, 0.02], [0.05, BALE_H / 2 + 0.022, 0.67, -0.03],
  [0.02, BALE_H * 1.5 + 0.066, -0.5, 0.04], [-0.03, BALE_H * 1.5 + 0.066, 0.84, -0.05],
];
/**
 * The barrier's form on the char: pressed jute bales stacked at the landing for the boat, two end to end below and two
 * above set across their joint, the barrier's length and height as the Jersey barrier stood.
 */
function bJuteBales(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.barrier.build, rng, 0x1b7e);
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z, yaw] of BALE_SEATS) placeBale(parts, o, x, y, z, yaw + (o() - 0.5) * 0.03);
  return merge(parts);
}
/** The stack's contact: its four bales as blocks over their bulge (the hoops and the stencil publish no parts). */
function bJuteBalesContact(): THREE.BufferGeometry {
  return merge(BALE_SEATS.map(([x, y, z, yaw]) => put(box(BALE_W + 0.044, BALE_H + 0.044, BALE_L + 0.044), x, y, z, 0, yaw, 0)));
}
/** The stack thrown down: the lower bales shoved askew, a top bale tumbled onto its side, the other burst into fibre. */
function bJuteBalesBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.barrier.broken!, rng, 0x1b7f);
  const parts: THREE.BufferGeometry[] = [];
  const h = BALE_H / 2 + 0.022;
  placeBale(parts, o, -0.25, h, -0.82, 0.25 + (o() - 0.5) * 0.1);
  placeBale(parts, o, 0.3, h, 0.76, -0.35 + (o() - 0.5) * 0.1);
  placeBale(parts, o, 0.78, BALE_W / 2 + 0.022, -0.2, 0.5 + (o() - 0.5) * 0.2, Math.PI / 2);
  // the burst bale: its fibre heaped where it fell, the slit hessian, the snapped hoops
  const heap = new THREE.DodecahedronGeometry(0.42, 1).scale(1.35, 0.42, 1.6);
  parts.push(P(heap.translate(-0.55, 0.11, 0.42), FIBRE, 0.12, o));
  parts.push(P(box(0.86, 0.012, 0.7).rotateZ(0.08).translate(-0.6, 0.2, 0.36), HESSIAN, 0.1, o));
  for (let k = 0; k < 3; k++) {
    const hoop = box(0.64, 0.012, 0.034);
    parts.push(P(hoop.rotateY(o() * Math.PI).translate(-0.4 + (o() - 0.5) * 0.9, 0.012, 0.3 + (o() - 0.5) * 1.2), IRON, 0.05, o));
  }
  return merge(parts);
}
/**
 * The pad-mount cabinet's form on the char: jute sticks (the stalks left when the fibre is stripped) set up in a stook
 * to dry, leaning together across the axis to the twine that ties them, their tops splayed above it, the mass of
 * sticks dark inside; on the cabinet's footprint and as tall as it stood.
 */
function bJuteStook(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.transformer.build, rng, 0x57c0);
  const parts: THREE.BufferGeometry[] = [];
  const foot = 0.53, tie = 1.6;
  parts.push(P(new THREE.ConeGeometry(foot - 0.07, tie + 0.08, 12, 1).translate(0, (tie + 0.08) / 2, 0), [0.09, 0.15, 0.3], 0.06, o));
  const sticks = 34, a0 = o() * Math.PI * 2;
  for (let k = 0; k < sticks; k++) {
    const a = a0 + (k / sticks) * Math.PI * 2 + (o() - 0.5) * 0.12, rf = foot * (0.94 + o() * 0.1);
    const start = new THREE.Vector3(Math.cos(a) * rf, -0.02, Math.sin(a) * rf);
    // through the tie just past the axis, and on to its top on the far side
    const through = new THREE.Vector3(-Math.cos(a) * 0.035, tie, -Math.sin(a) * 0.035);
    const top = 1.95 + (o() - 0.5) * 0.3, end = start.clone().lerp(through, (top + 0.02) / (tie + 0.02));
    const stick = along(new THREE.CylinderGeometry(0.011, 0.015, start.distanceTo(end), 4, 1), start, end);
    parts.push(P(stick, k % 5 === 2 ? [0.09, 0.18, 0.56] : JUTE_STICK, 0.14, o));
  }
  parts.push(P(new THREE.TorusGeometry(0.06, 0.022, 4, 10).rotateX(Math.PI / 2).translate(0, tie, 0), [0.1, 0.32, 0.46], 0.06, o));
  return merge(parts);
}
/** The stook's contact: the cone of its sticks (its single sticks publish no parts of their own). */
function bJuteStookContact(): THREE.BufferGeometry {
  return new THREE.ConeGeometry(0.55, 1.95, 12, 1).translate(0, 0.975, 0);
}
/**
 * A form whose pool refit reads a frozen contact band (DestructiblePropType.contactBand) from a proxy of its
 * ground-bearing blocks, derived on first use: its dressing (a bale's hoops, a stook's single sticks) would each have
 * published a collision part of its own.
 */
function withContactProxy(form: DestructiblePropType, proxy: () => THREE.BufferGeometry): DestructiblePropType {
  let band: StructureCollisionRuntimeBand | null = null;
  return Object.defineProperty(form, 'contactBand', {
    enumerable: true,
    get: () => {
      if (!band) { const g = proxy(); band = deriveRuntimeStructureContactBand({ baked: [g] }); g.dispose(); }
      return band;
    },
  });
}
/** The stook knocked flat: its sticks fallen in a fan where it stood, a few still leaning together, the twine burst. */
function bJuteStookBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(DESTRUCTIBLE_TYPES.transformer.broken!, rng, 0x57c1);
  const parts: THREE.BufferGeometry[] = [];
  const fan = o() * Math.PI * 2;
  for (let k = 0; k < 30; k++) {
    // (each from the stook's base on the side it fell from, out across where it stood)
    const a = fan + (o() - 0.5) * 1.6, length = 1.7 + o() * 0.4, side = (o() - 0.5) * 0.5;
    const start = new THREE.Vector3(-Math.cos(fan) * 0.45 - Math.sin(fan) * side, 0.016, -Math.sin(fan) * 0.45 + Math.cos(fan) * side);
    const end = start.clone().add(new THREE.Vector3(Math.cos(a) * length, 0.016 + (k % 4) * 0.012, Math.sin(a) * length));
    parts.push(P(along(new THREE.CylinderGeometry(0.011, 0.015, length, 4, 1), start, end), k % 5 === 2 ? [0.09, 0.18, 0.56] : JUTE_STICK, 0.14, o));
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + o() * 0.3;
    const start = new THREE.Vector3(Math.cos(a) * 0.32, -0.02, Math.sin(a) * 0.32), end = new THREE.Vector3(-Math.cos(a) * 0.1, 0.9, -Math.sin(a) * 0.1);
    parts.push(P(along(new THREE.CylinderGeometry(0.011, 0.015, start.distanceTo(end), 4, 1), start, end), JUTE_STICK, 0.14, o));
  }
  return merge(parts);
}

// ---- the types ------------------------------------------------------------------------------------------------------

/** Each modern kind's period form: the modern record (its footprint, class, cover and physics) with the period's build. */
const PERIOD_FORMS: Readonly<Record<string, DestructiblePropType>> = Object.freeze({
  barrier: { ...DESTRUCTIBLE_TYPES.barrier, build: bLogBarricade, broken: bLogBarricadeBroken },
  roadsign: { ...DESTRUCTIBLE_TYPES.roadsign, build: bFingerpost },
  cone: { ...DESTRUCTIBLE_TYPES.cone, build: bStripedTrestle },
  transformer: { ...DESTRUCTIBLE_TYPES.transformer, build: bCrateStack, broken: bCrateStackBroken },
  cablespool: { ...DESTRUCTIBLE_TYPES.cablespool, build: bLeadCableDrum },
});

/**
 * The regions whose tracks never saw the props' stock roadside kinds, and each region's own forms for them: the
 * Jamuna's chars (Jade River Delta), the Mekong's mangrove coast (Ca Mau), the Saharan oases (Siwa and the Dahar's
 * ksour), the Naga hills (Kohima), and the villages of the eastern plains and hills (Prokhorovka, the Podhale, the
 * Virgin Lands' sovkhoz). A region's forms stand over the period's.
 */
type ClutterRegion = 'bengal' | 'mekong' | 'sahara' | 'naga' | 'village';
export const MAP_CLUTTER_REGION: Readonly<Record<string, ClutterRegion>> = Object.freeze({
  delta: 'bengal', mangrove: 'mekong', oasis: 'sahara', desert: 'sahara', monsoon: 'naga',
  verdant: 'village', winter: 'village', steppe: 'village',
});
export const REGIONAL_CLUTTER_FORMS: Readonly<Record<ClutterRegion, Readonly<Record<string, DestructiblePropType>>>> = Object.freeze({
  // the kolshi by the path, the paddy basket, the jute bales at the landing, the jute sticks set up to dry
  bengal: {
    cone: { ...DESTRUCTIBLE_TYPES.cone, build: potForm(KOLSHI, 0x4b01) },
    trashcan: { ...DESTRUCTIBLE_TYPES.trashcan, build: basketForm(PADDY_BASKET, 0x4b02) },
    barrier: withContactProxy({ ...DESTRUCTIBLE_TYPES.barrier, build: bJuteBales, broken: bJuteBalesBroken }, bJuteBalesContact),
    transformer: withContactProxy({ ...DESTRUCTIBLE_TYPES.transformer, build: bJuteStook, broken: bJuteStookBroken }, bJuteStookContact),
  },
  // the glazed water jar, the tapered basket with its coconuts
  mekong: {
    cone: { ...DESTRUCTIBLE_TYPES.cone, build: potForm(MEKONG_JAR, 0x4b11) },
    trashcan: { ...DESTRUCTIBLE_TYPES.trashcan, build: basketForm(MEKONG_BASKET, 0x4b12) },
  },
  // the buff water jar, the lidded palm-leaf basket
  sahara: {
    cone: { ...DESTRUCTIBLE_TYPES.cone, build: potForm(OASIS_JAR, 0x4b21) },
    trashcan: { ...DESTRUCTIBLE_TYPES.trashcan, build: basketForm(PALM_BASKET, 0x4b22) },
  },
  // the conical carrying basket (Kohima's cones are already the period's striped trestle)
  naga: {
    trashcan: { ...DESTRUCTIBLE_TYPES.trashcan, build: basketForm(NAGA_BASKET, 0x4b32) },
  },
  // the coopered tub; the striped trestle for the cone (the Virgin Lands' sovkhoz is dated 1958, the moulded cone's own
  // year, and its roadworks never saw one)
  village: {
    cone: PERIOD_FORMS.cone,
    trashcan: { ...DESTRUCTIBLE_TYPES.trashcan, build: bVillageTub },
  },
});

/**
 * The forms a map's props resolve its stock kinds to (props.ts LOCAL_TYPES): every modern kind introduced after the
 * map's setting year in its period form (none on a map set in the present), and over those its region's own forms.
 */
export function periodClutterTypes(mapId: string): Record<string, DestructiblePropType> {
  const year = MAP_SETTING_YEAR[mapId];
  if (year === undefined) return {};
  const region = MAP_CLUTTER_REGION[mapId];
  return {
    ...Object.fromEntries(Object.entries(PERIOD_FORMS).filter(([kind]) => year < MODERN_KIND_INTRODUCED[kind])),
    ...(region ? REGIONAL_CLUTTER_FORMS[region] : {}),
  };
}
