// src/world/maps/mapKits.ts — per-map set-dressing extras beyond the generic
// props vocabulary (content_breadth r2).
//
// Two exports:
//   MARKET_BUILDERS — plan-name builders (props.ts BUILDER_BY_NAME contract:
//     make<X>(rng, buckets, wallBucket?) -> {w,d,h}) for the desert bazaar.
//     Spread into URBAN_BUILDERS (maps/urbanKit.ts) so map plans can place
//     'market' entries with ZERO props.ts changes.
//   dressMapExtras(ctx) — explicit-position dressing that the road-side plan
//     mechanism cannot reach: Frosthollow's frozen-lake basin gets shoreline
//     reed stands, refrozen pressure-ridge slab chains, a frozen-in rowboat
//     and a short timber jetty. Hooked from props.ts right before the bucket
//     merge (see docs/SYSTEMS.md — one import + one call).
//
// All geometry is procedural THREE.BufferGeometry pushed into the existing
// material buckets (wood/straw/stone), so it merges into the per-material
// prop meshes and inherits map-toned textures + the grime overlay for free.
// Most extras are soft dressing. The small rail coal stockpiles and Amberford's
// water mill (round 48) alone publish their actual convex footprints through the
// supplied collision sinks.

import * as THREE from 'three';
import { box, gablePrism, jitterUV, pitchSkillionRoof, scaleUV, slabBox } from '../propGeometry.ts';
import { planGroundedObbPose, planGroundedSegment } from '../propPlacement.ts';
import type { GroundedSegmentEndpoint } from '../propPlacement.ts';
import type { GeometryBuckets, StructureBuilder, StructureDimensions } from './exteriorDetailKit.ts';
import { planRiverLanding, type RiverLandingAnchor } from './riverLandings.ts';
import {
  JETTY_DECK_HALF_WIDTH_M, JETTY_DECK_THICKNESS_M, JETTY_SPAN_M, MOORED_BOAT_DRAFT_M, MOORED_BOAT_GAP_M,
  MOORED_BOAT_HALF_BEAM_M, landingStream, planShoreJetty, type ShoreJettyPlan,
} from './shoreJetty.ts';
import { createSnowDrift } from './snowDrift.ts';
import {
  cloneCollisionRecord, convexHull2, setCompoundShape, setConvexShape, type CollisionRecord, type SimpleCollisionShape,
} from '../collision.ts';
import {
  dressStrandWrack, strandAdmits, strandBandAt, wrackBand,
  type StrandContext, type StrandJetty, type StrandKeepOut, type StrandLanding,
} from './strandWrack.ts';
import {
  RAIL_SPUR_BALLAST_M, RAIL_SPUR_GAUGE_M, RAIL_SPUR_LAY_M, railRunLength, resampleRailPath, type RailSpurConfig,
} from '../railSpurs.ts';

type Rng = () => number;
type GeometryBucketName = keyof GeometryBuckets & string;

interface DressingBuckets extends GeometryBuckets {
  straw: THREE.BufferGeometry[];
  baked?: THREE.BufferGeometry[];
}

