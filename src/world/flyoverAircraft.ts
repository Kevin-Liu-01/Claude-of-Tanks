// src/world/flyoverAircraft.ts — the map-vehicles lane's flyover aircraft (P6, 2026-10-06).
//
// The front's aircraft cross 250-420 m up, read as silhouettes against the sky (frontlineAtmosphere.ts draws them in one
// flat colour). A silhouette is its planform and its proportions, so each type here is built from its real dimensions:
// the fuselage turned through its stations, the wing's root and tip chords, sweep, dihedral and position (a gull's
// kink, a high or a low wing), the tailplane and the fin (or two), the engines (a radial's cowling, nacelles, rear
// pods), a Stuka's spatted legs. Each map flies its own: Il-2s and Ju 87s over Prokhorovka, Thunderbolts and Marauders
// over Lorraine, Hurricanes over Kohima, G3Ms over Shanghai, A-10s over the Fulda Gap, Su-25s over Hostomel.
//
// Local frame: +Z the nose, +Y up, centred on the fuselage; metres. Renderer-free (THREE only for the geometry).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A wing-like surface: root and tip chords, its leading edge's sweep (m back at the tip), its dihedral, where it sits. */
interface Surface {
  readonly span: number;
  readonly root: number;
  readonly tip: number;
  /** The leading edge at the tip lies this far behind the root's (m). */
  readonly sweep: number;
  /** Dihedral (rad); a gull wing droops its inner panel by `gull` and raises the outer. */
  readonly dihedral: number;
  readonly gull?: number;
  /** The root's leading edge (z) and height (y) on the fuselage. */
  readonly z: number;
  readonly y: number;
  readonly thick: number;
}

interface FlyoverSpec {
  readonly length: number;
  /** Fuselage radius stations from the nose (z = +length/2) to the tail: [fraction along, radius]. */
  readonly fuselage: readonly (readonly [number, number])[];
  readonly wing: Surface;
  readonly tailplane: Surface;
  /** The fin: height, root and tip chords, its root's leading edge (z); `twin` puts one at each tailplane tip. */
  readonly fin: { readonly h: number; readonly root: number; readonly tip: number; readonly z: number; readonly sweep: number; readonly twin?: boolean };
  /** Engine nacelles or pods: x, y, z of the front, length, radius. */
  readonly nacelles?: readonly (readonly [number, number, number, number, number])[];
  /** A radial engine's cowling at the nose (its radius). */
  readonly radial?: number;
  /** Fixed spatted legs (x of each, the leg's length). */
  readonly spats?: { readonly x: number; readonly drop: number };
}

