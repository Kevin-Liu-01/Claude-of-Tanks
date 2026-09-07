// Independently turned source-frame main gun, with a real deep open bore.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { ARIETE_SUPPLIED_X_DATUMS as D } from './arieteXSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylZ } = KIT;

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

export function addArieteXSuppliedGun(P: TankBuilderPort): void {
  fixedMount(P);
  // Source-only radial station study, rounded to analytic turned rings.
  // The large middle fume sleeve and forward collar are genuinely distinct;
  // a single tapered cylinder would erase both source silhouettes.
  const outer = [[.12248, 1.95976235], [.12248, 2.53507449],
    [.09590, 2.71507], [.09590, 3.23571], [.11650, 3.23571],
    [.11650, 3.73028], [.09590, 3.73028], [.08520, 3.84046],
    [.08466, 4.16597], [.09590, 4.17774], [.09590, 4.23998],
    [.07910, 4.28288], [.06980, 4.87754], [.06980, D.muzzleZ]];
  const boreRadius = .0542;
  const shellRows = [...outer, [boreRadius, D.muzzleZ], [boreRadius, D.boreFloorZ]];
  P.add('gun', new THREE.LatheGeometry(shellRows.map(([r, z]) =>
    new THREE.Vector2(r, z - D.trunnion[2])), 48).rotateX(Math.PI / 2));
  // A blind stock closes the actual source depth, not the visible muzzle.
  P.add('gunDark', cylZ(boreRadius + .001, .004, 40), 0, 0,
    D.boreFloorZ - .002 - D.trunnion[2]);
  const x = 0, y = 1.750;
  // Muzzle reference housing faces back toward the turret. Its open mouth
  // and glass are separate from the bore so neither caps the main cannon.
  const add = (g: THREE.BufferGeometry, px: number, py: number, pz: number, bucket = 'gun') =>
    P.add(bucket, g, px - D.trunnion[0], py - D.trunnion[1], pz - D.trunnion[2]);
  add(box(.121118, .022, .126165), x, 1.793159, 4.94062);
  for (const side of [-1, 1]) add(box(.015, .087, .126165), side * .053059, y, 4.94062);
  add(box(.121118, .071, .010), x, y, 4.998702);
  add(box(.089, .014, .126165), x, 1.70265, 4.94062);
  add(box(.050466, .049625, .004), x, 1.774300, 4.879537, 'gunDark');
  P.muzzleZ = D.muzzleZ - D.trunnion[2];
}
