// First-party closed plates and folded louvers from independent Mk10 scalar
// planes. The forward diagonal relief clears the real turret bearing.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection, type SectionPoint } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylZ } = KIT;
type Height = (z: number) => number;

function sided(ring: SectionPoint[], side: number): SectionPoint[] {
  return side > 0 ? ring : ring.map(([x, y]): SectionPoint => [-x, y]).reverse();
}

function strip(side: number, x0: number, x1: number, z0: number, z1: number,
  lower: Height, upper: Height): THREE.BufferGeometry {
  const a = side < 0 ? -x1 : x0, b = side < 0 ? -x0 : x1;
  return sectionSolid([z0, z1].map(z => ({ z,
    ring: [[a, lower(z)], [b, lower(z)], [b, upper(z)], [a, upper(z)]],
  })));
}

function shoulder(P: TankBuilderPort, side: number): void {
  const roof = (x: number, z: number) => 1.946819 - .23107658 * x + .011245 * z;
  const sections: SolidSection[] = [-2.029, -.49].map(z => {
    return { z, ring: sided([[.918, 1.50], [1.43, 1.50],
      [1.43, roof(1.43, z)], [.918, roof(.918, z)]], side) };
  });
  // The source has a permanent outward-falling shoulder, not floating panel
  // feet. Its concealed lower closure overlaps the existing closed hull.
  P.add('hull', sectionSolid(sections));
}

function forwardCover(P: TankBuilderPort, side: number): void {
  const top: Height = z => side > 0 ? 1.732922 + .010906 * z : 1.74336 + .0218197 * z;
  const bottom: Height = z => 1.7280 + .06665 * z;
  const edge = (z: number) => Math.max(.410857, .4536 + 1.75 * (z + .75));
  const stations = [-.929374, -.774425, -.490164];
  const sections: SolidSection[] = stations.map(z => {
    return { z, ring: sided([[edge(z), top(z) - .006], [.908487, top(z) - .006],
      [.908487, top(z)], [edge(z), top(z)]], side) };
  });
  P.addEquipment('hullDetail', sectionSolid(sections));
  P.addEquipment('hullDetail', strip(side, .908487, .918977, stations[0], -.4835,
    bottom, z => top(z) + .005405));
  // Two straight inside walls describe the corner and diagonal, rather than
  // a rectangle filled across the source's genuine turret-clearance notch.
  for (let i = 0; i < stations.length - 1; i++) {
    const rows: SolidSection[] = [stations[i], stations[i + 1]].map(z => {
      const x = edge(z);
      return { z, ring: sided([[x, bottom(z)], [x + .008, bottom(z)],
        [x + .008, top(z)], [x, top(z)]], side) };
    });
    P.addEquipment('hullDetail', sectionSolid(rows));
  }
}

function frame(P: TankBuilderPort, side: number, z0: number, z1: number, top: Height): void {
  const low: Height = z => top(z) - .060;
  for (const [a, b] of [[.221627, .232117], [.908487, .918977]]) {
    P.addEquipment('hullDetail', strip(side, a, b, z0, z1, low, top));
  }
  for (const z of [z0 + .005, z1 - .005]) {
    P.addEquipment('hullDetail', strip(side, .227877, .908997, z - .005, z + .005,
      low, top));
  }
}

function foldedLouver(side: number, start: number, base: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // The lower fold starts aft of the top edge and returns slightly beyond
  // the front edge. A vertically extruded tilted box would be 6 mm too
  // thick in the actual open throat despite matching the upper plane.
  const rise = side > 0 ? .02847 : .02912;
  const points = [[start, base], [start + .05587, base + rise],
    [start + .05993, base + rise - .00585], [start + .00894, base - .01295]];
  for (const [i, [z, y]] of points.entries()) {
    if (i === 0) shape.moveTo(side * z, y); else shape.lineTo(side * z, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: .68112, bevelEnabled: false })
    .rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * .908997, 0, 0);
}

function louverBank(P: TankBuilderPort, side: number, z0: number, count: number,
  firstTop: number, slope: number): void {
  const z1 = z0 + (count - 1) * .048 + .05587;
  const frameTop: Height = z => side > 0 ? 1.738338 + .010906 * z
    : (z0 < -1.5 ? 1.75571 + .0218614 * z : 1.74850 + .02161 * z);
  frame(P, side, z0 - .01286, z1 + .00827, frameTop);
  for (let i = 0; i < count; i++) {
    const start = z0 + i * .048, base = firstTop + slope * i * .048;
    P.addEquipment('hullDetail', foldedLouver(side, start, base));
  }
  // Sparse thin cross-wires describe the source's net above the folded
  // metal. The openings remain geometry, with no opaque dark cover plane.
  for (let i = 0; i < 17; i++) {
    const x = .2483 + i * .04009;
    P.addEquipment('hullDark', strip(side, x - .001, x + .001,
      z0 + .012, z1 - .012, z => frameTop(z) - .001, z => frameTop(z) + .001));
  }
}

function hinges(P: TankBuilderPort, side: number): void {
  const tops = side > 0 ? [1.75943, 1.756136, 1.754450, 1.751350, 1.750617, 1.747507]
    : [1.761953, 1.756184, 1.752814, 1.746874, 1.752398, 1.746368];
  for (const [i, z] of [-.7118, -.969884, -1.121702, -1.377482, -1.44184, -1.70664].entries()) {
    const y = tops[i] - .0158;
    P.addEquipment('hullDetail', cylZ(.0158, .0324, 16), side * .9344, y, z);
    // The source outer wall has localized raised ears at the actual hinge
    // stations. These ears contact the pin without lifting the entire frame.
    P.addEquipment('hullDetail', box(.01049, .041, .0324), side * .913732,
      y - .006, z);
  }
}

export function addChieftain10XEngineDeck(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    shoulder(P, side);
    forwardCover(P, side);
    // Port's longer panel is one physical bank. Starboard has a separate
    // short bank immediately behind the front cover, with a real seam aft.
    if (side < 0) louverBank(P, side, -1.42778, 10, 1.68072, .02182);
    else {
      louverBank(P, side, -1.428337, 7, 1.685890, .010906);
      louverBank(P, side, -1.092254, 3, 1.689616, .010906);
    }
    louverBank(P, side, -1.764405, 7, side > 0 ? 1.682317 : 1.68134, .010906);
    hinges(P, side);
  }
}
