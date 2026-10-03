import {plate,type Vec3Tuple} from './specHelpers.ts';
import type {FleetTankSpec} from './specContracts.ts';
import {escortKitRing,type EscortFieldKit} from './escortFieldKitLayout.ts';
/** Same 8 mm spaced protection family as the AMX-10P 25 and AMX 56 kits. */
export function applyEscortFieldKitArmor(spec:FleetTankSpec,c:EscortFieldKit):void {
  const prefix='escort:fieldKit:';
  spec.armor.hullPlates=spec.armor.hullPlates.filter(p=>!p.surfaceGroup?.startsWith(prefix));
  const step=(c.front-c.rear)/c.panels;
  for(const side of [-1,1])for(let panel=0;panel<c.panels;panel++){
    const ring=escortKitRing(c,side),z=c.rear+(panel+.5)*step;
    const point=(end:number,i:number):Vec3Tuple=>[ring[i][0],ring[i][1],z+end*step*.485];
    const triangles:Vec3Tuple[][]=[];
    for(let k=0;k<ring.length;k++){
      const j=(k+1)%ring.length;
      // Inner carrier face is behind the existing skirt; retain only the
      // five exposed folds, plus the two finite end caps below.
      if(Math.abs(ring[k][0])===c.inner&&Math.abs(ring[j][0])===c.inner)continue;
      triangles.push([point(-1,k),point(-1,j),point(1,j)],[point(-1,k),point(1,j),point(1,k)]);
    }
    for(let k=1;k<ring.length-1;k++){
      triangles.push([point(-1,0),point(-1,k+1),point(-1,k)], [point(1,0),point(1,k),point(1,k+1)]);
    }
    triangles.forEach((verts,i)=>{
      const p=plate(`skirt_${side<0?'L':'R'}_escort_${panel}_${i}`,8,verts[0],verts[1],verts[2],{kind:'spaced',keMm:15,ceMm:30});
      p.verts=verts;p.convexPolygon=true;p.surfaceGroup=`${prefix}${side}`;
      spec.armor.hullPlates.push(p);
    });
  }
}
