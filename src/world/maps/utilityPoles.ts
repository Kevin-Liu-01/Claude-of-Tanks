// src/world/maps/utilityPoles.ts — the roadside utility line's geometry (props lane A, family #21, 2026-10-14: extracted
// from props.ts placeRoadsideUtilities unchanged — the sourced pole's prepared geometry, the procedural pole's parts and
// the wires' ribbon pool — so the family owns them; props.ts keeps the stations, the line's network, its crushables, the
// pole pool's material and the felled poles (Lane C's seat passes read them in flight), and calls these where the
// geometry always was built).
import * as THREE from 'three';
import { markPoleTimber, roundPoleShaft } from '../poleTimber.ts';
import { box, makeTelephonePoleDistanceGeometry, scaleUV } from '../propGeometry.ts';
import type { UtilityConductor, UtilityNetwork } from '../utilityNetwork.ts';
import { hexLin, mul, type Rgb } from './craftMesh.ts';
import { bar, finish, lathe, newMesh, place } from './clutterForms.ts';

/** props.ts bakedGeometry: a sourced model, baked and cached by its options. */
type BakedSource = (name: string, opts: { targetH: number; sink: number; sourceZMin: number; whiteCap: readonly [number, number, number] }) => THREE.BufferGeometry;

/**
 * The sourced pole (telephone_pole_polygoogle) for the line's pool: the cached bake cloned, its shaft made round and its
 * wood marked for the poles' timber material (poleTimber.ts).
 */
function sourcedPoleGeometry(bakedGeometry: BakedSource): THREE.BufferGeometry {
  // the scenery lane (after wave 57, Frosthollow's "beige column"): its wood is marked for the poles' timber material
  // (poleTimber.ts) on a clone — the baked source stays cached unmarked; wave 66 ("a straight, flat-faced,
  // constant-width beam"): its shaft round, smooth and tapered first
  return markPoleTimber(roundPoleShaft(bakedGeometry('telephone_pole_polygoogle',
    {
      targetH: 7.4, sink: 0.15, sourceZMin: -1,
      whiteCap: [0.14, 0.21, 0.16],
    }).clone()));
}

/** The procedural pole (no sourced models): its tapered shaft, two crossarms with their pegs and a brace, for the wood
 *  bucket, at the station's post and yaw. */
export function proceduralPoleParts(post: { x: number; y: number; z: number }, yaw: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.09, 0.17, 6.2, 7, 1);
  scaleUV(pole, 0.8, 3.0);
  pole.translate(post.x, post.y + 3.0, post.z);
  out.push(pole);
  for (const armY of [5.75, 5.15]) {
    const arm = box(1.5, 0.11, 0.09, 1.0);
    arm.rotateY(yaw);
    arm.translate(post.x, post.y + armY, post.z);
    out.push(arm);
    for (const side of [-1, 1]) {
      const peg = box(0.07, 0.16, 0.07, 2.0);
      peg.rotateY(yaw);
      peg.translate(post.x + Math.cos(yaw) * 0.6 * side,
        post.y + armY + 0.13, post.z - Math.sin(yaw) * 0.6 * side);
      out.push(peg);
    }
  }
  const brace = box(0.06, 1.1, 0.06, 1.5);
  brace.rotateZ(0.6);
  brace.rotateY(yaw);
  brace.translate(post.x + Math.cos(yaw) * 0.26,
    post.y + 4.8, post.z - Math.sin(yaw) * 0.26);
  out.push(brace);
  return out;
}

