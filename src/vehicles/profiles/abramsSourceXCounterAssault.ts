// Source65 counter-assault mounting stock, independently authored from sparse
// planes/sections. Source68 contributes only its three actual receiving seats.
// No source mesh payloads, broad gun replacement, or filled mounting AABBs.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { closedSectionLoft, planeBoundedArmor, type ArmorPlane, type XY } from './abramsSourceXGeometry.ts';

interface Part { name: string; geometry: THREE.BufferGeometry }
type Parts = Part[];
function add(parts: Parts, name: string, geometry: THREE.BufferGeometry): void {
  // BufferGeometry.clone shares userData; each authored part needs its own
  // provenance object before the equipment emitter adds its source name.
  geometry.userData = { ...geometry.userData, abramsCounterAssaultStock: name };
  parts.push({ name: `CounterAssault${name}`, geometry });
}
function block(parts: Parts, name: string, lo: readonly number[], hi: readonly number[]): void {
  add(parts, name, KIT.box(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    .translate((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2));
}
function acrossX(x0: number, x1: number, yz: readonly XY[]): THREE.BufferGeometry {
  let area = 0;
  for (let i = 0; i < yz.length; i++) area += yz[i][0] * yz[(i + 1) % yz.length][1] - yz[(i + 1) % yz.length][0] * yz[i][1];
  const ring = area > 0 ? yz : [...yz].reverse();
  return closedSectionLoft([{ z: x0, ring }, { z: x1, ring }]).applyMatrix4(new THREE.Matrix4().set(
    0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
}
function planPlate(outline: readonly XY[], bottom: number, top: number,
  holes: readonly { x: number; z: number; r: number }[] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3;
    return new THREE.Vector2(hole.x + Math.cos(a) * hole.r, -hole.z + Math.sin(a) * hole.r);
  })));
  return new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false, steps: 1 })
    .rotateX(-Math.PI / 2).translate(0, bottom, 0);
}

function receivingSeats(parts: Parts): void {
  // Central source68/1 bent 17.29mm sheet. Its mating end is naturally
  // embedded in the unchanged pitching casting, not a vertical pedestal.
  const bend = acrossX(0, 1, [
    [2.137595, 2.228905], [2.139785, 2.250265], [2.197345, 2.324305],
    [2.197345, 2.328545], [2.180055, 2.328545],
    [2.124385, 2.260335], [2.108925, 2.248565],
  ]);
  const p = bend.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    const left = z < 2.260336 ? THREE.MathUtils.clamp((1.71525798 - .30740414 * y - .44828591 * z) / -.83937026, -.07025, -.05804) : -.05804;
    const right = z < 2.260336 ? THREE.MathUtils.clamp((1.71183553 - .31103828 * y - .45358555 * z) / .83517384, .03091, .04306) : .03099;
    p.setX(i, THREE.MathUtils.lerp(left, right, p.getX(i)));
  }
  bend.computeVertexNormals(); add(parts, 'CentralSeat68Bend', bend);
  // Two real bolt holes in this receiver remain open even though the separate
  // source65 channel floor above them makes them non-air in the whole assembly.
  add(parts, 'CentralSeat68', planPlate([[-.05804, 2.328545], [.03105, 2.328545],
    [.03105, 2.399795], [.02013, 2.410715], [-.04699, 2.410715], [-.05791, 2.399795]],
  2.180055, 2.197345, [{ x: -.035435, z: 2.38984, r: .010655 }, { x: .008575, z: 2.38984, r: .010655 }]));
  for (const [side, cx, back0, back1, low, high] of [
    [1, .182431, .146551, .209151, 1.953385, 1.973955],
    [-1, -.199599, -.234679, -.165579, 1.953380, 1.973950],
  ]) {
    const left = cx - .02370, right = cx + .02370;
    // Actual six-sided bolt aperture, not an unpierced receiving block.
    add(parts, `SideSeat68${side}`, planPlate([
      [left, 2.369085], [right, 2.369085], [right, 2.402705],
      [cx + .012875, 2.413505], [cx - .012875, 2.413505], [left, 2.402705],
    ], low, high, [{ x: cx, z: 2.390810, r: .01066 }]));
    const bend = acrossX(0, 1, [[1.981475, 2.333765], [high, 2.355375],
      [high, 2.369085], [low, 2.369085], [1.944115, 2.359015]]);
    const p = bend.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = (p.getZ(i) - 2.333765) / (2.369085 - 2.333765);
      const a = THREE.MathUtils.lerp(back0, left, t), b = THREE.MathUtils.lerp(back1, right, t);
      p.setX(i, THREE.MathUtils.lerp(a, b, p.getX(i)));
    }
    // Source rear underside is open; this small tapered return closes only
    // that measured boundary. Sub-millimetre transverse warping is analytic.
    bend.computeVertexNormals(); add(parts, `SideSeatBend68${side}`, bend);
  }
}