interface DressingHeightField {
  getHeightAt(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
  getWaterDepthAt?(x: number, z: number): number;
  getWaterSurfaceHeightAt?(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  /** Round 56: the baked union wetness of a liquid field (the strand's sand ends where it falls under 0.02). */
  _waterWetnessAt?(x: number, z: number): number;
  /** Round 61: the bridge decks terrain.ts resolved from the stations authored `crossing: 'bridge'`. */
  bridgeDecks?: readonly DressingBridgeDeck[];
}

/** Round 61: the deck plane the river kit builds its arched bridge on (terrain.ts BridgeDeckPlane). */
interface DressingBridgeDeck {
  x: number;
  z: number;
  ux: number;
  uz: number;
  halfLength: number;
  halfWidth: number;
  deckY: number;
  bedY: number;
  waterY: number;
  route: number;
}

interface LayoutDisc {
  x: number;
  z: number;
  r: number;
  level?: number;
  /** Round 47 follow-up: authored beached-boat count for this shore (terrain.ts LakeConfig). */
  boats?: number;
  /** Round 56: an authored shelf marks a sea strand — the wrack line and the coastal driftwood follow its contour. */
  shelfM?: number;
  radii?: import('../shoreline.ts').ShorelineRadii;
}

interface DressingLayout {
  lakes?: LayoutDisc[];
  marshes?: LayoutDisc[];
  roads: Array<Array<readonly [number, number]>>;
  village: { x0: number; z0: number; z1: number };
  spawns?: { player: { x: number; z: number }; enemies: Array<{ x: number; z: number }> };
  /** Round 57: authored rail spurs (terrain.railSpurs, carried by createLayout); the kit lays their track. */
  railSpurs?: readonly RailSpurConfig[];
}

/** Round 56: what the kits laid on a shore, so the wrack line keeps off it (boats, jetties) and gathers its larger
 * pieces beside the landings. Created per dressMapExtras call; never retained. */
interface ShoreLedger {
  keepOut: StrandKeepOut[];
  jetties: StrandJetty[];
  landings: StrandLanding[];
}

interface GroundingReceipt {
  kind: string;
  x: number;
  y: number;
  z: number;
  relief?: number;
  baseClearance?: number;
  supportMin?: number;
  supportMax?: number;
  start?: GroundedSegmentEndpoint;
  end?: GroundedSegmentEndpoint;
}

interface DressingContext {
  mapId?: string;
  extraKits?: readonly string[] | null;
  riverLandings?: readonly RiverLandingAnchor[];
  L: DressingLayout;
  heightField: DressingHeightField;
  rng: Rng;
  buckets: DressingBuckets;
  groundingReceipts?: GroundingReceipt[] | null;
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
}

type FocusedDressingContext = Pick<
  DressingContext,
  'L' | 'heightField' | 'rng' | 'buckets' | 'groundingReceipts' | 'obstacles' | 'colliders'
> & { shore?: ShoreLedger };

const _groundUp = new THREE.Vector3(0, 1, 0);
const _groundRight = new THREE.Vector3(1, 0, 0);
const _groundNormal = new THREE.Vector3();
const _groundQuat = new THREE.Quaternion();

function applyGroundNormal(
  geometry: THREE.BufferGeometry,
  pose: { normalX: number; normalY: number; normalZ: number },
): void {
  _groundNormal.set(pose.normalX, pose.normalY, pose.normalZ);
  _groundQuat.setFromUnitVectors(_groundUp, _groundNormal);
  geometry.applyQuaternion(_groundQuat);
}

// =============================================================================
// DESERT BAZAAR — plan builders ('market', 'marketRow')
// =============================================================================

// A single souk stall: timber posts under a sagging fabric awning, a low
// counter, crate + pot clutter and a ground rug. Reads as commerce at the
// crossroads without blocking a driving lane (h kept low, footprint small).
function makeMarketStall(rng: Rng, buckets: GeometryBuckets): StructureDimensions {
  const w = 6.6, d = 5.2;
  const ph = 2.2 + rng() * 0.4;
  // 4 corner posts (slightly splayed like re-driven timber)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = box(0.16, ph, 0.16, 1.2);
    post.rotateZ((rng() - 0.5) * 0.06);
    post.translate(sx * (w / 2 - 0.7), ph / 2, sz * (d / 2 - 0.7));
    buckets.wood.push(jitterUV(post, rng));
  }
  // awning: thin plaster-toned slab (sun-bleached canvas), pitched + skewed
  const awn = box(w - 0.4, 0.09, d - 0.4, 0.35);
  awn.rotateX((rng() - 0.5) * 0.10 - 0.06);
  awn.rotateZ((rng() - 0.5) * 0.10);
  awn.translate(0, ph + 0.05, 0);
  buckets.plaster.push(jitterUV(awn, rng));
  // ragged valance strip on the street edge
  const val = box(w - 0.6, 0.5, 0.06, 0.5);
  val.translate(0, ph - 0.28, d / 2 - 0.55);
  buckets.plaster.push(jitterUV(val, rng));
  // low counter + goods
  const counter = box(2.6, 0.85, 0.9, 0.8);
  counter.translate(-0.6, 0.43, d / 2 - 1.35);
  buckets.wood.push(jitterUV(counter, rng));
  for (let k = 0, n = 2 + ((rng() * 3) | 0); k < n; k++) {
    const cs = 0.55 + rng() * 0.4;
    const crate = box(cs, cs, cs, 1.0);
    crate.rotateY(rng() * Math.PI * 0.5);
    crate.translate(-w / 2 + 1.2 + rng() * 1.6, cs / 2, -d / 2 + 1.1 + rng() * (d - 2.2));
    buckets.wood.push(jitterUV(crate, rng));
  }
  // clay pots (sandstone-toned) clustered by a post
  for (let k = 0, n = 2 + ((rng() * 3) | 0); k < n; k++) {
    const pr = 0.24 + rng() * 0.16, phg = 0.5 + rng() * 0.3;
    const pot = new THREE.CylinderGeometry(pr * 0.7, pr, phg, 8, 1);
    scaleUV(pot, 2, 1);
    pot.translate(w / 2 - 1.0 - rng() * 1.2, phg / 2, -d / 2 + 0.9 + rng() * 1.4);
    buckets.stone.push(jitterUV(pot, rng));
  }
  // ground rug (roof-tile tone reads as a dyed red carpet at range)
  const rug = box(1.8 + rng() * 0.8, 0.05, 2.6 + rng() * 0.6, 0.4);
  rug.rotateY((rng() - 0.5) * 0.4);
  rug.translate(0.9, 0.035, 0.2);
  buckets.roof.push(jitterUV(rug, rng));
  return { w, d, h: ph + 0.4 };
}

// Two stalls back-to-back with a shared alley of clutter — fills a wider
// road-side slot so the bazaar reads as a block, not a lone tent.
function makeMarketRow(rng: Rng, buckets: GeometryBuckets): StructureDimensions {
  const a = makeMarketStall(rng, buckets);
  // second stall, offset along x, mirrored
  const tmp: GeometryBuckets = {
    wood: [], plaster: [], stone: [], roof: [], dark: [],
  };
  const b = makeMarketStall(rng, tmp);
  const off = a.w / 2 + b.w / 2 - 1.2;
  for (const [key, geometries] of Object.entries(tmp)) {
    const target = buckets[key];
    if (!geometries || !target) continue;
    for (const g of geometries) {
      g.rotateY(Math.PI + (rng() - 0.5) * 0.2);
      g.translate(off, 0, (rng() - 0.5) * 1.2);
      target.push(g);
    }
  }
  // shared clutter: sacks (straw-less desert: use stone-toned bags -> plaster)
  for (let k = 0; k < 3; k++) {
    const s = 0.5 + rng() * 0.25;
    const sack = new THREE.SphereGeometry(s, 7, 5);
    scaleUV(sack, 1.5, 1);
    sack.scale(1, 0.72, 1);
    sack.translate(off / 2 + (rng() - 0.5) * 2.4, s * 0.5, (rng() - 0.5) * 2.4);
    buckets.plaster.push(jitterUV(sack, rng));
  }
  return { w: a.w + b.w - 1.2, d: Math.max(a.d, b.d), h: a.h };
}

// =============================================================================
// DESERT WALLED COMPOUNDS — plan builders ('compound', 'compoundSouk')
// content_breadth r5: the critique's "adobe 'village' is ~6 small boxes
// scattered on a bare sand pan with no compound walls/courtyards". Real
// crossroads settlements cluster into WALLED family compounds: a mud-brick
// perimeter with a gate, a 2-story main house in a back corner, an annex, a
// well/souk anchor and lived-in courtyard clutter. Each compound registers as
// ONE plan building, so it inherits ground-fit, the worn-earth apron decal,
// minimap footprint and collision for free.
// =============================================================================

// mud-brick perimeter wall with a gate gap on the street face (+z), coping
// course and gate posts. Returns nothing; pushes into buckets.
function compoundWall(
  rng: Rng,
  buckets: GeometryBuckets,
  w: number,
  d: number,
  wallH: number,
): number {
  const T = 0.42;
  // coping rides the SAME plaster print as the wall — the derived plaster2
  // shift renders as a saturated orange stripe under the desert sun (probed
  // on the r5 establishing shot); the 0.14 m geometric lip alone reads as a
  // finished mud-brick cap
  const cop = (geometry: THREE.BufferGeometry) => buckets.plaster.push(jitterUV(geometry, rng));
  const wal = (geometry: THREE.BufferGeometry) => buckets.plaster.push(jitterUV(geometry, rng));
  // back + side walls (slight per-run lean/settle so runs read hand-built)
  const runs = [
    { x: 0, z: -d / 2, wx: w, wz: T },
    { x: -w / 2, z: 0, wx: T, wz: d - T },
    { x: w / 2, z: 0, wx: T, wz: d - T },
  ];
  for (const r of runs) {
    const g = box(r.wx, wallH, r.wz, 0.8);
    g.rotateY((rng() - 0.5) * 0.015);
    g.translate(r.x, wallH / 2, r.z);
    wal(g);
    const c = box(r.wx + 0.14, 0.14, r.wz + 0.14, 0.8);
    c.translate(r.x, wallH + 0.07, r.z);
    cop(c);
  }
  // front wall split by a 3.6 m gate (offset from center like real lanes)
  const gx = w * (0.10 + rng() * 0.10) * (rng() < 0.5 ? -1 : 1);
  const segs = [
    { x0: -w / 2, x1: gx - 1.8 },
    { x0: gx + 1.8, x1: w / 2 },
  ];
  for (const s of segs) {
    const ww = s.x1 - s.x0;
    if (ww < 0.8) continue;
    const g = box(ww, wallH, T, 0.8);
    g.translate((s.x0 + s.x1) / 2, wallH / 2, d / 2);
    wal(g);
    const c = box(ww + 0.14, 0.14, T + 0.14, 0.8);
    c.translate((s.x0 + s.x1) / 2, wallH + 0.07, d / 2);
    cop(c);
  }
  // gate posts + timber lintel
  for (const s of [-1, 1]) {
    const p = box(0.55, wallH + 0.65, 0.55, 1.0);
    p.translate(gx + s * 1.95, (wallH + 0.65) / 2, d / 2);
    buckets.plaster.push(jitterUV(p, rng));
  }
  const lin = box(4.5, 0.16, 0.22, 1.2);
  lin.translate(gx, wallH + 0.30, d / 2);
  buckets.wood.push(jitterUV(lin, rng));
  return gx;
}

// flat-roofed adobe block with parapet, viga beam ends, door + windows on the
// courtyard face — the same massing language as props.ts makeAdobe.
function adobeBlock(
  rng: Rng,
  buckets: GeometryBuckets,
  bw: number,
  bd: number,
  bh: number,
  x: number,
  z: number,
  doorAxis: 'x' | 'z' = 'z',
  tone: GeometryBucketName = 'plaster',
): void {
  const wallTarget = buckets[tone] ?? buckets.plaster;
  const base = box(bw + 0.25, 0.6, bd + 0.25, 0.8);
  base.translate(x, -0.1, z);
  buckets.stone.push(jitterUV(base, rng));
  const blk = box(bw, bh, bd, 0.6);
  blk.translate(x, bh / 2, z);
  wallTarget.push(jitterUV(blk, rng));
  // parapet
  for (const [px, pz, pw, pdep] of [
    [0, bd / 2 - 0.08, bw, 0.16], [0, -bd / 2 + 0.08, bw, 0.16],
    [bw / 2 - 0.08, 0, 0.16, bd - 0.32], [-bw / 2 + 0.08, 0, 0.16, bd - 0.32],
  ]) {
    const p = box(pw, 0.42, pdep, 0.8);
    p.translate(x + px, bh + 0.21, z + pz);
    wallTarget.push(jitterUV(p, rng));
  }
  // roof deck: sun-bleached MUD roof (BASE plaster tone), not wood planking —
  // from the raised establishing camera a big timber deck read as a dark
  // brown slab, and the derived plaster3 shift (hue -0.035) rendered a big
  // sunlit deck saturated RED (both probed r5); vigas keep the timber cue
  const deck = box(bw - 0.2, 0.08, bd - 0.2, 0.35);
  deck.translate(x, bh + 0.02, z);
  buckets.plaster.push(jitterUV(deck, rng));
  // viga beam ends on the door face
  const dSign = 1;
  const nBeam = Math.max(3, (bw / 0.95) | 0);
  for (let k = 0; k < nBeam; k++) {
    const bx = -bw / 2 + (k + 0.5) * (bw / nBeam);
    const beam = box(0.13, 0.13, 0.5, 1.2);
    if (doorAxis === 'z') beam.translate(x + bx, bh - 0.3, z + dSign * (bd / 2 + 0.2));
    else beam.translate(x + dSign * (bw / 2 + 0.2), bh - 0.3, z + bx);
    buckets.wood.push(beam);
  }
  // door + a pair of small windows (courtyard face)
  const dr = box(1.0, 1.9, 0.10, 1.0);
  const drD = box(0.8, 1.7, 0.06, 1.0);
  if (doorAxis === 'z') {
    dr.translate(x + bw * 0.14, 0.95, z + bd / 2 + 0.06);
    drD.translate(x + bw * 0.14, 0.9, z + bd / 2 + 0.10);
  } else {
    dr.rotateY(Math.PI / 2); drD.rotateY(Math.PI / 2);
    dr.translate(x + bw / 2 + 0.06, 0.95, z + bd * 0.14);
    drD.translate(x + bw / 2 + 0.10, 0.9, z + bd * 0.14);
  }
  buckets.wood.push(dr); buckets.dark.push(drD);
  for (const s of [-1, 1]) {
    const wnd = box(0.55, 0.65, 0.06, 1.0);
    if (doorAxis === 'z') wnd.translate(x - bw * 0.24 + (s > 0 ? bw * 0.5 : 0), bh - 0.95, z + bd / 2 + 0.05);
    else { wnd.rotateY(Math.PI / 2); wnd.translate(x + bw / 2 + 0.05, bh - 0.95, z - bd * 0.24 + (s > 0 ? bd * 0.5 : 0)); }
    buckets.dark.push(wnd);
  }
  if (rng() < 0.5) { // rooftop stair hut
    const hut = box(bw * 0.32, 0.9, bd * 0.3, 0.8);
    hut.translate(x - bw * 0.2, bh + 0.45, z - bd * 0.2);
    wallTarget.push(jitterUV(hut, rng));
  }
}

// courtyard well: stone ring, two posts, crossbar + bucket
function courtyardWell(rng: Rng, buckets: GeometryBuckets, x: number, z: number): void {
  const ring = new THREE.CylinderGeometry(0.85, 0.95, 0.85, 9, 1);
  scaleUV(ring, 3, 1);
  ring.translate(x, 0.42, z);
  buckets.stone.push(jitterUV(ring, rng));
  for (const s of [-1, 1]) {
    const p = box(0.14, 1.9, 0.14, 1.2);
    p.translate(x + s * 0.75, 0.95, z);
    buckets.wood.push(p);
  }
  const bar = box(1.8, 0.10, 0.10, 1.2);
  bar.translate(x, 1.8, z);
  buckets.wood.push(bar);
  const bk = box(0.3, 0.3, 0.3, 1.2);
  bk.translate(x + 0.2, 1.35, z);
  buckets.dark.push(bk);
  // The bucket hangs from an authored rope instead of levitating beneath the
  // crossbar. This also keeps the complete well in one support chain.
  const rope = box(0.035, 0.45, 0.035, 2.0);
  rope.translate(x + 0.2, 1.575, z);
  buckets.dark.push(rope);
}

// scattered courtyard living clutter: crates, clay pots, sacks, a rug
function courtyardClutter(
  rng: Rng,
  buckets: GeometryBuckets,
  w: number,
  d: number,
  n: number,
): void {
  for (let k = 0; k < n; k++) {
    const cx = (rng() - 0.5) * (w - 5), cz = (rng() - 0.5) * (d - 5);
    const roll = rng();
    if (roll < 0.34) {
      const cs = 0.5 + rng() * 0.4;
      const crate = box(cs, cs, cs, 1.0);
      crate.rotateY(rng() * Math.PI * 0.5);
      crate.translate(cx, cs / 2, cz);
      buckets.wood.push(jitterUV(crate, rng));
    } else if (roll < 0.62) {
      const pr = 0.22 + rng() * 0.16, ph = 0.5 + rng() * 0.3;
      const pot = new THREE.CylinderGeometry(pr * 0.7, pr, ph, 8, 1);
      scaleUV(pot, 2, 1);
      pot.translate(cx, ph / 2, cz);
      buckets.stone.push(jitterUV(pot, rng));
    } else if (roll < 0.82) {
      const s = 0.42 + rng() * 0.22;
      const sack = new THREE.SphereGeometry(s, 7, 5);
      scaleUV(sack, 1.5, 1);
      sack.scale(1, 0.7, 1);
      sack.translate(cx, s * 0.48, cz);
      buckets.plaster.push(jitterUV(sack, rng));
    } else {
      const rug = box(1.5 + rng() * 0.8, 0.05, 2.2 + rng() * 0.6, 0.4);
      rug.rotateY((rng() - 0.5) * 0.6);
      rug.translate(cx, 0.035, cz);
      buckets.roof.push(jitterUV(rug, rng));
    }
  }
}

/**
 * Walled family compound: perimeter wall + gate, 2-story main house, 1-story
 * annex, well anchor, courtyard clutter. w runs ALONG the street so the
 * footprint stays shallow enough for the road-side placement lattice.
 */
function makeCompound(rng: Rng, buckets: GeometryBuckets): StructureDimensions {
  const w = 21 + rng() * 3, d = 13.5 + rng() * 1.5;
  const wallH = 2.05 + rng() * 0.3;
  compoundWall(rng, buckets, w, d, wallH);
  // main house in a back corner (2-story), door onto the courtyard
  const hw = 7.6 + rng() * 1.2, hd = 5.6 + rng() * 0.8, hh = 5.1 + rng() * 0.5;
  const hs = rng() < 0.5 ? -1 : 1;
  const hx = hs * (w / 2 - hw / 2 - 0.55), hz = -d / 2 + hd / 2 + 0.55;
  adobeBlock(rng, buckets, hw, hd, hh, hx, hz, 'z', 'plaster');
  // single-story annex against the opposite side wall (base plaster: the
  // derived plaster3 family carries a red hue shift that reads brick, not
  // mud, under the desert sun — probed r5)
  const aw = 4.6 + rng() * 1.0, ad = 3.8 + rng() * 0.8, ah = 2.75 + rng() * 0.3;
  const ax = -hs * (w / 2 - aw / 2 - 0.5), az = -d / 2 + ad / 2 + 0.6;
  adobeBlock(rng, buckets, aw, ad, ah, ax, az, 'z', 'plaster');
  // lean-to awning off the annex (shade for goods/animals)
  const awn = pitchSkillionRoof(box(aw * 0.9, 0.08, 2.4, 0.35), 'z', 1, 0.12);
  awn.translate(ax, ah - 0.35, az + ad / 2 + 1.15);
  buckets.plaster.push(jitterUV(awn, rng));
  for (const s of [-1, 1]) {
    const p = box(0.13, ah - 0.75, 0.13, 1.2);
    p.translate(ax + s * aw * 0.4, (ah - 0.75) / 2, az + ad / 2 + 2.1);
    buckets.wood.push(p);
  }
  // well just off courtyard center + lived-in clutter
  courtyardWell(rng, buckets, -hs * w * 0.08, d * 0.12);
  courtyardClutter(rng, buckets, w, d, 6 + ((rng() * 3) | 0));
  return { w: w + 0.5, d: d + 0.5, h: hh + 0.5 };
}

/**
 * Souk compound: walled yard with a shop row along the back wall, an awning
 * stall, corner watch-post and dense goods clutter — the market anchor.
 */
function makeCompoundSouk(rng: Rng, buckets: GeometryBuckets): StructureDimensions {
  const w = 19 + rng() * 2.5, d = 13 + rng() * 1.5;
  const wallH = 1.95 + rng() * 0.25;
  compoundWall(rng, buckets, w, d, wallH);
  // shop row: long single-story block against the back wall, wide dark bays.
  // BASE plaster only — both derived families shift hue on desert (plaster2
  // orange, plaster3 brick-red) and a 12 m block wears the cast loudly
  const sw = w * 0.62, sd = 4.0, sh = 3.05 + rng() * 0.25;
  const sx = -w * 0.12, sz = -d / 2 + sd / 2 + 0.55;
  adobeBlock(rng, buckets, sw, sd, sh, sx, sz, 'z', 'plaster');
  for (let k = 0; k < 3; k++) { // open market bays punched into the row
    const bx = sx - sw / 2 + (k + 0.5) * (sw / 3);
    const bay = box(1.7, 1.9, 0.08, 1.0);
    bay.translate(bx, 1.0, sz + sd / 2 + 0.07);
    buckets.dark.push(bay);
  }
  // corner watch-post (small square tower for the skyline)
  const tw = 2.6, th = 4.6 + rng() * 0.5;
  const tx = w / 2 - tw / 2 - 0.5, tz = -d / 2 + tw / 2 + 0.5;
  const tower = box(tw, th, tw, 0.6);
  tower.translate(tx, th / 2, tz);
  buckets.plaster.push(jitterUV(tower, rng));
  for (const [mx, mz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const merlon = box(0.5, 0.5, 0.5, 0.8);
    merlon.translate(tx + mx * (tw / 2 - 0.3), th + 0.25, tz + mz * (tw / 2 - 0.3));
    buckets.plaster.push(jitterUV(merlon, rng));
  }
  const slit = box(0.30, 0.75, 0.06, 1.0);
  slit.translate(tx, th - 1.1, tz + tw / 2 + 0.05);
  buckets.dark.push(slit);
  // awning stall in the yard (reuses the souk stall vocabulary)
  {
    const ph = 2.1 + rng() * 0.3, awW = 5.4, awD = 4.2;
    const ox = -w * 0.18, oz = d * 0.16;
    for (const [sxp, szp] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = box(0.15, ph, 0.15, 1.2);
      post.rotateZ((rng() - 0.5) * 0.05);
      post.translate(ox + sxp * (awW / 2 - 0.5), ph / 2, oz + szp * (awD / 2 - 0.5));
      buckets.wood.push(jitterUV(post, rng));
    }
    const awn = box(awW, 0.08, awD, 0.35);
    awn.rotateX((rng() - 0.5) * 0.09 - 0.05);
    awn.translate(ox, ph + 0.04, oz);
    buckets.plaster.push(jitterUV(awn, rng));
    const counter = box(2.4, 0.8, 0.85, 0.8);
    counter.translate(ox - 0.4, 0.4, oz + awD / 2 - 1.1);
    buckets.wood.push(jitterUV(counter, rng));
  }
  courtyardClutter(rng, buckets, w, d, 8 + ((rng() * 4) | 0));
  return { w: w + 0.5, d: d + 0.5, h: th + 0.3 };
}

/** Plan-name builders to spread into URBAN_BUILDERS (props.ts contract). */
export const MARKET_BUILDERS: Record<string, StructureBuilder> = {
  market: makeMarketStall, marketRow: makeMarketRow,
  compound: makeCompound, compoundSouk: makeCompoundSouk,
};

// =============================================================================
// FROSTHOLLOW LAKE BASIN — explicit-position dressing
// =============================================================================

// River reeds reuse the existing tapered stem topology, but retain every
// original clump/root XZ draw. Bed seating is per stem, not the clump center.
function reedClump(
  buckets: DressingBuckets,
  rng: Rng,
  heightField: DressingHeightField,
  x: number,
  z: number,
): void {
  winterReedClump(buckets, rng, heightField, x, z);
}

function winterSurface(
  name: string, positions: Float32Array, uvs: Float32Array, indices: Uint16Array,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

// Two narrow rings and a bent, tapered tip:14 vertices/12 triangles, versus
// the old24-vertex square post. The open bottom is buried, never visible.
function winterReedStem(
  height: number, width: number, bendX: number, bendZ: number, twist: number,
): THREE.BufferGeometry {
  const positions = new Float32Array(14 * 3), uvs = new Float32Array(14 * 2);
  const indices = new Uint16Array(36);
  for (let ring = 0; ring < 2; ring++) {
    const t = ring * 0.64, radius = width * (ring ? 0.32 : 0.5);
    for (let side = 0; side <= 4; side++) {
      const i = ring * 5 + side, angle = twist + side * Math.PI / 2;
      positions.set([Math.cos(angle) * radius + bendX * height * t * t,
        height * t, Math.sin(angle) * radius + bendZ * height * t * t], i * 3);
      uvs.set([side * width, height * t * 2], i * 2);
    }
  }
  for (let side = 0; side < 4; side++) {
    positions.set([bendX * height, height, bendZ * height], (10 + side) * 3);
    uvs.set([(side + 0.5) * width, height * 2], (10 + side) * 2);
    indices.set([side, side + 5, side + 1, side + 1, side + 5, side + 6,
      side + 5, side + 10, side + 6], side * 9);
  }
  const geometry = winterSurface('winter-reed', positions, uvs, indices);
  const normal = geometry.getAttribute('normal');
  // The UV seam duplicates the same ring vertex; share its lighting normal
  // explicitly instead of leaving the two adjacent faces ninety degrees apart.
  for (const [a, b] of [[0, 4], [5, 9]]) {
    const nx = normal.getX(a) + normal.getX(b);
    const ny = normal.getY(a) + normal.getY(b);
    const nz = normal.getZ(a) + normal.getZ(b);
    const length = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(a, nx / length, ny / length, nz / length);
    normal.setXYZ(b, nx / length, ny / length, nz / length);
  }
  return geometry;
}

function winterReedClump(
  buckets: DressingBuckets, rng: Rng, heightField: DressingHeightField, x: number, z: number,
): void {
  const n = 8 + ((rng() * 7) | 0);
  let headX = 0, headY = 0, headZ = 0;
  for (let k = 0; k < n; k++) {
    const tall = k < 3;
    const h = tall ? 1.15 + rng() * 0.6 : 0.6 + rng() * 0.6;
    const w = (tall ? 0.10 + rng() * 0.05 : 0.06 + rng() * 0.04) * 0.30;
    const bendZ = (rng() - 0.5) * 0.48, bendX = (rng() - 0.5) * 0.48;
    const st = winterReedStem(h, w, bendX, bendZ, rng() * Math.PI);
    const px = x + (rng() - 0.5) * 2.2, pz = z + (rng() - 0.5) * 2.2;
    st.translate(px, heightField.getHeightAt(px, pz) - 0.06, pz);
    if (k === 0) {
      const p = st.getAttribute('position');
      headX = p.getX(10); headY = p.getY(10); headZ = p.getZ(10);
    }
    buckets.straw.push(st);
  }
  // Consume the original three head draws, but attach its base to the first
  // actual stem tip instead of leaving a random crossbar in empty air.
  if (rng() < 0.6) {
    const lean = 1.2 + rng() * 0.3, yaw = rng() * Math.PI * 2, h = 0.25 + rng() * 0.20;
    const head = winterReedStem(h, 0.025, 0.18, 0, 0);
    head.name = 'winter-reed-head';
    head.rotateZ(lean); head.rotateY(yaw); head.translate(headX, headY, headZ);
    buckets.straw.push(head);
  }
}

function winterWedgeBaseHeight(
  heightField: DressingHeightField, x: number, z: number,
  width: number, depth: number, ca: number, sa: number,
): number {
  // A common buried plane cannot bridge a curved bank like independently
  // seated corners. Sample perimeter AND underside at <=0.45m spacing for
  // the authored footprints; the35mm embed covers between-sample curvature.
  let low = Infinity;
  for (let row = 0; row <= 4; row++) for (let column = 0; column <= 4; column++) {
    const lx = (column / 4 - 0.5) * width, lz = (row / 4 - 0.5) * depth;
    low = Math.min(low, heightField.getHeightAt(x + ca * lx + sa * lz, z - sa * lx + ca * lz));
  }
  return low - 0.035;
}

function setWinterPlateUV(
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number,
  x: number, rise: number, z: number, scale: number,
): void {
  // Box faces are +X,-X,+Y,-Y,+Z,-Z. Use the actual deformed face axes;
  // jitterUV still runs exactly once at the original production call site.
  const face = Math.floor(index / 4);
  const u = face < 2 ? (face ? -z : z) : (face === 5 ? -x : x);
  const v = face === 2 ? -z : face === 3 ? z : rise;
  uv.setXY(index, u * scale, v * scale);
}

// A broad, tilted fracture plate with unequal broken edges, not a narrow
// masonry tent. Keep the same24 vertices/12 triangles and exact buried base;
// existing roll/pitch draws vary the cap without consuming more randomness.
function winterIceWedge(
  heightField: DressingHeightField, x: number, z: number, width: number,
  height: number, depth: number, yaw: number, roll: number, pitch: number, uvScale: number,
): THREE.BoxGeometry {
  const h = Math.min(height, width * 0.16), d = Math.max(depth, width * 0.65);
  const geometry = slabBox(width, h, d, uvScale);
  geometry.name = 'winter-ice-wedge';
  const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const bottomY = winterWedgeBaseHeight(heightField, x, z, width, d, ca, sa);
  const tiltX = roll < 0 ? -0.30 : 0.30;
  const capHeights: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0, sx = Math.sign(p.getX(i)), sz = Math.sign(p.getZ(i));
    let lx = p.getX(i), lz = p.getZ(i);
    if (top) {
      lx = lx * (0.80 + sz * (0.06 + roll * 0.08)) + pitch * width * 0.045;
      lz = lz * (0.81 + sx * (0.045 + pitch * 0.08)) + roll * d * 0.055;
    }
    const wx = x + ca * lx + sa * lz, wz = z - sa * lx + ca * lz;
    const corner = (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0);
    if (top && capHeights[corner] === undefined) {
      const tilt = sx * tiltX + sz * (0.10 + pitch * 0.12);
      capHeights[corner] = heightField.getHeightAt(wx, wz) + 0.025 + h * (0.48 + tilt);
    }
    p.setXYZ(i, wx, top ? capHeights[corner] : bottomY, wz);
    setWinterPlateUV(uv, i, lx, p.getY(i) - bottomY, lz, uvScale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

interface WinterRidgeRow {
  x: number; z: number; angle: number; height: number; halfWidth: number;
}

function winterBermHump(t: number, center: number, radius: number): number {
  const q = Math.max(0, 1 - Math.abs(t - center) / radius);
  return q * q * (3 - 2 * q);
}

function seatWinterBermEdge(
  positions: Float32Array, heightField: DressingHeightField, a: number, b: number,
): void {
  a *= 3; b *= 3;
  let lower = 0;
  // Construction only: seat the interpolated edge, not just its two vertices.
  // Lowering both endpoints cannot reopen any already seated adjoining edge.
  for (let step = 1; step < 8; step++) {
    const t = step / 8;
    const x = positions[a] + (positions[b] - positions[a]) * t;
    const z = positions[a + 2] + (positions[b + 2] - positions[a + 2]) * t;
    const y = positions[a + 1] + (positions[b + 1] - positions[a + 1]) * t;
    lower = Math.max(lower, y - heightField.getHeightAt(x, z) + 0.035);
  }
  positions[a + 1] -= lower;
  positions[b + 1] -= lower;
}

function seatWinterBermPerimeter(
  positions: Float32Array, heightField: DressingHeightField, rows: number,
): void {
  for (let row = 0; row < rows - 1; row++) {
    seatWinterBermEdge(positions, heightField, row * 5, (row + 1) * 5);
    seatWinterBermEdge(positions, heightField, row * 5 + 4, (row + 1) * 5 + 4);
  }
  for (let column = 0; column < 4; column++) {
    seatWinterBermEdge(positions, heightField, column, column + 1);
    const last = (rows - 1) * 5 + column;
    seatWinterBermEdge(positions, heightField, last, last + 1);
  }
}

function winterPressureBerm(
  heightField: DressingHeightField, rows: WinterRidgeRow[],
): THREE.BufferGeometry {
  // Keep the same five-vertex sections, but compose two unequal snow humps
  // instead of a uniformly wide, regularly segmented masonry-looking strip.
  const positions = new Float32Array(rows.length * 15), uvs = new Float32Array(rows.length * 10);
  const indices = new Uint16Array((rows.length - 1) * 24);
  const wave = Math.sin(rows[0].x * 0.17 + rows[0].z * 0.11), side = wave >= 0 ? 1 : -1;
  const profile = side > 0 ? [0, 0.44, 1, 0.68, 0] : [0, 0.68, 1, 0.44, 0];
  let peak = 0;
  for (const row of rows) peak = Math.max(peak, row.height);
  for (let row = 0; row < rows.length; row++) {
    const r = rows[row], ca = Math.cos(r.angle), sa = Math.sin(r.angle);
    const t = row / (rows.length - 1), taper = 4 * t * (1 - t);
    const skew = side * (0.14 + 0.06 * (1 - taper));
    const acrossProfile = [-1, -0.52 + skew * 0.5, skew, 0.55 + skew * 0.5, 1];
    const rise = peak * (0.18 + 0.78 * winterBermHump(t, 0.28 + 0.04 * wave, 0.23)
      + 0.57 * winterBermHump(t, 0.75 + 0.02 * wave, 0.19));
    for (let column = 0; column < 5; column++) {
      const across = acrossProfile[column] * r.halfWidth * (0.24 + 0.76 * taper);
      const x = r.x - sa * across, z = r.z + ca * across;
      const edge = row === 0 || row === rows.length - 1 || column === 0 || column === 4;
      const y = heightField.getHeightAt(x, z) + (edge ? -0.035 : rise * profile[column]);
      const i = row * 5 + column;
      positions.set([x, y, z], i * 3);
      uvs.set([x * 0.3, z * 0.3], i * 2);
      if (row < rows.length - 1 && column < 4) {
        indices.set([i, i + 1, i + 5, i + 1, i + 6, i + 5], (row * 4 + column) * 6);
      }
    }
  }
  seatWinterBermPerimeter(positions, heightField, rows.length);
  return winterSurface('winter-pressure-berm', positions, uvs, indices);
}

// Same seeded ridge sites and occasional ice plates; only the construction
// topology changes. All old UV-jitter draws are consumed to preserve later
// drifts/boats and subsequent lakes, but the continuous surface uses metric UVs.
function pressureRidge(
  buckets: DressingBuckets,
  rng: Rng,
  cx: number,
  cz: number,
  heightField: DressingHeightField,
  ang: number,
  len: number,
): void {
  const n = Math.max(6, Math.round(len / 1.7));
  const bend = (rng() - 0.5) * 0.9; // gentle S-curve along the run
  const rows: WinterRidgeRow[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1) - 0.5;
    const aa = ang + bend * t;
    const px = cx + Math.cos(aa) * t * len + (rng() - 0.5) * 0.5;
    const pz = cz + Math.sin(aa) * t * len + (rng() - 0.5) * 0.5;
    const taper = Math.max(0.25, 1 - Math.abs(t) * 1.6); // sink toward the ends
    const bh = (0.17 + rng() * 0.13) * taper;
    const segmentLength = 1.9 + rng() * 0.9, width = 1.15 + rng() * 0.65;
    const angle = aa - (rng() - 0.5) * 0.22, pitch = (rng() - 0.5) * 0.10;
    rows.push({ x: px, z: pz, angle, height: bh * (1 + pitch),
      halfWidth: width * (0.46 + segmentLength * 0.02) });
    rng(); rng(); rng(); rng(); // original segment jitterUV contract
    if (rng() < 0.22) { // occasional small refrozen plate on the crest
      const pw = 0.7 + rng() * 0.6, phh = 0.18 + rng() * 0.22;
      const depth = 0.10 + rng() * 0.08;
      const roll = (rng() - 0.5) * 0.5, pitch = (rng() - 0.5) * 0.4;
      const plate = winterIceWedge(heightField, px, pz, pw, bh + phh * 0.5,
        depth, -aa + (rng() - 0.5) * 0.6, roll, pitch, 0.8);
      buckets.plaster.push(jitterUV(plate, rng));
    }
  }
  // Both the snow-filled seam and opaque snow-dusted plates reuse the existing
  // plaster/drift surface; mortar normals must not print masonry onto ice.
  buckets.plaster.push(winterPressureBerm(heightField, rows));
}

// Weathered rowboat frozen into the sheet near the shore — planked sides,
// transom and two bench thwarts, listing a few degrees.
function frozenRowboat(
  buckets: DressingBuckets,
  rng: Rng,
  heightField: DressingHeightField,
  x: number,
  z: number,
  yaw: number,
  groundingReceipts?: GroundingReceipt[] | null,
): void {
  const parts: THREE.BufferGeometry[] = [];
  const L = 3.4, W = 1.25, H = 0.52;
  const pose = planGroundedObbPose(heightField, x, z, L * 0.5, W * 0.5, yaw, 0.10);
  for (const s of [-1, 1]) { // side planks (two lapped strakes each)
    for (let r = 0; r < 2; r++) {
      const pl = box(L - r * 0.5, 0.20, 0.06, 1.2);
      pl.rotateZ((rng() - 0.5) * 0.03);
      pl.translate(0, 0.14 + r * 0.18, s * (W / 2 - r * 0.06));
      parts.push(pl);
    }
  }
  const bow = box(0.07, H * 0.8, W * 0.8, 1.2);
  bow.rotateY(Math.PI / 4);
  bow.translate(L / 2 - 0.12, H * 0.42, 0);
  parts.push(bow);
  const transom = box(0.07, H * 0.75, W * 0.9, 1.2);
  transom.translate(-L / 2 + 0.1, H * 0.4, 0);
  parts.push(transom);
  for (const tx of [-0.7, 0.55]) { // thwarts
    const th = box(0.26, 0.05, W * 0.94, 1.2);
    th.translate(tx, H * 0.62, 0);
    parts.push(th);
  }
  for (const g of parts) {
    g.rotateZ(0.06 + rng() * 0.05); // frozen-in list
    g.rotateY(yaw);
    applyGroundNormal(g, pose);
    g.translate(x, pose.y, z);    // hull bitten into the ice
    buckets.wood.push(jitterUV(g, rng));
  }
  groundingReceipts?.push({
    kind: 'frozen-rowboat', x, y: pose.y, z, relief: pose.spread,
    baseClearance: pose.maxFloat, supportMin: pose.min, supportMax: pose.max,
  });
}

// Short timber jetty walking off the shore onto the ice: paired piles with a
// plank deck, ending in a slight sag.
function jetty(
  buckets: DressingBuckets,
  rng: Rng,
  x0: number,
  z0: number,
  ang: number,
  y: number,
  len = 7.5,
  supportField?: DressingHeightField,
  groundingReceipts?: GroundingReceipt[] | null,
): void {
  const n = Math.round(len / 1.9);
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const px = -dz, pz = dx; // deck width axis
  for (let k = 0; k <= n; k++) {
    const t = k * 1.9;
    for (const s of [-1, 1]) {
      const x = x0 + dx * t + px * 0.65 * s;
      const z = z0 + dz * t + pz * 0.65 * s;
      const support = supportField?.getHeightAt(x, z);
      const base = support === undefined ? y - 0.05 : support - 0.10;
      const ph = support === undefined ? 0.9 - k * 0.04 : y + 0.865 - base;
      const pile = box(0.16, ph, 0.16, 1.2);
      pile.rotateY(rng() * 0.3);
      pile.translate(x, base + ph / 2, z);
      buckets.wood.push(jitterUV(pile, rng));
      if (support !== undefined) groundingReceipts?.push({
        kind: 'jetty-pile', x, y: base, z, baseClearance: -0.10,
        supportMin: support, supportMax: support,
      });
    }
  }
  for (let k = 0; k < n; k++) { // deck segments with a soft sag
    const t = (k + 0.5) * 1.9;
    const deck = box(1.95, 0.09, 1.5, 1.2);
    deck.rotateY(-Math.atan2(dz, dx));
    deck.translate(x0 + dx * t, y + 0.82 - (supportField ? 0 : k * 0.05), z0 + dz * t);
    buckets.wood.push(jitterUV(deck, rng));
  }
}

function isDressingPointClear(
  heightField: DressingHeightField,
  x: number,
  z: number,
  extent: number,
  roadClearance: number,
): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) <= extent
    && heightField._roadDist(x, z) >= roadClearance;
}

function addWinterShoreReeds(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const clumps = Math.round(lake.r * (big ? 0.52 : 0.3));
  for (let i = 0; i < clumps; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = lake.r * (0.82 + rng() * 0.22);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    if (!isDressingPointClear(heightField, x, z, 480, 6)) continue;
    winterReedClump(buckets, rng, heightField, x, z);
  }
}

function addWinterShoreIce(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const clusters = Math.round(lake.r * (big ? 0.62 : 0.42));
  for (let i = 0; i < clusters; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = lake.r * (0.90 + rng() * 0.12);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    if (!isDressingPointClear(heightField, x, z, 480, 6)) continue;
    if (rng() < 0.45) continue;
    const slabCount = 2 + ((rng() * 4) | 0);
    for (let slabIndex = 0; slabIndex < slabCount; slabIndex++) {
      const width = 0.7 + rng() * 1.1;
      const height = 0.22 + rng() * 0.34;
      const depth = 0.14 + rng() * 0.10;
      const roll = (rng() - 0.5) * 0.9, pitch = (rng() - 0.5) * 0.8;
      const yaw = -angle + (rng() - 0.5) * 0.9;
      const px = x + (rng() - 0.5) * 2.6, pz = z + (rng() - 0.5) * 2.6;
      const slab = winterIceWedge(heightField, px, pz, width, height, depth, yaw, roll, pitch, 0.9);
      buckets.plaster.push(jitterUV(slab, rng));
    }
  }
}

function addWinterPressureRidges(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const ridges = big ? 7 : 2;
  for (let i = 0; i < ridges; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = lake.r * (0.16 + rng() * 0.5);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    pressureRidge(buckets, rng, x, z, heightField,
      rng() * Math.PI, 10 + rng() * 10);
  }
}

const WINTER_WIND_YAW = -0.6;

function addSnowLens(
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
  x: number,
  z: number,
  radius: number,
  height: number,
  streak: boolean,
): void {
  const elongation = streak ? 3.0 + rng() * 1.8 : 1.4 + rng() * 0.5;
  const across = radius * (0.55 + rng() * 0.3);
  const yaw = WINTER_WIND_YAW + (rng() - 0.5) * 0.24;
  const geometry = createSnowDrift(heightField, x, z,
    radius * elongation * 0.5, across * 0.72, height, yaw);
  buckets.plaster.push(jitterUV(geometry, rng));
}

function addWinterInteriorDrifts(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const driftCount = big ? 12 : 5;
  for (let i = 0; i < driftCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = lake.r * (0.15 + rng() * 0.6);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    addSnowLens(heightField, rng, buckets, x, z,
      3.0 + rng() * 4.0, 0.13 + rng() * 0.12, true);
    const tailCount = 1 + ((rng() * 3) | 0);
    for (let tail = 1; tail <= tailCount; tail++) {
      addSnowLens(heightField, rng, buckets,
        x + Math.cos(WINTER_WIND_YAW) * (5 + tail * (4 + rng() * 3)),
        z - Math.sin(WINTER_WIND_YAW) * (5 + tail * (4 + rng() * 3)),
        1.2 + rng() * 1.8, 0.08 + rng() * 0.07, true);
    }
  }
}

function addWinterRimDrifts(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const rimCount = Math.round(lake.r * (big ? 0.5 : 0.35));
  for (let i = 0; i < rimCount; i++) {
    const angle = rng() * Math.PI * 2;
    if (rng() < 0.30) continue;
    const radius = lake.r * (0.90 + rng() * 0.16);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    if (!isDressingPointClear(heightField, x, z, 480, 6)) continue;
    addSnowLens(heightField, rng, buckets, x, z,
      2.6 + rng() * 3.4, 0.13 + rng() * 0.14, false);
  }
}

function addWinterLakeLandmark(
  lake: LayoutDisc,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
  groundingReceipts?: GroundingReceipt[] | null,
): void {
  const boatAngle = Math.PI * 1.32 + rng() * 0.2;
  const boatX = lake.x + Math.cos(boatAngle) * lake.r * 0.86;
  const boatZ = lake.z + Math.sin(boatAngle) * lake.r * 0.86;
  frozenRowboat(buckets, rng, heightField, boatX, boatZ,
    boatAngle + Math.PI / 2, groundingReceipts);
  const jettyAngle = boatAngle + 0.45;
  const jettyX = lake.x + Math.cos(jettyAngle) * lake.r * 1.02;
  const jettyZ = lake.z + Math.sin(jettyAngle) * lake.r * 1.02;
  jetty(buckets, rng, jettyX, jettyZ, jettyAngle + Math.PI,
    heightField.getHeightAt(jettyX, jettyZ));
}

function dressWinterLakes({
  L, heightField, rng, buckets, groundingReceipts,
}: FocusedDressingContext): void {
  for (const lake of L.lakes || []) {
    const big = lake.r >= 80;
    addWinterShoreReeds(lake, big, heightField, rng, buckets);
    addWinterShoreIce(lake, big, heightField, rng, buckets);
    addWinterPressureRidges(lake, big, heightField, rng, buckets);
    addWinterInteriorDrifts(lake, big, heightField, rng, buckets);
    addWinterRimDrifts(lake, big, heightField, rng, buckets);
    if (big) addWinterLakeLandmark(lake, heightField, rng, buckets, groundingReceipts);
  }
}

function legacyDressingKits(mapId?: string): readonly string[] {
  if (mapId === 'coastal') return ['coastal'];
  if (mapId === 'autumn') return ['river'];
  if (mapId === 'railyard') return ['rail'];
  if (mapId === 'winter') return ['winterLake'];
  return [];
}

/** Add map-specific geometry before the shared material buckets are merged. */
export function dressMapExtras({
  mapId, extraKits = null, riverLandings, L, heightField, rng, buckets, groundingReceipts = null,
  obstacles, colliders,
}: DressingContext): void {
  const kits = extraKits || legacyDressingKits(mapId);
  const shore: ShoreLedger = { keepOut: [], jetties: [], landings: [] };
  const focused = { L, heightField, rng, buckets, groundingReceipts, obstacles, colliders, shore };
  if (kits.includes('coastal')) dressCoastalShore(focused);
  if (kits.includes('river')) {
    if (riverLandings?.length) dressLakeRiverLandings(focused, riverLandings);
    else if (mapId === 'autumn') dressAmberfordRiver(focused);
    else dressAutumnRiver(focused);
  }
  if (kits.includes('rail')) dressRailYard(focused, mapId === 'skybridge');
  if (kits.includes('winterLake')) dressWinterLakes(focused);
  // Round 56 (2026-09-24, owner decision 21 of 2026-09-23): the wrack line and debris of every strand the map authors
  // (a sea lake with a shelf), after every kit so the boats, jetties and landings above are known and the kits' own
  // draw sequences are untouched. Soft dressing in the existing baked/wood buckets; no collision record.
  dressStrandWrack({
    lakes: L.lakes ?? [], heightField, rng, buckets, obstacles, groundingReceipts,
    spawns: L.spawns ? [L.spawns.player, ...L.spawns.enemies] : undefined,
    keepOut: shore.keepOut, jetties: shore.jetties, landings: shore.landings,
  });
  // Round 57 (2026-09-24): authored spurs lay after every kit, so a map that adds one keeps the seeded stream of
  // its earlier dressing; a map without one draws nothing here.
  if (L.railSpurs?.length) dressRailSpurs(focused, L.railSpurs);
}

// =============================================================================
// maps r1 — COASTAL SHORE dressing (beached boats, driftwood, buoys, jetty)
// =============================================================================

// The kit's open clinker hull in its own frame (length along local X, the keel line at y = 0): three lapped strakes a
// side, bow, transom and two thwarts — ten parts, six tilt draws. Shared by the beached hulls and the boats moored at
// the jetties (round 58), so both read as the same working fleet.
function clinkerHull(rng: Rng, L: number, W: number, H: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    for (let r = 0; r < 3; r++) { // three lapped strakes each side
      const pl = box(L - r * 0.55, 0.20, 0.07, 1.2);
      pl.rotateZ((rng() - 0.5) * 0.03);
      pl.translate(0, 0.16 + r * 0.20, s * (W / 2 - r * 0.07));
      parts.push(pl);
    }
  }
  const bow = box(0.08, H * 0.9, W * 0.8, 1.2);
  bow.rotateY(Math.PI / 4);
  bow.translate(L / 2 - 0.14, H * 0.45, 0);
  parts.push(bow);
  const transom = box(0.08, H * 0.8, W * 0.9, 1.2);
  transom.translate(-L / 2 + 0.12, H * 0.42, 0);
  parts.push(transom);
  for (const tx of [-L * 0.24, L * 0.18]) {
    const th = box(0.30, 0.06, W * 0.94, 1.2);
    th.translate(tx, H * 0.68, 0);
    parts.push(th);
  }
  return parts;
}

// Open clinker fishing boat beached above the surf: planked sides, transom,
// thwarts, a short mast with a furled boom. Reads "working beach" at range.
function beachedBoat(
  buckets: DressingBuckets,
  rng: Rng,
  heightField: DressingHeightField,
  x: number,
  z: number,
  yaw: number,
  withMast: boolean,
  groundingReceipts?: GroundingReceipt[] | null,
): void {
  const L = 4.6 + rng() * 1.2, W = 1.6, H = 0.72;
  const pose = planGroundedObbPose(heightField, x, z, L * 0.5, W * 0.5, yaw, 0.06);
  const parts = clinkerHull(rng, L, W, H);
  const keelList = 0.10 + rng() * 0.08; // beached hulls heel over a touch
  for (const g of parts) {
    // Length is local X: a Z rotation pitches/buries the bow and stern.
    g.rotateX(keelList);
    g.rotateY(yaw);
    applyGroundNormal(g, pose);
  }
  // Seat the rigid hull using its emitted lower faces AFTER heel and ground
  // alignment, not the unheeled OBB support plane. The opposite gunwale is
  // intentionally higher; don't deform both sides down into the beach.
  let supportY = -Infinity;
  for (const i of [0, 3, 6, 7]) { // two lowest strakes, bow and transom
    const g = parts[i] as THREE.BoxGeometry, p = g.attributes.position;
    const across = Math.max(1, Math.ceil(g.parameters.width / 0.35));
    const along = Math.max(1, Math.ceil(g.parameters.depth / 0.35));
    for (let a = 0; a <= across; a++) for (let b = 0; b <= along; b++) {
      const u = a / across, v = b / along;
      const px = p.getX(12) + (p.getX(13) - p.getX(12)) * u + (p.getX(14) - p.getX(12)) * v;
      const py = p.getY(12) + (p.getY(13) - p.getY(12)) * u + (p.getY(14) - p.getY(12)) * v;
      const pz = p.getZ(12) + (p.getZ(13) - p.getZ(12)) * u + (p.getZ(14) - p.getZ(12)) * v;
      supportY = Math.max(supportY, heightField.getHeightAt(x + px, z + pz) - py);
    }
  }
  const boatY = supportY - 0.035;
  for (const g of parts) {
    g.translate(x, boatY, z);
    buckets.wood.push(jitterUV(g, rng));
  }
  if (withMast) {
    const mast = box(0.11, 3.4, 0.11, 2.0);
    // Plant the foot on the actual forward thwart, not in the floorless hull.
    mast.translate(L * 0.18, H * 0.68 + 0.03 + 1.7, 0);
    mast.rotateX(keelList);
    mast.rotateY(yaw);
    applyGroundNormal(mast, pose);
    mast.translate(x, boatY, z);
    buckets.wood.push(mast);
    const boom = box(0.08, 0.08, 2.3, 2.0);
    boom.rotateY((rng() - 0.5) * 0.4);
    boom.translate(L * 0.18, 1.21, 0);
    boom.rotateX(keelList);
    boom.rotateY(yaw);
    applyGroundNormal(boom, pose);
    boom.translate(x, boatY, z);
    buckets.wood.push(boom);
  }
  groundingReceipts?.push({
    kind: 'beached-boat', x, y: boatY, z, relief: pose.spread,
    baseClearance: boatY - supportY, supportMin: pose.min, supportMax: pose.max,
  });
}

function addCoastalBoats(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
  groundingReceipts?: GroundingReceipt[] | null,
  shore?: ShoreLedger,
): void {
  const boatCount = lake.boats ?? (big ? 3 : 1);
  for (let i = 0; i < boatCount; i++) {
    const angle = Math.PI + (rng() - 0.5) * 1.5;
    const radius = lake.r * (1.045 + rng() * 0.05);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    if (!isDressingPointClear(heightField, x, z, 470, 7)) continue;
    beachedBoat(buckets, rng, heightField, x, z,
      angle + Math.PI / 2 + (rng() - 0.5) * 0.5, rng() < 0.55, groundingReceipts);
    shore?.keepOut.push({ x, z, r: 4.2 });
  }
}

function addCoastalDriftwood(
  lake: LayoutDisc,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
  groundingReceipts?: GroundingReceipt[] | null,
  strand: StrandContext | null = null,
): void {
  const driftCount = Math.round(lake.r * 0.14);
  // Round 56 (2026-09-24): on a shore that authors a shelf the logs lie in the strand's wrack band (strandWrack.ts)
  // instead of on the plain 1.03–1.12 R circle, which put them on the meadow behind Saltmere's crescent and up the
  // fjord's rock ridges (seed 1337: median 7.7 m above the water, nine in the water). The draws and the original
  // clearance gate are unchanged, so the buoys and the jetty keep their positions; a log the strand refuses is not built.
  const onStrand = strand !== null && lake.shelfM !== undefined && Number.isFinite(lake.level);
  for (let i = 0; i < driftCount; i++) {
    const angle = Math.PI + (rng() - 0.5) * 2.2;
    const spread = rng();
    const radius = lake.r * (1.03 + spread * 0.09);
    let x = lake.x + Math.cos(angle) * radius;
    let z = lake.z + Math.sin(angle) * radius;
    if (!isDressingPointClear(heightField, x, z, 470, 6)) continue;
    const length = 1.6 + rng() * 2.6;
    const yaw = angle + Math.PI / 2 + (rng() - 0.5) * 0.8;
    const log = box(length, 0.16 + rng() * 0.12, 0.16 + rng() * 0.12, 1.4);
    jitterUV(log, rng);
    if (onStrand) {
      const band = strandBandAt(heightField, lake, angle);
      if (!band) { log.dispose(); continue; }
      const [start, end] = wrackBand(band);
      const r = start + (end - start) * (0.25 + spread * 0.75);
      x = lake.x + Math.cos(angle) * r;
      z = lake.z + Math.sin(angle) * r;
      if (!strandAdmits(strand, lake as LayoutDisc & { level: number }, x, z, length * 0.5 + 0.1)) { log.dispose(); continue; }
    }
    const pose = planGroundedSegment(
      heightField, x, z, Math.cos(yaw), -Math.sin(yaw), length, 0.12, 0.03,
    );
    if (onStrand && pose.relief > 0.35) { log.dispose(); continue; }
    _groundNormal.set(pose.axisX, pose.axisY, pose.axisZ);
    _groundQuat.setFromUnitVectors(_groundRight, _groundNormal);
    log.applyQuaternion(_groundQuat);
    log.translate(x, pose.y, z);
    buckets.wood.push(log);
    groundingReceipts?.push({
      kind: 'driftwood', x, y: pose.y, z, relief: pose.relief,
      baseClearance: -0.03, start: pose.start, end: pose.end,
    });
  }
}

function addCoastalBuoys(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const buoyCount = big ? 5 : 2;
  for (let i = 0; i < buoyCount; i++) {
    const angle = Math.PI + (rng() - 0.5) * 1.8;
    const radius = lake.r * (0.72 + rng() * 0.2);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    if (Math.max(Math.abs(x), Math.abs(z)) > 480) continue;
    const buoy = new THREE.SphereGeometry(0.32 + rng() * 0.12, 8, 6);
    scaleUV(buoy, 1.5, 1);
    const waterline = heightField.getWaterSurfaceHeightAt?.(x, z)
      ?? heightField.getHeightAt(x, z) + (heightField.getWaterDepthAt?.(x, z) ?? 0);
    buoy.translate(x, waterline + 0.16, z);
    buckets.plaster.push(jitterUV(buoy, rng));
  }
}

/** The draws of the retired 1.05 R coastal jetty (14 piles × (a yaw + four UV draws) + 6 deck segments × four UV draws). */
const LEGACY_COASTAL_JETTY_DRAWS = 94;

// =============================================================================
// round 58 (2026-09-24) — the pieces that key on a jetty at the water's edge (shoreJetty.ts plans it): the gangway
// from the sand, the boat moored alongside its outer spans, the bollards and mooring lines. Both the coastal kit's
// jetties and Saltwind's authored piers take them. Everything is soft dressing in the existing wood / dark buckets;
// no collision record, so no dedicated shard moves and no bot lane gains a trap.
// =============================================================================

/** The gangway: one plank from the dry sand up to the deck top with three battens, its foot a centimetre into the
 * sand, its head flush with the shore end. */
function jettyGangway(
  buckets: DressingBuckets, rng: Rng, plan: ShoreJettyPlan, groundingReceipts?: GroundingReceipt[] | null,
): void {
  if (!plan.gangway) return; // the deck lands on the bank
  const dx = Math.cos(plan.angle), dz = Math.sin(plan.angle);
  const heading = -Math.atan2(dz, dx);
  const { run, groundY } = plan.gangway;
  const top = plan.deckY + JETTY_DECK_THICKNESS_M / 2;
  const footX = plan.x - dx * run, footZ = plan.z - dz * run;
  const pitch = Math.atan2(top - groundY, run);
  // centre-line ends: the foot's lower corner a centimetre into the sand, the head's top just under the deck top
  const footY = groundY + 0.04 * Math.cos(pitch) - 0.01, headY = top - 0.045;
  const span = Math.hypot(run, headY - footY);
  const slope = Math.atan2(headY - footY, run);
  const plank = box(span, 0.08, 1.2, 1.2);
  plank.rotateZ(slope);
  plank.rotateY(heading);
  plank.translate((footX + plan.x) / 2, (footY + headY) / 2, (footZ + plan.z) / 2);
  buckets.wood.push(jitterUV(plank, rng));
  for (const t of [0.25, 0.5, 0.75]) { // battens across the plank
    const batten = box(0.07, 0.03, 1.1, 1.2);
    batten.translate((t - 0.5) * span, 0.055, 0);
    batten.rotateZ(slope);
    batten.rotateY(heading);
    batten.translate((footX + plan.x) / 2, (footY + headY) / 2, (footZ + plan.z) / 2);
    buckets.wood.push(jitterUV(batten, rng));
  }
  groundingReceipts?.push({
    kind: 'jetty-gangway', x: footX, y: groundY, z: footZ, relief: top - groundY, baseClearance: -0.01,
    supportMin: groundY, supportMax: groundY,
  });
}

interface MooredBoat { x: number; z: number; yaw: number; L: number; keelY: number; bow: 1 | -1 }

/** The kit's clinker hull afloat beside the outer spans: the hull bottom a fixed draft under the water surface (the
 * bed lies 0.72 m below it), parallel to the deck, a slight list, a mast on some. */
function mooredBoat(
  buckets: DressingBuckets, rng: Rng, heightField: DressingHeightField, plan: ShoreJettyPlan,
  groundingReceipts?: GroundingReceipt[] | null,
): MooredBoat | null {
  if (!plan.boat) return null;
  const dx = Math.cos(plan.angle), dz = Math.sin(plan.angle), ax = -dz, az = dx;
  const across = plan.boat.side * (JETTY_DECK_HALF_WIDTH_M + MOORED_BOAT_GAP_M + MOORED_BOAT_HALF_BEAM_M);
  const x = plan.x + dx * plan.boat.along + ax * across, z = plan.z + dz * plan.boat.along + az * across;
  const L = 4.6 + rng() * 1.2, W = 1.6, H = 0.72;
  const parts = clinkerHull(rng, L, W, H);
  const list = (rng() - 0.5) * 0.08;
  const bow: 1 | -1 = rng() < 0.5 ? 1 : -1; // bow to sea or to shore
  const yaw = -Math.atan2(dz, dx) + (bow > 0 ? 0 : Math.PI) + (rng() - 0.5) * 0.05;
  const keelY = plan.surface - MOORED_BOAT_DRAFT_M;
  for (const g of parts) {
    g.rotateX(list);
    g.rotateY(yaw);
    g.translate(x, keelY, z);
    buckets.wood.push(jitterUV(g, rng));
  }
  if (rng() < 0.55) {
    const mast = box(0.11, 3.4, 0.11, 2.0);
    mast.translate(L * 0.18, H * 0.68 + 0.03 + 1.7, 0);
    mast.rotateX(list);
    mast.rotateY(yaw);
    mast.translate(x, keelY, z);
    buckets.wood.push(mast);
    const boom = box(0.08, 0.08, 2.3, 2.0);
    boom.rotateY((rng() - 0.5) * 0.4);
    boom.translate(L * 0.18, 1.21, 0);
    boom.rotateX(list);
    boom.rotateY(yaw);
    boom.translate(x, keelY, z);
    buckets.wood.push(boom);
  }
  const bed = heightField.getHeightAt(x, z);
  groundingReceipts?.push({
    kind: 'moored-boat', x, y: keelY, z, relief: 0, baseClearance: keelY - plan.surface,
    supportMin: bed, supportMax: bed,
  });
  return { x, z, yaw, L, keelY, bow };
}

/** Two bollards on the deck edge beside the moored hull and a line from each to the nearer gunwale. */
function jettyMoorings(buckets: DressingBuckets, rng: Rng, plan: ShoreJettyPlan, boat: MooredBoat): void {
  const dx = Math.cos(plan.angle), dz = Math.sin(plan.angle), ax = -dz, az = dx;
  const side = plan.boat!.side;
  const top = plan.deckY + JETTY_DECK_THICKNESS_M / 2;
  const gunwale = boat.keelY + 0.66; // the top strake's upper edge
  const nearGunwale = side * (JETTY_DECK_HALF_WIDTH_M + MOORED_BOAT_GAP_M + 0.04);
  for (const end of [-1, 1]) {
    const along = plan.boat!.along + end * JETTY_SPAN_M / 2;
    const px = plan.x + dx * along + ax * side * 0.60, pz = plan.z + dz * along + az * side * 0.60;
    const post = box(0.20, 0.55, 0.20, 1.2);
    post.rotateY((rng() - 0.5) * 0.4);
    post.translate(px, top + 0.275, pz);
    buckets.wood.push(jitterUV(post, rng));
    // the line: from the bollard's top to the hull's near gunwale at that end
    const hullAlong = plan.boat!.along + end * boat.L * 0.42;
    const hx = plan.x + dx * hullAlong + ax * nearGunwale, hz = plan.z + dz * hullAlong + az * nearGunwale;
    const fromY = top + 0.52, toY = gunwale;
    const runX = hx - px, runZ = hz - pz, run = Math.hypot(runX, runZ);
    const line = box(Math.hypot(run, toY - fromY), 0.03, 0.03, 1);
    line.rotateZ(Math.atan2(toY - fromY, run));
    line.rotateY(-Math.atan2(runZ, runX));
    line.translate((px + hx) / 2, (fromY + toY) / 2, (pz + hz) / 2);
    buckets.wood.push(jitterUV(line, rng)); // the kit's timber texture at 3 cm reads as a tarred line; no new bucket
  }
}

/** Every piece that keys on a planned jetty, drawn from the landing's own stream (the kit's main sequence is untouched). */
function dressShoreLanding(
  buckets: DressingBuckets, heightField: DressingHeightField, plan: ShoreJettyPlan,
  groundingReceipts?: GroundingReceipt[] | null, rng: Rng = landingStream(plan),
): void {
  jettyGangway(buckets, rng, plan, groundingReceipts);
  const boat = mooredBoat(buckets, rng, heightField, plan, groundingReceipts);
  if (boat) jettyMoorings(buckets, rng, plan, boat);
}

/** The shore ledger entry of a planned jetty: the wrack line keeps off the deck and the gangway, and gathers its
 * larger pieces beside the shore end. */
function registerShoreLanding(shore: ShoreLedger | undefined, plan: ShoreJettyPlan): void {
  if (!shore) return;
  const dx = Math.cos(plan.angle), dz = Math.sin(plan.angle), run = plan.gangway?.run ?? 0;
  shore.jetties.push({
    x0: plan.x - dx * run, z0: plan.z - dz * run,
    x1: plan.x + dx * plan.length, z1: plan.z + dz * plan.length, r: 2.6,
  });
  shore.landings.push({ x: plan.x, z: plan.z, angle: plan.azimuth });
}

function addCoastalJetty(
  lake: LayoutDisc,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
  shore: ShoreLedger | undefined,
  groundingReceipts: GroundingReceipt[] | null | undefined,
  spawns: readonly { x: number; z: number }[] | undefined,
): void {
  // Round 58 (2026-09-24): the jetty stood at 1.05 R of the disc with fixed-height piles and a sagging deck — 15–30 m
  // inland on Saltmere's flat strand, ten metres up the bank on Nordhavn's heads. It now stands where the strand law
  // puts it (shoreJetty.ts): the same azimuth draw as before, then its neighbours a twentieth of a radian apart within
  // the kit's window, the first whose contour admits a jetty of the kit's length; a shore that admits none keeps its
  // boats, driftwood and buoys and gets no jetty. The deck and piles are the river landings' planted kit.
  const drawn = Math.PI + (rng() - 0.5) * 0.5;
  // The old 11 m kit drew 94 values for its fourteen piles and six deck segments. The planted kit takes its timber from
  // the landing's own stream below and burns those 94 here, so every later draw of the map — the next arm's driftwood
  // and buoys, the wrack line — keeps the place it had; only the jetty and what keys on it move.
  for (let i = 0; i < LEGACY_COASTAL_JETTY_DRAWS; i++) rng();
  let plan: ShoreJettyPlan | null = null;
  for (let step = 0; step <= 5 && !plan; step++) {
    for (const sign of step === 0 ? [1] : [1, -1]) {
      plan = planShoreJetty(heightField, lake, drawn + sign * step * 0.05, { spawns });
      if (plan) break;
    }
  }
  if (!plan) return;
  const stream = landingStream(plan);
  jetty(buckets, stream, plan.x, plan.z, plan.angle, plan.deckY - 0.82, plan.length, heightField, groundingReceipts);
  dressShoreLanding(buckets, heightField, plan, groundingReceipts, stream);
  registerShoreLanding(shore, plan);
}

function dressCoastalShore({
  L, heightField, rng, buckets, groundingReceipts, obstacles, shore,
}: FocusedDressingContext): void {
  const spawns = L.spawns ? [L.spawns.player, ...L.spawns.enemies] : undefined;
  // Round 56: the driftwood's strand admission shares the wrack line's gates (roads, pads, boats, footprints)
  const strand: StrandContext = {
    lakes: L.lakes ?? [], heightField, rng, buckets, obstacles, spawns,
    keepOut: shore?.keepOut, jetties: shore?.jetties,
  };
  for (const lake of L.lakes || []) {
    const big = lake.r >= 110;
    addCoastalBoats(lake, big, heightField, rng, buckets, groundingReceipts, shore);
    addCoastalDriftwood(lake, heightField, rng, buckets, groundingReceipts, strand);
    addCoastalBuoys(lake, big, heightField, rng, buckets);
    if (big) addCoastalJetty(lake, heightField, rng, buckets, shore, groundingReceipts, spawns);
  }
}

// =============================================================================
// maps r1 — AUTUMN RIVER dressing (ruined bridge, ford posts, bank reeds)
// =============================================================================

function addRiverBankReeds(
  links: readonly LayoutDisc[],
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  for (const m of links) {
    const clumps = 2 + ((rng() * 3) | 0);
    for (let i = 0; i < clumps; i++) {
      const a = rng() * Math.PI * 2;
      const rr = m.r * (0.85 + rng() * 0.3);
      const x = m.x + Math.cos(a) * rr, z = m.z + Math.sin(a) * rr;
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) continue;
      if (heightField._roadDist(x, z) < 6) continue;
      reedClump(buckets, rng, heightField, x, z);
    }
  }
}

