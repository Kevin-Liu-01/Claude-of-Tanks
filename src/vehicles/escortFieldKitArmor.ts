import {plate,type Vec3Tuple} from './specHelpers.ts';
import type {FleetTankSpec} from './specContracts.ts';
import {escortKitSections,type EscortFieldKit} from './escortFieldKitLayout.ts';
/** Same 8 mm spaced protection family as the AMX-10P 25 and AMX 56 kits. */
export function applyEscortFieldKitArmor(spec:FleetTankSpec,c:EscortFieldKit):void {
  const prefix='escort:fieldKit:';
  spec.armor.hullPlates=spec.armor.hullPlates.filter(p=>!p.surfaceGroup?.startsWith(prefix));
  for(const side of [-1,1])for(let panel=0;panel<c.panels;panel++){
    const sections=escortKitSections(c,side,panel),ring=sections[0].ring;
    const point=(section:number,i:number):Vec3Tuple=>[sections[section].ring[i][0],sections[section].ring[i][1],sections[section].z];
    const triangles:Vec3Tuple[][]=[];
    for(let s=0;s<sections.length-1;s++)for(let k=0;k<ring.length;k++){
      const j=(k+1)%ring.length;
      // Inner carrier face is behind the existing skirt; retain only the
      // five exposed folds, plus the two finite end caps below.
      if(Math.abs(ring[k][0])===c.inner&&Math.abs(ring[j][0])===c.inner)continue;
      triangles.push([point(s,k),point(s,j),point(s+1,j)],[point(s,k),point(s+1,j),point(s+1,k)]);
    }
    for(let k=1;k<ring.length-1;k++){
      const last=sections.length-1;
      triangles.push([point(0,0),point(0,k+1),point(0,k)], [point(last,0),point(last,k),point(last,k+1)]);
    }
    triangles.forEach((verts,i)=>{
      const p=plate(`skirt_${side<0?'L':'R'}_escort_${panel}_${i}`,8,verts[0],verts[1],verts[2],{kind:'spaced',keMm:15,ceMm:30});
      p.verts=verts;p.convexPolygon=true;p.surfaceGroup=`${prefix}${side}`;
      spec.armor.hullPlates.push(p);
    });
  }
}