const FLYOVERS = {
  // Ilyushin Il-2 Sturmovik: tapered wing with swept outer panels, the long armoured nose
  il2: { length: 11.6, fuselage: [[0, 0.25], [0.08, 0.62], [0.3, 0.7], [0.55, 0.6], [0.85, 0.32], [1, 0.16]],
    wing: { span: 14.6, root: 3.5, tip: 1.3, sweep: 1.1, dihedral: 0.06, z: 1.6, y: -0.35, thick: 0.4 },
    tailplane: { span: 5.6, root: 1.7, tip: 0.9, sweep: 0.4, dihedral: 0, z: -4.3, y: 0.05, thick: 0.15 },
    fin: { h: 1.8, root: 1.9, tip: 0.8, z: -4.0, sweep: 0.9 } },
  // Junkers Ju 87: the inverted gull wing and the spatted legs
  ju87: { length: 11.1, fuselage: [[0, 0.3], [0.08, 0.62], [0.3, 0.66], [0.6, 0.55], [0.9, 0.26], [1, 0.14]],
    wing: { span: 13.8, root: 3.0, tip: 1.4, sweep: 0.5, dihedral: 0.14, gull: 0.22, z: 1.4, y: -0.45, thick: 0.38 },
    tailplane: { span: 4.6, root: 1.6, tip: 0.9, sweep: 0.3, dihedral: 0, z: -4.2, y: 0.25, thick: 0.15 },
    fin: { h: 1.6, root: 1.7, tip: 0.9, z: -3.9, sweep: 0.6 }, spats: { x: 1.45, drop: 1.35 } },
  // Messerschmitt Bf 109: small, angular, square-tipped
  bf109: { length: 9.0, fuselage: [[0, 0.22], [0.08, 0.5], [0.3, 0.55], [0.6, 0.42], [0.9, 0.2], [1, 0.1]],
    wing: { span: 9.9, root: 2.2, tip: 1.1, sweep: 0.35, dihedral: 0.1, z: 1.4, y: -0.35, thick: 0.28 },
    tailplane: { span: 3.4, root: 1.1, tip: 0.6, sweep: 0.25, dihedral: 0, z: -3.4, y: 0.25, thick: 0.1 },
    fin: { h: 1.3, root: 1.3, tip: 0.7, z: -3.3, sweep: 0.5 } },
  // Republic P-47 Thunderbolt: the great radial, the elliptical wing, the deep fuselage
  p47: { length: 11.0, fuselage: [[0, 0.7], [0.12, 0.78], [0.35, 0.75], [0.65, 0.5], [0.9, 0.24], [1, 0.12]],
    wing: { span: 12.4, root: 2.9, tip: 1.2, sweep: 0.6, dihedral: 0.08, z: 1.2, y: -0.45, thick: 0.35 },
    tailplane: { span: 4.9, root: 1.5, tip: 0.8, sweep: 0.3, dihedral: 0, z: -4.2, y: 0.15, thick: 0.12 },
    fin: { h: 1.7, root: 1.8, tip: 0.8, z: -4.0, sweep: 0.8 }, radial: 0.82 },
  // Hawker Typhoon: the thick wing, the chin radiator
  typhoon: { length: 9.7, fuselage: [[0, 0.35], [0.05, 0.72], [0.3, 0.68], [0.6, 0.5], [0.9, 0.22], [1, 0.12]],
    wing: { span: 12.7, root: 2.9, tip: 1.3, sweep: 0.45, dihedral: 0.1, z: 1.3, y: -0.4, thick: 0.45 },
    tailplane: { span: 4.6, root: 1.5, tip: 0.8, sweep: 0.3, dihedral: 0, z: -3.8, y: 0.15, thick: 0.13 },
    fin: { h: 1.5, root: 1.6, tip: 0.8, z: -3.6, sweep: 0.7 } },
  // Hawker Hurricane: the humped spine, the broad wing
  hurricane: { length: 9.8, fuselage: [[0, 0.3], [0.08, 0.6], [0.3, 0.72], [0.6, 0.58], [0.9, 0.25], [1, 0.12]],
    wing: { span: 12.2, root: 2.8, tip: 1.3, sweep: 0.35, dihedral: 0.1, z: 1.3, y: -0.45, thick: 0.4 },
    tailplane: { span: 4.4, root: 1.5, tip: 0.8, sweep: 0.3, dihedral: 0, z: -3.9, y: 0.2, thick: 0.13 },
    fin: { h: 1.5, root: 1.7, tip: 0.8, z: -3.6, sweep: 0.8 } },
  // Curtiss P-40: the shark's chin radiator, the long nose
  p40: { length: 9.7, fuselage: [[0, 0.32], [0.08, 0.6], [0.3, 0.6], [0.6, 0.45], [0.9, 0.22], [1, 0.12]],
    wing: { span: 11.4, root: 2.6, tip: 1.2, sweep: 0.4, dihedral: 0.1, z: 0.9, y: -0.4, thick: 0.32 },
    tailplane: { span: 4.0, root: 1.4, tip: 0.8, sweep: 0.3, dihedral: 0, z: -3.8, y: 0.15, thick: 0.12 },
    fin: { h: 1.5, root: 1.6, tip: 0.8, z: -3.6, sweep: 0.7 } },
  // Martin B-26 Marauder: the cigar fuselage, two great nacelles, the tall fin
  b26: { length: 17.8, fuselage: [[0, 0.5], [0.08, 1.0], [0.3, 1.1], [0.65, 0.95], [0.9, 0.45], [1, 0.25]],
    wing: { span: 21.6, root: 4.0, tip: 1.8, sweep: 0.7, dihedral: 0.05, z: 3.0, y: 0.35, thick: 0.6 },
    tailplane: { span: 8.2, root: 2.2, tip: 1.1, sweep: 0.5, dihedral: 0.12, z: -6.8, y: 0.5, thick: 0.18 },
    fin: { h: 3.4, root: 3.0, tip: 1.3, z: -6.4, sweep: 1.4 },
    nacelles: [[3.6, -0.1, 3.4, 5.2, 0.75], [-3.6, -0.1, 3.4, 5.2, 0.75]] },
  // Heinkel He 111: the glazed round nose, the elliptical wing, two nacelles
  he111: { length: 16.4, fuselage: [[0, 0.6], [0.06, 1.0], [0.3, 1.05], [0.65, 0.85], [0.9, 0.4], [1, 0.2]],
    wing: { span: 22.6, root: 5.0, tip: 1.8, sweep: 1.2, dihedral: 0.07, z: 3.0, y: -0.3, thick: 0.6 },
    tailplane: { span: 8.0, root: 2.2, tip: 1.0, sweep: 0.4, dihedral: 0, z: -6.4, y: 0.3, thick: 0.18 },
    fin: { h: 2.7, root: 2.6, tip: 1.2, z: -6.0, sweep: 1.0 },
    nacelles: [[3.5, -0.3, 4.0, 4.8, 0.7], [-3.5, -0.3, 4.0, 4.8, 0.7]] },
  // Mitsubishi G3M: the slim fuselage, the long wing, two radials, the twin fins
  g3m: { length: 16.5, fuselage: [[0, 0.45], [0.08, 0.85], [0.35, 0.9], [0.7, 0.7], [0.92, 0.32], [1, 0.16]],
    wing: { span: 25.0, root: 5.0, tip: 1.6, sweep: 1.5, dihedral: 0.08, z: 3.0, y: -0.2, thick: 0.6 },
    tailplane: { span: 7.4, root: 2.0, tip: 1.2, sweep: 0.3, dihedral: 0, z: -6.6, y: 0.3, thick: 0.16 },
    fin: { h: 2.0, root: 1.8, tip: 1.1, z: -6.5, sweep: 0.6, twin: true },
    nacelles: [[3.8, -0.1, 4.3, 3.6, 0.72], [-3.8, -0.1, 4.3, 3.6, 0.72]] },
  // Fairchild A-10: the straight wing, the engines in pods astern, the twin fins on the tailplane's tips
  a10: { length: 16.3, fuselage: [[0, 0.2], [0.06, 0.75], [0.3, 0.95], [0.6, 0.8], [0.85, 0.45], [1, 0.3]],
    wing: { span: 17.5, root: 3.1, tip: 1.9, sweep: 0.25, dihedral: 0.05, z: 1.2, y: -0.5, thick: 0.5 },
    tailplane: { span: 5.7, root: 2.0, tip: 2.0, sweep: 0, dihedral: 0, z: -6.4, y: 0.2, thick: 0.18 },
    fin: { h: 2.9, root: 2.2, tip: 1.6, z: -6.0, sweep: 0.4, twin: true },
    nacelles: [[1.25, 1.1, -2.6, 3.4, 0.62], [-1.25, 1.1, -2.6, 3.4, 0.62]] },
  // Sukhoi Su-25: the shoulder wing, the engines in long nacelles beside the fuselage
  su25: { length: 15.5, fuselage: [[0, 0.15], [0.08, 0.6], [0.3, 0.8], [0.65, 0.7], [0.9, 0.4], [1, 0.22]],
    wing: { span: 14.4, root: 3.6, tip: 1.4, sweep: 1.4, dihedral: -0.04, z: 1.8, y: 0.3, thick: 0.4 },
    tailplane: { span: 4.6, root: 1.9, tip: 0.9, sweep: 0.8, dihedral: 0, z: -5.2, y: 0.6, thick: 0.15 },
    fin: { h: 2.3, root: 2.6, tip: 0.9, z: -4.6, sweep: 1.6 },
    nacelles: [[1.1, 0.0, 2.4, 6.5, 0.6], [-1.1, 0.0, 2.4, 6.5, 0.6]] },
  // General Dynamics F-16: the cropped delta, the ventral intake, one fin
  f16: { length: 15.0, fuselage: [[0, 0.1], [0.1, 0.55], [0.35, 0.8], [0.7, 0.75], [0.95, 0.55], [1, 0.45]],
    wing: { span: 9.96, root: 5.0, tip: 1.2, sweep: 3.6, dihedral: 0, z: 0.8, y: 0.0, thick: 0.28 },
    tailplane: { span: 5.6, root: 2.2, tip: 0.8, sweep: 1.4, dihedral: -0.1, z: -4.6, y: 0.0, thick: 0.12 },
    fin: { h: 2.4, root: 3.0, tip: 1.0, z: -3.6, sweep: 2.0 } },
  // Mikoyan-Gurevich MiG-21: the tailed delta, the nose intake
  mig21: { length: 14.5, fuselage: [[0, 0.45], [0.06, 0.55], [0.4, 0.62], [0.75, 0.6], [0.95, 0.5], [1, 0.45]],
    wing: { span: 7.15, root: 5.3, tip: 0.6, sweep: 4.7, dihedral: -0.03, z: 0.4, y: -0.1, thick: 0.25 },
    tailplane: { span: 3.7, root: 2.0, tip: 0.6, sweep: 1.4, dihedral: 0, z: -5.0, y: 0.0, thick: 0.1 },
    fin: { h: 2.5, root: 3.0, tip: 1.0, z: -4.2, sweep: 2.0 } },
  // Lockheed F-104 Starfighter: the tiny straight wing, the T-tail
  f104: { length: 16.7, fuselage: [[0, 0.1], [0.12, 0.55], [0.4, 0.7], [0.75, 0.65], [0.95, 0.55], [1, 0.5]],
    wing: { span: 6.7, root: 3.0, tip: 1.3, sweep: 0.9, dihedral: -0.17, z: -0.6, y: -0.15, thick: 0.15 },
    tailplane: { span: 4.0, root: 1.7, tip: 0.8, sweep: 0.8, dihedral: 0, z: -6.2, y: 3.1, thick: 0.1 },
    fin: { h: 3.0, root: 3.0, tip: 1.6, z: -5.2, sweep: 1.2 } },
  // McDonnell Douglas F-4 Phantom: the cranked wingtips, the anhedral tailplane, the long nose
  f4: { length: 19.2, fuselage: [[0, 0.15], [0.12, 0.6], [0.35, 1.0], [0.65, 1.05], [0.9, 0.7], [1, 0.5]],
    wing: { span: 11.7, root: 5.5, tip: 1.8, sweep: 3.9, dihedral: 0.06, z: 0.6, y: -0.2, thick: 0.35 },
    tailplane: { span: 5.4, root: 2.1, tip: 0.8, sweep: 1.3, dihedral: -0.4, z: -6.6, y: 0.4, thick: 0.12 },
    fin: { h: 2.6, root: 3.6, tip: 1.2, z: -5.0, sweep: 2.4 } },
  // Dassault Mirage III: the pure delta, no tailplane
  mirage3: { length: 15.0, fuselage: [[0, 0.1], [0.12, 0.55], [0.4, 0.7], [0.75, 0.7], [0.95, 0.6], [1, 0.5]],
    wing: { span: 8.22, root: 7.2, tip: 0.5, sweep: 6.6, dihedral: -0.02, z: 1.0, y: -0.1, thick: 0.3 },
    tailplane: { span: 0.6, root: 0.4, tip: 0.3, sweep: 0, dihedral: 0, z: -6.5, y: 0, thick: 0.05 },
    fin: { h: 2.4, root: 3.4, tip: 1.0, z: -4.3, sweep: 2.3 } },
} satisfies Record<string, FlyoverSpec>;

