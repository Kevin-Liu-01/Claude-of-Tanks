// Ariete source-frame hull fittings, independently made from stock and tubes.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ, torus } = KIT;

function forwardCarry(P: TankBuilderPort): void {
  for (const [z, y] of [[3.09761, 1.17499], [3.23739, 1.09595]]) {
    for (let i = 0; i < 10; i++) {
      const x = -.698533 + i * .1552296;
      // Closed narrow center web and raised ears leave the carried-link
      // apertures open. No continuous dark rectangle substitutes for links.
      P.addEquipment('hullDark', box(.107, .014, .068), x, y - .027, z, .513);
      for (const side of [-1, 1]) {
        P.addEquipment('hullDetail', box(.021, .031, .112), x + side * .063, y, z, .513);
        P.addEquipment('hullDetail', cylX(.019, .029, 10), x + side * .063, y + .012, z - .030);
      }
      P.addEquipment('hullDetail', box(.116, .024, .017), x, y + .015, z + .031, .513);
    }
  }
  for (const [z, y] of [[3.00525, 1.20950], [3.31562, 1.03371]])
    P.addEquipment('hullDetail', box(1.56613, .032, .07065), 0, y, z, .513);
  for (const side of [-1, 1]) {
    const x = side * .877267;
    P.addEquipment('hullDetail', box(.118, .087, .092), x, 1.133, 3.264);
    P.addEquipment('hullDetail', torus(.047, .012, 16, 6), x, 1.09, 3.432, Math.PI / 2);
    P.addEquipment('hullDetail', cylZ(.017, .200, 12), x, 1.084, 3.390);
  }
}

function frontGuard(P: TankBuilderPort, side: -1 | 1): void {
  const x = side * 1.16728;
  P.addMudguard(`ariete-source-bow-lamp-${side}`, 'hullDetail', sectionSolid([
    { z: 3.149077, ring: [[x - .19976, 1.008479], [x + .19976, 1.008479],
      [x + .166, 1.150], [x - .166, 1.159035]] },
    { z: 3.383744, ring: [[x - .19976, 1.008479], [x + .19976, 1.008479],
      [x + .150, 1.128], [x - .150, 1.128]] },
  ]));
  // The source lamps have a recessed pair under their upper visor.
  for (const dx of [-.054, .054]) {
    P.addEquipment('hullDark', cylZ(.048, .018, 20), x + dx, 1.073243, 3.381);
    P.addEquipment('hullGlass', cylZ(.037, .004, 20), x + dx, 1.073243, 3.391);
  }
  P.addMudguard(`ariete-source-front-flexible-leaf-${side}`, 'hullDark',
    box(.485, .248, .015), side * 1.240, .882, 3.394);
  for (const z of [2.995, 3.149]) {
    P.addEquipment('hullDetail', box(.097, .020, .100), side * 1.367, 1.181 - (z - 2.995) * .31,
      z, .298);
    P.addEquipment('hullDetail', cylX(.013, .108, 12), side * 1.367, 1.203 - (z - 2.995) * .31, z);
  }
}

function driver(P: TankBuilderPort): void {
  // Source driver hatch is port of the main gun axis; retain its small
  // optical roof station separately from the yawing turret fittings.
  const x = -.685, z = 1.967;
  P.addHatch('hullDetail', cylY(.159, .167, .024, 32), x, 1.339, z);
  P.addEquipment('hullDetail', cylY(.099, .099, .014, 32), x, 1.358, z);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.087, .064, .084), x + side * .180, 1.349, 1.863, 0, side * .60);
    P.addEquipment('hullGlass', box(.064, .033, .004), x + side * .204, 1.355, 1.898, 0, side * .60);
  }
  P.addEquipment('hullDetail', box(.172, .065, .076), x, 1.346, 1.709);
  P.addEquipment('hullGlass', box(.139, .033, .004), x, 1.352, 1.749);
}

function rearHeadArc(path: THREE.Shape, inner: boolean, from: number, to: number): void {
  const steps = Math.ceil(Math.abs(to - from) * 14);
  for (let i = 0; i <= steps; i++) {
    const angle = from + (to - from) * i / steps, sine = Math.sin(angle);
    const radiusZ = inner ? (sine < 0 ? .076 : .1044) : (sine < 0 ? .112954 : .136);
    path.lineTo((inner ? -.0197 : -.016822) + Math.cos(angle) * (inner ? .0841 : .112707),
      -3.39275 + sine * radiusZ);
  }
}

