// The Strv 103 family's crew roof (274): the commander's cupola on its race, the gunner-driver's sight, the dome, the
// periscopes, the radio operator's hatch, the crew guns and the concept marks' remote stations and sight heads.
// First-party: Kevin B. Liu (NOTICE.md).

import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { Strv103Mark } from './strv103Frame.ts';

/** The commander's cupola (right) on its machined race with bolt circle, the gunner-driver's sight (left), the
 * observation dome and periscopes: the crew roof every mark keeps. The concept replaces both sight heads. */
export function crewRoof(P: TankBuilderPort, mark: Strv103Mark): void {
  const { box, cylY, torus, sph, periscope } = KIT;
  const race = (rIn: number, rOut: number, h: number): THREE.BufferGeometry => {
    const c = Math.min(0.005, (rOut - rIn) * 0.3);
    return new THREE.LatheGeometry([[rIn, 0], [rOut, 0], [rOut, h - c], [rOut - c, h], [rIn + c, h], [rIn, h - c], [rIn, 0]]
      .map(([r, y]) => new THREE.Vector2(r, y)), P.q ? 28 : 16);
  };
  P.add('hull', box(0.84, 0.10, 1.10), 0.46, 1.90, -0.62);                           // commander's plinth (right)
  P.add('hull', cylY(0.26, 0.28, 0.11, 16), 0.28, 1.93, -0.40);                      // cupola
  P.add('hull', cylY(0.145, 0.145, 0.085, 14), 0.28, 2.025, -0.40);                  // its crown at the 2.16 cap
  P.add('hullDark', race(0.232, 0.272, 0.014), 0.28, 1.985, -0.40);
  P.add('hullDark', race(0.128, 0.156, 0.012), 0.28, 2.0675, -0.40);
  for (let k = 0; k < 4; k++) {
    const a = 0.4 + k * Math.PI / 2;
    P.add('hullDetail', box(0.03, 0.045, 0.05), 0.28 + Math.cos(a) * 0.275, 1.968, -0.40 + Math.sin(a) * 0.275, 0, -a, 0);
  }
  for (let k = 0; k < 8; k++) {                                                       // the cupola's vision blocks
    const a = k * Math.PI / 4 + Math.PI / 8;
    P.add('hullGlass', box(0.07, 0.03, 0.01), 0.28 + Math.cos(a) * 0.272, 1.95, -0.40 + Math.sin(a) * 0.272, 0, -a + Math.PI / 2, 0);
  }
  if (mark === 'e') {
    // the remote 12.7 mm station on the cupola's race, worked from inside
    const rws = FITTINGS.americanRws({ mats: P.mats, scale: 0.72, seed: 10391 });
    rws.name = 'strv103eRemoteStation';
    mount(P, 'hull', rws, 0.28, 2.07, -0.40);
  } else if (mark === 'x') {
    // the 152's own station (owner 2026-11-20: "a different remote gun station"): an open-yoke 12.7 mm with its
    // sensor head on a compact tower on the cupola's race
    const rws = FITTINGS.openYokeRws({
      mats: P.mats, bodySlot: 'hull', sizeStandard: 'k2b-compact-tower', scale: 0.70, towerRise: 0.06,
      sensorHead: true, sensorMount: 'roof', weapon: true, caliberMm: 12.7, cls: 'm2',
      weaponName: 'Strv 152 remote weapon station', seed: 10392,
    });
    rws.name = 'strv152RemoteStation';
    mount(P, 'hull', rws, 0.28, 2.07, -0.40);
  } else {
    // the commander's hatch lid closed on the cupola crown, its hinge and grab handle (owner 2026-11-20: "hatches")
    P.add('hull', cylY(0.125, 0.13, 0.025, 16), 0.28, 2.0825, -0.40);
    P.add('hullDark', box(0.10, 0.03, 0.04), 0.28, 2.085, -0.54);
    P.add('hullDetail', box(0.08, 0.015, 0.015), 0.28, 2.10, -0.32);
    // VH.14 (every drawn gun works): the commander's Ksp 58 on the cupola race
    const commanderMg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 1.0,
      elev: 0.04, shield: 'low', ammo: true, seed: mark === 'a' ? 10430 : 10320, working: true, ridingCradle: true,
    });
    commanderMg.name = 'strv103CommanderKsp58';                                       // each roof station its own name
    mount(P, 'hull', commanderMg, 0.40, 1.999, -0.24, [0, 0.05, 0]);
  }
  P.add('hull', sph(0.155, 14, Math.PI / 2), -0.52, 1.87, -0.30);                   // observation dome (left)
  P.add('hullDark', torus(0.14, 0.012, 12), -0.52, 1.925, -0.30);
  if (mark !== 'x') {                                                                // (the 152's breech hump stands there)
    periscope(P, 'hullDetail', 0.24, 1.80, 0.30);
    periscope(P, 'hullDetail', -0.34, 1.80, 0.44);
  }
  // the radio operator's rear-facing hatch behind the gunner-driver
  P.add('hull', cylY(0.27, 0.28, 0.05, 16), -0.58, 1.905, -1.62);
  P.add('hullDark', torus(0.255, 0.012, 16), -0.58, 1.93, -1.62);
  P.add('hullDetail', box(0.08, 0.04, 0.16), -0.58, 1.945, -1.36);                   // its hinge
  if (mark === 'b' || mark === 'x') {
    // owner 2026-11-20 ("make the 103 b have 2 crew machine guns"; the 152's "crew machine guns"): the radio operator's
    // Ksp 58 on a pintle at his hatch's race, a working station like the commander's
    const radioMg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 1.0, elev: 0.04, shield: false, ammo: true,
      seed: mark === 'b' ? 10321 : 10393, working: true, ridingCradle: true,
    });
    radioMg.name = 'strv103RadioOperatorKsp58';
    mount(P, 'hull', radioMg, -0.58, 1.93, -1.62, [0, Math.PI, 0]);
  }
  if (mark === 'x') {
    // and a second crew pintle on its ring at the right rear of the roof, trained aft
    P.add('hull', cylY(0.17, 0.18, 0.04, 14), 0.72, 1.90, -1.30);
    P.add('hullDark', torus(0.165, 0.010, 14), 0.72, 1.922, -1.30);
    const rearMg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', tone: 'two-tone', scale: 1.0, elev: 0.04, shield: false, ammo: true,
      seed: 10394, working: true, ridingCradle: true,
    });
    rearMg.name = 'strv152RearKsp58';
    mount(P, 'hull', rearMg, 0.72, 1.92, -1.30, [0, Math.PI, 0]);
  }
  if (mark === 'e' || mark === 'x') {
    // the raised gunner's day/thermal head with its laser window (the 103C rangefinder carried into a modern head)
    P.addEquipment('hull', box(0.46, 0.04, 0.50), -0.66, 1.90, -0.98);
    P.addEquipment('hull', box(0.40, 0.30, 0.44), -0.66, 2.07, -0.98);
    P.add('hullGlass', box(0.26, 0.12, 0.008), -0.72, 2.09, -0.756);
    P.add('hullGlass', box(0.07, 0.07, 0.008), -0.50, 2.09, -0.756);
    P.add('hullDark', box(0.43, 0.025, 0.10), -0.66, 2.232, -0.80);                  // sun hood
    // the commander's stabilised panoramic head on its mast over the plinth
    P.addEquipment('hull', cylY(0.16, 0.17, 0.04, P.q ? 20 : 12), 0.66, 1.97, -0.98);
    P.addEquipment('hull', cylY(0.065, 0.075, 0.26, P.q ? 14 : 10), 0.66, 2.12, -0.98);
    P.addEquipment('hull', cylY(0.15, 0.15, 0.22, P.q ? 20 : 14), 0.66, 2.36, -0.98);
    for (const dx of [-0.055, 0.055]) P.add('hullGlass', box(0.09, 0.09, 0.008), 0.66 + dx, 2.37, -0.98 + 0.147);
    P.addEquipment('hull', cylY(0.165, 0.16, 0.03, P.q ? 20 : 14), 0.66, 2.485, -0.98);
  } else {
    P.addEquipment('hull', box(0.36, 0.26, 0.40), 0.62, 2.02, -0.94);                // commander's sight head
    P.add('hullDark', box(0.32, 0.02, 0.36), 0.62, 2.15, -0.94);
    P.add('hullGlass', box(0.20, 0.075, 0.022), 0.62, 2.06, -0.73);
    P.addEquipment('hull', box(0.34, 0.14, 0.36), -0.66, 1.92, -0.98);               // gunner-driver's sight box
    P.add('hullGlass', box(0.16, 0.08, 0.022), -0.66, 1.96, -0.79);
  }
}