/** The line's wires: one instanced ribbon pool, a thin cylinder per catenary segment of each side's conductor. */
export interface UtilityWires {
  readonly mesh: THREE.InstancedMesh;
  /** Re-lay the given spans (a pole fell or stood up again), or every span. */
  rebuild(indices?: readonly number[] | null): void;
}
/** The wires of the line (null: no spans), added to `group`, every span laid. */
export function createUtilityWires(network: UtilityNetwork | null, material: THREE.Material, group: THREE.Group): UtilityWires | null {
  if (!network?.instanceCount) return null;
  const points = new Float64Array((network.segments + 1) * 3);
  const _wireA = new THREE.Vector3(), _wireB = new THREE.Vector3();
  const _wireMid = new THREE.Vector3(), _wireDir = new THREE.Vector3();
  const _wireUp = new THREE.Vector3(0, 1, 0), _wireScale = new THREE.Vector3();
  const _wireQuat = new THREE.Quaternion(), _wireMatrix = new THREE.Matrix4();
  const wireGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
  const wireIM = new THREE.InstancedMesh(wireGeo, material, network.instanceCount);
  wireIM.name = 'utility-wires';
  wireIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wireIM.castShadow = false;
  wireIM.receiveShadow = false;
  wireIM.frustumCulled = false;
  wireIM.matrixAutoUpdate = false;
  group.add(wireIM);
  function writeWireSpan(spanIndex: number): void {
    for (let side = 0; side < network!.conductors; side++) {
      network!.writeSpanPoints(spanIndex, side, points);
      for (let seg = 0; seg < network!.segments; seg++) {
        const a = seg * 3, b = a + 3;
        _wireA.set(points[a], points[a + 1], points[a + 2]);
        _wireB.set(points[b], points[b + 1], points[b + 2]);
        _wireDir.subVectors(_wireB, _wireA);
        const len = _wireDir.length();
        if (len < 1e-5) continue;
        _wireQuat.setFromUnitVectors(_wireUp, _wireDir.multiplyScalar(1 / len));
        _wireMid.addVectors(_wireA, _wireB).multiplyScalar(0.5);
        _wireScale.set(0.020, len * 1.02, 0.020);
        _wireMatrix.compose(_wireMid, _wireQuat, _wireScale);
        wireIM.setMatrixAt(network!.instanceIndex(spanIndex, side, seg), _wireMatrix);
      }
    }
  }
  const wires: UtilityWires = {
    mesh: wireIM,
    rebuild(indices = null) {
      if (indices) {
        for (const spanIndex of indices) writeWireSpan(spanIndex);
      } else {
        for (let i = 0; i < network.spans.length; i++) writeWireSpan(i);
      }
      wireIM.instanceMatrix.needsUpdate = true;
    },
  };
  wires.rebuild();
  return wires;
}

// ------------------------------------------------------------------------------------------------ the regional lines
// (props lane A, #21, 2026-10-14; WORKLIST.md #21: "Poles by region and year: multi-arm open-wire telegraph poles
// (1937-45 maps); Soviet concrete or timber poles with struts (verdant, steppe); German timber A-poles and concrete masts
// (urban, frontier, railyard); US timber poles with crossarms (titan_gorge, skybridge, longleaf); Japanese concrete poles
// with dense cables (caldera); steel poles (whiteout); concrete poles (badlands, oasis, desert). Wires: one conductor per
// insulator in use ... aerial bundled cable on modern European poles ... cable bundles on Japanese poles".
//
// A line's pole is built in the pole pool's own frame (its post at the origin, the ground at y = 0, its crossarm along
// local x: the side of the road the wires run either side of) to the sourced pole's height (7.4 m) and attachment (6.5 m),
// its timber in the sourced pole's own wood tones so markPoleTimber marks it for the timber material; concrete and steel
// keep their baked tones. Its conductors (utilityNetwork's) sit on its insulators, so a line's wires meet its pole.

/** The sourced pole's wood tones (poleTimber.ts POLE_WOOD_TONES): the timber the poles' material paints. */
const WOOD: Rgb = [0.41, 0.34, 0.21], WOOD_DARK: Rgb = [0.29, 0.23, 0.17];
const CONCRETE = hexLin(0xa8a49a), CONCRETE_JP = hexLin(0xb8b8b0), STEEL = hexLin(0x6a6e6c), GALV = hexLin(0x9aa2a2);
const GLASS: Rgb = [0.14, 0.21, 0.16], PORCELAIN = hexLin(0xd8d4c8), PORCELAIN_BROWN = hexLin(0x6a3a26), CABLE = hexLin(0x1c1c1c);
/** The height the network attaches the conductors over (props.ts: a sourced pole's attachH). */
const ATTACH = 6.5;

