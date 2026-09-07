// A5-only first-party fittings from fixed local-source scalar measurements.
// No source mesh connectivity, buffers, textures or loaders are used here.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';

type PlanPoint = readonly [x: number, z: number];

function addPart(P: TankBuilderPort, owner: 'hull' | 'turret', name: string,
  geometry: THREE.BufferGeometry): void {
  const parent = owner === 'hull' ? P.hullG : P.turretG;
  const mesh = new THREE.Mesh(geometry, P.mats.detail);
  mesh.name = `leo2a5_xSourceFixture_${name}`;
  mesh.position.copy(parent.position).multiplyScalar(-1);
  mesh.userData = { appearanceRole: 'fittingPaint', combatHitboxRole: 'equipment',
    sourceA5FinalFitting: true };
  mesh.castShadow = mesh.receiveShadow = true;
  P.disposables.push(geometry);
  parent.add(mesh);
}

function serviceCover(x: number, z: number, topY: number): THREE.BufferGeometry {
  // Three measured radial slopes surround the shallow central face. The
  // small deck rake is real; a tall cylindrical pedestal would erase them.
  const radial = [[0,0],[.301,0],[.295,.0805],[.244,.111],
    [.189,.121],[0,.121]].map(([r,y]) => new THREE.Vector2(r,y));
  const geometry = new THREE.LatheGeometry(radial, 64);
  const rake = Math.atan(.05245 * .9895);
  geometry.rotateX(rake);
  geometry.scale(1,1,.9895);
  geometry.translate(x, topY - .121 * Math.cos(rake), z);
  return geometry;
}

function bridgeBase(): THREE.BufferGeometry {
  const rectangle = (x0:number,x1:number,z0:number,z1:number) =>
    [[x0,-z1],[x1,-z1],[x1,-z0],[x0,-z0]] as const;
  const inner = rectangle(-.002477,.095588,-1.013370,-.757662);
  const geometry=sectionSolid([
    {z:2.5149045,ring:rectangle(-.010427,.1035386,-1.0302676,-.7408844)},
    {z:2.5274,ring:inner}, {z:2.5405,ring:inner},
  ]);
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) if(positions.getY(i)>2.54)
    positions.setY(i,(2.537833-.002920*positions.getZ(i))/.999996);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function bridgeArch(): THREE.BufferGeometry {
  // Independent longitudinal crown/inner-eye samples. The two broad low
  // feet join the source baseplate; no surface crosses the transverse eye.
  const rows=[
    [-1.0186766,2.5348,2.5409],[-1.00,2.5440,2.581198],
    [-.98,2.5790,2.619564],[-.96,2.590422,2.638407],
    [-.94,2.6140,2.647068],[-.92,2.617697,2.649742],
    [-.90,2.612759,2.647320],[-.88,2.590289,2.639166],
    [-.84,2.5700,2.610201],[-.80,2.5400,2.579449],
    [-.76,2.5348,2.548465],[-.7501312,2.5348,2.5409],
  ];
  const sections:SolidSection[]=rows.map(([z,bottom,top],i)=>{
    const foot=i===0 || i===rows.length-1;
    const left=foot ? .0109617 : .026593, right=foot ? .08443 : .068748;
    return {z,ring:[[left,bottom],[right,bottom],[right,top],[left,top]]};
  });
  return sectionSolid(sections);
}

function hoodTop(x:number,z:number): number {
  return (2.63698+.00391*x-.07646*z)/.99707;
}

function hoodPlate(): THREE.BufferGeometry {
  const plan:readonly PlanPoint[]=[
    [.897010,.767760],[.833306,.692109],[.645935,.849890],[.709639,.925541],
  ];
  const shape=new THREE.Shape(plan.map(([x,z])=>new THREE.Vector2(x,-z)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.0059,steps:1,bevelEnabled:false});
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) positions.setY(i,positions.getY(i)
    +hoodTop(positions.getX(i),positions.getZ(i))-.0059);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function hoodLeg(a:PlanPoint,b:PlanPoint,direction:number): THREE.BufferGeometry {
  // Only the occluded roots continue through the source/native roof
  // approximation (13–18 mm nominal gap). The visible 6–8 mm folded sheet,
  // upper plane and open space between the two legs stay source-measured.
  const sections:SolidSection[]=[];
  for(const [x,z] of [a,b].sort((p,q)=>p[1]-q[1])) {
    const top=hoodTop(x,z)-.0025;
    const bottom=2.519-(z-.40)*(.149/1.24)-.003;
    const rootX=x+direction*.0115;
    sections.push({z,ring:[[rootX-.0037,bottom],[rootX+.0037,bottom],
      [x+.0037,top],[x-.0037,top]]});
  }
  return sectionSolid(sections);
}

export function addLeopardA5XSourceDetails(P: TankBuilderPort): void {
  addPart(P, 'hull', 'ServiceCoverRight', serviceCover(.776058,-1.378049,1.813339));
  addPart(P, 'hull', 'ServiceCoverLeft', serviceCover(-.765934,-1.365959,1.813270));
  addPart(P, 'turret', 'BridgeBase', bridgeBase());
  addPart(P, 'turret', 'BridgeArch', bridgeArch());
  addPart(P, 'turret', 'HoodTop', hoodPlate());
  addPart(P, 'turret', 'HoodForwardLeg', hoodLeg([.897010,.767760],[.833306,.692109],1));
  addPart(P, 'turret', 'HoodRearLeg', hoodLeg([.645935,.849890],[.709639,.925541],0));
}