function addBridgeAbutment(
  side: number,
  centerX: number,
  centerZ: number,
  cross: number,
  halfSpan: number,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const x = centerX + Math.cos(cross) * halfSpan * side;
  const z = centerZ + Math.sin(cross) * halfSpan * side;
  const y = heightField.getHeightAt(x, z);
  const abutment = box(6.2, 3.2, 5.4, 0.6);
  abutment.rotateY(-cross);
  abutment.translate(x, y + 1.2, z);
  buckets.stone.push(jitterUV(abutment, rng));
  const stub = box(3.8, 1.6, 4.6, 0.6);
  stub.rotateY(-cross);
  stub.rotateZ(-side * Math.cos(cross) * 0.30);
  stub.rotateX(side * Math.sin(cross) * 0.30);
  stub.translate(x - Math.cos(cross) * side * 4.0, y + 2.2,
    z - Math.sin(cross) * side * 4.0);
  buckets.stone.push(jitterUV(stub, rng));
  const parapet = box(0.5, 1.1, 5.8, 0.8);
  parapet.rotateY(-cross);
  parapet.translate(x + Math.cos(cross + Math.PI / 2) * 2.6, y + 3.2,
    z + Math.sin(cross + Math.PI / 2) * 2.6);
  buckets.stone.push(jitterUV(parapet, rng));
  const wing = box(1.6, 1.8, 6.4, 0.6);
  wing.rotateY(-cross + side * 0.5);
  wing.translate(x + Math.cos(cross) * side * 2.2, y + 0.6,
    z + Math.sin(cross) * side * 2.2);
  buckets.stone.push(jitterUV(wing, rng));
}

