// Owner-directed Polish armor packages. Solid cassettes are external armor;
// cage bars retain real gaps and never create a solid damage proxy.
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Port=Pick<TankBuilderPort,'addEquipment'|'addExternalArmor'|'hullG'>;
import {escortKitRing,type EscortFieldKit} from '../escortFieldKitLayout.ts';
const {box,cylX}=KIT;

export function addEscortFieldKit(P:Port,c:EscortFieldKit):void {
  const step=(c.front-c.rear)/c.panels;
  for(const side of [-1,1]){
    // A continuous upper return joins the modules to the existing fender.
    P.addEquipment('hullDetail',box(c.outer-c.inner,.06,c.front-c.rear),side*(c.outer+c.inner)/2,c.top-.03,(c.front+c.rear)/2);
    for(let i=0;i<c.panels;i++){
      const z=c.rear+(i+.5)*step;
      const mirrored=escortKitRing(c,side);
      P.addExternalArmor('hull',sectionSolid([{z:z-step*.485,ring:mirrored},{z:z+step*.485,ring:mirrored}]));
      for(const dz of [-step*.34,step*.34]){
        P.addEquipment('hullDetail',box(.04,.08,.13),side*(c.outer+.012),c.top-.14,z+dz);
        P.addEquipment('hullDark',cylX(.018,.025,8),side*(c.outer+.041),c.top-.14,z+dz);
      }
      P.addEquipment('hullRubber',box(.027,.17,step*.94),side*(c.outer-.026),c.hem-.065,z);
    }
    const cageX=c.outer+.19,cageTop=c.hem+.13,cageBottom=.42;
    for(let i=0;i<=c.panels;i++){
      const z=c.rear+i*step;
      P.addEquipment('hullDetail',box(.23,.045,.06),side*(c.outer+.09),cageTop-.02,z);
      P.addEquipment('hullOpenLattice',box(.027,cageTop-cageBottom,.03),side*cageX,(cageTop+cageBottom)/2,z);
    }
    const rows=Math.ceil((cageTop-cageBottom)/.09);
    for(let i=0;i<=rows;i++){
      const y=cageBottom+i*(cageTop-cageBottom)/rows;
      P.addEquipment('hullOpenLattice',box(.026,.023,c.front-c.rear),side*cageX,y,(c.front+c.rear)/2);
      for(const z of [c.front,c.rear])P.addEquipment('hullOpenLattice',box(.20,.023,.026),side*(c.outer+.10),y,z);
    }
  }
  // Folded rear screen with load-bearing stays to the two side carriers.
  const rear=c.rear-.22,width=c.outer*2;
  for(let i=0;i<=8;i++)P.addEquipment('hullOpenLattice',box(width,.023,.027),0,.48+i*(c.hem-.35)/8,rear);
  for(let i=0;i<=12;i++){
    const x=-c.outer+i*width/12;
    P.addEquipment('hullOpenLattice',box(.025,c.hem-.30,.028),x,(c.hem+.66)/2,rear);
  }
  for(const side of [-1,1])P.addEquipment('hullDetail',box(.07,.06,.30),side*(c.outer-.06),c.hem+.10,c.rear-.10);
  P.hullG.userData.escortArmorKit={...c,openCages:true};
}
