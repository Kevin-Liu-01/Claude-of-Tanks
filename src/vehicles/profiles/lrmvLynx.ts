// Early Italian LRMV delivery: KF41 chassis with the Lance 30 mm turret.
// It is not Puma-derived, and the later Hitfist configuration is a different target.
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { armorLoft, turretEquipment, optic, antenna, openTube, smokeBank, mirrorX } from './europeSourcePrimitives.ts';
import { buildKf41Chassis } from './kf41LynxSourceX.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylY,cylZ}=KIT;

export function buildLrmvLynx(P: TankBuilderPort): void {
  buildKf41Chassis(P);
  const [px,py,pz]=P.spec.armor.turretPivot;
  P.turretG.position.set(px,py,pz);
  P.add('turret',cylY(1.02,1.06,.07,40),0,.025,0);
  P.add('turret',armorLoft([
    [-1.84,.88,1.12,1.00,2.53,2.68,3.02],
    [-1.35,1.09,1.31,1.13,2.34,2.56,3.07],
    [.43,1.14,1.38,1.13,2.34,2.53,3.07],
    [.73,1.03,1.30,1.04,2.36,2.55,3.03],
  ],py,pz));
  for (const side of [-1,1]) {
    // Deep paired faceted cheeks frame the rocking cannon cradle.
    const cheek=sectionSolid([
      {z:.43-pz,ring:[[.35,2.37-py],[1.38,2.53-py],[1.13,3.07-py],[.35,3.07-py]]},
      {z:1.47-pz,ring:[[.35,2.46-py],[1.10,2.57-py],[.91,2.94-py],[.35,2.94-py]]},
    ]);
    P.add('turret',side<0?mirrorX(cheek):cheek);
    P.addHatch('turret',box(.65,.045,.69),side*.49,3.10-py,-.06-pz);
    for (const dx of [-.21,0,.21]) KIT.periscope(P,'turretDetail',side*.49+dx,3.13-py,.31-pz);
    for (const z of [-1.18,-.76,-.34,.08]) turretEquipment(P,'turretDetail',box(.018,.042,.095),side*1.305,2.73,z);
    smokeBank(P,side,1.19,2.78,-1.22,4);
    antenna(P,side*.94,3.04,5.50,-1.40);
  }
  optic(P,.68,2.88,1.36,.32,.27,.24);
  optic(P,-.66,2.89,1.35,.23,.22,.22);
  turretEquipment(P,'turretDetail',cylY(.22,.25,.10,24),.63,3.12,-.85);
  turretEquipment(P,'turretDetail',cylY(.19,.19,.27,16),.63,3.30,-.85);
  optic(P,.63,3.43,-.78,.40,.32,.37);
  // Long ventilated Lance shroud belongs to the gun rig. The relief strips
  // are recessed inserts on an enclosed structural casing, not open armor holes.
  P.addGunExtra(sectionSolid([
    {z:-.22,ring:[[-.29,-.20],[.29,-.20],[.29,.39],[-.29,.39]]},
    {z:.46,ring:[[-.26,-.15],[.26,-.15],[.25,.39],[-.25,.39]]},
    {z:2.74,ring:[[-.105,-.09],[.105,-.09],[.105,.12],[-.105,.12]]},
    {z:3.00,ring:[[-.075,-.07],[.075,-.07],[.075,.08],[-.075,.08]]},
  ]));
  for (const side of [-1,1]) for (let i=0;i<7;i++) {
    const z=.58+i*.29, x=side*(.25-(z-.46)*.145/2.28+.002);
    P.addGunExtraDark(box(.008,.07,.16).rotateY(side*.063),x,.09,z);
  }
  openTube(P,.064,2.93,3.50,.015);
  P.addGunExtraDark(cylZ(.02,.45,12),-.34,.02,.32);
  P.topY=3.62-py;
  P.additionalShadowSources={hull:['hullExternalArmor','hullHatch'],turret:['turretHatch']};
}