export type FlyoverType = keyof typeof FLYOVERS;

/** Each map's flyovers (its Reference: line's place and year); maps not named keep the generic twin. */
const MAP_FLYOVERS: Readonly<Record<string, readonly FlyoverType[]>> = {
  verdant: ['il2', 'ju87'], winter: ['il2', 'bf109'], steppe: ['mig21'],
  alpine: ['p47', 'typhoon'], foundry: ['p47', 'b26'], reservoir: ['p47', 'typhoon'], polders: ['typhoon', 'b26'], autumn: ['p47', 'b26'],
  monsoon: ['hurricane'], fjord: ['he111', 'ju87'], longleaf: ['p40'], blackglass: ['g3m'],
  railyard: ['f104'], frontier: ['a10'], urban: ['a10', 'f16'], coastal: ['mirage3'], cliffbridge: ['f4'], skybridge: ['f4'],
  titan_gorge: ['f4'], whiteout: ['f16'], ruinspires: ['a10', 'f16'], saltwind: ['f16'], airfield: ['su25'],
  desert: ['f16'], oasis: ['f16'], orchard: ['f16'], badlands: ['f16'], caldera: ['f16'], delta: ['mig21'], mangrove: ['mig21'],
  copper_mesa: ['mirage3'],
};

/** The types a map's front flies (empty: the generic silhouette). */
export function flyoversForMap(mapId: string): readonly FlyoverType[] {
  return MAP_FLYOVERS[mapId] ?? [];
}

