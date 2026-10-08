// Kevin B. Liu — compact M242 elevation cradle for the M6 modernization.
import * as THREE from 'three';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';

/** The shield is a finite raked plate with open gun and coax channels. Its
 * clipped shoulders sit between the Bradley cheeks instead of covering them. */
function shield(segments: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-.275, -.248);
  shape.lineTo(.275, -.248);
  shape.lineTo(.344, -.178);
  shape.lineTo(.344, .162);
  shape.lineTo(.266, .267);
  shape.lineTo(-.266, .267);
  shape.lineTo(-.344, .162);
  shape.lineTo(-.344, -.178);
  shape.closePath();
  for (const [x, y, radius] of [[0, 0, .153], [.255, -.09, .030]]) {
    const hole = new THREE.Path();
    hole.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 1, steps: 1, bevelEnabled: false, curveSegments: segments / 2,
  });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const front = .31 - .30 * p.getY(i);
    p.setZ(i, THREE.MathUtils.lerp(front - .085, front, p.getZ(i)));
  }
  g.computeVertexNormals();
  return g;
}

export function linebackerGunMount(P: TankBuilderPort): void {
  const n = P.q ? 32 : 20;
  // The rotary receiver has a genuine curved back. Separate end plates carry
  // the journals; the hollow center leaves the M242 recoil tube unobstructed.
  const rotor = new THREE.Shape();
  rotor.absarc(0, 0, .272, Math.PI / 2, Math.PI * 1.5, false);
  rotor.lineTo(0, -.228);
  rotor.absarc(0, 0, .228, Math.PI * 1.5, Math.PI / 2, true);
  rotor.closePath();
  P.addGunExtra(new THREE.ExtrudeGeometry(rotor, {
    depth: .65, steps: 1, bevelEnabled: false, curveSegments: n / 2,
  }).rotateY(-Math.PI / 2), .325, 0, 0);
  P.addGunExtra(shield(n));
  // Joined top and chin stock close the receiver itself; the only open space
  // outside the casing is the mechanical clearance to the stationary roof.
  P.addGunExtra(sectionSolid([
    {z:-.012,ring:[[-.32,.23],[.32,.23],[.32,.259],[.27,.272],[-.27,.272],[-.32,.259]]},
    {z:.18,ring:[[-.32,.16],[.32,.16],[.32,.192],[.262,.267],[-.262,.267],[-.32,.192]]},
  ]));
  P.addGunExtra(sectionSolid([
    {z:-.012,ring:[[-.32,-.272],[.32,-.272],[.32,-.230],[-.32,-.230]]},
    {z:.12,ring:[[-.32,-.26],[.32,-.26],[.32,-.22],[-.32,-.22]]},
    {z:.325,ring:[[-.27,-.248],[.27,-.248],[.27,-.205],[-.27,-.205]]},
  ]));
  for (const side of [-1, 1]) {
    const end = new THREE.Shape();
    end.moveTo(.358, -.16);
    end.lineTo(.255, .184);
    end.lineTo(.05, .267);
    end.lineTo(0, .272);
    end.absarc(0, 0, .272, Math.PI / 2, Math.PI * 1.5, false);
    end.lineTo(.22, -.248);
    end.closePath();
    P.addGunExtra(new THREE.ExtrudeGeometry(end, {
      depth: .024, steps: 1, bevelEnabled: false, curveSegments: n / 2,
    }).rotateY(-Math.PI / 2), side < 0 ? -.320 : .344, 0, 0);
    // Short journals engage the annular bearings without entering the solid
    // cheek behind them. The side casting stays inboard of the bearing face.
    P.addGunExtra(KIT.cylX(.145, .040, n), side * .344, 0, 0);
    // Recessed bolts and small lifting eyes belong to the pitching shield.
    for (const y of [-.17, .12]) {
      const z = .31 - .30 * y;
      P.addGunExtraDark(KIT.cylZ(.019, .008, 12), side * .294, y, z + .003);
      P.addGunExtra(KIT.cylZ(.012, .012, 6), side * .294, y, z + .007);
    }
    const x = side * .213;
    for (const z of [.15, .225]) P.addGunExtra(KIT.box(.036, .046, .028), x, .268, z);
    P.addGunExtra(KIT.box(.036, .023, .103), x, .302, .1875);
  }
  // Concentric stepped sleeve surrounds, rather than caps, the recoiling
  // receiver. The outer lip keys into the shield's circular opening.
  const profile = [[.098, -.17], [.149, -.17], [.149, .34], [.170, .34],
    [.170, .39], [.135, .44], [.119, .54], [.098, .54], [.098, -.17]];
  P.addGunExtra(new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), n)
    .rotateX(Math.PI / 2));
  P.addGunExtraDark(KIT.cylZ(.017, .31, P.q ? 16 : 10), .255, -.09, .24);
}