function addFallenBridgeSlabs(
  centerX: number,
  centerZ: number,
  cross: number,
  halfSpan: number,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  for (let k = 0; k < 5; k++) {
    const offset = (rng() - 0.5) * halfSpan * 1.2;
    const x = centerX + Math.cos(cross) * offset;
    const z = centerZ + Math.sin(cross) * offset;
    const slab = box(2.2 + rng() * 1.6, 0.7, 2.6 + rng() * 1.0, 0.7);
    slab.rotateY(-cross + (rng() - 0.5) * 0.8);
    slab.rotateZ((rng() - 0.5) * 0.5);
    slab.translate(x, heightField.getHeightAt(x, z) + 0.3, z);
    buckets.stone.push(jitterUV(slab, rng));
  }
}

function addRuinedRiverBridge(
  links: readonly LayoutDisc[],
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const centerIndex = Math.floor(links.length * 0.4);
  const before = links[Math.max(0, centerIndex - 1)];
  const after = links[Math.min(links.length - 1, centerIndex + 1)];
  const centerX = links[centerIndex].x;
  const centerZ = links[centerIndex].z;
  const cross = Math.atan2(after.z - before.z, after.x - before.x) + Math.PI / 2;
  const halfSpan = links[centerIndex].r * 1.02;
  for (const side of [-1, 1]) {
    addBridgeAbutment(side, centerX, centerZ, cross, halfSpan, heightField, rng, buckets);
  }
  addFallenBridgeSlabs(centerX, centerZ, cross, halfSpan, heightField, rng, buckets);
}

