// Original source2/3 rear cooling assembly: three unequal protective grids,
// separately seated ahead of inclined ventilation blades. These are native
// rods and closed folded sheets, not a texture or one filled grille panel.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { closedSectionLoft, type XY } from './abramsSourceXGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

interface Screen {
  x0: number; x1: number; horizontalZ: number; verticalZ: number;
  y0: number; y1: number; verticalXs: readonly number[]; rows: readonly number[];
  clipsX: readonly number[]; clipsY: readonly number[];
}
const SCREENS: readonly Screen[] = [
  { x0: -1.01576, x1: -.526231, horizontalZ: -3.979085, verticalZ: -3.971545,
    y0: .995506, y1: 1.355975, verticalXs: [-.981621, -.879261, -.776726, -.674621, -.571391],
    rows: [.998662, 1.030581, 1.062621, 1.094666, 1.126586, 1.158627,
      1.190607, 1.222590, 1.254630, 1.286610, 1.318590, 1.350635],
    clipsX: [-.955906, -.597406], clipsY: [1.078647, 1.302635] },
  { x0: -.492451, x1: .183909, horizontalZ: -3.974730, verticalZ: -3.965970,
    y0: .955575, y1: 1.321385, verticalXs: [-.462031, -.358986, -.256846, -.154161, -.051696, .050479, .153379],
    rows: [.964250, .996230, 1.028276, 1.060196, 1.092236, 1.124281,
      1.156201, 1.188241, 1.220280, 1.252200, 1.284245, 1.316285],
    clipsX: [-.442191, .124449], clipsY: [1.012315, 1.236365] },
  { x0: .314700, x1: 1.02105, horizontalZ: -3.972775, verticalZ: -3.964245,
    y0: .989782, y1: 1.350985, verticalXs: [.36015, .46280, .56552, .66810, .770235, .872995, .97553],
    rows: [.998517, 1.029467, 1.060537, 1.091487, 1.122557, 1.153507,
      1.184456, 1.215530, 1.246480, 1.277550, 1.308500, 1.345155],
    clipsX: [.384, .94087], clipsY: [1.076071, 1.292845] },
];

function emit(P: TankBuilderPort, geometry: THREE.BufferGeometry, label: string): void {
  geometry.userData.abramsSourceRearGrille = label;
  P.addEquipment('hullDetail', geometry);
}

function protectiveScreen(P: TankBuilderPort, screen: Screen, index: number): void {
  for (const y of screen.rows) {
    emit(P, KIT.box(screen.x1 - screen.x0, .00413, .02622)
      .translate((screen.x0 + screen.x1) / 2, y, screen.horizontalZ), `screen-${index}-horizontal`);
  }
  for (const x of screen.verticalXs) {
    emit(P, KIT.box(.0089, screen.y1 - screen.y0, .0089)
      .translate(x, (screen.y0 + screen.y1) / 2, screen.verticalZ), `screen-${index}-vertical`);
  }
  for (const x of screen.clipsX) for (const y of screen.clipsY) {
    emit(P, KIT.box(.0464, .0284, .01686).translate(x, y, screen.horizontalZ - .0045),
      `screen-${index}-retainer`);
    emit(P, KIT.cylZ(.0074, .0068, 8).translate(x, y, screen.horizontalZ - .0128),
      `screen-${index}-retainer-head`);
    // Source retaining bars and through-studs join the forward blade field
    // to the rear protective grid. They are not hidden full-panel backing.
    const high = y > 1.2;
    emit(P, KIT.box(.0284, high ? .08411 : .1005, .0078)
      .translate(x, y + .013, screen.horizontalZ + (high ? .0214 : .0358)),
      `screen-${index}-receiving-strap`);
    emit(P, KIT.cylZ(.00555, .053, 8).translate(x, y, screen.horizontalZ + .010),
      `screen-${index}-retaining-stud`);
  }
}

