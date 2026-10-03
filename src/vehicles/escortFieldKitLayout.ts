// Shared authoring coordinates for visible cassettes and finite combat plates.
// Open cage bars deliberately do not acquire an invisible armor sheet.
export type EscortFieldKit = {inner:number;outer:number;rear:number;front:number;top:number;hem:number;panels:number;
  glacis?:readonly [rearZ:number,rearY:number,frontZ:number,frontY:number];cageNoseSetback?:number};
export const ESCORT_FIELD_KITS = {
  pl01_105:{inner:1.87,outer:2.08,rear:-3.28,front:3.18,top:1.96,hem:1.11,panels:7,
    glacis:[1.30,1.975,3.425,1.46],cageNoseSetback:.65},
  upior:{inner:1.45,outer:1.64,rear:-2.26,front:2.25,top:1.43,hem:.88,panels:6},
} satisfies Record<string,EscortFieldKit>;
export function escortKitTop(c:EscortFieldKit,z:number):number {
  if(!c.glacis)return c.top;
  const [z0,y0,z1,y1]=c.glacis;
  return Math.min(c.top,y0+(z-z0)*(y1-y0)/(z1-z0));
}
export function escortKitStations(c:EscortFieldKit,rear:number,front:number):number[] {
  if(!c.glacis)return [rear,front];
  const [z0,y0,z1,y1]=c.glacis,knee=z0+(c.top-y0)*(z1-z0)/(y1-y0);
  return knee>rear&&knee<front?[rear,knee,front]:[rear,front];
}
export function escortKitRing(c:EscortFieldKit,side:number,z=c.rear):[number,number][] {
  const top=escortKitTop(c,z);
  const ring:[number,number][]=[[c.inner,c.hem],[c.outer-.035,c.hem],[c.outer,c.hem+.085],
    [c.outer,top-.08],[c.outer-.055,top],[c.inner,top]];
  return side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring;
}
export function escortKitSections(c:EscortFieldKit,side:number,panel:number){
  const step=(c.front-c.rear)/c.panels,z=c.rear+(panel+.5)*step;
  return escortKitStations(c,z-step*.485,z+step*.485).map(z=>({z,ring:escortKitRing(c,side,z)}));
}
