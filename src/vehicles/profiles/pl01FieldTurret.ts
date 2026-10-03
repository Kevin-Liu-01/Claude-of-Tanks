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
export function addPL01FieldTurret(P: FieldTurretPort, roofY: number): void {
  const { box, cylX, cylY, cylZ } = KIT;
  for (const s of [-1, 1]) {
    // A bolted cheek crossmember supports separate white-light and IR drums.
    // The inner feet enter the sloping casting; the outer lamps have real stays.
    P.addEquipment('turretDetail', box(.60,.065,.18), s*.86,.445,.85);
    for (const x of [.70,1.02]) {
      P.addEquipment('turretDetail', box(.045,.205,.085), s*x,.58,.85);
      P.addEquipment('turretDark', cylX(.032,.065,12), s*x,.66,.85);
      P.addEquipment('turretDetail', cylZ(.13,.19,20), s*x,.68,.88);
      const lens = cylZ(.103,.018,20);
      // Only the visible white-light drum emits. The adjacent IR optic stays dark.
      P.addEquipment('turretGlass', x<.8 ? markVehicleNightLens(lens,'headlight') : lens,
        s*x,.68,.982);
      P.addEquipment('turretDark', box(.26,.023,.27), s*x,.813,.89);
      for (const dx of [-.125,.125])
        P.addEquipment('turretDetail', box(.018,.25,.023), s*x+dx,.68,1.008);
    }

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
    P.addEquipment('turretDetail',box(.15,.12,.105),x,.63,z-.36);
    P.addEquipment('turretGlass',cylZ(.039,.014,12),x,.63,z-.42);
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
  P.turretG.userData.pl01FieldTurret = 'cheek-lamps-side-pods-braced-bustle-r1';
}
