// src/world/maps/puenteNuevo.ts — Aegis Crossing's Puente Nuevo: the bridge row a map authors with `profile: 'puente'`
// (terrain.ts bridges; mapKits.ts addArchedStoneBridge hands such a deck here). Map revival lane 2, rounds 4-5
// (2026-10-06/07): one great arch over the Tajo's slot from the gorge floor, a chamber over its crown, an upper arch
// each side, buttress piers, string courses, voussoir rings and a monumental ashlar face; the deck, the parapets and
// the body's bands are its collision. Moved out of mapKits.ts by the maps lane (2026-10-14) under the token rule
// (extract-then-own): mapKits.ts keeps the call site only.
import * as THREE from 'three';
import { box, jitterUV, scaleUV, slabBox } from '../propGeometry.ts';
import { cloneCollisionRecord, setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from '../collision.ts';
import type { GeometryBuckets } from './exteriorDetailKit.ts';
import { landingStream } from './shoreJetty.ts';

/** The deck plane terrain.ts resolved for the bridge (mapKits.ts DressingBridgeDeck: the fields this elevation reads). */
type Rng = () => number;

export interface PuenteDeck {
  x: number; z: number; ux: number; uz: number; halfLength: number; halfWidth: number; deckY: number; bedY: number;
}
export interface PuenteHeightField { getHeightAt(x: number, z: number): number }
export interface PuenteContext { obstacles?: CollisionRecord[]; colliders?: CollisionRecord[] }

/**
 * The arched stone bridge's body and parapet (mapKits.ts BRIDGE_*, round 61): the Puente keeps the same deck, parapet
 * and body law as every arched bridge, so a crossing reads the same from the road. puenteNuevo.selftest holds these
 * equal to mapKits.ts's.
 */
export const PUENTE_SHARED_BRIDGE_M = Object.freeze({
  parapetHeight: 1.1, parapetThick: 0.5, slab: 0.5, bodyBelowBed: 0.6, bodyTopUnderDeck: 0.45, spandrelFill: 0.55,
});
const BRIDGE_PARAPET_HEIGHT_M = PUENTE_SHARED_BRIDGE_M.parapetHeight;
const BRIDGE_PARAPET_THICK_M = PUENTE_SHARED_BRIDGE_M.parapetThick;
const BRIDGE_SLAB_M = PUENTE_SHARED_BRIDGE_M.slab;
const BRIDGE_BODY_BELOW_BED_M = PUENTE_SHARED_BRIDGE_M.bodyBelowBed;
const BRIDGE_BODY_TOP_UNDER_DECK_M = PUENTE_SHARED_BRIDGE_M.bodyTopUnderDeck;
const BRIDGE_SPANDREL_FILL_M = PUENTE_SHARED_BRIDGE_M.spandrelFill;

/** Align a box's width axis (local +x) with the world direction (dx, dz); local +z then points to (-dz, dx). */
function alignWidth<T extends THREE.BufferGeometry>(geometry: T, dx: number, dz: number): T {
  geometry.rotateY(Math.atan2(-dz, dx));
  return geometry;
}

/** Round 4 (map revival lane 2): the Puente Nuevo's collision bands over its arch heads (its arches are metres across). */
const PUENTE_BAND_M = 0.5;
/**
 * Round 4b (map revival lane 2, 2026-10-07; mr2's round-4 frames: the Puente's face "one flat ashlar wall", the sandstone
 * print at the stone bucket's 0.7 per metre reading as brickwork across a 38 m wall): the face's architecture. Round 5
 * (gauntlet wave 242: "one small-brick texture tiled in an obvious repeat", "no ashlar size variation"): the print at 0.2
 * per metre on the wall, its piers, courses and rings, the masonry of a monumental work — courses ~0.5-0.9 m, blocks
 * ~0.9-2 m — at 0.45 on the parapets.
 */
const PUENTE_UV_PER_M = 0.2;
const PUENTE_PARAPET_UV_PER_M = 0.45;
/**
 * Round 4b: the buttress piers on both faces, mirrored about the arch — [station along the road, the three stages' widths
 * along the road, their projections from the face] (m). The great piers frame the arch's ring. Each stage rises to a
 * course and is set back there under a moulded cap: the gorge floor to the impost, to the chamber's course, to the cornice.
 * (Round 5: the slot is 68 m across at the deck, so the side bays' piers of the 200 m wall are gone with them.)
 */
const PUENTE_PIERS: ReadonlyArray<readonly [number, readonly number[], readonly number[]]> = [
  [20.3, [7.0, 6.2, 5.4], [3.5, 2.4, 1.4]],
];
/**
 * Round 5: the faces in vertical strips this wide (m), each with its own run of the print — slid along by a share of the
 * tile, so no two neighbours share their joints while every course runs level across them — and its own tone; split up
 * the face in rows this tall (m) for the weathering's gradients.
 */
const PUENTE_STRIP_M = 3.2;
const PUENTE_ROW_M = 4;
/** Round 5: the rain's streaks under every ledge — how far down they run (m) and how dark at most. */
const PUENTE_STREAK = { runM: 9, dark: 0.2 } as const;
/** Round 4b: the courses, [height, projection from the face] (m) — the arch's impost, the chamber's sill course, the cornice. */
const PUENTE_COURSE = { impost: [0.55, 0.35], chamber: [0.5, 0.3], cornice: [0.45, 0.55] } as const;
/** Round 4b: the voussoir rings — their depth from the intrados (m), how far they stand proud of the face, how deep they run. */
const PUENTE_RING_M = { main: 1.6, small: 0.7, proud: 0.25, depth: 0.4 } as const;
type PuenteTone = readonly [number, number, number];
/**
 * Round 4b: the tones over the regional print (a regional kit's per-vertex colour): the wall a warm golden calcarenite, the
 * piers a shade greyer, the dressed courses, caps and voussoirs paler; each darkening toward the gorge floor (the damp and
 * the river's staining), to PUENTE_FOOT_TONE of itself there, a linear ramp (exact on the body's long triangles).
 */
const PUENTE_TONE = {
  wall: [0.94, 0.87, 0.77], pier: [0.88, 0.83, 0.75], dressed: [1.03, 0.98, 0.9], ring: [1.05, 1.0, 0.91],
  deck: [0.92, 0.88, 0.82], parapet: [0.98, 0.94, 0.86],
} as const satisfies Record<string, PuenteTone>;
const PUENTE_FOOT_TONE = 0.74;
/** Round 4b: the key of the Puente's own stream (landingStream's span count; any constant). */
const PUENTE_STREAM_KEY = 7919;

/** Round 5: an extruded elevation's side walls alone (its lids dropped): the soffits and reveals of its openings, its top,
 * foot and ends — the faces are drawn apart (puenteFace). */
function extrudeSides(g: THREE.ExtrudeGeometry): THREE.BufferGeometry {
  const keep: number[] = [];
  for (const group of g.groups) {
    if (group.materialIndex !== 1) continue;
    for (let i = group.start; i < group.start + group.count; i++) keep.push(i);
  }
  const copy = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number): THREE.BufferAttribute => {
    const out = new Float32Array(keep.length * size);
    keep.forEach((i, k) => { for (let c = 0; c < size; c++) out[k * size + c] = attr.getComponent(i, c); });
    return new THREE.BufferAttribute(out, size);
  };
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', copy(g.getAttribute('position'), 3));
  sides.setAttribute('normal', copy(g.getAttribute('normal'), 3));
  sides.setAttribute('uv', copy(g.getAttribute('uv'), 2));
  return sides;
}

