// First-party source77 case, constructed from measured design planes.
// This is not the source79 mast case. No external mesh/topology is imported.
import type { BufferGeometry } from 'three';
import { planeBoundedArmor, type ArmorPlane } from './abramsSourceXGeometry.ts';

export interface AbramsSourceXAftCasePart {
  name: string;
  geometry: BufferGeometry;
}

const FLOOR = 1.920805;
const DECK = 2.431285;
const REAR = -2.733115;
const FRONT = -2.303115;
const SHOULDER: ArmorPlane = [-.5971019078, .8021653892, 0, 1.68849659];
const RETURN_TOP: ArmorPlane = [.8022194354, .5970292936, 0, 1.86154608];
const RETURN_BOTTOM: ArmorPlane = [-.8025018707, -.5966496019, 0, -1.85472984];

function bounds(x0: number, x1: number, y0: number, y1: number,
  z0 = REAR, z1 = FRONT): ArmorPlane[] {
  return [[-1, 0, 0, -x0], [1, 0, 0, x1], [0, -1, 0, -y0],
    [0, 1, 0, y1], [0, 0, -1, -z0], [0, 0, 1, z1]];
}

function stock(name: string, planes: readonly ArmorPlane[], owner = '77'): AbramsSourceXAftCasePart {
  const geometry = planeBoundedArmor(planes);
  geometry.userData.abramsSourceXAftCase = name;
  geometry.userData.sourceOwner = `selectedOBJ:${owner}`;
  return { name: `AftCase${name}`, geometry };
}

/** Closed solids in canonical world metres. The equipment emitter applies
 * the ordinary turret-frame translation. The folded return is separate so
 * its real open shoulder channel cannot become a convex-hull fill. */
export function buildAbramsSourceXAftCase(): readonly AbramsSourceXAftCasePart[] {
  const parts = [
    stock('SlopedBody', [...bounds(.1876695, .4803595, FLOOR, 2.51), SHOULDER]),
    stock('DeckBody', bounds(.4803595, .9436295, FLOOR, DECK)),
    stock('LeadingBevel', [...bounds(.1616895, .1876695, 2.18, 2.30), SHOULDER,
      [-.8017367187, -.5976773660, 0, -1.45960499]]),
    stock('LeadingFold', [...bounds(.1616895, .1663595, 2.225235, 2.283455),
      [-.73875803, 1, 0, 2.1605555835]]),
    stock('WaistFlange', [...bounds(.1379795, .1876695, 2.12, 2.20, REAR, -2.384295),
      [-.3878628381, .9217171035, 0, 1.94612512],
      [-.4592587178, -.8883025555, 0, -1.97878407]]),
    stock('ShoulderReturn', [...bounds(.4540995, .4803595, DECK, 2.51), RETURN_TOP, RETURN_BOTTOM]),
    stock('ReturnElbow', [...bounds(.4803595, .5110795, DECK, 2.51), RETURN_TOP]),
    stock('RaisedCapBody', bounds(.6311595, .8711795, DECK, 2.520175, -2.724635, -2.311595)),
    stock('RaisedCapLip', bounds(.6294095, .8711795, 2.520175, 2.536435, -2.726925, -2.309425)),
  ];
  // Source77/202 and1946: separate top lap straps, not a case-wide lid.
  // Their narrow folded feet seat into the cap; rounded sub-mm edge tooling
  // is approximated with closed planar stock, not claimed as copied detail.
  for (const [label, z0, z1] of [['Rear', -2.633235, -2.617705],
    ['Fore', -2.418645, -2.402995]] as const) {
    parts.push(stock(`${label}CapLatch`, bounds(.6278795, .6757400,
      2.531855, 2.538695, z0, z1)));
    parts.push(stock(`${label}CapLatchFoot`, bounds(.6226195, .6311605,
      2.526745, 2.533595, z0, z1)));
  }
  parts.push(...louverReceivers(), ...louverBlades());
  return parts;
}

function louverReceivers(): AbramsSourceXAftCasePart[] {
  // Source77/0 has two thin raised end walls, absent from its mid-section.
  // They receive the83 blades without filling the54.8mm shoulder cavity.
  const raised: ArmorPlane = [-.7448975, 1, 0, 2.15954981];
  const seated: ArmorPlane = [.5971019078, -.8021653892, 0, -1.68849659 + .0008];
  return [['Rear', -2.733115, -2.727175], ['Fore', -2.309295, -2.303115]].map(
    ([label, z0, z1]) => stock(`${label}LouverReceiver`, [
      ...bounds(.1663595, .4803595, 2.20, 2.51, Number(z0), Number(z1)),
      raised, seated, RETURN_TOP,
    ]));
}

function louverBlades(): AbramsSourceXAftCasePart[] {
  // Fourteen physical blade stations: centerX and independently measured
  // upper/lower Y at that center. A common37.45mm tangent span and~28degree
  // fold approximate the source's sub-0.15degree tooling variation. These
  // are scalar part datums, not retained mesh vertices or contour samples.
  const stations = [
    [.1843095, 2.27795483, 2.27129529],
    [.2052095, 2.29322723, 2.28655372],
    [.2237045, 2.30687568, 2.30018417],
    [.2438045, 2.32141669, 2.31470294],
    [.2626995, 2.33603503, 2.32938523],
    [.2825795, 2.35059031, 2.34376946],
    [.3020595, 2.36509825, 2.35840152],
    [.3215395, 2.37963832, 2.37294148],
    [.3404695, 2.39425505, 2.38760080],
    [.3603495, 2.40877831, 2.40198416],
    [.3803395, 2.42344833, 2.41675150],
    [.3997845, 2.43800692, 2.43126114],
    [.4187145, 2.45262373, 2.44595220],
    [.4386295, 2.46712829, 2.46033401],
  ];
  return stations.map(([x, upper, lower], index) => {
    const slope = index === 0 ? .4865 : .5322;
    const c = 1 / Math.hypot(1, slope), s = slope * c;
    const tangent = c * x - s * (upper + lower) / 2;
    // Close the source's open axial ends and unmodeled narrow trailing edge.
    // Both long ends overlap the real77 receivers by120micrometres; the
    // short first blade is a rear-seated cantilever, as in the source.
    return stock(`CoverLouver${index}`, [
      [slope, 1, 0, slope * x + upper], [-slope, -1, 0, -slope * x - lower],
      [c, -s, 0, tangent + .018725], [-c, s, 0, -tangent + .018725],
      [0, 0, -1, 2.727295], [0, 0, 1, index === 0 ? -2.489165 : -2.309175],
    ], '83');
  });
}

