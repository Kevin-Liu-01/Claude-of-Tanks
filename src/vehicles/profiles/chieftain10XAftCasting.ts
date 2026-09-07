// Independently authored rear casting, not the adjacent external stowage.
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
const roof = (z: number): number => 2.624103 + .176318 * z;
const lid = (z: number): number => 2.653303 + .176327 * z;

export function addChieftain10XAftCasting(P: TankBuilderPort, pivot: Point): void {
  // Source complete turret at Z−1.5/−1.3: floor1.85303/1.83524,
  // sideX±.93268/±.97757 and roof2.35963/2.39426. The former profile
  // accidentally left this half-meter connection empty below flat hatches.
  const casting = sectionSolid([-1.623, -1.5, -1.3, -1.105].map(z => {
    const w = 1.27026 + .22505 * z;
    const low = 1.719639 - .088927 * z, top = roof(z);
    const corner = low + Math.max(0, w - .766) * .22346;
    return { z, ring: [[-.766, low], [.766, low], [w, corner],
      [w, top - .012], [w - .027, top], [-w + .027, top], [-w, top - .012],
      [-w, corner]] as [number, number][] };
  }));
  casting.translate(-pivot[0], -pivot[1], -pivot[2]);
  P.add('turret', casting);
  for (const side of [-1, 1]) {
    const center = side * .478;
    const cover = sectionSolid([-1.590, -1.125].map(z => ({ z,
      ring: [[center - .340, lid(z) - .031325], [center + .340, lid(z) - .031325],
        [center + .340, lid(z)], [center - .340, lid(z)]] as [number, number][],
    })));
    cover.translate(-pivot[0], -pivot[1], -pivot[2]);
    P.addHatch('turretDetail', cover);
    for (const x of [center - .23, center + .23]) P.addEquipment('turretDetail',
      KIT.cylX(.020, .088, 16), x - pivot[0], lid(-1.552) + .005 - pivot[1],
      -1.552 - pivot[2]);
  }
}
