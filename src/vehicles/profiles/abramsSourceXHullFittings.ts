// Source4 towing fittings, independently constructed from sparse measured
// bounds and front-facing sections. Small cast radii are approximated; the
// receiving stock and real eye apertures are separate physical surfaces.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT } from './kit.ts';
import { closedSectionLoft, roundMember } from './abramsSourceXGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Section = readonly [y: number, front: number, back: number];
const LOWER: readonly Section[] = [
  [.389564, 3.563, 3.491], [.410, 3.578116, 3.476145],
  [.440, 3.502180, 3.456930], [.470, 3.502730, 3.449337],
  [.500, 3.510781, 3.443763], [.560, 3.518235, 3.441984],
  [.586324, 3.493, 3.437575],
];
const UPPER: readonly Section[] = [
  [1.036973, 3.966, 3.945], [1.060, 3.975612, 3.945],
  [1.090, 3.9633, 3.9322], [1.120, 3.9506, 3.9184],
  [1.150, 3.9388, 3.9125], [1.180, 3.929, 3.8814],
  [1.210, 3.935925, 3.867033], [1.244745, 3.910, 3.890],
];

function depthAt(y: number, sections: readonly Section[], front: boolean): number {
  let i = 1;
  while (i < sections.length - 1 && sections[i][0] < y) i++;
  const a = sections[i - 1], b = sections[i];
  const t = Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0])));
  const axis = front ? 1 : 2;
  return a[axis] + (b[axis] - a[axis]) * t;
}

function ellipseWidth(y: number, center: number, halfHeight: number, halfWidth: number): number {
  return halfWidth * Math.sqrt(Math.max(0, 1 - ((y - center) / halfHeight) ** 2));
}

function eye(upper: boolean): THREE.BufferGeometry {
  const sections = upper ? UPPER : LOWER;
  const lo = sections[0][0], hi = sections[sections.length - 1][0];
  const ys = new Set(sections.map(s => s[0]));
  for (let i = 0; i <= 32; i++) ys.add(lo + (hi - lo) * i / 32);
  for (const y of upper ? [1.068, 1.118, 1.168] : [.449, .470, .491]) ys.add(y);
  const heights = [...ys].sort((a, b) => a - b);
  const pieces = [-1, 1].map(side => closedSectionLoft(heights.map(y => {
    const edgeDistance = Math.min(y - lo, hi - y);
    const round = Math.sqrt(Math.max(0, .021 ** 2 - Math.max(0, .021 - edgeDistance) ** 2));
    const outer = upper ? Math.max(.001, ellipseWidth(y, 1.140859, .103886, .0693))
      : .028225 + round;
    const inner = upper ? ellipseWidth(y, 1.118, .050, .037) : ellipseWidth(y, .470, .021, .0185);
    const x0 = side < 0 ? -outer : inner, x1 = side < 0 ? -inner : outer;
    const front = depthAt(y, sections, true), back = depthAt(y, sections, false);
    return { z: y, ring: [[x0, -front], [x1, -front], [x1, -back], [x0, -back]] as const };
  })).rotateX(-Math.PI / 2));
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return geometry;
}

function emit(P: TankBuilderPort, geometry: THREE.BufferGeometry,
  label: string, x = 0): void {
  geometry.userData.abramsSourceTowFitting = label;
  P.addEquipment('hullDetail', geometry, x, 0, 0);
}

function lowerLug(): THREE.BufferGeometry {
  // Source4 mounting lug ends overlap the actual approach/bow stock. The
  // lower eye hangs below it; no sheet is stretched across the two eyes.
  return closedSectionLoft([
    { z: 3.334285, ring: [[-.031765, .605], [.031765, .605], [.031765, .660664], [-.031765, .660664]] },
    { z: 3.449654, ring: [[-.031765, .493164], [.031765, .493164], [.031765, .660664], [-.031765, .660664]] },
    { z: 3.526363, ring: [[-.031765, .530], [.031765, .530], [.031765, .657], [-.031765, .657]] },
  ]);
}

function upperLug(): THREE.BufferGeometry {
  return closedSectionLoft([
    { z: 3.683345, ring: [[-.01879, 1.177], [.01879, 1.177], [.01879, 1.218], [-.01879, 1.218]] },
    { z: 3.900, ring: [[-.01879, 1.136113], [.01879, 1.136113], [.01879, 1.287285], [-.01879, 1.287285]] },
    { z: 3.941255, ring: [[-.01879, 1.209], [.01879, 1.209], [.01879, 1.251], [-.01879, 1.251]] },
  ]);
}

export function addAbramsSourceXHullFittings(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const lowX = side * .964025, highX = side * 1.04822;
    emit(P, eye(false), `lower-eye-${side}`, lowX);
    emit(P, lowerLug(), `lower-lug-${side}`, lowX);
    emit(P, roundMember([lowX - .0554, .545144, 3.474265],
      [lowX + .0554, .545144, 3.474265], .02119, 16), `lower-pin-${side}`);
    emit(P, eye(true), `upper-eye-${side}`, highX);
    emit(P, upperLug(), `upper-lug-${side}`, highX);
    emit(P, KIT.cylX(.02105, .10846, 16).translate(highX, 1.209695, 3.897865),
      `upper-pin-${side}`);
  }
}