function foldedFrame(parts: Parts): void {
  const feet: readonly (readonly [number, number])[] = [[-.22334, -.17601], [.14907, .19647]];
  feet.forEach(([x0, x1], i) => add(parts, `Foot${i}`, planPlate([
    [x0 + .00677, 2.365625], [x1 - .00677, 2.365625], [x1, 2.372305],
    [x1, 2.440755], [x1 - .00677, 2.447555], [x0 + .00677, 2.447555],
    [x0, 2.440755], [x0, 2.372305],
  ], 1.973935, 1.989985)));
  const slants: readonly (readonly [ArmorPlane, ArmorPlane, ArmorPlane, ArmorPlane])[] = [
    [[-.8691668, .4945189, 0, 1.1370673], [.8666869, -.4988526, 0, -1.1372481],
      [.3387297, .9408837, 0, 1.9877196], [.8665066, -.4991635, -.0014592, -1.1414759]],
    [[.8691911, .4944764, 0, 1.1135709], [-.8667092, -.4988137, 0, -1.1138261],
      [-.3387294, .9408838, 0, 1.9968418], [-.8665298, -.4991238, -.0012729, -1.1176005]],
  ];
  slants.forEach(([outside, inner, cap, foreInner], i) => {
    add(parts, `SlantedLegRear${i}`, planeBoundedArmor([outside, inner, cap,
      [0, -1, 0, -1.973935], [0, 0, -1, -2.386505], [0, 0, 1, 2.450955]]));
    add(parts, `SlantedLegFore${i}`, planeBoundedArmor([outside, foreInner,
      [0, 1, 0, 2.197325], [0, -1, 0, -1.989985], [0, -.7892964, .6140123, -.0678591],
      [0, 0, -1, -2.450955], [0, 0, 1, 2.714085]]));
  });
  // The longitudinal channel has an actual through-bottom opening between
  // Z2.542705 and2.864585. It is not one broad rectangular cradle.
  block(parts, 'ChannelRearFloor', [-.05804, 2.197325, 2.365505], [.03111, 2.214175, 2.542705]);
  add(parts, 'ChannelRearBevel', planPlate([[-.04736, 2.354825], [.02042, 2.354825],
    [.03111, 2.365505], [-.05804, 2.365505]], 2.197325, 2.214175));
  block(parts, 'ChannelFrontFloor', [-.05804, 2.197325, 2.864585], [.03111, 2.214175, 2.893105]);
  channelWalls(parts);
  block(parts, 'RearChannelBridge', [-.0526, 2.214175, 2.450955], [.02573, 2.265605, 2.480205]);
  block(parts, 'FrontChannelBridge', [-.04696, 2.214175, 2.880115], [.02009, 2.281585, 2.893105]);
  for (const [name, y, z, radius] of [['RearCrossPin', 2.25576, 2.5157, .0057],
    ['FrontCrossPin', 2.29957, 2.870165, .00602]] as const) {
    add(parts, name, KIT.cylX(radius, .09691, 16).translate(-.010315, y, z));
  }
}

function channelWalls(parts: Parts): void {
  for (const [i, x0, x1, mid, outer] of [[0, -.05804, -.04696, -.05034, -.05260],
    [1, .02009, .03111, .02341, .02573]]) {
    const sign = i ? 1 : -1, outer0 = i ? outer : x0, outer1 = i ? x1 : outer;
    add(parts, `ChannelWall${i}`, acrossX(x0, x1, [
      [2.197325, 2.611285], [2.197325, 2.893105], [2.214175, 2.893105],
      [2.267795, 2.964105], [2.278225, 2.968715], [2.287855, 2.962645],
      [2.314345, 2.899295], [2.318425, 2.885695], [2.318425, 2.761415],
      [2.286695, 2.761415], [2.286695, 2.611285],
    ]));
    block(parts, `ChannelFlange${i}`, [i ? .00887 : -.05804, 2.197325, 2.542705],
      [i ? .03111 : -.03574, 2.214175, 2.864585]);
    block(parts, `ThinRearLip${i}`, [outer0, 2.214175, 2.450955], [outer1, 2.286695, 2.611285]);
    const middle0 = i ? mid : outer, middle1 = i ? outer : mid;
    block(parts, `RearLipStep${i}`, [middle0, 2.214175, 2.480205], [middle1, 2.265605, 2.611285]);
    add(parts, `CradleNotch${i}`, acrossX(i ? x0 : mid, i ? mid : x1, [
      [2.214175, 2.480205], [2.214175, 2.611285], [2.265605, 2.611285],
      [2.265605, 2.547075], [2.241245, 2.534455], [2.237085, 2.524505],
      [2.241245, 2.514545], [2.265605, 2.501805], [2.265605, 2.480205],
    ]));
    // Source side pins join the stepped wall, without crossing the entire throat.
    add(parts, `CradlePin${i}`, KIT.cylX(.007, .01819, 12).translate(sign < 0 ? -.067335 : .024, 2.299535, 2.870225));
  }
}

