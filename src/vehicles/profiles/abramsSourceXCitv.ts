// First-party CITV stocks from sparse selected-OBJ61/59 design measurements.
// No source vertices, topology, mesh imports or fitted vehicle transforms.
import * as T from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { closedSectionLoft, planeBoundedArmor, type ArmorPlane, type XY } from './abramsSourceXGeometry.ts';

export interface AbramsSourceXCitvPart {
  name: string;
  geometry: T.BufferGeometry;
  glass?: boolean;
}
const CX = .707125, CZ = .4660945;
const HEAD_X = .7075905, HEAD_Z = .466765, HEAD_R = .1829855;
const FLOOR = 2.43462491, SHOULDER = 2.495754957, CROWN = 2.709664822;

function part(name: string, geometry: T.BufferGeometry, owner = '61', glass = false): AbramsSourceXCitvPart {
  geometry.userData.abramsSourceXCitv = name;
  geometry.userData.sourceOwner = `selectedOBJ:${owner}`;
  return { name: `CITV${name}`, geometry, glass };
}

function planar(name: string, planes: readonly ArmorPlane[], owner = '61'): AbramsSourceXCitvPart {
  return part(name, planeBoundedArmor(planes), owner);
}

function bounds(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): ArmorPlane[] {
  return [[-1, 0, 0, -x0], [1, 0, 0, x1], [0, -1, 0, -y0],
    [0, 1, 0, y1], [0, 0, -1, -z0], [0, 0, 1, z1]];
}

/** A generated circular design polygon, clipped by authored flat boundaries. */
function circlePlan(radius: number, x0: number, x1: number, z1: number): XY[] {
  let ring: XY[] = Array.from({ length: 32 }, (_, i) => {
    const a = i * Math.PI / 16;
    return [CX + radius * Math.cos(a), CZ + radius * Math.sin(a)];
  });
  for (const [axis, sign, limit] of [[0, -1, -x0], [0, 1, x1], [1, 1, z1]]) {
    const next: XY[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const da = sign * a[axis] - limit, db = sign * b[axis] - limit;
      if (da <= 0) next.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    ring = next;
  }
  return ring;
}

function convexRings(rows: readonly { y: number; ring: readonly XY[] }[]): T.BufferGeometry {
  const geometry = new ConvexGeometry(rows.flatMap(row => row.ring.map(([x, z]) => new T.Vector3(x, row.y, z))));
  const positions = geometry.getAttribute('position'), uv: number[] = [];
  for (let i = 0; i < positions.count; i++) uv.push(positions.getX(i), positions.getZ(i));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return geometry;
}

function vertical(ring: readonly XY[], y0: number, y1: number): T.BufferGeometry {
  const xy = ring.map(([x, z]): XY => [x, -z]).reverse();
  return closedSectionLoft([{ z: y0, ring: xy }, { z: y1, ring: xy }]).rotateX(-Math.PI / 2);
}

function annulus(profile: readonly XY[], center: XY = [CX, CZ]): T.BufferGeometry {
  const points = profile.map(([r, y]) => new T.Vector2(r, y));
  const geometry = new T.LatheGeometry(points, 32);
  return geometry.translate(center[0], 0, center[1]);
}

function receivingRoof(x: number, z: number): number {
  return 2.304809057 - .0645671497 / .9918032806 * (x - CX)
    - .1102603094 / .9918032806 * (z - CZ);
}

function permanentSeatTie(): AbramsSourceXCitvPart {
  // Explicit authored attachment accommodation, NOT source59 geometry:
  // the base A2/SEP3 gameplay skin may be spent, exposing12mm lower permanent
  // backing. One narrow interior tie extends13mm below the source roof.
  const ring: XY[] = Array.from({ length: 16 }, (_, i) => {
    const angle = i * Math.PI / 8;
    return [.87 + .025 * Math.cos(angle), .58 + .025 * Math.sin(angle)];
  });
  const geometry = new ConvexGeometry([-.013, .001].flatMap(offset =>
    ring.map(([x, z]) => new T.Vector3(x, receivingRoof(x, z) + offset, z))));
  const p = geometry.attributes.position, uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i), p.getZ(i));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  const result = part('PermanentSeatTie', geometry);
  geometry.userData.sourceOwner = 'authored:spent-skin-seat';
  return result;
}

function pedestal(): AbramsSourceXCitvPart[] {
  // Source59/2644 has a roof-trimmed lower receiving neck, wide shallow
  // flange, narrower middle sleeve and a final open source wall terminating
  // against61's bottom annulus. Close only its concealed stock thickness.
  const ring = circlePlan(.291, -2, 2, 2);
  const base = new ConvexGeometry([
    ...ring.map(([x, z]) => new T.Vector3(x, receivingRoof(x, z) - .0004, z)),
    ...ring.map(([x, z]) => new T.Vector3(x, 2.344604969, z)),
  ]);
  const uv: number[] = [];
  const p = base.getAttribute('position');
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i), p.getZ(i));
  base.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return [part('RoofReceiver', base, '59'), part('ReceivingSleeve', annulus([
    [.307, 2.344604969], [.307, 2.3825749], [.2698, 2.3825749],
    [.2698, 2.43087], [.26465, 2.43087], [.26465, FLOOR + .00004],
    [.2555, FLOOR + .00004], [.2555, 2.344604969], [.307, 2.344604969],
  ]), '59')];
}

