// Source-specific first-party smoke fixtures: each bank has a different fan,
// and the upper left pair actually points slightly inboard. Source files are
// local measurement oracles only; no source geometry is used here.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Tube = readonly [number,number,number,number,number,number,number];
const TUBES: readonly Tube[] = [
  [-1.45027,1.84172,-.15405,-.41205,.31231,.85597,.28515],
  [-1.32540,1.84969,-.07383,-.35024,.32314,.87915,.28591],
  [-1.43835,2.03497,-.10306,-.23640,.33875,.91070,.28697],
  [-1.30111,2.03363,-.06856,-.18737,.34400,.92009,.28731],
  [-1.11129,2.15607,.11659,.07119,.28733,.95518,.28851],
  [-.97812,2.15727,.09816,.11299,.28822,.95087,.28838],
  [1.52935,1.70682,-.05386,.45380,.27500,.84761,.28490],
  [1.38384,1.71193,.02492,.42005,.27796,.86388,.28539],
  [1.53655,1.86878,.01157,.31669,.28478,.90477,.28676],
  [1.38859,1.87773,.06723,.27616,.28653,.91741,.28719],
  [1.48007,2.03945,.09930,.11304,.28815,.95089,.28839],
  [1.31951,2.04009,.10009,-.02878,.28800,.95720,.28860],
];

function tube(P: TankBuilderPort,values: Tube): void {
  const [x,y,z,dx,dy,dz,length]=values;
  const direction=new THREE.Vector3(dx,dy,dz).normalize();
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
  const place=(slot: string,g: THREE.BufferGeometry,along: number,below=0): void=>{
    const p=new THREE.Vector3(x,y,z).addScaledVector(direction,along)
      .add(new THREE.Vector3(0,-below,0).applyQuaternion(q));
    P.addEquipment(slot,g.applyQuaternion(q),p.x-.010,p.y-1.468,p.z+.0039);
  };
  place('turretDark',KIT.cylZ(.046,length-.014,16),-.007);
  place('turretDetail',KIT.cylZ(.0465,.014,16),length*.5-.007);
  // A shallow carrier cradles the underside. Its axis follows its own tube,
  // instead of projecting every upper mount outboard at the lower bank angle.
  place('turretDetail',KIT.box(.088,.031,.219),-.027,.044);
}

export function addT90ASmokeTubes(P: TankBuilderPort): void {
  for(const values of TUBES) tube(P,values);
}