function container(parts: Parts): void {
  // Source65/114: sloping95mm-deep upper pocket above real lower stock.
  const yz = (x: number): readonly XY[] => {
    const bottom = 2.117435 + (x - .06118) * .00089214;
    const top = 2.370155 - (x - .10566) * .00018755;
    const floor = 2.274805 - (x - .07353) * .00076764;
    const back = 2.740415 + (x - .06118) * .002338;
    const front = 2.894925 - (x - .06118) * .002338;
    return [[bottom, back], [bottom, front], [top, front], [top, 2.889945],
      [floor, 2.887395], [floor, 2.748065], [top, 2.745395], [top, back]];
  };
  let geometry = closedSectionLoft([{ z: .06118, ring: [...yz(.06118)].reverse() }, { z: .476, ring: [...yz(.476)].reverse() }]);
  geometry = geometry.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  add(parts, 'ContainerPocket', geometry);
  containerEnds(parts);
  add(parts, 'ContainerLid', acrossX(.19872, .31449, [[2.378325, 2.735445],
    [2.378325, 2.899895], [2.371535, 2.899895], [2.371535, 2.896135],
    [2.357675, 2.896135], [2.357675, 2.894195], [2.371535, 2.894195],
    [2.371535, 2.741145], [2.357675, 2.741145], [2.357675, 2.739325],
    [2.371535, 2.739325], [2.371535, 2.735445]]));
  // Source90 has a beveled lower edge and an open right mating face. The
  // explicitly approved0.8mm concealed lap corrects the source's0.69mm seam;
  // all exposed planes and adjacent air remain at their measured positions.
  const seat: readonly XY[] = [[.03111, 2.198485], [.0483, 2.190825],
    [.05713, 2.190825], [.05713, 2.309085], [.03111, 2.309085]];
  add(parts, 'ContainerSeat', closedSectionLoft([{ z: 2.776585, ring: seat }, { z: 2.858265, ring: seat }]));
  block(parts, 'ContainerFixedEndCover', [.06125, 2.370155, 2.740545], [.10566, 2.374825, 2.894925]);
  const receiver: readonly XY[] = [[.03104, 2.265025], [.04651, 2.265025], [.04651, 2.284865],
    [.15226, 2.284865], [.15226, 2.390945], [.14701, 2.390945], [.14701, 2.289825], [.03104, 2.289825]];
  add(parts, 'SideReceiver', closedSectionLoft([{ z: 2.425705, ring: receiver }, { z: 2.613345, ring: receiver }]));
}

function containerEnds(parts: Parts): void {
  // Source110/112 are folded end skins, not21mm-wide solid end blocks.
  // Their concealed closing faces meet source114's measured outer wall.
  const left: readonly XY[] = [[.057, 2.120285], [.0612, 2.120285],
    [.06126, 2.367595], [.05706, 2.367595]];
  for (const side of [0, 1]) {
    const mirror = (x: number) => side ? .53719 - x : x;
    const ring = left.map(([x, y]) => [mirror(x), y] as const);
    if (side) ring.reverse();
    add(parts, `ContainerEnd${side}`, closedSectionLoft([
      { z: 2.7372, ring }, { z: 2.89814, ring },
    ]));
    for (const [name, tip, low, high, z0, z1] of [
      ['AftFold', .11183, 2.151795, 2.336085, 2.737385, 2.741755],
      ['ForeFold', .10453, 2.145375, 2.342505, 2.893585, 2.898075],
    ] as const) {
      const r = [[.0612, 2.120285], [.07837, 2.120285], [tip, low],
        [tip, high], [.07837, 2.367595], [.0612, 2.367595]]
        .map(([x, y]) => [mirror(x), y] as const);
      if (side) r.reverse();
      add(parts, `Container${name}${side}`, closedSectionLoft([{ z: z0, ring: r }, { z: z1, ring: r }]));
    }
  }
  // Tapered inner pocket ends, measured independently from114's inward faces.
  for (const [i, ring] of [
    [0, [[.06120, 2.274805], [.07353, 2.274805], [.06749, 2.370155], [.06126, 2.370155]]],
    [1, [[.46425, 2.274505], [.47596, 2.274505], [.476, 2.370085], [.47043, 2.370085]]],
  ] as const) add(parts, `ContainerInnerEnd${i}`, closedSectionLoft([
    { z: 2.745395, ring }, { z: 2.889945, ring },
  ]));
}