interface PuenteFaceOptions {
  /** +1 the face at +halfWidth (local +z), -1 the other. */
  side: number;
  halfWidth: number;
  bodyHalf: number;
  bottom: number;
  top: number;
  floor: number;
  deckY: number;
  openings: ReadonlyArray<{ x: number; r: number; sill: number | null; jamb: number }>;
  /** The heights the rain runs down from: the courses, the cornice and the arches' heads. */
  ledges: readonly number[];
  /** The ground under this face at a station along the road. */
  ground: (along: number) => number;
  tone: PuenteTone;
  coloured: boolean;
  rng: Rng;
}

/**
 * Round 5 (map revival lane 2, 2026-10-07; gauntlet wave 242 on the Puente: "one small-brick texture tiled in an obvious
 * repeat", "a checkerboard repeat with no ashlar size variation"): one face of the Puente's wall in the body's frame (x
 * along the road, y up, the face at z = side x halfWidth), as vertical strips PUENTE_STRIP_M across. The strips break at
 * every opening's sides and centre, so an arch's head runs whole across each strip it crosses (sampled every 0.6 m, inside
 * its voussoir ring); each strip stops 1.5 m under the lowest ground across it (the gorge's walls hold the rest). Every
 * strip slides the print along by its own share of a tile, so the joints never line up strip to strip while every course
 * runs level across them; the stone's tone moves in slow waves across the face; down it the damp darkens the foot
 * (PUENTE_FOOT_TONE) and the rain streaks the stone under every ledge, more on some strips than others.
 */
