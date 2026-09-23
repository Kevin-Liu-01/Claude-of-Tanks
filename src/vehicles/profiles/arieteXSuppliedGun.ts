// Independently turned source-frame main gun. Its real deep open bore was
// closed at the source tip on 2026-09-22 (owner: holes are added, not carved,
// to save triangles); the measured depth stays recorded at the lathe below.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { ARIETE_SUPPLIED_X_DATUMS as D } from './arieteXSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box } = KIT;

function mrsLowerBridge(boreRadius: number): THREE.BufferGeometry {
  // Keep the visible top/edges and side seats. The original hidden underside
  // cut into the bore; this concave relief follows its120mm installed throat.
  const half = .089 / 2, bottom = 1.70265 - .014 / 2 - D.trunnion[1];
  const top = bottom + .014, relief = boreRadius + .0005;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = -half + i * half / 8;
    points.push(new THREE.Vector2(x, Math.max(bottom, Math.sqrt(Math.max(0, relief ** 2 - x ** 2)))));
  }
  points.push(new THREE.Vector2(half, top), new THREE.Vector2(-half, top));
  return new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: .126165, steps: 1, bevelEnabled: false }).translate(0, D.trunnion[1], 4.94062 - .126165 / 2);
}

function fixedMount(P: TankBuilderPort): void {
  const roof = (z: number) => (2.166577396 - .812052153 * z) / .583584870;
  const plate = sectionSolid([1.33398414, 1.531642571].map(z => ({ z,
    ring: [[-.190088526, 1.463513487], [.190088526, 1.463513487],
      [.190088526, roof(z)], [-.190088526, roof(z)]],
  })));
  plate.translate(-D.trunnion[0], -D.trunnion[1], -D.trunnion[2]);
  P.add('gunMount', plate);
  const rows = [[.157286, 1.342], [.174949, 1.418], [.174949, 1.520],
    [.157286, 1.567810], [.157286, 1.960603], [.122, 2.043872],
    [.107, 2.043872], [.107, 1.342], [.157286, 1.342]];
  const shroud = new THREE.LatheGeometry(rows.map(([r, z]) => new THREE.Vector2(r, z - D.trunnion[2])),
    40).rotateX(Math.PI / 2);
  P.add('gunMount', shroud);
}

export function addArieteXSuppliedGun(P: TankBuilderPort, boreRadius = .0542): void {
  fixedMount(P);
  // Source-only radial station study, rounded to analytic turned rings.
  // The large middle fume sleeve and forward collar are genuinely distinct;
  // a single tapered cylinder would erase both source silhouettes.
  const outer = [[.12248, 1.95976235], [.12248, 2.53507449],
    [.09590, 2.71507], [.09590, 3.23571], [.11650, 3.23571],
    [.11650, 3.73028], [.09590, 3.73028], [.08520, 3.84046],
    [.08466, 4.16597], [.09590, 4.17774], [.09590, 4.23998],
    [.07910, 4.28288], [.06980, 4.87754], [.06980, D.muzzleZ]];
  // Owner 2026-09-22 ("the point of adding holes instead of carving them into
  // the barrel is that we save on triangles"): the lathe ends on the axis at
  // the source tip. Until then it turned into the bore (boreRadius, .0542 on
  // the C1 and the C2's 120 mm) down to the source deep blind floor at
  // D.boreFloorZ (3.683820288 in the supplied frame, 1.344 m behind the
  // 5.028094113 muzzle) with a dark stock disc 2 mm behind that floor. The
  // factory's dark mouth disc at the tube edge hid the recess entirely; the
  // depth stays recorded here and in arieteXSupplied/arieteX/arieteC2X.selftest.
  const shellRows = [...outer, [0, D.muzzleZ]];
  P.add('gun', new THREE.LatheGeometry(shellRows.map(([r, z]) =>
    new THREE.Vector2(r, z - D.trunnion[2])), 48).rotateX(Math.PI / 2));
  const x = 0, y = 1.750;
  // Muzzle reference housing faces back toward the turret. Its open mouth
  // and glass are separate from the bore so neither caps the main cannon.
  const add = (g: THREE.BufferGeometry, px: number, py: number, pz: number, bucket = 'gun') =>
    P.add(bucket, g, px - D.trunnion[0], py - D.trunnion[1], pz - D.trunnion[2]);
  add(box(.121118, .022, .126165), x, 1.793159, 4.94062);
  for (const side of [-1, 1]) add(box(.015, .087, .126165), side * .053059, y, 4.94062);
  add(box(.121118, .071, .010), x, y, 4.998702);
  if (boreRadius === .0542) add(box(.089, .014, .126165), x, 1.70265, 4.94062);
  else P.add('gun', mrsLowerBridge(boreRadius).translate(-D.trunnion[0], -D.trunnion[1], -D.trunnion[2]));
  add(box(.050466, .049625, .004), x, 1.774300, 4.879537, 'gunDark');
  P.muzzleZ = D.muzzleZ - D.trunnion[2];
}