function acrossX(x0: number, x1: number, outline: readonly XY[]): THREE.BufferGeometry {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ring = area > 0 ? [...outline] : [...outline].reverse();
  const geometry = closedSectionLoft([{ z: x0, ring }, { z: x1, ring }]);
  return geometry.applyMatrix4(new THREE.Matrix4().set(
    0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
}

/** Measured blade slopes have a small downward inner return, rather than
 * the earlier shallow rectangular bars. Constant9.3mm wall approximates
 * the source's sub-millimetre taper and tiny transverse nonplanarity. */
function foldedBlade(x0: number, x1: number,
  y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const a = new THREE.Vector2(y0 + .0068, z0);
  const b = new THREE.Vector2(y1, z0 + (y1 - a.x) / .7465);
  const c = new THREE.Vector2(y1 - (z1 - b.y) * .2425, z1);
  const first = b.clone().sub(a).normalize(), last = c.clone().sub(b).normalize();
  const n0 = new THREE.Vector2(-first.y, first.x), n1 = new THREE.Vector2(-last.y, last.x);
  const miter = n0.clone().add(n1).normalize();
  const innerB = b.clone().addScaledVector(miter, .0093 / miter.dot(n0));
  const innerA = a.clone().addScaledVector(n0, .0093), innerC = c.clone().addScaledVector(n1, .0093);
  return acrossX(x0, x1, [a, b, c, innerC, innerB, innerA].map(p => [p.x, p.y] as const));
}

function inclinedBlades(P: TankBuilderPort): void {
  const right = [[.996092, 1.168311, -3.928795, -3.634785],
    [1.064782, 1.231065, -3.933505, -3.646405], [1.133241, 1.293325, -3.939415, -3.659285],
    [1.202782, 1.355105, -3.944195, -3.670905], [1.271725, 1.421255, -3.948315, -3.682055],
    [1.341145, 1.485705, -3.952895, -3.693735]];
  const left = [[1.005575, 1.177807, -3.929395, -3.635385],
    [1.074276, 1.241885, -3.935035, -3.647335], [1.143695, 1.304995, -3.938885, -3.657495],
    [1.211785, 1.367865, -3.943795, -3.669435], [1.281335, 1.432075, -3.949375, -3.682115],
    [1.350755, 1.496035, -3.954225, -3.694135]];
  for (const [bank, x0, x1] of [[right, .30055, 1.02718], [left, -1.02218, -.513171]] as const) {
    for (const [y0, y1, z0, z1] of bank) emit(P, foldedBlade(x0, x1, y0, y1, z0, z1), 'side-folded-blade');
  }
  // The central bay uses three substantially taller blades, not the six
  // short outside-bank folds. End caps are first-party closed stock.
  for (const y of [.978265, 1.113116, 1.274895]) {
    emit(P, acrossX(-.506901, .193979, [[y + .0089, -3.960525], [y + .26253, -3.619525],
      [y + .2545, -3.6135], [y, -3.9538]]), 'central-blade');
  }
}

type LeafHeights = readonly [number, number, number, number, number, number];

/** Independent scalar stations for the two different source2/3 hinge leaves.
 * The short port leaf is not a mirrored long starboard leaf. Its receiving
 * end has a one-sided bevel; both source ends lap the sidewall by 0.51 mm.
 * The enlarged inner end and rounded outer nose are not one convex hull.
 * Only the concealed mating end receives an inferred closure cap. */
function hingeLeaf(side: -1 | 1, heights: LeafHeights): THREE.BufferGeometry {
  const [innerLow, innerHigh, neckLow, neckHigh, endLow, endHigh] = heights;
  const xs = side === 1
    ? [1.03652, 1.04819, 1.10897, 1.11991, 1.12436]
    : [1.03145, 1.04312, 1.05217, 1.06311, 1.06756];
  const stations = [
    [innerLow, innerHigh, -3.959735, -3.922095],
    [neckLow, neckHigh, -3.959665, -3.928795],
    [endLow, endHigh, -3.959595, -3.928795],
    [endLow, endHigh, -3.955085, -3.933315],
  ];
  const vertices = stations.map(([low, high, back, front], i) => [
    [side * xs[i], low, back], [side * xs[i], high, back],
    [side * xs[i], high, front], [side * xs[i], low, front],
  ].map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const positions: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    for (const p of side === 1 ? [a, b, c] : [a, c, b]) positions.push(p.x, p.y, p.z);
  };
  for (let k = 0; k < vertices.length - 1; k++) for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(vertices[k][i], vertices[k][j], vertices[k + 1][j]);
    tri(vertices[k][i], vertices[k + 1][j], vertices[k + 1][i]);
  }
  tri(vertices[0][2], vertices[0][1], vertices[0][0]);
  tri(vertices[0][3], vertices[0][2], vertices[0][0]);
  // A true edge terminates the polygonal nose; no zero-area terminal ring.
  const lowTip = new THREE.Vector3(side * xs[4], endLow, -3.944195);
  const highTip = new THREE.Vector3(side * xs[4], endHigh, -3.944195);
  const end = vertices[3];
  tri(end[0], end[1], highTip); tri(end[0], highTip, lowTip);
  tri(end[1], end[2], highTip);
  tri(end[2], end[3], lowTip); tri(end[2], lowTip, highTip);
  tri(end[3], end[0], lowTip);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function hingeLeaves(P: TankBuilderPort): void {
  // Source owner3 islands1493/1523/1553/1583, then owner2 islands453/620/650/673.
  const leaves: readonly (readonly [-1 | 1, LeafHeights])[] = [
    [-1, [1.405005, 1.437045, 1.404885, 1.430005, 1.404885, 1.429885]],
    [-1, [1.332065, 1.364345, 1.339105, 1.364225, 1.338985, 1.364105]],
    [-1, [1.094786, 1.126826, 1.094666, 1.119787, 1.094666, 1.119667]],
    [-1, [1.021846, 1.054127, 1.028887, 1.054007, 1.028757, 1.053886]],
    [1, [1.341755, 1.380955, 1.348795, 1.373915, 1.348795, 1.373795]],
    [1, [1.411905, 1.451115, 1.418945, 1.444075, 1.418945, 1.443955]],
    [1, [1.087482, 1.126561, 1.094521, 1.119522, 1.094401, 1.119522]],
    [1, [1.021581, 1.060781, 1.028622, 1.053742, 1.028622, 1.053621]],
  ];
  for (const [side, heights] of leaves) emit(P, hingeLeaf(side, heights), 'hinge-leaf');
}

function receivingFrame(P: TankBuilderPort): void {
  const wall: readonly XY[] = [[.9848, -3.9600], [1.474, -3.9600], [1.58936, -3.813],
    [1.480, -3.65345], [.94973, -3.704]];
  for (const [x0, x1] of [[-1.03196, -1.02182], [-.513321, -.503181],
    [.193979, .204119], [.29537, .30551], [1.02689, 1.03703]]) {
    emit(P, acrossX(x0, x1, wall), 'receiving-sidewall');
  }
  const roofAt = (z: number) => (3.71196 + .6635 * z) / .748;
  emit(P, acrossX(-1.03188, 1.09073, [[roofAt(-3.960), -3.960], [roofAt(-3.784415), -3.784415],
    [roofAt(-3.784415) - .023, -3.784415], [roofAt(-3.960) - .023, -3.960]]), 'folded-upper-frame');
  for (const [x0, x1, y] of [[-.513321, .30551, .95764], [-1.03196, -.503181, .985], [.29537, 1.03703, .985]]) {
    emit(P, KIT.box(x1 - x0, .011, .015).translate((x0 + x1) / 2, y, -3.9525), 'lower-frame-rail');
  }
  hingeLeaves(P);
}

export function addAbramsSourceXRearGrilles(P: TankBuilderPort): void {
  receivingFrame(P);
  inclinedBlades(P);
  SCREENS.forEach((screen, index) => protectiveScreen(P, screen, index));
}

