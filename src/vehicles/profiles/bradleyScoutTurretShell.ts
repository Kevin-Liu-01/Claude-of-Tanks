// Kevin B. Liu — owner-requested M3A3 base redesign, October 2026.
// Authored in the A3's existing pre-compression frame; the caller preserves its
// roof equipment and 0.80 vertical conversion. No M2A3 UA geometry is changed.
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {armorLoft} from './europeSourcePrimitives.ts';
import {sectionSolid} from './sectionSolid.ts';

type PlaceEra = (...transform: number[]) => void;

/** Seat each cassette on the real sloped cheek after the A3's height conversion. */
export function placeBradleyScoutCheekEra(side: number, put: PlaceEra): void {
  for (const fraction of [.18,.55]) for (const z of [.60,.79,.98]) {
    const t = (z-.48)/.60;
    const shoulder = .96-.26*t, roof = .71-.21*t, crown = .69-.12*t;
    const point = new THREE.Vector3(side*(shoulder+(roof-shoulder)*fraction)-.06,
      (.31+(crown-.31)*fraction)*.80,z);
    const along = new THREE.Vector3(side*(-.26+.05*fraction),-.096*fraction,.60);
    const up = new THREE.Vector3(side*(-.25+.05*t),(.38-.12*t)*.80,0);
    const normal = along.cross(up).multiplyScalar(-side).normalize();
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion()
      .setFromUnitVectors(new THREE.Vector3(0,0,1),normal));
    point.addScaledVector(normal,.07*1.05/2-.005);
    put(point.x,1.895+point.y,-.36+point.z,rotation.x,rotation.y,rotation.z,.72,.92*.80,1.05);
  }
}

export function buildBradleyScoutTurretShell(P: TankBuilderPort): void {
  P.add('turret',armorLoft([
    [-1.30,.74,.93,.71,.09,.34,.65],
    [-1.05,.88,1.02,.78,.025,.35,.735],
    [-.09,.88,1.02,.75,.025,.35,.735],
  ]));
  for (const side of [-1,1]) {
    const rings=[[-.11,.34,.88,1.02,.75,.735],[.48,.34,.83,.96,.71,.69],
      [1.08,.34,.57,.70,.50,.57]];
    const cheek=sectionSolid(rings.map(([z,inner,belly,shoulder,roof,top])=>{
      const ring:[number,number][]=[[inner,.025],[belly,.025],[shoulder,.31],[roof,top],[inner,top]];
      // The M242 trunnion is 60 mm to the vehicle's left. Share its actual
      // offset with the bay rather than hiding a full solid slab behind it.
      const points=ring.map(([x,y]):[number,number]=>[side*x-.06,y]);
      return {z,ring:side<0?points.reverse():points};
    }));
    P.add('turret',cheek);
    // Welded cheek saddles carry the raised trunnion without lifting the
    // turret or changing its donor hull. Their roots overlap the cheek;
    // the center stays open for the rocking receiver and closed rear roof.
    P.add('turret',sectionSolid([
      {z:.56,top:.755},{z:.78,top:.820},{z:1.04,top:.705},
    ].map(({z,top})=>{
      const ring:[number,number][]=[[.34,.30],[.54,.30],[.50,top],[.34,top]];
      const points=ring.map(([x,y]):[number,number]=>[side*x-.06,y]);
      return {z,ring:side<0?points.reverse():points};
    })));
    P.add('turret',KIT.cylX(.18,.10,24),side*.34-.06,.615,.78);
    // Side cassettes are supported by the widened shoulder and terminate
    // behind the sloped cheek instead of protruding across the gun opening.
    P.addExternalArmor('turret',KIT.box(.07,.38,1.10),side*.993,.35,-.49,0,0,side*.06);
    for (const z of [-.88,-.45,-.02]) P.addEquipment('turretDetail',KIT.cylX(.022,.025,10),side*1.035,.40,z);
  }
  // Close the fighting-compartment roof between the cheeks. The leading
  // edge stops behind the rocking mask's complete -9/+30 degree sweep;
  // a thin, closed plate joins both shoulders and the rear roof bulkhead.
  P.add('turret',sectionSolid([
    {z:-.11,ring:[[-.42,.670],[.30,.670],[.30,.735],[-.42,.735]]},
    {z:.48,ring:[[-.42,.625],[.30,.625],[.30,.690],[-.42,.690]]},
    {z:.60,ring:[[-.42,.601],[.30,.601],[.30,.666],[-.42,.666]]},
  ]));
  P.add('turret',KIT.box(.72,.06,1.18),-.06,.025,.49);
  P.addEquipment('turretDark',KIT.box(.92,.016,.49),0,.75,-.67);
}