function isInRiver(links: readonly LayoutDisc[], x: number, z: number): boolean {
  return links.some((link) => Math.hypot(x - link.x, z - link.z) < link.r * 0.85);
}

function addFordMarkerPair(
  previous: readonly [number, number],
  current: readonly [number, number],
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const [previousX, previousZ] = previous;
  const [x, z] = current;
  const tangentX = x - previousX;
  const tangentZ = z - previousZ;
  const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
  const lateralX = -tangentZ / tangentLength;
  const lateralZ = tangentX / tangentLength;
  for (const side of [-1, 1]) {
    const markerX = x + lateralX * 4.6 * side;
    const markerZ = z + lateralZ * 4.6 * side;
    if (Math.max(Math.abs(markerX), Math.abs(markerZ)) > 470) continue;
    const markerY = heightField.getHeightAt(markerX, markerZ);
    const post = box(0.16, 1.5, 0.16, 1.6);
    post.rotateY(rng() * Math.PI);
    post.translate(markerX, markerY + 0.72, markerZ);
    buckets.wood.push(jitterUV(post, rng));
    const tip = box(0.19, 0.22, 0.19, 1.0);
    tip.translate(markerX, markerY + 1.45, markerZ);
    buckets.plaster.push(tip);
  }
}

function addRiverFordMarkers(
  roads: DressingLayout['roads'],
  links: readonly LayoutDisc[],
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  for (const nodes of roads) {
    let prev = false;
    for (let i = 0; i < nodes.length; i++) {
      const [nx, nz] = nodes[i];
      const now = isInRiver(links, nx, nz);
      if (now !== prev && i > 0) {
        addFordMarkerPair(nodes[i - 1], nodes[i], heightField, rng, buckets);
      }
      prev = now;
    }
  }
}

