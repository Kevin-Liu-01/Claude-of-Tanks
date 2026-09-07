// Photo-led operational roof weapon, not geometry claimed from the bare-yoke
// comparison OBJ. DVIDS 3912303 / VIRIN171012-A-KM000-001 shows this station.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Weapon=ReturnType<typeof sourceMachineGun>;
const X=-.3867,Y=2.765;

function receiver(mg:Weapon):void {
  mg.add('turretDark',KIT.box(.104,.095,.460),X,Y,.615);
  mg.add('turretDark',KIT.box(.100,.013,.385),X,Y+.050,.625);
  mg.add('turretDark',KIT.box(.078,.065,.066),X,Y-.009,.357);
  // Cross-pin engages the retained source yoke at its measured bearing axis.
  mg.add('turretDark',KIT.cylX(.024,.144,20),X,2.703,.648);
  mg.add('turretDark',KIT.box(.066,.026,.082),X,2.726,.648);
  for(const side of [-1,1]){
    mg.add('turretDark',KIT.box(.014,.016,.104),X+side*.055,Y-.013,.332);
    mg.add('turretDark',KIT.cylY(.011,.011,.077,14),X+side*.055,Y-.042,.286);
  }
  mg.add('turretDark',KIT.box(.044,.020,.091),X+.067,Y+.004,.584);
  mg.add('turretDark',KIT.box(.012,.054,.035),X+.091,Y-.013,.613);
  // A real narrow notch between the two rear-sight ears.
  for(const side of [-1,1])mg.add('turretDark',KIT.box(.010,.038,.018),X+side*.018,Y+.075,.479);
  mg.add('turretDark',KIT.box(.046,.009,.023),X,Y+.057,.479);
}

function barrel(mg:Weapon):void {
  const profile=[[0,.822],[.023,.822],[.023,1.09],[.0175,1.12],
    [.0175,1.78],[.024,1.79],[.024,1.837],[.00635,1.837],
    [.00635,1.61],[0,1.61]];
  const tube=new THREE.LatheGeometry(profile.map(([r,z])=>new THREE.Vector2(r,z)),32).rotateX(Math.PI/2);
  mg.add('turretDark',tube,X,Y,0);
  for(const z of [.852,1.120]){
    const ring=new THREE.LatheGeometry([[.024,-.006],[.037,-.006],[.037,.006],[.024,.006],[.024,-.006]]
      .map(([r,t])=>new THREE.Vector2(r,t)),32).rotateX(Math.PI/2);
    mg.add('turretDark',ring,X,Y,z);
  }
  mg.add('turretDark',KIT.box(.014,.047,.030),X,Y+.033,1.126);
}

function perforatedJacket(mg:Weapon):void {
  // Eight folded strips with actual round apertures; the inner barrel remains
  // visible through them. No opaque black dots pretending to be openings.
  for(let side=0;side<8;side++){
    const a=side*Math.PI/4,c=Math.cos(a),s=Math.sin(a);
    const shape=new THREE.Shape().moveTo(-.014,.858).lineTo(.014,.858)
      .lineTo(.014,1.115).lineTo(-.014,1.115).closePath();
    for(const z of [.890,.949,1.008,1.067]){
      const hole=new THREE.Path();hole.absarc(0,z,.0085,0,Math.PI*2,true);shape.holes.push(hole);
    }
    const g=new THREE.ExtrudeGeometry(shape,{depth:.003,steps:1,bevelEnabled:false,curveSegments:10});
    const matrix=new THREE.Matrix4().makeBasis(new THREE.Vector3(c,s,0),
      new THREE.Vector3(0,0,1),new THREE.Vector3(s,-c,0));
    g.applyMatrix4(matrix);g.translate(s*.033,-c*.033,0);
    mg.add('turretDark',g,X,Y,0);
  }
}

function ammunitionTray(mg:Weapon):void {
  // Receiver-to-box bridge and lower bent bearer make the load path visible.
  mg.add('turretDetail',KIT.box(.137,.025,.140),X-.104,Y-.058,.712);
  mg.add('turretDetail',KIT.box(.018,.142,.035),X-.164,Y-.037,.712);
  mg.add('turretDetail',KIT.box(.014,.110,.038),X-.066,Y-.048,.712);
  mg.add('turretDetail',KIT.box(.187,.144,.215),X-.170,Y+.010,.713);
  mg.add('turretDetail',KIT.box(.196,.012,.224),X-.170,Y+.085,.713);
  mg.add('turretDark',KIT.box(.035,.027,.081),X-.063,Y+.018,.712);
}

export function addK1A1XMachineGun(P:TankBuilderPort):void {
  const mg=sourceMachineGun(P,[0,1.49566,.42564]);
  receiver(mg);barrel(mg);perforatedJacket(mg);ammunitionTray(mg);
  const group=mg.finish();group.name='k1a1XPhotoRoofMachineGun';
  group.userData.reference='DVIDS3912303-photo-inferred-dimensions';
}