function puenteFace(o: PuenteFaceOptions): THREE.BufferGeometry {
  const edges = new Set<number>([-o.bodyHalf, o.bodyHalf]);
  for (const op of o.openings) for (const e of [op.x - op.r, op.x, op.x + op.r]) if (Math.abs(e) < o.bodyHalf) edges.add(e);
  const sorted = [...edges].sort((p, q) => p - q);
  const columns: Array<[number, number]> = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (b - a < 1e-3) continue;
    const n = Math.max(1, Math.ceil((b - a) / PUENTE_STRIP_M));
    for (let k = 0; k < n; k++) columns.push([a + (b - a) * k / n, a + (b - a) * (k + 1) / n]);
  }
  const pos: number[] = [], nrm: number[] = [], uvs: number[] = [], col: number[] = [];
  const span = Math.max(1, o.deckY - o.floor);
  const z = o.side * o.halfWidth;
  // the stone's own tone over the face: two slow waves of the face's own phases (10-90 m long), so its masses lighten and
  // darken across the strips instead of each strip taking a tone (that printed vertical bands), a warmer cast with one
  const ph = [o.rng() * 6.283, o.rng() * 6.283, o.rng() * 6.283];
  const toneAt = (a: number, y: number): number => 1 + 0.045 * Math.sin(a * 0.19 + y * 0.05 + ph[0]) * Math.sin(a * 0.07 - y * 0.11 + ph[1])
    + 0.025 * Math.sin(a * 0.41 + y * 0.23 + ph[2]);
  const warmAt = (a: number, y: number): number => 0.025 * Math.sin(a * 0.11 + y * 0.08 + ph[1] * 1.7);
  for (const [a0, a1] of columns) {
    const mid = (a0 + a1) / 2;
    const over = o.openings.filter((op) => Math.abs(mid - op.x) < op.r);
    const m = over.length ? Math.max(2, Math.ceil((a1 - a0) / 0.6)) : 1;
    let low = Infinity;
    for (let k = 0; k <= 8; k++) low = Math.min(low, o.ground(a0 + (a1 - a0) * k / 8));
    const foot = Math.max(o.bottom, low - 1.5);
    // every strip draws its stream whether or not it shows, so each keeps its own look when the ground moves
    const slide = o.rng() * 7.31, wash = o.rng() ** 2;
    if (foot >= o.top - 0.05) continue;
    const intervalsAt = (a: number): Array<[number, number]> => {
      let list: Array<[number, number]> = [[foot, o.top]];
      for (const op of over) {
        const dx = a - op.x, head = op.jamb + Math.sqrt(Math.max(0, op.r * op.r - dx * dx)), lo = op.sill ?? -Infinity;
        list = list.flatMap(([p, q]): Array<[number, number]> => (head <= p || lo >= q ? [[p, q]]
          : [[p, Math.max(p, lo)], [Math.min(q, head), q]])).filter(([p, q]) => q - p > 1e-3);
      }
      return list;
    };
    const vertex = (a: number, y: number): void => {
      pos.push(a, y, z);
      nrm.push(0, 0, o.side);
      uvs.push((o.side > 0 ? a : -a) * PUENTE_UV_PER_M + slide, y * PUENTE_UV_PER_M);
      if (!o.coloured) return;
      const damp = PUENTE_FOOT_TONE + (1 - PUENTE_FOOT_TONE) * Math.min(1, Math.max(0, (y - o.floor) / span));
      let streak = 0;
      for (const ledge of o.ledges) {
        const d = ledge - y;
        if (d > 0 && d < PUENTE_STREAK.runM) streak = Math.max(streak, 1 - d / PUENTE_STREAK.runM);
      }
      const k = toneAt(a, y) * damp * (1 - PUENTE_STREAK.dark * wash * streak), warm = warmAt(a, y);
      col.push(o.tone[0] * k * (1 + warm), o.tone[1] * k, o.tone[2] * k * (1 - warm));
    };
    for (let j = 0; j < m; j++) {
      const ua = a0 + (a1 - a0) * j / m, ub = a0 + (a1 - a0) * (j + 1) / m;
      const A = intervalsAt(ua), B = intervalsAt(ub);
      for (let k = 0; k < Math.min(A.length, B.length); k++) {
        const [ya0, ya1] = A[k], [yb0, yb1] = B[k];
        const rows = Math.max(1, Math.ceil(Math.max(ya1 - ya0, yb1 - yb0) / PUENTE_ROW_M));
        for (let r = 0; r < rows; r++) {
          const t0 = r / rows, t1 = (r + 1) / rows;
          const la = ya0 + (ya1 - ya0) * t0, lb = ya0 + (ya1 - ya0) * t1, ra = yb0 + (yb1 - yb0) * t0, rb = yb0 + (yb1 - yb0) * t1;
          // counter-clockwise seen from the face's own side
          const quad: Array<[number, number]> = o.side > 0 ? [[ua, la], [ub, ra], [ub, rb], [ua, lb]] : [[ua, la], [ua, lb], [ub, rb], [ub, ra]];
          for (const i of [0, 1, 2, 0, 2, 3]) vertex(quad[i][0], quad[i][1]);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (o.coloured) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * Map revival lane 2, round 4 (2026-10-06; gauntlet wave 160: "a low, even five-arch viaduct" where the Puente Nuevo of
 * Ronda is "one tall central arch over a deep slot"): a bridge row's `profile: 'puente'`. One wall of masonry across the
 * gorge from its floor to the deck; a single stilted arch deep in the slot (30 m across, its crown at seven tenths of the
 * depth, so the slot shows under it), the old prison chamber's small arch over that crown, and short arches high in the
 * wall near both lips; the deck slab, the parapets and the wing walls as the arched bridge's. The collision record follows
 * the openings: the body is cut into columns along the road at every opening's edge, and up each column the solid
 * stretches band by band (the arch heads' bands PUENTE_BAND_M) are merged wherever a run of bands is the same. The
 * dressing stream takes the arched bridge's draws exactly, so every later draw keeps its seat. Round 5 (2026-10-07;
 * gauntlet wave 242: "a squat dam-like wall", "nothing like a 98 m bridge over a narrow limestone slot"): the gorge is a
 * slot at the deck now (Aegis's waist: 68 m across, 54 m deep), so the wall stands as tall as it is wide — the one tall
 * arch, the chamber over its crown, one upper arch each side in the bay between the great pier and the gorge's wall — and
 * its faces are ashlar in strips (puenteFace) instead of the extrusion's two flat lids.
 */
export function addPuenteBridge(
  deck: PuenteDeck, heightField: PuenteHeightField, rng: Rng, buckets: GeometryBuckets, ctx: PuenteContext,
): void {
  const { x: cx, z: cz, ux, uz, halfLength, halfWidth, deckY, bedY } = deck;
  const vx = -uz, vz = ux;
  const width = halfWidth * 2;
  const bodyHalf = halfLength + 1.0;
  // the wall stands on the gorge's lowest ground under the deck (the rib it springs from is higher at the centre)
  let floor = bedY;
  for (let along = -halfLength; along <= halfLength; along += 2) {
    for (const across of [-halfWidth, 0, halfWidth]) {
      floor = Math.min(floor, heightField.getHeightAt(cx + ux * along + vx * across, cz + uz * along + vz * across));
    }
  }
  const bottom = floor - BRIDGE_BODY_BELOW_BED_M;
  const top = deckY - BRIDGE_BODY_TOP_UNDER_DECK_M;
  const crownLine = top - BRIDGE_SPANDREL_FILL_M;
  const depth = deckY - floor;
  // the openings along the road (x) and up the wall (y): [centre, half-chord, sill (null: open to the floor), jamb top]
  type Opening = { x: number; r: number; sill: number | null; jamb: number };
  const mainR = 15, mainCrown = floor + depth * 0.7;
  const openings: Opening[] = [{ x: 0, r: mainR, sill: null, jamb: mainCrown - mainR }];
  const chamberSill = mainCrown + 2.5;
  openings.push({ x: 0, r: 3.5, sill: chamberSill, jamb: chamberSill + 2 });
  const upperSill = deckY - 12;
  // (round 5) one upper arch each side, in the bay between the great pier and the gorge's wall at the arch's height: the
  // wall found along the deck where the ground under either face rises past the sill
  const faceGround = (a: number): number => Math.max(
    heightField.getHeightAt(cx + ux * a - uz * halfWidth, cz + uz * a + ux * halfWidth),
    heightField.getHeightAt(cx + ux * a + uz * halfWidth, cz + uz * a - ux * halfWidth));
  const pierOuter = PUENTE_PIERS[0][0] + PUENTE_PIERS[0][1][0] / 2;
  for (const side of [-1, 1]) {
    let rim = pierOuter;
    while (rim < bodyHalf && faceGround(side * rim) < upperSill - 1) rim += 0.5;
    const r = Math.min(4, (rim - pierOuter) / 2 - 0.9);
    if (r >= 1.5) openings.push({ x: side * (pierOuter + rim) / 2, r, sill: upperSill, jamb: upperSill + 2.5 });
  }
  const headTop = (o: Opening): number => o.jamb + o.r;
  // the elevation: the outline with the main arch cut from the floor, the others as holes
  const profile = new THREE.Shape();
  profile.moveTo(-bodyHalf, bottom);
  profile.lineTo(-bodyHalf, top);
  profile.lineTo(bodyHalf, top);
  profile.lineTo(bodyHalf, bottom);
  const main = openings[0];
  profile.lineTo(main.x + main.r, bottom);
  profile.lineTo(main.x + main.r, main.jamb);
  profile.absarc(main.x, main.jamb, main.r, 0, Math.PI, false);
  profile.lineTo(main.x - main.r, bottom);
  profile.lineTo(-bodyHalf, bottom);
  for (const o of openings.slice(1)) {
    const hole = new THREE.Path();
    hole.moveTo(o.x + o.r, o.sill!);
    hole.lineTo(o.x + o.r, o.jamb);
    hole.absarc(o.x, o.jamb, o.r, 0, Math.PI, false);
    hole.lineTo(o.x - o.r, o.sill!);
    hole.lineTo(o.x + o.r, o.sill!);
    profile.holes.push(hole);
  }
  // Round 4b: the masonry on the regional kit's weathered stone where the map has one — its per-vertex tone (PUENTE_TONE)
  // over the same print, so no mesh, draw or program is added — else on the stone bucket as before. A bucket's parts merge
  // only with the same attributes, so the regional bucket is taken only when each of its parts has exactly position,
  // normal, uv and colour.
  const regional = buckets.regionalStone;
  const tinted = !!regional?.length && regional.every((g) => {
    const names = Object.keys(g.attributes);
    return names.length === 4 && ['position', 'normal', 'uv', 'color'].every((name) => names.includes(name));
  });
  const sink = tinted && regional ? regional : buckets.stone;
  const put = (g: THREE.BufferGeometry, tone: PuenteTone, shade = 1): void => {
    if (tinted) {
      const position = g.getAttribute('position');
      const colour = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const t = Math.min(1, Math.max(0, (position.getY(i) - floor) / Math.max(1, deckY - floor)));
        const k = shade * (PUENTE_FOOT_TONE + (1 - PUENTE_FOOT_TONE) * t);
        colour[i * 3] = tone[0] * k; colour[i * 3 + 1] = tone[1] * k; colour[i * 3 + 2] = tone[2] * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    }
    sink.push(g);
  };
  let draws = 0;
  const jitter = <T extends THREE.BufferGeometry>(g: T): T => { draws++; return jitterUV(g, rng); };
  // (round 5) the body's sides only — the soffits and reveals of its openings, its top and ends; its two faces are the
  // strips below (puenteFaces), drawn after the Puente's own stream opens
  const extruded = new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false, curveSegments: 16 });
  const body = extrudeSides(extruded);
  extruded.dispose();
  body.translate(0, 0, -width / 2);
  scaleUV(body, PUENTE_UV_PER_M, PUENTE_UV_PER_M);
  jitter(body);
  alignWidth(body, ux, uz);
  put(body.translate(cx, 0, cz), PUENTE_TONE.wall);
  const slab = slabBox(bodyHalf * 2, BRIDGE_SLAB_M, width, 0.7);
  jitter(slab);
  put(alignWidth(slab, ux, uz).translate(cx, deckY - BRIDGE_SLAB_M / 2, cz), PUENTE_TONE.deck);
  const parapetHalf = bodyHalf + 0.2;
  const inset = halfWidth - BRIDGE_PARAPET_THICK_M / 2;
  for (const side of [-1, 1]) {
    const parapet = box(parapetHalf * 2, BRIDGE_PARAPET_HEIGHT_M, BRIDGE_PARAPET_THICK_M, PUENTE_PARAPET_UV_PER_M);
    jitter(parapet);
    put(alignWidth(parapet, ux, uz)
      .translate(cx + vx * inset * side, deckY + BRIDGE_PARAPET_HEIGHT_M / 2, cz + vz * inset * side), PUENTE_TONE.parapet);
    for (const end of [-1, 1]) {
      const post = box(0.8, BRIDGE_PARAPET_HEIGHT_M + 0.4, 0.8, PUENTE_PARAPET_UV_PER_M);
      jitter(post);
      put(alignWidth(post, ux, uz).translate(
        cx + ux * end * parapetHalf + vx * inset * side, deckY + (BRIDGE_PARAPET_HEIGHT_M + 0.4) / 2,
        cz + uz * end * parapetHalf + vz * inset * side), PUENTE_TONE.dressed);
    }
  }
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const wingX = cx + ux * end * (bodyHalf + 2.2) + vx * (halfWidth + 1.4) * side;
      const wingZ = cz + uz * end * (bodyHalf + 2.2) + vz * (halfWidth + 1.4) * side;
      const foot = heightField.getHeightAt(wingX, wingZ) - 0.5;
      const wingTop = deckY + 0.3;
      const wing = box(5.2, wingTop - foot, 0.9, PUENTE_UV_PER_M);
      wing.rotateY(-end * side * 0.6);
      jitter(wing);
      put(alignWidth(wing, ux, uz).translate(wingX, (foot + wingTop) / 2, wingZ), PUENTE_TONE.wall);
    }
  }
  // the arched bridge's draws on the dressing stream (its cutwaters, one pair a pier), so every later draw keeps its seat
  const wetSpan = Math.max(4, (halfLength - 3) * 2);
  const arches = Math.max(1, Math.round(wetSpan / (halfLength > 60 ? 32 : 11)));
  const arched = 1 + 1 + 2 * 3 + 2 * (arches - 1) + 4;
  for (let k = draws; k < arched; k++) for (let j = 0; j < 4; j++) rng();
  // Round 4b: the face's architecture, drawn from the Puente's own stream (landingStream keyed by the deck's centre), so
  // the dressing stream's draws stay the arched bridge's
  const yaw = Math.atan2(ux, uz);
  const own = landingStream({ x: cx, z: cz, spans: PUENTE_STREAM_KEY });
  const at = (a: number, c: number): [number, number] => [cx + ux * a + vx * c, cz + uz * a + vz * c];
  // a block against a face (side ±1): [a0, a1] along the road, [y0, y1] up, from `embed` inside the face to `out` past it
  // (round 5) the two faces in strips of ashlar, each strip its own run of the print and its own tone
  const ledges = [main.jamb, chamberSill, deckY - BRIDGE_SLAB_M, ...openings.map(headTop)];
  for (const side of [-1, 1]) {
    const face = puenteFace({ side, halfWidth, bodyHalf, bottom, top, floor, deckY, openings, ledges,
      ground: (a) => heightField.getHeightAt(cx + ux * a + vx * side * halfWidth, cz + uz * a + vz * side * halfWidth),
      tone: PUENTE_TONE.wall, coloured: tinted, rng: own });
    alignWidth(face, ux, uz);
    sink.push(face.translate(cx, 0, cz));
  }
  const faceBlock = (side: number, a0: number, a1: number, y0: number, y1: number, out: number, embed: number): THREE.BufferGeometry => {
    const g = slabBox(a1 - a0, y1 - y0, out + embed, PUENTE_UV_PER_M);
    jitterUV(g, own);
    alignWidth(g, ux, uz);
    const [x, z] = at((a0 + a1) / 2, side * (halfWidth + (out - embed) / 2));
    return g.translate(x, (y0 + y1) / 2, z);
  };
  // the voussoir rings: every arch's ring proud of both faces, its segments the body's (curveSegments 16), its soffit a
  // centimetre inside the opening's
  for (const o of openings) {
    const thick = o === main ? PUENTE_RING_M.main : PUENTE_RING_M.small;
    for (const side of [-1, 1]) {
      const rin = o.r - 0.01, rout = o.r + thick;
      const shape = new THREE.Shape();
      shape.moveTo(rout, 0);
      shape.absarc(0, 0, rout, 0, Math.PI, false);
      shape.lineTo(-rin, 0);
      shape.absarc(0, 0, rin, Math.PI, 0, true);
      shape.closePath();
      const ring = new THREE.ExtrudeGeometry(shape, { depth: PUENTE_RING_M.depth, bevelEnabled: false, curveSegments: 16 });
      ring.translate(o.x, o.jamb, side > 0 ? halfWidth + PUENTE_RING_M.proud - PUENTE_RING_M.depth : -halfWidth - PUENTE_RING_M.proud);
      scaleUV(ring, PUENTE_UV_PER_M, PUENTE_UV_PER_M);
      jitterUV(ring, own);
      alignWidth(ring, ux, uz);
      put(ring.translate(cx, 0, cz), PUENTE_TONE.ring);
    }
  }
  // the courses: the arch's impost, the chamber's sill course (the upper arches cut through it) and the cornice under the
  // slab; the lower two run out until the gorge's sides stand over them
  const courseEnd = (dir: number, from: number, yTop: number): number => {
    for (let a = from; Math.abs(a) < bodyHalf; a += dir * 0.5) {
      let ground = -Infinity;
      for (const c of [-halfWidth - 0.6, -halfWidth, halfWidth, halfWidth + 0.6]) {
        const [x, z] = at(a, c);
        ground = Math.max(ground, heightField.getHeightAt(x, z));
      }
      if (ground > yTop + 0.3) return Math.max(-bodyHalf, Math.min(bodyHalf, a + dir * 0.8));
    }
    return dir * bodyHalf;
  };
  const corniceTop = deckY - BRIDGE_SLAB_M, corniceBottom = corniceTop - PUENTE_COURSE.cornice[0];
  const courses: Array<{ top: number; course: readonly [number, number]; spans: Array<[number, number]> }> = [
    { top: main.jamb, course: PUENTE_COURSE.impost,
      spans: [[courseEnd(-1, main.x - main.r, main.jamb), main.x - main.r], [main.x + main.r, courseEnd(1, main.x + main.r, main.jamb)]] },
    { top: chamberSill, course: PUENTE_COURSE.chamber, spans: [[courseEnd(-1, 0, chamberSill), courseEnd(1, 0, chamberSill)]] },
    { top: corniceTop, course: PUENTE_COURSE.cornice, spans: [[-bodyHalf, bodyHalf]] },
  ];
  for (const { top: courseTop, course: [h, out], spans: authored } of courses) {
    // an opening standing across the course's height cuts it at its jambs
    let spans = authored;
    for (const o of openings) {
      if ((o.sill ?? -Infinity) >= courseTop || headTop(o) <= courseTop - h) continue;
      spans = spans.flatMap(([p, q]): Array<[number, number]> => (o.x + o.r <= p || o.x - o.r >= q ? [[p, q]]
        : [[p, Math.min(q, o.x - o.r)], [Math.max(p, o.x + o.r), q]])).filter(([p, q]) => q - p > 0.05);
    }
    for (const [a0, a1] of spans) for (const side of [-1, 1]) put(faceBlock(side, a0, a1, courseTop - h, courseTop, out, 0.12), PUENTE_TONE.dressed);
  }
  // the piers: three stages from the gorge floor, each set back at its course under a moulded cap; their record parts
  const stageTops = [main.jamb, chamberSill, corniceBottom];
  const pierParts: SimpleCollisionShape[] = [];
  let pierFoot = bottom;
  for (const [station, widths, outs] of PUENTE_PIERS) for (const along of [-station, station]) for (const side of [-1, 1]) {
    const shade = 0.96 + own() * 0.08;
    let ground = Infinity;
    for (let a = along - widths[0] / 2; a <= along + widths[0] / 2 + 1e-6; a += widths[0] / 4) {
      for (const c of [halfWidth, halfWidth + outs[0] / 2, halfWidth + outs[0]]) {
        const [x, z] = at(a, side * c);
        ground = Math.min(ground, heightField.getHeightAt(x, z));
      }
    }
    let y0 = ground - 0.8;
    pierFoot = Math.min(pierFoot, y0);
    for (let k = 0; k < 3; k++) {
      const y1 = stageTops[k], w = widths[k], out = outs[k];
      if (y1 - y0 < 0.5) { y0 = Math.max(y0, y1); continue; }
      put(faceBlock(side, along - w / 2, along + w / 2, y0, y1, out, 0.3), PUENTE_TONE.pier, shade);
      put(faceBlock(side, along - w / 2 - 0.15, along + w / 2 + 0.15, y1 - 0.35, y1, out + 0.15, 0.3), PUENTE_TONE.dressed);
      const [px, pz] = at(along, side * (halfWidth + out / 2));
      pierParts.push({ kind: 'obb', cx: px, cz: pz, hw: out / 2, hl: w / 2, yaw, y0, y1 });
      y0 = y1;
    }
  }
  // the parapets' coping, a dressed course proud of both their faces
  for (const side of [-1, 1]) {
    const coping = slabBox(parapetHalf * 2, 0.14, BRIDGE_PARAPET_THICK_M + 0.16, PUENTE_PARAPET_UV_PER_M);
    jitterUV(coping, own);
    put(alignWidth(coping, ux, uz).translate(cx + vx * inset * side, deckY + BRIDGE_PARAPET_HEIGHT_M + 0.07, cz + vz * inset * side),
      PUENTE_TONE.dressed);
  }
  // the record: the deck part from the crown line up, then the wall's columns, the piers and the parapets
  const parts: SimpleCollisionShape[] = [{ kind: 'obb', cx, cz, hw: halfWidth, hl: bodyHalf, yaw, y0: crownLine, y1: deckY }];
  const solid = (from: number, to: number, y0: number, y1: number): void => {
    if (to - from < 1e-3 || y1 - y0 < 1e-3) return;
    const at = (from + to) / 2;
    parts.push({ kind: 'obb', cx: cx + ux * at, cz: cz + uz * at, hw: halfWidth, hl: (to - from) / 2, yaw, y0, y1 });
  };
  // an opening's half-width at height y (0 outside it)
  const halfOpen = (o: Opening, y: number): number => {
    if (o.sill !== null && y < o.sill) return 0;
    if (y <= o.jamb) return o.r;
    const dy = y - o.jamb;
    return dy >= o.r ? 0 : Math.sqrt(o.r * o.r - dy * dy);
  };
  const edges = [...new Set([-bodyHalf, bodyHalf, ...openings.flatMap((o) => [o.x - o.r, o.x + o.r])])].sort((a, b) => a - b);
  // the heights a column changes at: every sill, jamb and head top, and the head bands between
  const cuts = new Set<number>([bottom, crownLine]);
  for (const o of openings) {
    if (o.sill !== null) cuts.add(o.sill);
    cuts.add(o.jamb);
    const n = Math.max(1, Math.ceil(o.r / PUENTE_BAND_M));
    for (let b = 1; b <= n; b++) cuts.add(Math.min(headTop(o), o.jamb + o.r * b / n));
  }
  const heights = [...cuts].filter((y) => y >= bottom && y <= crownLine).sort((a, b) => a - b);
  for (let e = 0; e + 1 < edges.length; e++) {
    const x0 = edges[e], x1 = edges[e + 1];
    // per band, the solid stretches of the column [x0, x1] at the band's middle height
    let run: { y0: number; spans: string; list: Array<[number, number]> } | null = null;
    const flush = (y1: number): void => { if (run) for (const [a, b] of run.list) solid(a, b, run.y0, y1); };
    for (let h = 0; h + 1 < heights.length; h++) {
      const y0 = heights[h], y1 = heights[h + 1], ym = (y0 + y1) / 2;
      let spans: Array<[number, number]> = [[x0, x1]];
      for (const o of openings) {
        const w = halfOpen(o, ym);
        if (w <= 0) continue;
        const a = o.x - w, b = o.x + w;
        spans = spans.flatMap(([p, q]): Array<[number, number]> => (b <= p || a >= q ? [[p, q]] : [[p, Math.min(q, a)], [Math.max(p, b), q]]))
          .filter(([p, q]) => q - p > 1e-3);
      }
      const key = spans.map(([p, q]) => `${p.toFixed(3)}:${q.toFixed(3)}`).join('|');
      if (run && run.spans === key) continue;
      flush(y0);
      run = { y0, spans: key, list: spans };
    }
    flush(heights[heights.length - 1]);
  }
  parts.push(...pierParts);
  for (const side of [-1, 1]) {
    parts.push({ kind: 'obb', cx: cx + vx * inset * side, cz: cz + vz * inset * side,
      hw: BRIDGE_PARAPET_THICK_M / 2, hl: parapetHalf, yaw, y0: deckY, y1: deckY + BRIDGE_PARAPET_HEIGHT_M });
  }
  for (let offset = 0; offset < parts.length; offset += 64) {
    const record = setCompoundShape({ min: [0, pierFoot, 0], max: [0, deckY + BRIDGE_PARAPET_HEIGHT_M, 0], kind: 'bridge' }, parts.slice(offset, offset + 64));
    ctx.obstacles?.push(record);
    ctx.colliders?.push(cloneCollisionRecord(record));
  }
}