function dressAutumnRiver({ L, heightField, rng, buckets }: FocusedDressingContext): void {
  const links = (L.marshes || []).filter((marsh) => marsh.r <= 40);
  if (links.length < 3) return;
  addRiverBankReeds(links, heightField, rng, buckets);
  addRuinedRiverBridge(links, heightField, rng, buckets);
  addRiverFordMarkers(L.roads, links, heightField, rng, buckets);
}

// =============================================================================
// Round 48 — AMBERFORD river dressing (owner 2026-09-23: the Verdant-clone maps
// "need redesign"). The coach road crosses the narrows on an INTACT stone bridge,
// the other lanes get the round-1 ford posts, and a weir sill holds the reach
// above the town with a water mill on its bank. Round 61 (2026-09-24): the bridge
// is a true arched span on the deck plane terrain.ts resolves for the station
// authored crossing: 'bridge' (heightField.bridgeDecks) — the water flows under
// it through real arcs, the deck and the parapets are its collision record.
// Everything is derived from the layout and that plane; no map coordinate lives here.
// =============================================================================

/** Align a box's width axis (local +x) with the world direction (dx, dz); local +z then points to (-dz, dx). */
function alignWidth<T extends THREE.BufferGeometry>(geometry: T, dx: number, dz: number): T {
  geometry.rotateY(Math.atan2(-dz, dx));
  return geometry;
}

/** Round 61: the pier between two arches and the abutment past the last, the parapet and the deck slab (m). */
const BRIDGE_PIER_M = 2.0;
const BRIDGE_PARAPET_HEIGHT_M = 1.1;
const BRIDGE_PARAPET_THICK_M = 0.5;
const BRIDGE_SLAB_M = 0.5;
/** The body's bottom below the bed and its top under the slab; the spandrel fill over an arch crown. */
const BRIDGE_BODY_BELOW_BED_M = 0.6;
const BRIDGE_BODY_TOP_UNDER_DECK_M = 0.45;
const BRIDGE_SPANDREL_FILL_M = 0.55;
/** The pier face shown above the water surface before the arch springs. */
const BRIDGE_SPRING_OVER_WATER_M = 0.3;
/** Round 63: the vault's collision bands (the building hitboxes' shell bands are 0.5 m; the arcs are finer). */
const BRIDGE_VAULT_BAND_M = 0.3;

/**
 * Round 61 (2026-09-24): the arched stone bridge on the deck plane terrain.ts resolved — the water flows under it.
 * The body is ONE extruded elevation profile through the full deck width: the spandrel walls with N segmental arches
 * (the chord from the wet span, the rise from the headroom the deck leaves over the spring line) whose vault soffits are
 * the extrusion's inner walls, so the openings are arcs, not recesses, and the sheet runs through them. Piers carry
 * cutwaters turned into the stream, the abutments stand on the banks past the wet reach with splayed wing walls, the
 * deck slab lies level at deckY (flush with the graded approaches) and the parapets ride on it. The collision record
 * the ride stands on is a compound whose parts follow the geometry (round 63, 2026-09-24 — it was one solid body
 * from the footing to the deck, an invisible wall across every arch): the deck from the crown line up, the piers and
 * abutments from the footing to the crown line, each vault as thin bands whose haunches reach from the pier faces to
 * the arc, and the two parapets. A hull on the approach mounts the deck part as its floor, a shell through an
 * opening passes, a hull low enough for the vault passes under it, a hull in the river is pushed by the piers and
 * the vault, and the parapets stop a hull that leaves the deck sideways. Everything is derived from the deck plane;
 * no map coordinate lives here.
 */
function addArchedStoneBridge(
  deck: DressingBridgeDeck, heightField: DressingHeightField, rng: Rng, buckets: DressingBuckets,
  ctx: FocusedDressingContext,
): void {
  const { x: cx, z: cz, ux, uz, halfLength, halfWidth, deckY, bedY, waterY } = deck;
  const vx = -uz, vz = ux; // across the road = along the river (the extrusion's local +z)
  const width = halfWidth * 2;
  const bodyHalf = halfLength + 1.0; // a metre into each approach embankment
  const bottom = bedY - BRIDGE_BODY_BELOW_BED_M;
  const top = deckY - BRIDGE_BODY_TOP_UNDER_DECK_M;
  // the arches share the wet span between the abutments: N ≈ one per 11 m, piers between them
  const wetSpan = Math.max(4, (halfLength - 3) * 2);
  const arches = Math.max(1, Math.round(wetSpan / 11));
  const chord = (wetSpan - (arches - 1) * BRIDGE_PIER_M) / arches;
  const springY = waterY + BRIDGE_SPRING_OVER_WATER_M;
  const crownY = top - BRIDGE_SPANDREL_FILL_M;
  const rise = Math.max(0.4, Math.min(chord * 0.32, crownY - springY));
  const radius = (chord * chord / 4 + rise * rise) / (2 * rise);
  const centreY = springY + rise - radius;
  const halfAngle = Math.asin(Math.min(1, chord / 2 / radius));
  // the elevation profile (local x along the road, y up), traced clockwise with the arch openings cut from the bottom
  const profile = new THREE.Shape();
  profile.moveTo(-bodyHalf, bottom);
  profile.lineTo(-bodyHalf, top);
  profile.lineTo(bodyHalf, top);
  profile.lineTo(bodyHalf, bottom);
  for (let i = arches - 1; i >= 0; i--) {
    const archX = -wetSpan / 2 + chord / 2 + i * (chord + BRIDGE_PIER_M);
    profile.lineTo(archX + chord / 2, bottom);
    profile.lineTo(archX + chord / 2, springY);
    profile.absarc(archX, centreY, radius, Math.PI / 2 - halfAngle, Math.PI / 2 + halfAngle, false);
    profile.lineTo(archX - chord / 2, bottom);
  }
  profile.lineTo(-bodyHalf, bottom);
  const body = new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false, curveSegments: 10 });
  body.translate(0, 0, -width / 2);
  scaleUV(body, 0.7, 0.7); // the extrusion's UVs are metres; the stone bucket's boxes carry 0.7 per metre
  jitterUV(body, rng);
  alignWidth(body, ux, uz);
  buckets.stone.push(body.translate(cx, 0, cz));
  // the deck slab, level and flush with the approaches (a thin slab takes per-face metre UVs — box() would stretch
  // the stone across the deck's width into stripes), and the parapets on its edges with end posts
  const slab = slabBox(bodyHalf * 2, BRIDGE_SLAB_M, width, 0.7);
  jitterUV(slab, rng);
  buckets.stone.push(alignWidth(slab, ux, uz).translate(cx, deckY - BRIDGE_SLAB_M / 2, cz));
  const parapetHalf = bodyHalf + 0.2;
  for (const side of [-1, 1]) {
    const inset = halfWidth - BRIDGE_PARAPET_THICK_M / 2;
    const parapet = box(parapetHalf * 2, BRIDGE_PARAPET_HEIGHT_M, BRIDGE_PARAPET_THICK_M, 0.7);
    jitterUV(parapet, rng);
    buckets.stone.push(alignWidth(parapet, ux, uz)
      .translate(cx + vx * inset * side, deckY + BRIDGE_PARAPET_HEIGHT_M / 2, cz + vz * inset * side));
    for (const end of [-1, 1]) {
      const post = box(0.8, BRIDGE_PARAPET_HEIGHT_M + 0.4, 0.8, 0.7);
      jitterUV(post, rng);
      buckets.stone.push(alignWidth(post, ux, uz).translate(
        cx + ux * end * parapetHalf + vx * inset * side, deckY + (BRIDGE_PARAPET_HEIGHT_M + 0.4) / 2,
        cz + uz * end * parapetHalf + vz * inset * side));
    }
  }
  // cutwaters on both faces of every pier, their noses turned into the stream
  const cutwaterTop = springY + 0.5;
  for (let i = 0; i < arches - 1; i++) {
    const pierX = -wetSpan / 2 + (i + 1) * chord + i * BRIDGE_PIER_M + BRIDGE_PIER_M / 2;
    for (const side of [-1, 1]) {
      const nose = box(BRIDGE_PIER_M * 0.8, cutwaterTop - bottom, BRIDGE_PIER_M * 0.8, 0.7);
      nose.rotateY(Math.PI / 4);
      jitterUV(nose, rng);
      buckets.stone.push(alignWidth(nose, ux, uz).translate(
        cx + ux * pierX + vx * (halfWidth + 0.5) * side, (cutwaterTop + bottom) / 2,
        cz + uz * pierX + vz * (halfWidth + 0.5) * side));
    }
  }
  // wing walls splay from each abutment corner down the bank
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const wingX = cx + ux * end * (bodyHalf + 2.2) + vx * (halfWidth + 1.4) * side;
      const wingZ = cz + uz * end * (bodyHalf + 2.2) + vz * (halfWidth + 1.4) * side;
      const foot = heightField.getHeightAt(wingX, wingZ) - 0.5;
      const wingTop = deckY + 0.3;
      const wing = box(5.2, wingTop - foot, 0.9, 0.7);
      wing.rotateY(-end * side * 0.6);
      jitterUV(wing, rng);
      buckets.stone.push(alignWidth(wing, ux, uz).translate(wingX, (foot + wingTop) / 2, wingZ));
    }
  }
  // The record (round 63, 2026-09-24): parts that follow the geometry. The deck part is the spandrel fill and the slab
  // from the crown line up — deckY − crownY = BRIDGE_BODY_TOP_UNDER_DECK_M + BRIDGE_SPANDREL_FILL_M = 1.0 m, over
  // HULL_STANDABLE_HEIGHT_M (0.9), so a hull on the deck mounts it as its floor and is not pushed by its sides — the
  // abutments and the piers stand from the footing to the crown line, and each vault is BRIDGE_VAULT_BAND_M bands
  // (the shell bands of the building hitboxes) whose solid haunches reach in from the pier faces to the arc at the
  // band's middle height, so the opening a shell or a low hull sees is the arc to within a band. Below the spring
  // line the openings are clear from pier to pier.
  const yaw = Math.atan2(ux, uz); // an OBB's forward axis is (sin yaw, cos yaw), like a hull's
  const parts: SimpleCollisionShape[] = [{ kind: 'obb', cx, cz, hw: halfWidth, hl: bodyHalf, yaw, y0: crownY, y1: deckY }];
  const solid = (from: number, to: number, y0: number, y1: number): void => {
    // one solid slice of the body between two stations along the road, through the full deck width
    const at = (from + to) / 2;
    parts.push({ kind: 'obb', cx: cx + ux * at, cz: cz + uz * at, hw: halfWidth, hl: (to - from) / 2, yaw, y0, y1 });
  };
  solid(-bodyHalf, -wetSpan / 2, bottom, crownY); // the abutments
  solid(wetSpan / 2, bodyHalf, bottom, crownY);
  for (let i = 0; i < arches - 1; i++) { // the piers
    const pierX = -wetSpan / 2 + (i + 1) * chord + i * BRIDGE_PIER_M;
    solid(pierX, pierX + BRIDGE_PIER_M, bottom, crownY);
  }
  const bands = Math.max(1, Math.ceil((crownY - springY) / BRIDGE_VAULT_BAND_M));
  for (let i = 0; i < arches; i++) { // the vaults' haunches, band by band
    const archX = -wetSpan / 2 + chord / 2 + i * (chord + BRIDGE_PIER_M);
    for (let band = 0; band < bands; band++) {
      const y0 = springY + (crownY - springY) * band / bands, y1 = springY + (crownY - springY) * (band + 1) / bands;
      const dy = (y0 + y1) / 2 - centreY;
      const opening = Math.sqrt(Math.max(0, radius * radius - dy * dy)); // the arc's half-opening at the band's middle
      if (opening >= chord / 2) continue;
      solid(archX - chord / 2, archX - opening, y0, y1);
      solid(archX + opening, archX + chord / 2, y0, y1);
    }
  }
  const parapetInset = halfWidth - BRIDGE_PARAPET_THICK_M / 2;
  for (const side of [-1, 1]) {
    parts.push({ kind: 'obb', cx: cx + vx * parapetInset * side, cz: cz + vz * parapetInset * side,
      hw: BRIDGE_PARAPET_THICK_M / 2, hl: parapetHalf, yaw, y0: deckY, y1: deckY + BRIDGE_PARAPET_HEIGHT_M });
  }
  const record = setCompoundShape({ min: [0, bottom, 0], max: [0, deckY + BRIDGE_PARAPET_HEIGHT_M, 0], kind: 'bridge' }, parts);
  ctx.obstacles?.push(record);
  ctx.colliders?.push(cloneCollisionRecord(record));
}

