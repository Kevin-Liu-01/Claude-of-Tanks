// First-party soft stowage, not three copies of each bag's world AABB.
// Owner82 contains the same 0.776m sack in three quite different orientations.
// Sparse principal axes and six section envelopes were measured independently;
// this new rounded-section loft does not contain the source's vertex payload.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { closedSectionLoft, type XYZ } from './abramsSourceXGeometry.ts';

export type SourceStowageBagName = 'AftBagLeft' | 'AftBagCenter' | 'AftBagRight';
interface BagFrame { center: XYZ; width: XYZ; length: XYZ }
const FRAMES: Record<SourceStowageBagName, BagFrame> = {
  AftBagLeft: { center: [-.821250, 2.293312, -3.031986],
    width: [.731749, .577653, .361746], length: [-.607598, .793345, -.037787] },
  AftBagCenter: { center: [-.108970, 2.288622, -3.022330],
    width: [.171121, -.526412, .832831], length: [.870709, .476374, .122200] },
  AftBagRight: { center: [.547224, 2.130553, -3.043605],
    width: [.099981, -.611144, -.785179], length: [-.988954, .025751, -.145972] },
};

// A rounded rectangle with shallow sewn-end pinches, not an extruded circle.
// These eight authored design stations approximate the measured broad fabric
// envelope; fine wrinkles are intentionally not inferred from an AABB.
const SECTIONS = [
  [-.38783, .142, .126], [-.351, .185, .179], [-.264, .226, .218],
  [-.100, .231, .215], [.105, .228, .208], [.254, .217, .205],
  [.341, .182, .167], [.38783, .124, .120],
] as const;

function sectionPoint(a: number, width: number, depth: number): [number, number] {
  const rounded = (n: number) => Math.sign(n) * Math.pow(Math.abs(n), .82);
  return [rounded(Math.cos(a)) * width, rounded(Math.sin(a)) * depth];
}

function bagTransform(name: SourceStowageBagName): THREE.Matrix4 {
  const frame = FRAMES[name];
  const long = new THREE.Vector3(...frame.length).normalize();
  const wide = new THREE.Vector3(...frame.width).normalize();
  const cross = long.clone().cross(wide).normalize();
  wide.crossVectors(cross, long).normalize();
  return new THREE.Matrix4().makeBasis(wide, cross, long).setPosition(...frame.center);
}

function fabricBody(segments: number): THREE.BufferGeometry {
  const raw = closedSectionLoft(SECTIONS.map(([z, w, d]) => ({ z,
    ring: Array.from({ length: segments }, (_, i) => sectionPoint(i * Math.PI * 2 / segments, w, d)),
  })));
  raw.deleteAttribute('normal');
  const smooth = mergeVertices(raw, 1e-6);
  raw.dispose();
  smooth.computeVertexNormals();
  return smooth;
}

/** A narrow closed fabric belt following the sack's surface. Its center stays
 * empty; it is neither a straight rod nor a second opaque bag-sized solid. */
function fabricBelt(z: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const point = (i: number, side: number, outer: boolean): XYZ => {
    const station = z + side * .011;
    const [w, d] = fabricRadii(station);
    const [x, y] = sectionPoint(i * Math.PI * 2 / segments,
      w + (outer ? .002 : -.002), d + (outer ? .002 : -.002));
    return [x, y, station];
  };
  const quad = (a: XYZ, b: XYZ, c: XYZ, d: XYZ) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    quad(point(i, -1, true), point(j, -1, true), point(j, 1, true), point(i, 1, true));
    quad(point(i, 1, false), point(j, 1, false), point(j, -1, false), point(i, -1, false));
    quad(point(i, -1, false), point(j, -1, false), point(j, -1, true), point(i, -1, true));
    quad(point(i, 1, true), point(j, 1, true), point(j, 1, false), point(i, 1, false));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(positions.flatMap((_, i) =>
    i % 3 === 0 ? [positions[i], positions[i + 2]] : []), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function fabricRadii(z: number): [number, number] {
  const j = SECTIONS.findIndex(s => s[0] >= z);
  if (j < 1) throw new Error('Fabric belt must sit inside the authored sack');
  const a = SECTIONS[j - 1], b = SECTIONS[j], t = (z - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function sourceStowageBag(name: SourceStowageBagName, high = true):
  { name: string; geometry: THREE.BufferGeometry }[] {
  const segments = high ? 24 : 16, transform = bagTransform(name);
  const parts = [{ name, geometry: fabricBody(segments) },
    { name: `${name}ClosureBelt`, geometry: fabricBelt(.254, segments) }];
  for (const part of parts) {
    part.geometry.applyMatrix4(transform);
    part.geometry.userData.sourceOwner = '82';
  }
  return parts;
}

