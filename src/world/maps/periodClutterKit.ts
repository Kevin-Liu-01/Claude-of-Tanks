// src/world/maps/periodClutterKit.ts — (b42, the scenery lane; wave 260: "a misplaced modern caravan" on Frosthollow)
// the roadside clutter of a map's own period. The props' modern roadside vocabulary (props.ts modernClutter: the
// reflector Jersey barrier, the orange traffic cone, the pad-mount transformer, the retroreflective road sign, the
// plastic-cable drum) stood on maps set in 1937-1945. A map whose identity gives it a period now draws, for every kind
// that came into use after it, that kind's period form at the very same seats: the kind's name, its record and its
// placement are unchanged (props.ts LOCAL_TYPES resolves the kind to the period form, as it does the coursed and the
// snow-loaded walls), and each period builder spends exactly the draws the modern builder spent from the shared
// destructible stream (brokenDraws.ts spentDraws), so every later pool keeps its geometry. Only the swapped kinds'
// own colliders follow their new geometry; the forms that stand as cover keep the modern forms' length and height.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTRUCTIBLE_TYPES, type DestructiblePropType } from './inhabitKit.ts';
import { spentDraws } from './brokenDraws.ts';

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
 * The period forms a map's props resolve its modern kinds to (props.ts LOCAL_TYPES): every kind introduced after the
 * map's setting year, none on a map set in the present.
 */
export function periodClutterTypes(mapId: string): Record<string, DestructiblePropType> {
  const year = MAP_SETTING_YEAR[mapId];
  if (year === undefined) return {};
  return Object.fromEntries(Object.entries(PERIOD_FORMS).filter(([kind]) => year < MODERN_KIND_INTRODUCED[kind]));
}