function addWeirAndMill(links: readonly LayoutDisc[], crossing: Readonly<{ x: number; z: number }> | null, heightField: DressingHeightField,
  rng: Rng, buckets: DressingBuckets, ctx: FocusedDressingContext): void {
  // the reach six links upstream of the bridge (the SW end of the chain is upstream)
  let bridgeIndex = 0, bestDistance = Infinity;
  if (crossing) for (let i = 0; i < links.length; i++) {
    const d = Math.hypot(links[i].x - crossing.x, links[i].z - crossing.z);
    if (d < bestDistance) { bestDistance = d; bridgeIndex = i; }
  }
  const index = Math.max(1, Math.min(links.length - 2, (crossing ? bridgeIndex : Math.floor(links.length * 0.4)) - 6));
  const link = links[index], before = links[index - 1], after = links[index + 1];
  const tl = Math.hypot(after.x - before.x, after.z - before.z) || 1;
  const tx = (after.x - before.x) / tl, tz = (after.z - before.z) / tl; // downstream tangent
  let nx = -tz, nz = tx; // the bank normal toward the town side (+z)
  if (nz < 0) { nx = -nx; nz = -nz; }
  const water = heightField.getHeightAt(link.x, link.z);
  // the weir: a stone sill across the channel with a pier at each end, its crest 0.5 m above the water
  const sillLength = link.r * 1.3;
  const sill = alignWidth(box(sillLength, 0.9, 1.5, 0.8), nx, nz);
  jitterUV(sill, rng);
  buckets.stone.push(sill.translate(link.x, water + 0.05, link.z));
  for (const end of [-1, 1]) {
    const pierX = link.x + nx * end * (sillLength / 2 + 0.7), pierZ = link.z + nz * end * (sillLength / 2 + 0.7);
    const pier = alignWidth(box(1.3, 1.9, 1.7, 0.8), nx, nz);
    jitterUV(pier, rng);
    buckets.stone.push(pier.translate(pierX, water + 0.55, pierZ));
  }
  // the mill house on the bank: stone body, tiled gable roof, wheel on the river side in a stone leat
  const setback = link.r * 1.05 + 9;
  const mx = link.x + nx * setback, mz = link.z + nz * setback;
  if (Math.max(Math.abs(mx), Math.abs(mz)) > 470 || heightField._roadDist(mx, mz) < 9) return;
  const ground = heightField.getHeightAt(mx, mz);
  const width = 7.6, depth = 9.2, wallHeight = 4.4;
  const body = alignWidth(box(width, wallHeight, depth, 0.6), tx, tz);
  jitterUV(body, rng);
  buckets.stone.push(body.translate(mx, ground + wallHeight / 2 - 0.2, mz));
  const roof = gablePrism(depth + 0.8, 2.9, width + 0.7, 0.4); // ridge along the river (extruded along local z)
  roof.rotateY(Math.PI / 2);
  alignWidth(roof, tx, tz);
  buckets.roof.push(roof.translate(mx, ground + wallHeight - 0.25, mz));
  // door on the lane side, two windows on the river side
  const door = alignWidth(box(1.3, 2.3, 0.14, 1.0), tx, tz);
  buckets.dark.push(door.translate(mx + nx * (depth / 2 + 0.02), ground + 0.95, mz + nz * (depth / 2 + 0.02)));
  for (const along of [-2.2, 2.2]) {
    const window = alignWidth(box(0.9, 1.1, 0.14, 1.0), tx, tz);
    buckets.dark.push(window.translate(mx + tx * along - nx * (depth / 2 + 0.02), ground + 2.6, mz + tz * along - nz * (depth / 2 + 0.02)));
  }
  // the wheel: a wooden drum on an axle along the river, half sunk in a stone leat between the house and the water
  const wheelX = mx - nx * (depth / 2 + 1.9), wheelZ = mz - nz * (depth / 2 + 1.9);
  const wheelGround = heightField.getHeightAt(wheelX, wheelZ);
  const wheelY = wheelGround + 1.9;
  const drum = new THREE.CylinderGeometry(2.5, 2.5, 0.8, 14, 1);
  drum.rotateZ(Math.PI / 2); // axis along local x
  alignWidth(drum, tx, tz);
  scaleUV(drum, 2, 1);
  buckets.wood.push(drum.translate(wheelX, wheelY, wheelZ));
  for (let spoke = 0; spoke < 6; spoke++) {
    const bar = box(0.16, 5.4, 0.16, 1.6);
    bar.rotateX(spoke * Math.PI / 6);
    bar.rotateY(Math.PI / 2);
    alignWidth(bar, tx, tz);
    buckets.dark.push(bar.translate(wheelX, wheelY, wheelZ));
  }
  const axle = alignWidth(box(3.0, 0.3, 0.3, 1.0), tx, tz);
  buckets.dark.push(axle.translate(wheelX, wheelY, wheelZ));
  for (const side of [-1, 1]) {
    const leat = alignWidth(box(0.5, 1.1, 8.0, 0.7), tx, tz);
    jitterUV(leat, rng);
    buckets.stone.push(leat.translate(wheelX + tx * side * 1.1, wheelGround + 0.35, wheelZ + tz * side * 1.1));
  }
  // the house blocks like a building: its footprint is a convex prism in both collision sinks
  const hx = tx * width / 2, hz = tz * width / 2, dx = nx * depth / 2, dz = nz * depth / 2;
  const footprint = convexHull2([
    [mx + hx + dx, mz + hz + dz], [mx - hx + dx, mz - hz + dz], [mx - hx - dx, mz - hz - dz], [mx + hx - dx, mz + hz - dz],
  ]);
  const record = setConvexShape({ min: [0, ground - 0.2, 0], max: [0, ground + wallHeight + 2.6, 0], kind: 'mill-house' }, footprint);
  ctx.obstacles?.push(record);
  ctx.colliders?.push(cloneCollisionRecord(record));
}

function dressAmberfordRiver(ctx: FocusedDressingContext): void {
  const { L, heightField, rng, buckets } = ctx;
  const links = (L.marshes || []).filter((marsh) => marsh.r <= 40);
  if (links.length < 3) return;
  addRiverBankReeds(links, heightField, rng, buckets);
  // round 61: the bridge stands on the deck plane terrain.ts resolved for the station authored crossing: 'bridge';
  // a river without one keeps the round-1 ruin
  const decks = heightField.bridgeDecks ?? [];
  for (const deck of decks) addArchedStoneBridge(deck, heightField, rng, buckets, ctx);
  if (!decks.length) addRuinedRiverBridge(links, heightField, rng, buckets);
  // ford posts on every lane that wades the river; a lane a deck carries crosses dry-shod
  addRiverFordMarkers(L.roads.filter((_road, index) => !decks.some((deck) => deck.route === index)),
    links, heightField, rng, buckets);
  addWeirAndMill(links, decks[0] ?? null, heightField, rng, buckets, ctx);
}

function dressLakeRiverLandings(
  { L, heightField, rng, buckets, groundingReceipts, shore }: FocusedDressingContext,
  anchors: readonly RiverLandingAnchor[],
): void {
  // Authored landing budget is independent of channel interpolation density.
  // Existing river/coast vocabulary stays in the same wood/straw buckets.
  for (const anchor of anchors.slice(0, 4)) {
    const landing = planRiverLanding(heightField, L.lakes ?? [], anchor);
    if (!landing) continue;
    beachedBoat(buckets, rng, heightField, landing.boatX, landing.boatZ,
      landing.boatYaw, false, groundingReceipts);
    jetty(buckets, rng, landing.x, landing.z, landing.angle,
      landing.deckY - 0.82, landing.length, heightField, groundingReceipts);
    // Round 58: on a sea strand the pier takes the gangway, moored boat and bollards of the derived landing
    if (landing.shore) dressShoreLanding(buckets, heightField, landing.shore, groundingReceipts);
    if (anchor.shoreReeds !== false) addRiverBankReeds([L.lakes![anchor.lakeIndex]], heightField, rng, buckets);
    shore?.keepOut.push({ x: landing.boatX, z: landing.boatZ, r: 4.2 });
    if (landing.shore) registerShoreLanding(shore, landing.shore);
    else {
      shore?.jetties.push({ x0: landing.x, z0: landing.z, x1: landing.x + Math.cos(landing.angle) * landing.length,
        z1: landing.z + Math.sin(landing.angle) * landing.length, r: 2.6 });
      shore?.landings.push({ x: landing.x, z: landing.z, angle: anchor.shoreAngleDeg * Math.PI / 180 });
    }
  }
}

// =============================================================================
// maps r1 — RAIL YARD dressing (track fans, buffers, coal heaps, cable drums)
// round 57 (2026-09-24) — the same track laid along an authored path (../railSpurs.ts): a map's `terrain.railSpurs`
// reach this kit through the layout, Tarkhan Steppe's grain-station siding first. One span layer serves both: the
// yards keep their historical lay ('along' — byte-identical spans on their graded ground), authored spurs conform
// to a plain ('full' — cross-slope roll, every part placed in the span's own frame).
// =============================================================================

/**
 * Build-time footprint check against the same liquid mask used by water/wakes: the whole ballast width under the
 * straight span a→b (seven stations across), its slab overhang included (a 0.20 m margin past each end, which
 * encloses the overhang even after the terrain-following tilt), at the quarter points as well as the ends so a wet
 * cove between two dry endpoints is caught. For a span laid along +z the stations are the rail yards' original
 * sample points, number for number.
 */
export function railSpanIsDry(
  heightField: DressingHeightField, ax: number, az: number, bx: number, bz: number, halfWidth = 1.5,
): boolean {
  const waterAt = heightField.getWaterMaskAt;
  if (!waterAt) return true;
  const dx = bx - ax, dz = bz - az, run = railRunLength(dx, dz);
  if (!(run > 0)) return true;
  const ux = dx / run, uz = dz / run;   // along the span
  const nx = uz, nz = -ux;              // across it (screen-right of the heading)
  const step = halfWidth / 3;
  for (let longitudinal = 0; longitudinal <= 4; longitudinal++) {
    const t = (run + 0.40) * longitudinal / 4;
    const px = (ax + ux * -0.20) + ux * t, pz = (az + uz * -0.20) + uz * t;
    for (let lateral = -3; lateral <= 3; lateral++) {
      if (waterAt(px + nx * (lateral * step), pz + nz * (lateral * step)) > 0.01) return false;
    }
  }
  return true;
}

/** The rail yards' fixed line (x, za..zb): the span check along +z, the receipts' contract since Skybridge's washout. */
export function railSegmentIsDry(
  heightField: DressingHeightField, x: number, za: number, zb: number,
): boolean {
  return railSpanIsDry(heightField, x, za, x, zb);
}

interface RailLay {
  gauge: number;
  ballast: number;
  /**
   * 'along': the graded yards' historical lay — a span pitches with the ground between its ends, sleepers stay
   * level at their interpolated heights and the rail / slab offsets are world-vertical (Cinder Junction, Foundry,
   * Caldera and Skybridge byte-identical). 'full': the span also rolls with the cross-slope and every part is
   * placed in the span's own frame, so across a plain the sleepers sit on the slab and the rails on the sleepers.
   */
  conform: 'along' | 'full';
  /** Skip spans over the liquid mask (advancing their seeded draws, so the rest of the dressing is unchanged). */
  washout: boolean;
}

/** The 'full' lay's ground samples in the slab's own frame (along, across), each ±1 = the footprint's half-extent. */
const RAIL_FOOTPRINT_SAMPLES: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, 0],
];
/** How far below the fitted plane a 'full' span seats: a fold's residual becomes bedded ballast, not a gap. */
const RAIL_SEAT_SINK_M = 0.05;
/** Slab overhang past the span ends (the joints of consecutive tilted slabs stay closed). */
const RAIL_SLAB_OVERHANG_M = 0.35;
/**
 * The 'full' lay's ballast is a deep slab (the yards' is 0.16 m): its top stays at the yards' +0.15 m, so rails
 * and sleepers sit where they always did, while its sides run 0.26 m below the fitted plane — deeper than the
 * ground falls away under any corner of Tarkhan's siding (0.13 m at worst, p99 0.12), so no corner shows a gap.
 */
const RAIL_SLAB_DEPTH_FULL_M = 0.36;