// ---------------------------------------------------------------------------------------------------- building

/** A turned body along z: its radius at fractions of its length from the front (z = zFront) back. */
function turned(zFront: number, length: number, stations: readonly (readonly [number, number])[], x = 0, y = 0, segs = 10): THREE.BufferGeometry {
  const points = stations.map(([t, r]) => new THREE.Vector2(Math.max(0.001, r), -t * length));
  const g = new THREE.LatheGeometry(points, segs);
  // the lathe turns about y (its profile running down y from the front): lay it along z, the front forward
  g.rotateX(Math.PI / 2);
  g.translate(x, y, zFront);
  return g;
}

/** A surface's two halves (or one fin): a thin slab per panel between root and tip, its dihedral and gull kink. */
function surface(s: Surface, halves: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const panel = (x0: number, x1: number, y0: number, y1: number, le0: number, le1: number, c0: number, c1: number) => {
    // a quad slab: the leading and trailing edges at each end, thickness s.thick * chord, as a closed prism
    const g = new THREE.BufferGeometry();
    const t0 = s.thick * Math.min(1, c0 / s.root) * 0.5, t1 = s.thick * Math.min(1, c1 / s.root) * 0.5;
    const v = [
      [x0, y0 + t0, le0], [x0, y0 + t0, le0 - c0], [x1, y1 + t1, le1 - c1], [x1, y1 + t1, le1],
      [x0, y0 - t0, le0], [x0, y0 - t0, le0 - c0], [x1, y1 - t1, le1 - c1], [x1, y1 - t1, le1],
    ];
    const f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2], [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7]];
    const pos: number[] = [];
    for (const tri of f) for (const k of tri) pos.push(...v[k]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    out.push(g);
  };
  const half = s.span / 2;
  for (const side of halves ? [1, -1] : [1]) {
    if (s.gull) {
      const kink = half * 0.32, yk = s.y - Math.tan(s.gull) * kink;
      const tk = s.root + (s.tip - s.root) * (kink / half), lek = s.z - s.sweep * (kink / half);
      panel(0, side * kink, s.y, yk, s.z, lek, s.root, tk);
      panel(side * kink, side * half, yk, yk + Math.tan(s.dihedral) * (half - kink), lek, s.z - s.sweep, tk, s.tip);
    } else {
      panel(0, side * half, s.y, s.y + Math.tan(s.dihedral) * half, s.z, s.z - s.sweep, s.root, s.tip);
    }
  }
  return out;
}