// The source70 feed is twenty separately positioned cartridges, not an empty
// pocket or a broad belt slab. These are axis/radius measurements, not copied
// source vertices. The analytic12-sided cross section smooths the source's
// six-sided cases; source tip wander is below0.1mm and remains an approximation.
const FEED_AXES: readonly XY[] = [
  [-.003923, 2.395800], [.016392, 2.381790], [.042342, 2.376460], [.069162, 2.376755],
  [.095117, 2.376797], [.119412, 2.376060], [.143877, 2.375660], [.168737, 2.367595],
  [.187157, 2.351325], [.204912, 2.334585], [.2247625, 2.320505], [.2463375, 2.310220],
  [.269737, 2.301650], [.295127, 2.302160], [.321547, 2.304275], [.348602, 2.304385],
  [.375222, 2.304275], [.403927, 2.303070], [.4334075, 2.303400], [.4545175, 2.288625],
];
function cartridge(high: boolean): THREE.BufferGeometry {
  const segments = high ? 12 : 8;
  const stations = [[2.746805, .01209], [2.831165, .012035],
    [2.832615, .00920], [2.884805, .00363]];
  const rings = stations.map(([z, r]) => Array.from({ length: segments }, (_, i) => {
    const a = high ? i * Math.PI / 6 : i * Math.PI / 4;
    return [r * Math.cos(a), r * Math.sin(a), z] as const;
  }));
  const positions: number[] = [];
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[]) => positions.push(...a, ...b, ...c);
  for (let s = 0; s < rings.length - 1; s++) for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    tri(rings[s][i], rings[s][j], rings[s + 1][j]);
    tri(rings[s][i], rings[s + 1][j], rings[s + 1][i]);
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    tri([0, 0, 2.746805], rings[0][j], rings[0][i]);
    tri(rings[3][i], rings[3][j], [0, 0, 2.888325]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function ammunition(parts: Parts, high: boolean): void {
  const round = cartridge(high);
  FEED_AXES.forEach(([x, y], i) => add(parts, `FeedRound${i}`, round.clone().translate(x, y, 0)));
  round.dispose();
  feedLinks(parts);
}

// Independently measured two-plane strip sections, in source70 island order:
// foldX/Y, left-terminationX/Y, right-terminationX/Y. These compact design
// intersections replace the inaccurate inferred feed-tangent orientation.
const LINK_FOLDS = [
  [.107927, 2.383355, .100297, 2.387585, .114507, 2.387225],
  [.133617, 2.381975, .125787, 2.385835, .139997, 2.386205],
  [.158577, 2.377665, .152007, 2.383425, .165817, 2.380145],
  [.201667, 2.347825, .199077, 2.356145, .209168, 2.346145],
  [.181547, 2.363955, .179097, 2.372265, .188987, 2.362055],
  [.259418, 2.311055, .254307, 2.317915, .266918, 2.312515],
  [.281128, 2.307625, .273288, 2.311425, .287498, 2.311935],
  [.308338, 2.309525, .300438, 2.313175, .314648, 2.313905],
  [.335358, 2.310545, .327528, 2.314345, .341728, 2.314775],
  [.362048, 2.310035, .354738, 2.314855, .368878, 2.313465],
  [.390858, 2.307115, .383158, 2.311135, .397358, 2.311205],
  [.419328, 2.307265, .411768, 2.311495, .425968, 2.311055],
  [.081977, 2.383285, .074337, 2.387515, .088547, 2.387225],
  [.055157, 2.383065, .047527, 2.387225, .061727, 2.386935],
  [.029267, 2.384525, .022697, 2.390215, .036507, 2.386935],
  [.011277, 2.392475, .006627, 2.399845, .018907, 2.392695],
  [.218587, 2.332285, .215007, 2.340245, .226228, 2.331485],
  [.238568, 2.320615, .233197, 2.327405, .246138, 2.321635],
  [.444288, 2.298945, .439848, 2.306465, .451928, 2.299025],
] as const;
function feedLinks(parts: Parts): void {
  LINK_FOLDS.forEach(([fx, fy, lx, ly, rx, ry], i) => {
    const top: readonly XY[] = [[lx, ly], [fx, fy], [rx, ry]];
    // The original link is a zero-thickness two-plane strip. Close0.6mm
    // inward only; no wide connecting belt slab and no shifted outer plane.
    const ring: XY[] = [...top].reverse();
    ring.push(...top.map(([u, v]) => [u, v - .0006] as const));
    add(parts, `FeedLink${i}`, closedSectionLoft([
      { z: 2.798265, ring }, { z: 2.842445, ring },
    ]));
  });
}

export function buildAbramsSourceXCounterAssault(high = true): Part[] {
  const parts: Parts = [];
  receivingSeats(parts); foldedFrame(parts); container(parts); ammunition(parts, high);
  return parts;
}

