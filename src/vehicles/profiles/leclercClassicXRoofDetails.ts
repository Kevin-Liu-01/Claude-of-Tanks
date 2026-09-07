// Original closed primitives from older-file scalar planes, not source buffers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { classicTurret } from './leclercClassicXFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const HIGH = 2.30867856, FLOOR = 2.163613558, LEDGE = 2.269230;

function portCoaming(P: TankBuilderPort): void {
  // Independent major stations describe the rounded outer shoulder and its
  // raised inner bevel. The center remains145mm below the actual rim.
  const stations = [
    [-.58918, -1.276, -1.209, -.969, -1.0618],
    [-.40, -1.28, -1.2315, -.9689462, -1.061800],
    [0, -1.28, -1.249, -.9676557, -1.064925],
    [.20, -1.258, -1.225, -.9847702, -1.088],
    [.40, -1.237, -1.221, -.9133593, -1.090114],
    [.48579, -1.226, -1.211, -.819, -1.014],
  ];
  const rows: SolidSection[] = stations.map(([z, outer, crest, inner, knee]) => ({ z,
    ring: [[outer, 2.115], [inner, 2.115], [inner, LEDGE], [knee, HIGH],
      [crest, HIGH], [outer, 2.20]],
  }));
  classicTurret(P, 'turretDetail', sectionSolid(rows));
  classicTurret(P, 'turretDetail', KIT.box(.664, FLOOR - 2.115, .977),
    -.674, (FLOOR + 2.115) / 2, -.001615);
  // The original inboard wall is very slightly yawed, not an axis-aligned
  // broad slab. Both measured parallel face planes are retained.
  classicTurret(P, 'turretDetail', sectionSolid([-.584, .8305].map(z => ({ z,
    ring: [[(-.34368003 + .003835258 * z) / .999992645, 2.09],
      [(-.30019584 + .003835211 * z) / .999992645, 2.09],
      [(-.30019584 + .003835211 * z) / .999992645, HIGH],
      [(-.34368003 + .003835258 * z) / .999992645, HIGH]],
  }))));
  classicTurret(P, 'turretDetail', KIT.box(.906, HIGH - 2.115, .099),
    -.7555, (HIGH + 2.115) / 2, -.5395);
  const foldedRoof = (x: number, z: number) => Math.min(HIGH,
    (2.055694186 - .0003472502 * x + .268043997 * z) / .963406609);
  classicTurret(P, 'turretDetail', sectionSolid([
    [.485, -1.226], [.628213, -1.177], [.712578, -1.145], [.8305, -1.081],
  ].map(([z, left]): SolidSection => ({ z, ring: [[left, 2.115], [-.326628, 2.115],
    [-.326628, foldedRoof(-.326628, z)], [-.885363, foldedRoof(-.885363, z)],
    [-1.018, HIGH], [left, HIGH]] }))));
}

function crewShoulder(P: TankBuilderPort): void {
  // Source725 carries a complete16-sided vertical support plus a shallow
  // rounded surrounding shoulder. It is not a cap floating over the shell.
  classicTurret(P, 'turretDetail', KIT.cylY(.3077572, .3077572,
    2.420942068 - 1.809360743, 16), .776212, (2.420942068 + 1.809360743) / 2, .174996);
  const rows = [
    [-.5779, .44986, 1.07402, 2.338466, 2.338466],
    [-.27, .432, 1.14907, 2.390, 2.338466],
    [-.10, .435, 1.170, 2.418, 2.360],
    [.175, .438, 1.244, 2.42094, 2.343],
    [.40, .443, 1.218, 2.42094, 2.34015],
    [.55, .696, 1.143, 2.415, 2.340],
    [.62, .754, 1.025, 2.353, 2.340],
  ];
  classicTurret(P, 'turretDetail', sectionSolid(rows.map(([z, left, right, crown, edge]) => ({ z,
    ring: [[left, 2.10], [right, 2.10], [right, edge],
      [right - .145, crown], [left + .065, crown], [left, crown - .021]],
  }))));
}

function rampSector(angle: number): THREE.BufferGeometry {
  const profile = [[.097, 2.442], [.2335915, 2.442], [.2335915, 2.457965],
    [.097, 2.486498], [.097, 2.442]].map(([r, y]) => new THREE.Vector2(r, y));
  const sector = new THREE.LatheGeometry(profile, 4, angle, .32).toNonIndexed();
  const shape = new THREE.Shape(profile), pieces = [sector];
  for (let i = 0; i < 2; i++) {
    const end = new THREE.ShapeGeometry(shape);
    if (i === 1 && end.index) for (let j = 0; j < end.index.count; j += 3) {
      const b = end.index.getX(j + 1);
      end.index.setX(j + 1, end.index.getX(j + 2)); end.index.setX(j + 2, b);
    }
    end.rotateY(angle + i * .32 - Math.PI / 2);
    pieces.push(end.toNonIndexed()); end.dispose();
  }
  const result = mergeGeometries(pieces);
  for (const g of pieces) g.dispose();
  if (!result) throw new Error('Classic hatch ramp merge failed');
  result.computeVertexNormals();
  return result;
}

function crewCap(P: TankBuilderPort): void {
  // A recessed annular hatch with stepped central boss; the133.9mm source
  // maximum belongs to a narrow central ring, not the entire609mm cap.
  const rings = [[0, 2.388141394], [.3045705, 2.388141394],
    [.3045705, 2.45354557], [.2335915, 2.45354557], [.2335915, 2.422264338],
    [.1452975, 2.422264338], [.1452975, 2.472366333], [.0944595, 2.472366333],
    [.0944595, 2.522013664], [.0748445, 2.522013664], [.0748445, 2.491897345],
    [0, 2.491897345], [0, 2.388141394]];
  classicTurret(P, 'turretHatch', new THREE.LatheGeometry(
    rings.map(([r, y]) => new THREE.Vector2(r, y)), 40), .7767935, 0, .1824385);
  // Ten actual radial ramp lands leave alternating depressed channels.
  for (let i = 0; i < 10; i++) classicTurret(P, 'turretHatch',
    rampSector(i * Math.PI / 5 + .04), .7767935, 0, .1824385);
}

export function addLeclercClassicXRoofDetails(P: TankBuilderPort): void {
  portCoaming(P); crewShoulder(P); crewCap(P);
}

export function addLeclercClassicXMast(P: TankBuilderPort): void {
  const body = [[0, 2.279720306], [.0757345, 2.279720306],
    [.0757345, 2.314856], [.053227, 2.365345716], [.0487825, 2.365345716],
    [.0487825, 2.82255], [0, 2.82255]];
  classicTurret(P, 'turretDetail', new THREE.LatheGeometry(
    body.map(([r, y]) => new THREE.Vector2(r, y)), 32), .025442, 0, -1.919310);
  // Source746 has an enlarged, rear-overhanging closed head with a tapered
  // forward underside. The old cone incorrectly lost its visible130mm rim.
  const g = sectionSolid([2.808936, 2.811732, 2.82255, 2.880746841].map(y => ({ z: y,
    ring: Array.from({ length: 32 }, (_, i): [number, number] => {
      const a = i * Math.PI / 16, forward = Math.sin(a) < 0;
      const t = THREE.MathUtils.clamp((y - (forward ? 2.82255 : 2.808936))
        / (forward ? .058196841 : .002796), 0, 1);
      const r = .0487825 + (.065455 - .0487825) * t;
      return [Math.cos(a) * r, Math.sin(a) * r];
    }),
  }))).rotateX(-Math.PI / 2);
  classicTurret(P, 'turretDetail', g, .026035, 0, -1.916332);
}