type LineKind = 'open-wire' | 'soviet-strut' | 'soviet-concrete' | 'german-timber' | 'german-concrete' | 'us-crossarm'
  | 'japan-concrete' | 'h-concrete' | 'eu-abc' | 'steel';
const LINE_OF_MAP: Readonly<Record<string, LineKind>> = Object.freeze({
  fjord: 'open-wire', autumn: 'open-wire', alpine: 'open-wire', foundry: 'open-wire', winter: 'open-wire', blackglass: 'open-wire',
  monsoon: 'open-wire', verdant: 'soviet-strut', steppe: 'soviet-concrete', railyard: 'german-timber', frontier: 'german-timber',
  urban: 'german-concrete', titan_gorge: 'us-crossarm', skybridge: 'us-crossarm', caldera: 'japan-concrete',
  desert: 'h-concrete', badlands: 'h-concrete', coastal: 'eu-abc', whiteout: 'steel',
});
/** The line's make on a map (null: the sourced pole as it always was). */
export function utilityLineFormOf(mapId: string | undefined): LineKind | null {
  return (mapId && LINE_OF_MAP[mapId]) || null;
}

type M = ReturnType<typeof newMesh>;
/** An insulator on its pin: the pin up from (x, y) on an arm, the glass or porcelain cap on it; returns the conductor
 *  seat (the cap's neck) as the network's offset. */
function insulator(m: M, x: number, y: number, cap: Rgb, pin: Rgb): UtilityConductor {
  bar(m, [x, y, 0], [x, y + 0.11, 0], 0.025, 0.025, [1, 0, 0], pin);
  const from = m.mark;
  lathe(m, [[0.04, 0], [0.055, 0.04], [0.035, 0.08], [0, 0.1]], 5, () => cap, { faceted: true });
  place(m, from, 0, x, y + 0.1, 0);
  return { across: x, up: y + 0.16 - ATTACH };
}
/** A tapered shaft from below the ground to its head (sides: 7 a timber pole, 4 a square concrete one, 9 round concrete). */
function shaft(m: M, r0: number, r1: number, top: number, sides: number, col: Rgb, phase = 0): void {
  lathe(m, [[r0, -0.6], [(r0 + r1) / 2 + 0.005, top * 0.5], [r1, top], [0, top + 0.03]], sides, () => col, { faceted: sides <= 5, phase });
}
/** A crossarm along x at y (its top), `half` each side. */
function arm(m: M, y: number, half: number, col: Rgb, depth = 0.09): void {
  bar(m, [-half, y - 0.05, 0], [half, y - 0.05, 0], 0.1, depth, [0, 1, 0], col);
}

