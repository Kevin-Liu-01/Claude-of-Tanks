// Shared authoring coordinates for visible cassettes and finite combat plates.
// Open cage bars deliberately do not acquire an invisible armor sheet.
export type EscortFieldKit = {inner:number;outer:number;rear:number;front:number;top:number;hem:number;panels:number};
export const ESCORT_FIELD_KITS = {
  pl01_105:{inner:1.87,outer:2.08,rear:-3.28,front:3.18,top:1.96,hem:1.11,panels:7},
  upior:{inner:1.45,outer:1.64,rear:-2.26,front:2.25,top:1.43,hem:.88,panels:6},
} satisfies Record<string,EscortFieldKit>;
export function escortKitRing(c:EscortFieldKit,side:number):[number,number][] {
  const ring:[number,number][]=[[c.inner,c.hem],[c.outer-.035,c.hem],[c.outer,c.hem+.085],
    [c.outer,c.top-.08],[c.outer-.055,c.top],[c.inner,c.top]];
  return side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring;
}
