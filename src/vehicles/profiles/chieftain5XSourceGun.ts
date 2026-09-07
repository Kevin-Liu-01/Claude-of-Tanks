// Source-specific original lathed cannon and independently closed root hood.
// The supplied gun is mildly warped. The nominal straight native axis is an
// explicit construction inference, not an imported or source-authored rig.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];

function rootHood(): THREE.BufferGeometry {
  const rows = [[1.37945, .1725, 1.915, 2.1646], [1.465, .1714, 1.769, 2.1340],
    [1.6958, .1712, 1.7537, 2.0551], [1.88, .137, 1.728, 1.994],
    [2.3484, .130, 1.731, 1.988]];
  return sectionSolid(rows.map(([z, width, low, top]) => ({ z,
    ring: Array.from({ length: 24 }, (_, i): [number, number] => {
      const a = -Math.PI / 2 + i * Math.PI / 12;
      return [-.0022 + width * Math.cos(a), (top + low) / 2 + (top - low) / 2 * Math.sin(a)];
    }),
  })));
}

function outerBarrel(trunnionZ: number, segments: number): THREE.BufferGeometry {
  const rows = [[1.78, .131], [1.96, .149], [2.34, .140], [2.39, .125],
    [2.94, .115], [4.25, .115], [4.37, .122], [4.47, .136],
    [5.20, .132], [5.267, .115], [6.30, .114], [6.435, .113],
    [6.49, .1023], [6.8120532, .1017]];
  return new THREE.LatheGeometry(rows.map(([z, r]) => new THREE.Vector2(r, z - trunnionZ)),
    segments).rotateX(Math.PI / 2);
}

function collar(radius: number, length: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry([[.081, -length / 2], [radius, -length / 2],
    [radius, length / 2], [.081, length / 2], [.081, -length / 2]]
    .map(([r, z]) => new THREE.Vector2(r, z)), 32).rotateX(Math.PI / 2);
}

export function addChieftain5XSourceGun(P: TankBuilderPort, trunnion: Point): void {
  P.add('gunMount', rootHood().translate(-trunnion[0], -trunnion[1], -trunnion[2]));
  P.add('gun', outerBarrel(trunnion[2], P.q ? 40 : 24));
  for (const [z, radius, length] of [[2.342, .146, .014], [4.318, .140, .050],
    [5.291, .140, .050], [6.458, .127, .048]]) {
    P.add('gun', collar(radius, length), 0, 0, z - trunnion[2]);
    P.add('gun', KIT.box(.026, .017, length + .012), .071, radius * .84, z - trunnion[2]);
  }
  // Short local cloth seams are individual ring relief, never a radial scale
  // of the entire gun. Their sub-centimetre unevenness remains simplified.
  for (const [z, r] of [[2.63, .125], [3.08, .116], [3.55, .117], [3.98, .116],
    [4.81, .137], [5.58, .117], [6.00, .119]]) {
    P.add('gun', KIT.torus(r, .003, 24, 5), 0, 0, z - trunnion[2], Math.PI / 2);
  }
  const muzzle = 6.8120532, boreR = .0804, floor = 6.24935;
  P.add('gun', new THREE.RingGeometry(boreR, .1017, 40), 0, 0, muzzle - trunnion[2]);
  // Descending longitudinal profile gives the actual inward-facing wall.
  const inner = new THREE.LatheGeometry([
    new THREE.Vector2(boreR, muzzle - trunnion[2]),
    new THREE.Vector2(boreR, floor - trunnion[2]),
  ], 40).rotateX(Math.PI / 2);
  P.add('gunDark', inner);
  P.add('gunDark', KIT.cylZ(boreR, .003, 40), 0, 0, floor - .0015 - trunnion[2]);
  P.muzzleZ = muzzle - trunnion[2];
}