function rearTowHead(P: TankBuilderPort): void {
  // Source4980 is a flat, open C head with different forward/aft curvature,
  // not a round torus. Independent ellipse arcs meet the measured shank.
  const shape = new THREE.Shape(), back = 3.30, fore = 2.955, neck = 1.015;
  shape.moveTo(-.016822 + Math.cos(back) * .112707, -3.39275 + Math.sin(back) * .112954);
  rearHeadArc(shape, false, back, Math.PI * 2 + neck);
  shape.lineTo(.044578284, -3.279448); shape.lineTo(.044578284, -3.16758166);
  shape.lineTo(-.074857874, -3.16758166); shape.lineTo(-.074857874, -3.279448);
  rearHeadArc(shape, false, Math.PI * 2 + Math.PI - neck, Math.PI * 2 + fore);
  rearHeadArc(shape, true, fore, back - Math.PI * 2); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: .037849459, bevelEnabled: false });
  g.rotateX(Math.PI / 2).translate(0, 1.484541, 0);
  P.addEquipment('hullDetail', g);
  // The two actual split retaining ears do not bridge the open middle slot.
  for (const [z, x, width, length, bottom, lowerTop, upperBottom, top] of [
    [-3.423, -.13145, .0584, .024, 1.447533, 1.455103, 1.475289, 1.484541],
    [-3.348, -.1326, .051, .030, 1.446692, 1.456785, 1.471083, 1.483700],
  ]) for (const [a, b] of [[bottom, lowerTop], [upperBottom, top]])
    P.addEquipment('hullDetail', new THREE.BoxGeometry(width, b - a, length), x, (a + b) / 2, z);
}

function rearLever(P: TankBuilderPort): void {
  // Separate source4905: narrow stepped lever through the split head ears.
  // Its rear cross-pin/retaining collar are attached stock, not a broad fill.
  const x = -.13962255, y = 1.463934, centerZ = -3.424958;
  const profile = [[0, -3.496451], [.013, -3.496451], [.013, -3.472901],
    [.0097, -3.467], [.0097, -3.440], [.006, -3.436733],
    [.006, -3.399], [.007, -3.398043], [.007, -3.353464], [0, -3.353464]];
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z - centerZ)), 12);
  P.addEquipment('hullDetail', g, x, y, centerZ, Math.PI / 2);
  const collar = new THREE.LatheGeometry([
    [.013, -.011775], [.01934, -.011775], [.01934, .011775],
    [.013, .011775], [.013, -.011775],
  ].map(([r, z]) => new THREE.Vector2(r, z)), 12);
  P.addEquipment('hullDetail', collar, -.13794, 1.46435, -3.48131, Math.PI / 2);
  P.addEquipment('hullDetail', cylX(.00799, .073176, 12), -.088736, y, -3.48131);
  // Source4675/5115 roots and4704/5164 crosswise hinge stocks meet the hull.
  for (const [xHinge, xPin] of [[-.092521, -.092100418], [.058877, .05845643]]) {
    P.addEquipment('hullDetail', new THREE.BoxGeometry(.021869, .047943, .11523),
      xHinge, 1.4588875, -3.2251965);
    P.addEquipment('hullDetail', cylX(.0353262, .0277563, 12).scale(1, 1, .97619),
      xPin, 1.4567847, -3.215524);
    const left = xHinge < 0 ? -.112707359 : .039531685;
    const right = xHinge < 0 ? -.073175676 : .078222272;
    // The independently measured flared root, not the shank tip, reaches
    // the hull face. One concealed millimeter overlaps that permanent face.
    P.addEquipment('hullDetail', sectionSolid([
      { z: -3.16758166, ring: [[xHinge - .0109345, 1.434916],
        [xHinge + .0109345, 1.434916], [xHinge + .0109345, 1.482859],
        [xHinge - .0109345, 1.482859]] },
      { z: -3.15648843, ring: [[left, 1.432393], [right, 1.432393],
        [right, 1.485382], [left, 1.485382]] },
    ]));
  }
}

