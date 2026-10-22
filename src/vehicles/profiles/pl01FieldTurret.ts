import type { BufferGeometry, Group, Material } from 'three';
import { FITTINGS, KIT, orientedSlab } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

interface FieldTurretPort {
  readonly turretG: Group;
  readonly mats: Record<string, Material>;
  addEquipment(slot: string, geometry: BufferGeometry, ...transform: number[]): void;
}

/** PL-01 105 mission package, seated on its diamond shell. All brackets,
 * stores and open guards are equipment, never additional invisible armor. */
export function addPL01FieldTurret(P: FieldTurretPort, roofY: number,
  shellTopY: (x: number, z: number) => number | null): void {
  const { box, cylY, cylZ } = KIT;
  // Owner 2026-10-21 ("make the 4 lights on turret of pl01 105 oriented much better"): the white-light and IR drums
  // stood on posts over a crossmember that ran out past the cheek, square to the hull while the diamond's front
  // shoulders sweep back 31 degrees. Each lamp is now its own drum head on a cast pedestal seated on the swept
  // shoulder facet: the pedestal's foot follows the facet 12 mm deep, the head stands with its whole lens above the
  // roof line (a blind critic read the first, lower housings as lamps sunk into the armour), and the lens faces
  // forward toed out 8 degrees under a visor. The white lamp sits ahead and inboard, the IR lamp behind it and
  // outboard along the ridge, so neither blocks the other.
  const seatLamp = (s: number, x0: number, z0: number, white: boolean): void => {
    const yaw = s * .14, fx = Math.sin(yaw), fz = Math.cos(yaw);   // lens axis
    const w = .17, d = .17, head = .092, len = .20, r = .072;
    const at = (u: number, v: number): [number, number] => [s * x0 + fz * u + fx * v, z0 - fx * u + fz * v];
    const foot = (u: number, v: number): number => {
      const [x, z] = at(u, v), y = shellTopY(x, z);
      if (y == null) throw new Error(`PL-01 105 lamp foot (${x.toFixed(3)}, ${z.toFixed(3)}) is off the turret shell`);
      return y - .012;
    };
    const headY = roofY + head + .012, padTop = headY - head + .012;
    const ring = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]] as const;
    P.addEquipment('turretDetail', orientedSlab(
      ...ring.map(([u, v]) => [at(u, v)[0], foot(u, v), at(u, v)[1]]),
      ...ring.map(([u, v]) => [at(u, v)[0], padTop, at(u, v)[1]])));
    const [hx, hz] = at(0, .01);
    P.addEquipment('turretDetail', cylZ(head, len, 20), hx, headY, hz, 0, yaw, 0);
    const [fxp, fzp] = at(0, .01 + len / 2);
    P.addEquipment('turretDark', cylZ(r + .012, .012, 20), fxp + fx * .002, headY, fzp + fz * .002, 0, yaw, 0);
    const lens = cylZ(r, .016, 20);
    // Only the white lamp emits; the IR optic stays dark.
    P.addEquipment('turretGlass', white ? markVehicleNightLens(lens, 'headlight') : lens,
      fxp + fx * .006, headY, fzp + fz * .006, 0, yaw, 0);
    const [vx, vz] = at(0, .01 + len / 2 - .02);
    P.addEquipment('turretDark', box(2 * head + .03, .016, .10), vx, headY + head + .006, vz, 0, yaw, 0);
  };
  for (const s of [-1, 1]) {
    seatLamp(s, .64, 1.17, true);
    seatLamp(s, .86, .80, false);

    // Faceted side mission boxes hug the shoulder. Their lids carry extra
    // outward-firing smoke tubes; service handles and cooling slots face out.
    for (const z of [-.91,-.29])
      P.addEquipment('turretDetail', beamBetween([s*1.08,.35,z],[s*1.56,.35,z],.045));
    P.addEquipment('turretDetail', orientedSlab(
      [s*1.20,.28,-1.03],[s*1.61,.28,-1.03],[s*1.61,.28,-.18],[s*1.20,.28,-.18],
      [s*1.23,.61,-.95],[s*1.51,.61,-.95],[s*1.51,.61,-.26],[s*1.23,.61,-.26]));
    P.addEquipment('turretDark', box(.018,.19,.51),s*1.585,.405,-.60);
    for (let i=0;i<5;i++)
      P.addEquipment('turretDetail',box(.028,.016,.40),s*1.600,.34+i*.028,-.60);
    for (const z of [-.88,-.32])
      P.addEquipment('turretDark',box(.027,.045,.09),s*1.60,.49,z);
    const smoke=FITTINGS.smokeBank({mats:P.mats,count:4,r:.041,len:.25,
      splay:s*1.18,pitch:-.50,arc:.38,spacing:.095,seed:1090+s});
    smoke.name=`pl01_105_forward_smoke_${s}`;
    smoke.position.set(s*1.38,.612,-.58);
    P.turretG.add(smoke);

    // Cantilevered bustle baskets carry restrained soft stores. Horizontal
    // arms reach into the solid tail flank, with diagonal lower braces.
    const x=s*.98, z=-1.94;
    for (const dz of [-.26,.26]) {
      P.addEquipment('turretDetail',beamBetween([s*.64,.42,z+dz],[s*1.24,.42,z+dz],.035));
      P.addEquipment('turretDetail',beamBetween([s*.65,.22,z+dz],[s*1.22,.42,z+dz],.027));
    }
    P.addEquipment('turretDetail',box(.53,.035,.74),x,.43,z);
    for (const dx of [-.25,.25]) {
      for (const dz of [-.35,.35])
        P.addEquipment('turretDetail',box(.025,.31,.025),x+dx,.585,z+dz);
      for(const y of [.51,.73])P.addEquipment('turretDetail',box(.025,.025,.72),x+dx,y,z);
    }
    for(const dz of [-.35,.35])for(const y of [.51,.73])
      P.addEquipment('turretDetail',box(.52,.025,.025),x,y,z+dz);
    P.addEquipment('turretCloth',box(.41,.23,.58),x,.567,z);
    for (const dz of [-.18,.18])
      P.addEquipment('turretDark',box(.425,.239,.028),x,.567,z+dz);
    // Rear-facing cameras live in the basket corner guards, below the MG sweep.
    // 2026-10-19 (owner float sweep): the camera hung between the guard rails (17 mm clear); it sits on the lower rail.
    P.addEquipment('turretDetail',box(.15,.12,.105),x,.58,z-.36);
    P.addEquipment('turretGlass',cylZ(.039,.014,12),x,.58,z-.42);
  }

  // Low electronics/radio enclosure behind the weapon pedestal. A flat
  // screened lid, latched doors and cabling distinguish it from the soft stores.
  P.addEquipment('turretDetail',box(.54,.15,.29),0,roofY+.071,-1.68);
  P.addEquipment('turretDark',box(.46,.018,.22),0,roofY+.153,-1.68);
  for(let i=0;i<6;i++)
    P.addEquipment('turretDetail',box(.016,.022,.20),-.19+i*.076,roofY+.165,-1.68);
  for(const x of [-.18,.18]) {
    P.addEquipment('turretDark',box(.045,.06,.016),x,roofY+.067,-1.833);
    P.addEquipment('turretDark',beamBetween([x,roofY+.01,-1.62],[x,roofY+.05,-1.43],.021));
  }
  // Roof-mounted compact warning heads; the broad foot is on the real roof.
  for(const [x,z] of [[-.94,-.95],[.94,-1.04]]) {
    P.addEquipment('turretDetail',cylY(.075,.10,.075,12),x,roofY+.033,z);
    P.addEquipment('turretDetail',box(.18,.12,.16),x,roofY+.123,z);
    P.addEquipment('turretGlass',box(.135,.065,.014),x,roofY+.123,z+.087);
    P.addEquipment('turretDark',box(.205,.023,.19),x,roofY+.191,z);
  }
  P.turretG.userData.pl01FieldTurret = 'seated-cheek-lamps-side-pods-braced-bustle-r2';
}
