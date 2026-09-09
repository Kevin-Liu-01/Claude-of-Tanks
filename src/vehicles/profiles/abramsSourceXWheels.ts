// Independent rotational stock from sparse SEP v2 wheel-ray measurements.
// No source mesh arrays or legacy wheel geometry are used here.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { gearFastener, runningGearRadialSegments, turnedGearStock } from '../runningGearPrimitives.ts';
import { stitchedGearAnnulus, stitchedGearStock } from '../stitchedGearStock.ts';

type RadialStation = readonly [radiusM: number, axleXM: number];
const GAP_HALF = .03035;
const OUTER_HALF = .215435;
const TIRE_RADIUS = .3166805;

function turnedStock(profile: readonly RadialStation[], side: number, segments: number, legacy = false): THREE.BufferGeometry {
  if (!legacy) return turnedGearStock(profile, segments, side);
  const shape = profile.map(([r, x]) => new THREE.Vector2(r, x));
  const geometry = new THREE.LatheGeometry(shape, segments).rotateZ(-Math.PI / 2);
  if (side < 0) geometry.rotateY(Math.PI);
  return geometry;
}

function tire(side: number, segments: number, radius = TIRE_RADIUS, legacy = false, idler = false): THREE.BufferGeometry {
  // Source rubber face begins at radius .25805. Its inner wall slopes to
  // the web at .28; the shoulder rounds inward at the outer tire crown.
  const profile: RadialStation[] = [
    [.25805, OUTER_HALF], [.29336, OUTER_HALF], [radius, OUTER_HALF - .014],
    [radius, GAP_HALF + .014], [.283, GAP_HALF], [.280, GAP_HALF],
    [.270, .08728], [.260, .15094], [.25805, OUTER_HALF],
  ];
  // Lathe contours are CCW in (radius, axle). The outside tire run goes
  // from high to low axle position, so reverse it before constructing the
  // closed annulus. FrontSide rays must see the outer crown, not its cavity.
  profile.reverse();
  // The source109 idler is an exposed end wheel at every track phase.
  // Forty sectors bound its arbitrary-angle crown sag below one millimetre;
  // the inward rubber sections keep their existing angular density.
  if(idler&&!legacy)return stitchedGearAnnulus(profile.slice(0,-1)
    .map(([r,x])=>[r,x,r===radius?40:segments] as const),side<0?-1:1);
  return turnedStock(profile, side, segments, legacy);
}

/** Source109 shares the paired pressed-rim construction but has a distinct
 * 122.1 mm local hub. Both halves remain on the one native idler axle; the
 * small inner source bracing is simplified to a functional narrow spindle. */
export function buildAbramsSourceXIdlerGeometry(high: boolean, legacy = false) {
  const segments = legacy ? (high ? 64 : 48) : runningGearRadialSegments(high);
  const body: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    body.push(tire(side, segments, .3167445, legacy, true), pressedWeb(side, segments, high, legacy));
    dark.push(KIT.xform(KIT.cylX(.06105, .02605, legacy ? 16 : high ? 12 : 8), side * .1420, 0, 0));
  }
  body.push(KIT.cylX(.07, GAP_HALF * 2 + .012, legacy ? 24 : high ? 12 : 8));
  return { body: KIT.mergeAll(body), dark: KIT.mergeAll(dark) };
}

function pressedWeb(side: number, segments: number, high: boolean, legacy: boolean): THREE.BufferGeometry {
  // Outward steel bowl is only X1.4566 at radius .10–.16, then rises to
  // X1.4798 at .20–.25. This ~160 mm recessed bowl is not a proud generic
  // full-width disc. Inner-face asymmetry is simplified to the same turned
  // construction on each half (source inner web differs by about 8 mm).
  const profile: RadialStation[] = [
    [0, GAP_HALF], [.278, GAP_HALF], [.278, .0682], [.270, .0682],
    [.255, .05689], [.198, .05683], [.166, .03365], [.096, .03365],
  ];
  // Distant stock retains the measured bowl and guide-channel stations.
  // Only the tiny central cap's concentric bevels lose intermediate rings.
  profile.push(...(high || legacy ? [
    [.080, .085], [.060, .1378], [.050, .1492], [.028, .142],
    [.022, .13774], [0, .13774], [0, GAP_HALF],
  ] as RadialStation[] : [[.060, .1492], [0, .13774], [0, GAP_HALF]] as RadialStation[]));
  // LOW combines the eight-millimetre lip's two adjacent radial sections.
  // The outer rim, bowl, guide gap and hub stations remain source-measured;
  // the complete resulting pressing is checked against the fixed 4.2mm bound.
  if(!high&&!legacy)return stitchedGearStock(profile.slice(0,-1).filter(([r,x])=>!(r===.270&&x===.0682)).map(([r,x])=>
    [r,x,r===.096?10:r===.060?8:segments] as const),undefined,side<0?-1:1);
  return turnedStock(profile, side, segments, legacy);
}

export function buildAbramsSourceXRoadWheelGeometry(high: boolean, legacy = false) {
  const segments = legacy ? (high ? 64 : 48) : runningGearRadialSegments(high);
  const tires: THREE.BufferGeometry[] = [], steel: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    tires.push(tire(side, segments, TIRE_RADIUS, legacy)); steel.push(pressedWeb(side, segments, high, legacy));
    for (let i = 0; i < (high || legacy ? 10 : 0); i++) {
      const angle = i * Math.PI / 5;
      steel.push(KIT.xform(legacy ? KIT.cylX(.008, .013, 6) : gearFastener(.008, .013, high), side * .040,
        Math.sin(angle) * .140, Math.cos(angle) * .140));
    }
  }
  // A narrow functional axle joins the paired webs. It cannot fill the
  // source-measured guide gap at r .20–.28. Small internal source hardware
  // around r .16–.18 remains simplified at this construction checkpoint.
  steel.push(KIT.cylX(.070, GAP_HALF * 2 + .012, legacy ? 24 : high ? 12 : 4));
  return { tire: KIT.mergeAll(tires), disc: KIT.mergeAll(steel), dark: null };
}