function lowerCoupling(P: TankBuilderPort): void {
  // Source773 is a closed hooked forging with an open throat and a separate
  // upper locking jaw. Original quadratic arcs approximate its rounded tip;
  // a shallow center box cannot replace its176mm rearward projection.
  const s = new THREE.Shape();
  s.moveTo(3.1886, .877267); s.lineTo(3.215, .876);
  s.quadraticCurveTo(3.25, .8615, 3.285, .8615);
  s.quadraticCurveTo(3.339, .8615, 3.359, .899);
  s.quadraticCurveTo(3.370, .918, 3.359, .950);
  s.quadraticCurveTo(3.351, .973, 3.335, .9824);
  s.quadraticCurveTo(3.326, .979, 3.330, .954);
  s.quadraticCurveTo(3.334, .929, 3.32066, .91343);
  s.quadraticCurveTo(3.310, .9008, 3.30552, .9008);
  s.lineTo(3.25842, .91259); s.lineTo(3.22057, .93110);
  s.lineTo(3.19870, .95128); s.lineTo(3.1886, .95128); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .05887698, bevelEnabled: false, curveSegments: 12 });
  g.rotateY(Math.PI / 2).translate(-.02943849, 0, 0);
  P.addEquipment('hullDetail', g);
  P.addEquipment('hullDetail', sectionSolid([
    { z: -3.2744, ring: [[-.041214, 1.03287], [.041214, 1.03287],
      [.041214, 1.04296], [-.041214, 1.04296]] },
    { z: -3.25926, ring: [[-.041214, 1.024], [.041214, 1.024],
      [.041214, 1.0589445], [-.041214, 1.0589445]] },
    { z: -3.20038, ring: [[-.041214, .988292], [.041214, .988292],
      [.041214, 1.037917], [-.041214, 1.037917]] },
    { z: -3.18860, ring: [[-.041214, .981563], [.041214, .981563],
      [.041214, 1.038758], [-.041214, 1.038758]] },
  ]));
  P.addEquipment('hullDetail', new THREE.BoxGeometry(.141305, .055513, .010094),
    0, .9235275, -3.193655);
  P.addEquipment('hullDetail', new THREE.BoxGeometry(.075699, .16149, .010094),
    0, .958012, -3.193655);
}

function backFace(P: TankBuilderPort): void {
  // Separate source service panel, port paired cases and fasteners. Their
  // upper roots sit in the actual rear deck rather than a floating back wall.
  P.addEquipment('hullDetail', box(1.186, .402, .070), .023, 1.248, -3.188);
  for (const x of [-.792, .861]) {
    P.addEquipment('hullDetail', box(.126, .135, .103), x, 1.401, -3.204);
    P.addEquipment('hullDetail', torus(.055, .014, 18, 6), x, 1.329, -3.330, Math.PI / 2);
    P.addEquipment('hullDetail', cylZ(.019, .129, 12), x, 1.329, -3.268);
  }
  for (const y of [1.21665, 1.40254]) {
    P.addEquipment('hullDetail', box(.39616, .172, .155), -1.137587, y, -3.275);
    for (const x of [-1.28, -.999]) P.addEquipment('hullDetail', cylZ(.009, .009, 8), x, y, -3.357);
  }
  rearTowHead(P); rearLever(P);
  lowerCoupling(P);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', torus(.072, .014, 20, 6), side * .706, .850, -3.084, Math.PI / 2);
    P.addEquipment('hullDetail', box(.154, .072, .082), side * .706, .887, -3.018);
  }
}

function cable(P: TankBuilderPort, side: -1 | 1): void {
  // Original smooth centerline follows the source shoulder cable endpoints;
  // the separate saddles are real supports, not unconnected decorative pins.
  const points = [[side * 1.50, 1.449, -2.91], [side * 1.520, 1.461, -2.56],
    [side * 1.502, 1.360, -1.30], [side * 1.500, 1.284, -.05]];
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))),
    20, .012, 8, false);
  P.addEquipment('hullDark', g);
  for (const [z, y] of [[-2.91, 1.451], [-2.40, 1.446], [-1.30, 1.360], [-.05, 1.284]]) {
    P.addEquipment('hullDetail', box(.063, .034, .042), side * 1.493, y - .010, z);
  }
}

export function addArieteXSuppliedHullEquipment(P: TankBuilderPort): void {
  forwardCarry(P); driver(P); backFace(P);
  for (const side of [-1, 1] as const) { frontGuard(P, side); cable(P, side); }
  // The source rear deck is a broad plate with a shallow round service cap,
  // not an invented field of tall louvers taken from another Ariete model.
  P.addEquipment('hullDetail', new THREE.LatheGeometry([
    [0, 1.496], [.436, 1.496], [.436, 1.497998589],
    [.408774449, 1.518185054], [0, 1.518185054], [0, 1.496],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 24), 0, 0, -2.4299370844);
}
