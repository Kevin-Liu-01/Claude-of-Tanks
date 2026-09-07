// Original closed stock from measured Mk10 fitting sections. The cupola's
// inclined receiving channel is open; its maximum height is not a filled box.
import * as THREE from 'three';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type ProfilePoint = readonly [number, number];
const ANGLE = -Math.atan2(.3954780343208633, .9184754348210441);

function channelSection(profile: readonly ProfilePoint[], u0: number, u1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (const [i, [v, y]] of profile.entries()) {
    if (i === 0) shape.moveTo(-v, y); else shape.lineTo(-v, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: u1 - u0, bevelEnabled: false })
    .rotateY(Math.PI / 2).translate(u0, 0, 0).rotateY(ANGLE);
}

function add(P: TankBuilderPort, pivot: Point, g: THREE.BufferGeometry, name: string): void {
  g.userData.chieftain10UpperFitting = name;
  P.addEquipment('turretDetail', g.translate(-pivot[0], -pivot[1], -pivot[2]));
}

function receivingChannel(P: TankBuilderPort, pivot: Point): void {
  const u0 = -.167034, u1 = -.083554;
  // The two ends alone meet the real circular bearing. The 0.5 mm concealed
  // seating allowance accounts for its independently faceted native crown.
  for (const [v0, v1] of [[-.1789, -.151], [.135, .16578]]) add(P, pivot,
    channelSection([[v0, 2.6192], [v1, 2.6192], [v1, 2.621759], [v0, 2.621759]], u0, u1), 'channelFoot');
  const lower = (v: number) => 2.6451283 - .1103206 * v;
  const floor = (v: number) => 2.6471883 - .112108 * v;
  add(P, pivot, channelSection([[-.155, lower(-.155)], [.134, lower(.134)],
    [.134, floor(.134)], [-.155, floor(-.155)]], u0, u1), 'channelFloor');
  // Thin side walls rise toward the forward return. The center remains open
  // well above the descending floor, with no dark solid standing in for air.
  for (const [a, b] of [[u0, u0 + .0021], [u1 - .0021, u1]]) add(P, pivot,
    channelSection([[-.155, lower(-.155)], [.134, lower(.134)],
      [.134, 2.76798], [-.155, 2.7216]], a, b), 'channelSide');
  add(P, pivot, channelSection([[-.1768, 2.6212], [-.1548, 2.6212],
    [-.1439, 2.6853], [-.1461, 2.700], [-.1600, 2.7216],
    [-.1621, 2.7216], [-.1569, 2.6584], [-.1768, 2.6548]], u0, u1), 'channelAftReturn');
  // Source front normal [-.3937,-.1288,+.9102] defines this inclined
  // return; the narrow rolled crown folds back over genuine approach air.
  add(P, pivot, channelSection([[.1341, 2.6212], [.13625, 2.6212],
    [.1542, 2.78213], [.1521, 2.78213]], u0, u1), 'channelFrontReturn');
  add(P, pivot, channelSection([[.1318, 2.7764], [.1338, 2.7738],
    [.1418, 2.7663], [.1522, 2.7809], [.1522, 2.78285],
    [.1420, 2.78808], [.1380, 2.78809], [.1340, 2.7864],
    [.1318, 2.7835]], u0, u1), 'channelRolledCrown');
}

function leftLatch(P: TankBuilderPort, pivot: Point): void {
  // Actual source outer-jamb latch, separate from the already correct broad
  // housing wall. Its steep upper fold explains the local front-view crown.
  const ring: [number, number][] = [[-1.566005, 2.28393], [-1.559715, 2.28064],
    [-1.554925, 2.28415], [-1.55470, 2.29129], [-1.541525, 2.3016],
    [-1.541525, 2.3059707], [-1.553855, 2.3030705], [-1.565925, 2.2904007]];
  add(P, pivot, sectionSolid([-.1158362, -.0563263].map(z => ({ z, ring }))), 'leftLatchUpper');
}

export function addChieftain10XUpperFittings(P: TankBuilderPort, pivot: Point): void {
  receivingChannel(P, pivot);
  leftLatch(P, pivot);
}
