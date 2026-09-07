// Original planar carriage and linkage solids from gun_barrel_44 scalar
// planes. The fixed shield pitches with the cradle, never with recoil.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];

function top(z: number): number {
  if (z < .33654484) return (1.246359731 + .701201258 * z) / .712963391;
  if (z <= .67097479) return 2.079132557;
  if (z < .672374785) return (.702416408 - .999885087 * z) / .015159553;
  if (z <= .921454728) return (1.781737004 + .227493650 * z) / .973779564;
  return (2.225171924 - .292839106 * z) / .956161732;
}

function bottom(z: number): number {
  if (z < .431254864) return (1.669381314 - .445604432 * z) / .895229965;
  if (z < .523875) return (1.313530825 - .811858821 * z) / .583853796;
  if (z < .673774958) return (1.509774944 + .021343069 * z) / .999772211;
  if (z < .789714873) return (1.002471917 + .487592510 * z) / .873071328;
  if (z < .794604838) return (.998677591 * z - .706965825) / .051410780;
  return (1.675663067 + .010676287 * z) / .999943007;
}

function shield(pivot: Point): THREE.BufferGeometry {
  const stations = [.195314884, .33654484, .431254864, .523875, .67097479,
    .672374785, .673774958, .789714873, .794604838, .921454728, 1.21048470];
  const geometry = sectionSolid(stations.map(z => ({ z,
    ring: [[-.276129, bottom(z)], [-.239639, bottom(z)],
      [-.239639, top(z)], [-.276129, top(z)]],
  })));
  return geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
}

export function addChieftain10XGunCarriage(P: TankBuilderPort, pivot: Point): void {
  P.add('gunMount', shield(pivot));
  // Small source breech-end closure belongs to the recoiling breech. The
  // extra concealed millimetre is a positive joint to its existing floor.
  P.add('gun', KIT.box(.123800, .153450, .077690),
    -.004299 - pivot[0], 1.68699765 - pivot[1], .329429856 - pivot[2]);
  P.add('gunMount', KIT.box(.035200, .0352199, .640780),
    .096531 - pivot[0], 2.15492260 - pivot[1], 1.66624469 - pivot[2]);
  P.add('gunMount', KIT.cylZ(.01657, .15772, 24),
    .096201 - pivot[0], 2.154788 - pivot[1], 2.04999477 - pivot[2]);
}