/** One flyover's silhouette (positions and normals, nose ahead on +Z). */
export function buildFlyover(type: FlyoverType): THREE.BufferGeometry {
  const s: FlyoverSpec = FLYOVERS[type];
  const parts: THREE.BufferGeometry[] = [];
  const front = s.length / 2;
  parts.push(turned(front, s.length, s.fuselage, 0, 0, 12));
  parts.push(...surface(s.wing, true), ...surface(s.tailplane, true));
  // the fin(s): a vertical surface — the same slab stood up
  const finAt = (x: number) => {
    for (const g of surface({ span: s.fin.h * 2, root: s.fin.root, tip: s.fin.tip, sweep: s.fin.sweep, dihedral: 0, z: s.fin.z, y: 0, thick: 0.12 }, false)) {
      g.rotateZ(Math.PI / 2);
      g.translate(x, s.fin.twin ? s.tailplane.y : s.fuselage[s.fuselage.length - 2][1] * 0.6, 0);
      parts.push(g);
    }
  };
  if (s.fin.twin) { finAt(s.tailplane.span / 2); finAt(-s.tailplane.span / 2); } else finAt(0);
  for (const [x, y, z, len, r] of s.nacelles ?? []) parts.push(turned(z, len, [[0, r * 0.7], [0.15, r], [0.7, r * 0.9], [1, r * 0.3]], x, y, 10));
  if (s.radial) parts.push(turned(front + 0.2, 1.2, [[0, s.radial * 0.85], [0.15, s.radial], [1, s.radial * 0.9]], 0, 0, 14));
  if (s.spats) {
    for (const side of [1, -1]) {
      const legX = side * s.spats.x, top = s.wing.y - Math.tan(s.wing.gull ?? 0) * s.spats.x;
      const leg = new THREE.BoxGeometry(0.22, s.spats.drop, 0.5);
      leg.translate(legX, top - s.spats.drop / 2, s.wing.z - 0.6);
      parts.push(leg);
      parts.push(turned(s.wing.z - 0.1, 1.3, [[0, 0.12], [0.3, 0.32], [0.8, 0.25], [1, 0.05]], legX, top - s.spats.drop, 8));
    }
  }
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(n.attributes)) if (key !== 'position' && key !== 'normal') n.deleteAttribute(key);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    return n;
  });
  const merged = mergeGeometries(flat, false);
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  if (!merged) throw new Error(`buildFlyover: ${type} merge failed`);
  merged.computeBoundingSphere();
  return merged;
}
