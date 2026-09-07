// Independent source-sized rear cases and receiving hardware. Replaces
// four guessed blocks formerly concealed by an incorrectly filled hull.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box } = KIT;
type Profile = readonly (readonly [z: number, y: number])[];

function stock(profile: Profile, x0: number, x1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (const [i, [z, y]] of profile.entries()) {
    if (i === 0) shape.moveTo(-z, y); else shape.lineTo(-z, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false })
    .rotateY(Math.PI / 2).translate(x0, 0, 0);
}

function add(P: TankBuilderPort, geometry: THREE.BufferGeometry, name: string): void {
  geometry.userData.chieftain10RearEquipment = name;
  P.addEquipment('hullDetail', geometry);
}

function sideCase(P: TankBuilderPort, side: number): void {
  const x0 = side < 0 ? -1.47298598 : 1.04924297,
    x1 = side < 0 ? -1.04926598 : 1.47296298;
  const z0 = side < 0 ? -3.571565866 : -3.571486473,
    z1 = side < 0 ? -3.261995792 : -3.262056828;
  const top = (z: number) => Math.min(1.66495073,
    ((side < 0 ? 1.977138081 : 1.977144012) + .0971840768 * z) / .995266424);
  add(P, sectionSolid([z0, -3.29348, z1].map(z => ({ z,
    ring: [[x0, 1.2601506], [x1, 1.2601506], [x1, top(z)], [x0, top(z)]],
  }))), 'sideCase');
  // Separate source receiving wall touches the case front. Its concealed
  // lower 3 mm continuation closes a small source/native sheet-seat gap.
  add(P, box(.567, .126, .00503).translate(side * 1.331,
    1.31294, -3.26086974), 'sideCaseReceivingWall');
}

function portClasp(P: TankBuilderPort, centerX: number): void {
  const x0 = centerX - .01967, x1 = centerX + .01967;
  const rear = (y: number) => -(3.55294316134 + .003037726856 * y) / .999995386097;
  add(P, stock([[rear(1.29207), 1.29207], [-3.5404048, 1.29207],
    [-3.5404048, 1.43044], [rear(1.43044), 1.43044]], x0, x1), 'claspRoot');
  const top = (z: number) => (1.3155349224 - .03584648891 * z) / .99935730809;
  add(P, stock([[-3.6235247, 1.4352295], [-3.548, 1.4352295],
    [-3.548, top(-3.548)], [-3.6235247, top(-3.6235247)]], x0, x1), 'claspTop');
  add(P, stock([[-3.62701464, 1.27743], [-3.548, 1.27752],
    [-3.548, 1.287], [-3.62338471, 1.28675]], x0, x1), 'claspLower');
  const outer = (y: number) => -(3.6110487755 + .020257732811 * y) / .999794791075;
  add(P, stock([[outer(1.28887), 1.28887], [-3.622, 1.2855], [-3.627, 1.33722],
    [outer(1.33722), 1.33722]], x0, x1), 'claspAftLip');
  // The flared source receiving plate joins both thin returns to the rear
  // box; the tall rectangular window between the returns stays empty.
  add(P, box(.07046, .22902, .010).translate(centerX, 1.39194, -3.545), 'claspReceivingPlate');
}

function starboardCase(P: TankBuilderPort): void {
  // Separate backing skin, raised central cover and four actual source
  // receiving stations. The old symmetric cube was not this assembly.
  add(P, box(.41457, .48452, .0037).translate(.469645, 1.32365, -3.5759464), 'rearPanel');
  add(P, box(.28410, .34438, .110).translate(.47128, 1.31333, -3.6304367), 'rearRaisedCover');
  for (const x of [.3023, .6403]) for (const y of [1.1673, 1.4664]) {
    add(P, box(.0484, .0479, .030).translate(x, y, -3.5599), 'rearPanelSeat');
  }
}

export function addChieftain10XRearEquipment(P: TankBuilderPort): void {
  for (const side of [-1, 1]) sideCase(P, side);
  for (const center of [-.66662, -.30994]) portClasp(P, center);
  starboardCase(P);
}