interface LineBuild { full: THREE.BufferGeometry; conductors: UtilityConductor[] }
function buildLine(kind: LineKind): LineBuild {
  const m = newMesh(), c: UtilityConductor[] = [];
  switch (kind) {
    case 'open-wire': case 'soviet-strut': {
      // the timber pole; the open-wire telegraph's two arms of four glass insulators (the soviet line's one, its strut)
      shaft(m, 0.15, 0.1, 7.3, 7, WOOD);
      const arms = kind === 'open-wire' ? [ATTACH, ATTACH - 0.6] : [ATTACH];
      for (const [i, y] of arms.entries()) {
        arm(m, y, 0.85, WOOD);
        for (const x of [-0.7, -0.25, 0.25, 0.7]) {
          const k = insulator(m, x, y, GLASS, WOOD_DARK);
          if (i === 0 || Math.abs(x) > 0.5) c.push(k);
        }
        // its brace down to the pole
        bar(m, [0.45, y - 0.08, 0.03], [0.06, y - 0.6, 0.03], 0.05, 0.04, [0, 0, 1], WOOD_DARK);
      }
      if (kind === 'soviet-strut') {
        // the strut (podkos) leaning against the pole on the road's far side, its foot in the ground
        bar(m, [-1.25, -0.4, 0], [-0.1, 4.2, 0], 0.16, 0.16, [0, 0, 1], WOOD, 0.03);
        bar(m, [-0.16, 4.0, -0.09], [-0.16, 4.3, -0.09], 0.03, 0.03, [1, 0, 0], STEEL);
      }
      break;
    }
    case 'soviet-concrete': case 'h-concrete': {
      // a prestressed concrete pole (square, or the desert's H in its flanges' outline) and its steel crossarm, three
      // porcelain insulators: two on the arm, one on the pole's head
      const h = kind === 'h-concrete';
      shaft(m, h ? 0.17 : 0.14, h ? 0.11 : 0.09, 7.25, 4, CONCRETE, Math.PI / 4);
      if (h) for (const s of [-1, 1]) bar(m, [s * 0.11, 0.2, 0], [s * 0.08, 7.0, 0], 0.03, 0.2, [1, 0, 0], mul(CONCRETE, 0.9));
      arm(m, ATTACH, 0.85, STEEL, 0.07);
      for (const x of [-0.72, 0.72]) c.push(insulator(m, x, ATTACH, PORCELAIN, STEEL));
      bar(m, [0, 7.25, 0], [0, 7.42, 0], 0.03, 0.03, [1, 0, 0], STEEL);
      const top = insulator(m, 0.0, 7.42, PORCELAIN, STEEL);
      c.push({ across: 0.05, up: top.up });
      break;
    }
    case 'german-timber': case 'german-concrete': {
      // the Niederspannung line: its conductors one over another on steel brackets, alternate sides (a timber pole), or
      // a spun-concrete mast with its steel crossarm of four
      if (kind === 'german-timber') {
        shaft(m, 0.15, 0.1, 7.3, 7, WOOD);
        for (const [i, y] of [6.8, 6.5, 6.2, 5.9].entries()) {
          const s = i % 2 ? 1 : -1;
          bar(m, [0, y, 0], [s * 0.3, y, 0], 0.05, 0.03, [0, 1, 0], STEEL);
          c.push(insulator(m, s * 0.3, y + 0.02, PORCELAIN_BROWN, STEEL));
        }
      } else {
        shaft(m, 0.17, 0.11, 7.3, 9, CONCRETE);
        arm(m, ATTACH, 0.95, STEEL, 0.07);
        for (const x of [-0.8, -0.35, 0.35, 0.8]) c.push(insulator(m, x, ATTACH, PORCELAIN_BROWN, STEEL));
      }
      break;
    }
    case 'us-crossarm': {
      // the American West's timber pole: a long crossarm on its two braces, three pins on it and one on the pole's top
      shaft(m, 0.16, 0.11, 7.3, 7, WOOD);
      arm(m, ATTACH, 1.2, WOOD, 0.1);
      for (const s of [-1, 1]) bar(m, [s * 0.6, ATTACH - 0.1, 0.06], [0, ATTACH - 0.75, 0.06], 0.05, 0.03, [0, 0, 1], STEEL);
      for (const x of [-1.05, -0.45, 1.05]) c.push(insulator(m, x, ATTACH, GLASS, WOOD_DARK));
      bar(m, [0.12, 7.0, 0], [0.12, 7.3, 0], 0.04, 0.04, [1, 0, 0], WOOD_DARK);
      c.push(insulator(m, 0.12, 7.3, GLASS, WOOD_DARK));
      break;
    }
    case 'japan-concrete': {
      // the round concrete pole, its step bolts, the crossarm of three, and the communication cables' bracket below
      shaft(m, 0.17, 0.12, 7.3, 9, CONCRETE_JP);
      for (let k = 0; k < 6; k++) { const y = 2.2 + k * 0.45, s = k % 2 ? 1 : -1; bar(m, [0, y, s * 0.1], [0, y, s * 0.26], 0.02, 0.02, [1, 0, 0], STEEL); }
      arm(m, ATTACH, 0.9, STEEL, 0.07);
      for (const x of [-0.75, 0.38, 0.75]) c.push(insulator(m, x, ATTACH, PORCELAIN, STEEL));
      bar(m, [-0.35, ATTACH - 1.3, 0], [0.35, ATTACH - 1.3, 0], 0.06, 0.05, [0, 1, 0], STEEL);
      for (const x of [-0.28, 0.28]) {
        bar(m, [x, ATTACH - 1.38, -0.06], [x, ATTACH - 1.22, -0.06], 0.08, 0.06, [1, 0, 0], CABLE);
        c.push({ across: x, up: -1.18 });
      }
      break;
    }
    case 'eu-abc': {
      // the modern Léon line: one bundled cable on a suspension clamp off a hook, a timber pole
      shaft(m, 0.15, 0.1, 7.2, 7, WOOD);
      bar(m, [0, ATTACH - 0.2, 0], [0.24, ATTACH - 0.2, 0], 0.05, 0.04, [0, 1, 0], GALV);
      bar(m, [0.24, ATTACH - 0.32, -0.05], [0.24, ATTACH - 0.18, -0.05], 0.06, 0.1, [1, 0, 0], CABLE);
      c.push({ across: 0.24, up: -0.36 });
      break;
    }
    case 'steel': {
      // DYE-M's galvanised tubular pole and its steel crossarm of two
      shaft(m, 0.13, 0.09, 7.25, 8, GALV);
      arm(m, ATTACH, 0.75, STEEL, 0.07);
      for (const x of [-0.6, 0.6]) c.push(insulator(m, x, ATTACH, PORCELAIN, STEEL));
      break;
    }
  }
  return { full: finish(m), conductors: c };
}
/** The pole past the pool's split (no pins, no insulators): its shaft and its arms. */
function buildLineDistance(kind: LineKind): THREE.BufferGeometry {
  const m = newMesh();
  const timber = kind === 'open-wire' || kind === 'soviet-strut' || kind === 'german-timber' || kind === 'us-crossarm' || kind === 'eu-abc';
  const col = timber ? WOOD : kind === 'steel' ? GALV : kind === 'japan-concrete' ? CONCRETE_JP : CONCRETE;
  lathe(m, [[0.15, -0.6], [0.1, 7.3], [0, 7.33]], 5, () => col, { faceted: true });
  if (kind === 'open-wire') { arm(m, ATTACH, 0.85, WOOD); arm(m, ATTACH - 0.6, 0.85, WOOD); }
  else if (kind === 'soviet-strut') { arm(m, ATTACH, 0.85, WOOD); bar(m, [-1.25, -0.4, 0], [-0.1, 4.2, 0], 0.16, 0.16, [0, 0, 1], WOOD); }
  else if (kind === 'us-crossarm') arm(m, ATTACH, 1.2, WOOD, 0.1);
  else if (kind !== 'german-timber' && kind !== 'eu-abc') arm(m, ATTACH, kind === 'german-concrete' ? 0.95 : 0.85, STEEL, 0.07);
  return finish(m);
}
const LINES = new Map<LineKind, LineBuild>();
function lineOf(kind: LineKind): LineBuild {
  let line = LINES.get(kind);
  if (!line) LINES.set(kind, line = buildLine(kind));
  return line;
}

/** The pole pool's geometry on a map: its region's pole, marked for the timber (else the sourced pole). */
export function utilityPoleGeometry(mapId: string | undefined, bakedGeometry: BakedSource): THREE.BufferGeometry {
  const kind = utilityLineFormOf(mapId);
  return kind ? markPoleTimber(lineOf(kind).full.clone()) : sourcedPoleGeometry(bakedGeometry);
}
/** The pole pool's distance stand-in on a map (else the sourced pole's), unmarked (props.ts marks the pool's). */
export function utilityPoleDistanceGeometry(mapId: string | undefined): THREE.BufferGeometry {
  const kind = utilityLineFormOf(mapId);
  return kind ? buildLineDistance(kind) : makeTelephonePoleDistanceGeometry();
}
/** The line's conductors on a map, one per insulator in use (undefined: the network's two). */
export function utilityConductorsOf(mapId: string | undefined): UtilityConductor[] | undefined {
  const kind = utilityLineFormOf(mapId);
  return kind ? lineOf(kind).conductors : undefined;
}
