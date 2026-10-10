import type { ArmorPlate, ArmorModel } from '../sim/armor.ts';

type Point = [number, number, number];
export const UA_CAGE_STATIONS = Object.freeze([
  { z: 2.62, x: 1.94, base: .20, roof: 1.16 },
  { z: .28, x: 1.98, base: .10, roof: 1.30 },
  { z: -1.28, x: 2.04, base: .08, roof: 1.34 },
  { z: -3.34, x: 2.06, base: .14, roof: 1.28 },
]);
export const UA_SOURCE_CAGE = Object.freeze({ roofY: 3.360795, drop: .20,
  rearZ: -2.22, bendZ: .30, frontZ: 1.20, rightX: 1.30, leftX: -1.40 });

/** Drone bodies cannot fit through the authored 155 mm lattice. These faces
 * only participate in drone contact; they never turn air into bullet armor.
 * Interception is a fictional gameplay probability, not a real-world rating. */
function screen(name: string, verts: Point[], outward: Point): ArmorPlate {
  const a = verts[0]!, b = verts[1]!, c = verts[2]!;
  const u = b.map((n,i)=>n-a[i]!), v = c.map((n,i)=>n-a[i]!);
  const dot = (u[1]!*v[2]!-u[2]!*v[1]!)*outward[0]
    +(u[2]!*v[0]!-u[0]!*v[2]!)*outward[1]+(u[0]!*v[1]!-u[1]!*v[0]!)*outward[2];
  if (dot < 0) verts.reverse();
  return { name, verts, physicalMm: 6, keMm: 6, ceMm: 6,
    kind: 'spaced', convexPolygon: true, droneInterception: .8 };
}

export function ukrainianAbramsCage(): NonNullable<ArmorModel['droneScreens']> {
  const turret: ArmorPlate[] = [];
  for (let i=0;i<UA_CAGE_STATIONS.length-1;i++) {
    const a=UA_CAGE_STATIONS[i]!, b=UA_CAGE_STATIONS[i+1]!;
    const half=Math.min(a.x,b.x)-.08;
    const bands: [number,number][] = i===0 ? [[-half,-.50],[.50,half]] : [[-half,half]];
    for(const [left,right] of bands) turret.push(screen(`drone_cage_roof_${i}_${left}`,
      [[left,a.roof+.012,a.z],[right,a.roof+.012,a.z],[right,b.roof+.012,b.z],[left,b.roof+.012,b.z]],[0,1,0]));
    for(const side of [-1,1]) turret.push(screen(`drone_cage_side_${i}_${side}`,
      [[side*(a.x+.012),a.base+.025,a.z],[side*(b.x+.012),b.base+.025,b.z],
        [side*(b.x+.012),b.roof-.025,b.z],[side*(a.x+.012),a.roof-.025,a.z]],[side,0,0]));
  }
  const rear=UA_CAGE_STATIONS[3]!;
  turret.push(screen('drone_cage_rear',[[ -rear.x+.05,rear.base+.025,rear.z-.012],
    [rear.x-.05,rear.base+.025,rear.z-.012],[rear.x-.05,rear.roof-.025,rear.z-.012],
    [-rear.x+.05,rear.roof-.025,rear.z-.012]],[0,0,-1]));
  return { turret };
}

/** The source-kit geometry is authored in hull-rest coordinates, then mounted
 * on the turret. Use the same conversion so yaw and hull tilt remain exact. */
export function ukrainianSourceCage(pivot: readonly number[], sideX: (side: -1|1,y:number)=>number): NonNullable<ArmorModel['droneScreens']> {
  const c=UA_SOURCE_CAGE, turret: ArmorPlate[]=[];
  const face=(name:string,points:Point[],normal:Point):void=>{
    const local:Point[]=points.map(p=>[p[0]-pivot[0]!,p[1]-pivot[1]!,p[2]-pivot[2]!]);
    // The bent flank has four noncoplanar corners. Two finite triangles match
    // its ruled mesh; one surface group prevents double hits on their seam.
    for(const [i,indices] of [[0,1,2],[0,2,3]].entries()){
      const plate=screen(`${name}_${i}`,indices.map(index=>local[index]!),normal);
      plate.surfaceGroup=name;turret.push(plate);
    }
  };
  const bays=[[c.rearZ,c.bendZ,c.roofY,c.roofY],[c.bendZ,c.frontZ,c.roofY,c.roofY-c.drop]];
  for(const [i,bay] of bays.entries()) {
    const [z0,z1,y0,y1]=bay as [number,number,number,number];
    face(`drone_cage_roof_${i}`,[[c.leftX+.02,y0+.008,z0],[c.rightX-.02,y0+.008,z0],
      [c.rightX-.02,y1+.008,z1],[c.leftX+.02,y1+.008,z1]],[0,1,0]);
    for(const side of [-1,1] as const) {
      const x=side>0?c.rightX:c.leftX, bottom=sideX(side,2.20)+side*.07;
      face(`drone_cage_flank_${i}_${side}`,[[bottom,2.20,z0],[bottom,2.20,z1],
        [x,y1-.012,z1],[x,y0-.012,z0]],[side,0,0]);
    }
  }
  face('drone_cage_rear',[[c.leftX+.10,2.45,c.rearZ-.04],[c.rightX-.10,2.45,c.rearZ-.04],
    [c.rightX-.10,c.roofY-.012,c.rearZ],[c.leftX+.10,c.roofY-.012,c.rearZ]],[0,0,-1]);
  face('drone_bustle_slats',[[-1.03,1.85,-2.96],[.93,1.85,-2.96],[.93,2.55,-2.96],[-1.03,2.55,-2.96]],[0,0,-1]);
  return { turret };
}
