// The Ukrainian-service 2A4's Kontakt-1 (leo2a4_v, release 265): the 4S20 containers of leopard2A4Kontakt1.ts's courses,
// laid as gameplay ERA fields (each container is external armour of its course's plate, spent and reset with it). Turret
// courses in turret metres from the ring, the skirt courses in hull metres.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { eraField, type CassetteSeat } from './leopard2A4KitParts.ts';
import { LEO2A4_TURRET } from '../leopard2A4FamilyArmor.ts';
import {
  KONTAKT1_BRICK as B, LEO2A4V_KONTAKT1, SKIRT_FACE_X, bevelTopZAt, faceZAt, wallX, type Kontakt1Course,
} from '../leopard2A4Kontakt1.ts';

const T = LEO2A4_TURRET;
/** The eraCluster's base cassette (tankFactoryCore eraCluster): a seat's scale is over these. */
const ERA_BASE = [0.28, 0.13, 0.07] as const;
const TAN_SWEEP = Math.tan(T.faceSweepDeg * Math.PI / 180);
const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A container w x h centred on a surface point with outward normal n and in-plane x axis ax, bolted `lift` off it. */
function seat(at: THREE.Vector3, ax: THREE.Vector3, n: THREE.Vector3, w: number, h: number): CassetteSeat {
  n = n.clone().normalize();
  ax = ax.clone().addScaledVector(n, -ax.dot(n)).normalize();
  const ay = n.clone().cross(ax).normalize();
  return {
    center: at.clone().addScaledVector(n, B.lift + B.t / 2),
    rotation: new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ax, ay, n)),
    scale: [w / ERA_BASE[0], h / ERA_BASE[1], B.t / ERA_BASE[2]],
  };
}

function courseSeats(c: Kontakt1Course): CassetteSeat[] {
  const s = c.sx, [w, h] = c.upright ? [B.short, B.long] : [B.long, B.short];
  return c.seats.map(([u, v]) => {
    switch (c.surface) {
      case 'face':
        return seat(v3(s * u, v, faceZAt(u)), v3(s, 0, -TAN_SWEEP), v3(s * TAN_SWEEP, 0, 1), w, h);
      case 'bevel': {
        // the bevel's middle at |x|, from the faces' top (0.61) up to the block's top (0.74), 40 degrees off the level
        const at = v3(s * u, (T.faceTopY + T.blockTopY) / 2, (faceZAt(u) + bevelTopZAt(u)) / 2);
        return seat(at, v3(s, 0, 0), v3(0, Math.cos(40 * Math.PI / 180), Math.sin(40 * Math.PI / 180)), w, h);
      }
      case 'wall':
        return seat(v3(s * wallX(s), v, u), v3(0, 0, 1), v3(s, 0, 0), w, h);
      default:
        return seat(v3(s * SKIRT_FACE_X, v, u), v3(0, 0, 1), v3(s, 0, 0), w, h);
    }
  });
}

/** The Kontakt-1 courses on the cheeks, the bevel, the walls and the fore skirt blocks. */
export function addLeo2A4Kontakt1(P: TankBuilderPort): void {
  for (const c of LEO2A4V_KONTAKT1) eraField(P, c.name, courseSeats(c), c.rig === 'turret');
}