// One straight span of track: ballast bed + twin rails + sleepers, tilted to the ground between its ends.
// Soft dressing by contract — hulls roll over the 0.2 m bed like a curb.
function layRailSpan(
  buckets: DressingBuckets,
  rng: Rng,
  heightField: DressingHeightField,
  ax: number, az: number, bx: number, bz: number,
  lay: RailLay,
): void {
  const dx = bx - ax, dz = bz - az, run = railRunLength(dx, dz);
  const ya = heightField.getHeightAt(ax, az), yb = heightField.getHeightAt(bx, bz);
  const xm = (ax + bx) / 2, zm = (az + bz) / 2;
  const yaw = Math.atan2(dx, dz);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let ym = (ya + yb) / 2, rise = yb - ya, roll = 0;
  if (lay.conform === 'full') {
    // The slab is the least-squares plane through seven ground samples of its footprint — the four corners, the
    // two end centres and the midpoint. The design is symmetric about the midpoint, so the fit decouples into the
    // mean and the two slopes; seated RAIL_SEAT_SINK_M low, so a fold's residual reads as ballast bedded into the
    // ground rather than a gap under a corner (Tarkhan's loading face: corners within 0.11 m of the ground, p99).
    const hl = (run + RAIL_SLAB_OVERHANG_M) / 2, hw = lay.ballast / 2;   // the slab's real footprint
    let sum = 0, along = 0, across = 0;
    for (const [u, v] of RAIL_FOOTPRINT_SAMPLES) {
      const h = heightField.getHeightAt(xm + s * u * hl + c * v * hw, zm + c * u * hl - s * v * hw);
      sum += h; along += u * h; across += v * h;
    }
    ym = sum / RAIL_FOOTPRINT_SAMPLES.length - RAIL_SEAT_SINK_M;
    rise = along / (6 * hl) * run;                 // Σu² = 6 over the seven samples; the slope times the run
    roll = Math.atan2(across / 4, hw);             // Σv² = 4
  }
  const len = Math.hypot(run, rise);
  const tilt = Math.atan2(rise, run);
  const nS = Math.round(len / 1.4);
  if (lay.washout && !railSpanIsDry(heightField, ax, az, bx, bz, lay.ballast / 2)) {
    // A drowned siding ends at the bank; the liquid surface is not ground
    // that can support a paper-thin ballast slab. Advance the original 24
    // BoxGeometry vertex-color draws plus one jitter draw per sleeper so
    // surviving dry rails and all later yard dressing remain identical.
    for (let draw = 0; draw < 24 + nS; draw++) rng();
    return;
  }
  // A part authored in the span's frame (x across, y up, z along): rolled about the track, pitched to the grade,
  // turned to the heading, seated at the span's midpoint. The 'along' lay applies the offsets after the pitch, in
  // world axes — the yards' original arithmetic.
  const place = (part: THREE.BufferGeometry, lx: number, ly: number, lz: number): void => {
    if (lay.conform === 'full') {
      part.translate(lx, ly, lz);
      if (roll !== 0) part.rotateZ(roll);
      part.rotateX(-tilt);
      if (yaw !== 0) part.rotateY(yaw);
      part.translate(xm, ym, zm);
    } else {
      part.rotateX(-tilt);
      if (yaw !== 0) part.rotateY(yaw);
      part.translate(xm + lx * c + lz * s, ym + ly, zm - lx * s + lz * c);
    }
  };
  // ballast slab — grey crushed-stone vertex paint on the matte 'baked'
  // bucket (the 'stone' bucket is BRICK on railyard and read as brick beds)
  const deep = lay.conform === 'full';
  const bal = box(lay.ballast, deep ? RAIL_SLAB_DEPTH_FULL_M : 0.16, len + RAIL_SLAB_OVERHANG_M, 0.55);
  {
    const n = bal.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = 0.040 + rng() * 0.018;
      col[i * 3] = v; col[i * 3 + 1] = v * 0.98; col[i * 3 + 2] = v * 0.94;
    }
    bal.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  place(bal, 0, deep ? 0.15 - RAIL_SLAB_DEPTH_FULL_M / 2 : 0.07, 0);
  (buckets.baked || buckets.stone).push(bal);
  // twin rails
  const half = lay.gauge / 2;
  for (const side of [-half, half]) {
    const rail = box(0.09, 0.17, len + 0.06, 2.0);
    place(rail, side, 0.24, 0);
    buckets.dark.push(rail);
  }
  // sleepers every ~1.4 m
  for (let sI = 0; sI < nS; sI++) {
    const t = (sI + 0.5) / nS;
    const sl = box(lay.gauge + 0.66, 0.09, 0.28, 1.4);
    const jitter = (rng() - 0.5) * 0.05;
    if (lay.conform === 'full') {
      place(sl, jitter, 0.17, (t - 0.5) * len);
    } else {
      const sx = ax + dx * t, sz = az + dz * t, sy = ya + (yb - ya) * t;
      if (yaw !== 0) sl.rotateY(yaw);
      sl.translate(sx + jitter * c, sy + 0.17, sz - jitter * s);
    }
    buckets.wood.push(sl);
  }
}

// One rail line of a yard: the fixed-x spans the yards always laid (a two-point path through the span layer).
function railLine(
  buckets: DressingBuckets,
  rng: Rng,
  heightField: DressingHeightField,
  x: number,
  z0: number,
  z1: number,
  washoutLiquid = false,
): void {
  const lay: RailLay = { gauge: RAIL_SPUR_GAUGE_M, ballast: RAIL_SPUR_BALLAST_M, conform: 'along', washout: washoutLiquid };
  for (const span of resampleRailPath([[x, z0], [x, z1]])) {
    layRailSpan(buckets, rng, heightField, span.ax, span.az, span.bx, span.bz, lay);
  }
}

// timber-and-steel buffer stop closing a stub track: the beam faces the track (local -z), the struts brace it
// from behind. `yaw` turns it to the track's heading; the yards' stops keep their historical yaw 0 at both ends.
function bufferStop(
  buckets: DressingBuckets,
  rng: Rng,
  heightField: DressingHeightField,
  x: number,
  z: number,
  yaw = 0,
  gauge = RAIL_SPUR_GAUGE_M,
): void {
  const y = heightField.getHeightAt(x, z);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const side of [-gauge / 2, gauge / 2]) {
    const strut = box(0.18, 1.5, 0.18, 1.4);
    strut.rotateX(-0.5);
    if (yaw !== 0) strut.rotateY(yaw);
    strut.translate(x + side * c + 0.3 * s, y + 0.75, z - side * s + 0.3 * c);
    buckets.dark.push(strut);
  }
  const beam = box(2.2, 0.45, 0.28, 1.0);
  if (yaw !== 0) beam.rotateY(yaw);
  beam.translate(x + -0.05 * s, y + 1.05, z + -0.05 * c);
  buckets.wood.push(jitterUV(beam, rng));
}

// An authored spur: its path in spans of at most RAIL_SPUR_LAY_M (5 m — half the yards' span, so a slab across an
// open plain's folds neither floats nor buries) that conform to the ground, a buffer stop 0.8 m past the closed
// end(s) turned to the end span's heading. Every part is soft dressing; the height field's noVeg berth
// (terrain.ts, railSpurs.ts) keeps vegetation and scattered props off the line before this runs.
function dressRailSpurs(ctx: FocusedDressingContext, spurs: readonly RailSpurConfig[]): void {
  const { heightField, rng, buckets } = ctx;
  for (const spur of spurs) {
    const lay: RailLay = {
      gauge: spur.gauge ?? RAIL_SPUR_GAUGE_M, ballast: spur.ballast ?? RAIL_SPUR_BALLAST_M,
      conform: 'full', washout: true,
    };
    const spans = resampleRailPath(spur.path, RAIL_SPUR_LAY_M, true);
    for (const span of spans) layRailSpan(buckets, rng, heightField, span.ax, span.az, span.bx, span.bz, lay);
    if (!spur.bufferStop || spans.length === 0) continue;
    const closeEnd = (from: { ax: number; az: number }, to: { bx: number; bz: number }): void => {
      const dx = to.bx - from.ax, dz = to.bz - from.az, run = railRunLength(dx, dz);
      const ux = dx / run, uz = dz / run;
      bufferStop(buckets, rng, heightField, to.bx + ux * 0.8, to.bz + uz * 0.8, Math.atan2(ux, uz), lay.gauge);
    };
    const last = spans[spans.length - 1], first = spans[0];
    if (spur.bufferStop !== 'start') closeEnd(last, last);
    if (spur.bufferStop !== 'end') closeEnd({ ax: first.bx, az: first.bz }, { bx: first.ax, bz: first.az });
  }
}

const RAIL_YARD_LINES = [
  { x: 40, z0: -235, z1: 235 },
  { x: 49, z0: -235, z1: 235 },
  { x: 58, z0: -205, z1: 210 },
  { x: 67, z0: -175, z1: 185 },
  { x: 76, z0: -150, z1: 160 },
  { x: -66, z0: -235, z1: 235 },
  { x: -57, z0: -190, z1: 200 },
] as const;

function addRailYardLines(
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
  washoutLiquid: boolean,
): void {
  for (const line of RAIL_YARD_LINES) {
    railLine(buckets, rng, heightField, line.x, line.z0, line.z1, washoutLiquid);
  }
  for (const line of RAIL_YARD_LINES) {
    if (line.z1 < 230) bufferStop(buckets, rng, heightField, line.x, line.z1 + 0.8);
    if (line.z0 > -230) bufferStop(buckets, rng, heightField, line.x, line.z0 - 0.8);
  }
}

type CoalVertex = readonly [number, number, number];

function coalSiteIsClear(
  field: DressingHeightField, x: number, z: number, radius: number,
  obstacles: readonly CollisionRecord[],
): boolean {
  let low = Infinity, high = -Infinity;
  for (let iz = -2; iz <= 2; iz++) for (let ix = -2; ix <= 2; ix++) {
    const px = x + ix * radius / 2, pz = z + iz * radius / 2;
    if (field._roadDist(px, pz) < 7 || field.getWaterMaskAt?.(px, pz) > 0.01) return false;
    const y = field.getHeightAt(px, pz);
    if (!Number.isFinite(y)) return false;
    low = Math.min(low, y); high = Math.max(high, y);
  }
  if (high - low > 0.4) return false;
  return !obstacles.some(record => record.min[0] < x + radius + 0.5
    && record.max[0] > x - radius - 0.5 && record.min[2] < z + radius + 0.5
    && record.max[2] > z - radius - 0.5);
}

function coalFacet(
  positions: number[], colors: number[], uvs: number[],
  a: CoalVertex, b: CoalVertex, c: CoalVertex, phase: number,
): void {
  // Three small irregular facets retain a granular highlight, not smooth
  // interpolated ellipsoid normals. No additional seeded draws are consumed.
  const middle: CoalVertex = [(a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3 + 0.015 * (1 + Math.sin(phase * 2.7)),
    (a[2] + b[2] + c[2]) / 3];
  const corners = [a, b, c];
  for (let edge = 0; edge < 3; edge++) {
    const shade = 0.032 + 0.012 * Math.sin(phase * 4.1 + edge * 1.7);
    for (const vertex of [corners[edge], corners[(edge + 1) % 3], middle]) {
      positions.push(...vertex);
      colors.push(shade * 0.94, shade, shade * 1.03);
      uvs.push(vertex[0] * 0.6, vertex[2] * 0.6);
    }
  }
}

function makeCoalStockpile(
  field: DressingHeightField, x: number, z: number,
  radius: number, length: number, phase: number,
): THREE.BufferGeometry {
  const base: CoalVertex[] = [], shoulder: CoalVertex[] = [];
  const height = 0.66 + (radius - 1.1) * 0.36;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * length;
    base.push([x + dx, field.getHeightAt(x + dx, z + dz) - 0.05, z + dz]);
    const sx = x + dx * 0.47 + radius * 0.08, sz = z + dz * 0.47;
    shoulder.push([sx, field.getHeightAt(sx, sz) + height * (0.54 + 0.06 * Math.sin(i * 2 + phase)), sz]);
  }
  const peak: CoalVertex = [x - radius * 0.1, field.getHeightAt(x - radius * 0.1, z) + height, z];
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    // Clockwise XZ winding faces upward in Three's Y-up world.
    coalFacet(positions, colors, uvs, base[i], shoulder[i], base[next], phase + i * 3);
    coalFacet(positions, colors, uvs, base[next], shoulder[i], shoulder[next], phase + i * 3 + 1);
    coalFacet(positions, colors, uvs, shoulder[i], peak, shoulder[next], phase + i * 3 + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'rail-coal-stockpile';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function registerCoalStockpile(geometry: THREE.BufferGeometry, ctx: FocusedDressingContext): void {
  const position = geometry.getAttribute('position'), points: Array<[number, number]> = [];
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < position.count; i++) {
    points.push([position.getX(i), position.getZ(i)]);
    low = Math.min(low, position.getY(i)); high = Math.max(high, position.getY(i));
  }
  // Same ordinary conservative vertical prism as authored rocks: exact
  // projected convex footprint/Y bounds, not a rectangular invisible wall.
  const record = setConvexShape({min: [0, low, 0], max: [0, high, 0], kind: 'coal-heap'}, convexHull2(points));
  ctx.obstacles?.push(record);
  ctx.colliders?.push(cloneCollisionRecord(record));
}

function addRailYardCoalHeaps(
  heightField: DressingHeightField, rng: Rng, buckets: DressingBuckets,
  ctx: FocusedDressingContext,
): void {
  for (let i = 0; i < 7; i++) {
    const oldX = 34 + rng() * 50, oldZ = -140 + rng() * 280;
    if (heightField._roadDist(oldX, oldZ) < 7) continue;
    // Preserve all original accepted/rejected RNG draws before new admission.
    const size = rng(), stretch = rng(), phase = rng() * Math.PI;
    const radius = 1.1 + size * 0.5, length = radius * (1.15 + stretch * 0.2);
    // An unloading strip east of the outer siding, not piles across tracks.
    const x = 84 + (oldX - 34) * 0.14, z = -52 + i * 7 + oldZ / 140;
    if (!buckets.baked || !coalSiteIsClear(heightField, x, z, length, ctx.obstacles ?? [])) continue;
    const heap = makeCoalStockpile(heightField, x, z, radius, length, phase);
    buckets.baked.push(heap);
    registerCoalStockpile(heap, ctx);
  }
}

function addCableDrum(
  x: number,
  y: number,
  z: number,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const radius = 0.7 + rng() * 0.4;
  const drum = new THREE.CylinderGeometry(radius, radius, radius * 1.1, 10, 1);
  scaleUV(drum, 3, 1);
  drum.rotateZ(Math.PI / 2);
  drum.rotateY(rng() * Math.PI);
  drum.translate(x, y + radius, z);
  buckets.wood.push(jitterUV(drum, rng));
}

function addSleeperStack(
  x: number,
  y: number,
  z: number,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  for (let layer = 0; layer < 3; layer++) {
    for (let side = -1; side <= 1; side += 2) {
      const sleeper = box(2.2, 0.14, 0.30, 1.2);
      if (layer % 2) sleeper.rotateY(Math.PI / 2);
      sleeper.translate(x + (layer % 2 ? side * 0.7 : 0), y + 0.1 + layer * 0.16,
        z + (layer % 2 ? 0 : side * 0.7));
      buckets.wood.push(jitterUV(sleeper, rng));
    }
  }
}

function addRailYardSupplies(
  village: DressingLayout['village'],
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  for (let i = 0; i < 9; i++) {
    const x = village.x0 + 8 + rng() * 30;
    const z = village.z0 + 12 + rng() * (village.z1 - village.z0 - 24);
    if (heightField._roadDist(x, z) < 7) continue;
    const y = heightField.getHeightAt(x, z);
    if (rng() < 0.5) addCableDrum(x, y, z, rng, buckets);
    else addSleeperStack(x, y, z, rng, buckets);
  }
}

function dressRailYard(
  ctx: FocusedDressingContext, washoutLiquid = false,
): void {
  const { L, heightField, rng, buckets } = ctx;
  addRailYardLines(heightField, rng, buckets, washoutLiquid);
  addRailYardCoalHeaps(heightField, rng, buckets, ctx);
  addRailYardSupplies(L.village, heightField, rng, buckets);
}
