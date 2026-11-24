// Kevin B. Liu — compact elevation cradle for the M6 modernization, and (276) its GAU-12/U rotary cannon.
import * as THREE from 'three';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {latheY} from '../accessoryPrimitives.ts';
import {GUN_ROTOR_KEY, type GunRotorTag} from '../gunRotorSpin.ts';
import {LINEBACKER_ROTARY as G, LINEBACKER_MUZZLE, LINEBACKER_MUZZLE_MOUTH} from '../m6LinebackerLayout.ts';

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
  // the journals; the hollow center leaves the rotor's breeches unobstructed.
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

/**
 * 276 (Kevin 2026-11-23: "make the m6 linebackers gun a minigun so its an evolution from the m163"): the GAU-12/U's
 * turning parts (gun-local, native frame; m6LinebackerLayout.ts LINEBACKER_ROTARY). In the 'gun' and 'gunDark' buckets,
 * which carry only the rotor on this build: the five barrels, each bored at its muzzle, the rotor's front ring ahead of
 * the receiver's sleeve, the mid and muzzle clamps with a bolt boss between each pair of barrels, the centre tie from
 * inside the sleeve to the muzzle clamp and the spindle on to the mouth. The stationary sleeve and receiver stay on the
 * cradle (linebackerGunMount).
 */
export function linebackerRotaryGun(P: TankBuilderPort): void {
  const {box, cylZ, xform} = KIT;
  const n = P.q ? 28 : 18, seg = P.q ? 12 : 8;
  for (let k = 0; k < G.barrels; k++) {
    const a = (k / G.barrels) * Math.PI * 2;
    const tube = latheY([[.0005, G.barrelRearZ], [G.barrelRearR, G.barrelRearZ], [G.barrelR, G.barrelTipZ],
      [G.boreR, G.barrelTipZ], [G.boreR, G.barrelTipZ - G.boreDepth], [.0005, G.barrelTipZ - G.boreDepth]], seg);
    P.add('gun', xform(tube, 0, 0, 0, Math.PI / 2, 0, 0), Math.sin(a) * G.pitchR, Math.cos(a) * G.pitchR, 0);
  }
  for (const [r, [z0, z1]] of [[G.collarR, G.collarZ], [G.midClampR, G.midClampZ], [G.muzzleClampR, G.muzzleClampZ]] as const) {
    P.add('gunDark', cylZ(r, z1 - z0, n), 0, 0, (z0 + z1) / 2);
  }
  // the clamps' bolt bosses, one between each pair of barrels
  for (let k = 0; k < G.barrels; k++) {
    const a = ((k + .5) / G.barrels) * Math.PI * 2;
    for (const [r, [z0, z1]] of [[G.midClampR, G.midClampZ], [G.muzzleClampR, G.muzzleClampZ]] as const) {
      P.add('gunDark', xform(box(.02, .016, z1 - z0 - .012), 0, 0, 0, 0, 0, -a),
        Math.sin(a) * (r + .005), Math.cos(a) * (r + .005), (z0 + z1) / 2);
    }
  }
  // the centre tie (it keeps the fire axis one line through the sleeve, gun-junction census) and the spindle to the mouth
  const tie1 = G.muzzleClampZ[0] + .01;
  P.add('gunDark', cylZ(G.tieR, tie1 - G.tieZ0, 8), 0, 0, (G.tieZ0 + tie1) / 2);
  const hub0 = G.muzzleClampZ[1] - .005;
  P.add('gunDark', cylZ(G.hubR, LINEBACKER_MUZZLE - hub0, P.q ? 14 : 10), 0, 0, (LINEBACKER_MUZZLE + hub0) / 2);
  P.muzzleZ = LINEBACKER_MUZZLE;
  P.muzzleMouth = {...LINEBACKER_MUZZLE_MOUTH};
}

/**
 * The rotor group about the bore (recoil-local +z), tagged for the spin owner the M163 uses (gunRotorSpin.ts): after the
 * merge the 'gun' and 'gunDark' meshes move into it at its identity frame, so every receipt reads them where drawn.
 */
export function linebackerRotor(P: TankBuilderPort): void {
  const rotor = new THREE.Group();
  rotor.name = 'm6_gau12_rotor';
  const tag: GunRotorTag = Object.freeze({barrels: G.barrels, cycleS: P.spec.gun.autoloader?.intraClipS ?? P.spec.gun.reloadS});
  rotor.userData[GUN_ROTOR_KEY] = tag;
  rotor.userData.weaponName = 'GAU-12/U 25 mm rotor';
  rotor.userData.caliberMm = 25;
  P.recoilG.add(rotor);
  const previous = P.postAssemble;
  P.postAssemble = (rig) => {
    previous?.(rig);
    for (const child of [...rig.recoilG.children]) {
      if (child === rotor) continue;
      if (child instanceof THREE.Mesh && (child.name === 'gun' || child.name === 'gunDark')) rotor.add(child);
    }
    if (!rotor.children.some((child) => child.name === 'gun')) throw new Error('m6_linebacker: the GAU-12\'s barrels must ride its rotor');
  };
}