function lowerHead(): AbramsSourceXCitvPart[] {
  const parts = [part('LowerAnnulus', annulus([
    [.270, FLOOR], [.270, 2.45140481], [.175, 2.45140481],
    [.175, 2.448], [.25964, FLOOR], [.270, FLOOR],
  ]))];
  // The cone is divided by the real optical opening sides. The middle
  // forward segment ends at the sloping sill; no full cone spans that air.
  const radius = (y: number) => .270 - (y - 2.45140481) * (.270 - .225835) / (SHOULDER - 2.45140481);
  for (const [name, x0, x1, z1] of [
    ['Left', -2, .635, 2], ['Right', .778186, 2, 2], ['Back', .635, .778186, .550],
  ] as const) {
    parts.push(part(`Flare${name}`, convexRings([2.45140481, SHOULDER].map(y => ({
      y, ring: circlePlan(radius(y), x0, x1, z1),
    })))));
  }
  parts.push(part('SlopingSill', convexRings([2.45140481, 2.467084885, 2.477885008].map(y => ({
    y, ring: circlePlan(radius(y), .635, .778186,
      Math.min(2, (2.5602724805 - .9811673728 * y) / .1931594846)),
  })))));
  parts.push(planar('InnerSill', [
    ...bounds(.635, .778186, 2.470, 2.479, .550, .668114),
    [0, .9999990464, .0013810102, 2.4788053172],
  ]));
  return parts;
}

function bodyPlan(): XY[] {
  const start = 147.65 * Math.PI / 180, end = 393.75 * Math.PI / 180;
  const arc: XY[] = Array.from({ length: 24 }, (_, i) => {
    const a = start + (end - start) * i / 23;
    return [HEAD_X + HEAD_R * Math.cos(a), HEAD_Z + HEAD_R * Math.sin(a)];
  });
  // The few flat-front design intersections are separate from the generated
  // circular rear shoulder. The central rectangular pocket remains open.
  return [...arc, [.848626, .623454], [.809726, .655854], [.778186, .668114],
    [.778216, .550], [.635038, .550], [.634806, .666295],
    [.606396, .655855], [.553815, .623455]];
}

function canopy(): AbramsSourceXCitvPart[] {
  const roof = planar('CanopyInner', [
    ...bounds(.606396, .809726, 2.68, CROWN, .550, .683895),
    [0, -.999932, .01165, -2.67966],
  ]);
  const slope = planar('CanopySlope', [
    ...bounds(.606396, .809726, 2.68, CROWN, .683895, .710355),
    [0, -.9231368355, .3844715634, -2.2180416194],
    [0, .9999989261, .0014655076, 2.7106230765],
  ]);
  // Independent parabolic nose approximation: measured chord/sag/crown,
  // not the source's irregular seven boundary vertices.
  const nose: XY[] = [[.606396, .710355], [.809726, .710355]];
  for (let i = 1; i < 12; i++) {
    const t = 1 - i / 6;
    nose.push([.708061 + .101665 * t, .736085 - .025730 * t * t]);
  }
  return [roof, slope, part('CanopyNose', vertical(nose, 2.69857502, 2.709584951))];
}

function aperture(): AbramsSourceXCitvPart[] {
  const contour: XY[] = [[.663475, 2.496345], [.749775, 2.496345],
    [.769356, 2.518375], [.769356, 2.649985], [.749775, 2.671945],
    [.663475, 2.671945], [.644025, 2.649985], [.644025, 2.518375]];
  const outer = new T.Shape([new T.Vector2(.635, 2.478025), new T.Vector2(.778186, 2.478025),
    new T.Vector2(.778186, 2.686385), new T.Vector2(.635, 2.686385)]);
  outer.holes.push(new T.Path(contour.map(([x, y]) => new T.Vector2(x, y)).reverse()));
  const frame = new T.ExtrudeGeometry(outer, { depth: .016774, bevelEnabled: false, steps: 1 });
  frame.translate(0, 0, .550);
  // Source atlas face is not an empty aperture. Seal it with0.8mm first-party
  // glazing; a concealed0.25mm perimeter lap seats into the measured frame.
  const cx = .7066905, cy = 2.584145;
  const glass = closedSectionLoft([.5560245, .5568245].map(z => ({ z,
    ring: contour.map(([x, y]): XY => [x + Math.sign(x - cx) * .00025, y + Math.sign(y - cy) * .00025]),
  })));
  return [part('OpticalFrame', frame), part('OpticalFace', glass, '61', true)];
}

function rearFixture(): AbramsSourceXCitvPart[] {
  // Source61/0 is a shallow two-facet rear cover, not another forward-looking
  // rectangular window. Its folded perimeter seats in the curved body.
  const left: ArmorPlane = [-.1151285779, .017167323, -.993202242, -.2953898754];
  const right: ArmorPlane = [.1238014255, .0172273797, -.9921574595, -.1258487719];
  return [planar('RearCoverLeft', [...bounds(.668055, .707825, 2.502255, 2.600665, .25, .291), left]),
    planar('RearCoverRight', [...bounds(.707825, .747585, 2.502255, 2.600665, .25, .2914), right]),
    planar('RearReceivingRim', bounds(.661025, .754225, 2.494885, 2.604825, .281, .291744))];
}

export function buildAbramsSourceXCitv(): readonly AbramsSourceXCitvPart[] {
  return [...pedestal(), ...lowerHead(), part('UpperSteppedBody', vertical(bodyPlan(), SHOULDER, CROWN)),
    ...canopy(), ...aperture(), ...rearFixture(), permanentSeatTie()];
}

