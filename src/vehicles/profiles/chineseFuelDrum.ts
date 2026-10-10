// Native Chinese auxiliary tank equipment. A barrel has one pair of circular
// ends; retaining hoops are hollow stock, never another capped cylinder laid
// over the same end plane.
import {BufferGeometry,Float32BufferAttribute} from 'three';
import {KIT} from './kit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

/** Closed annular steel band around the X axis. Hard axial faces and smooth
 * radial normals are authored separately, including the visible end rim. */
export function fuelDrumHoop(radius:number,width:number,thickness:number,segments:number):BufferGeometry {
  if(!([radius,width,thickness].every(Number.isFinite)&&radius>thickness&&width>0&&thickness>0&&Number.isInteger(segments)&&segments>=12))
    throw new RangeError('Fuel drum hoop requires finite positive annular stock');
  const p:number[]=[],n:number[]=[],uv:number[]=[];
  const inner=radius-thickness;
  const point=(x:number,r:number,a:number):number[]=>[x,r*Math.cos(a),r*Math.sin(a)];
  const emit=(a:number[],b:number[],c:number[],na:number[],nb:number[],nc:number[])=>{
    p.push(...a,...b,...c);n.push(...na,...nb,...nc);uv.push(0,0,1,0,1,1);
  };
  for(let i=0;i<segments;i++){
    const a=2*Math.PI*i/segments,b=2*Math.PI*(i+1)/segments;
    const radial=(angle:number,s:number)=>[0,s*Math.cos(angle),s*Math.sin(angle)];
    for(const [r,s]of [[radius,1],[inner,-1]]){
      const aa=point(-width/2,r,a),ab=point(-width/2,r,b),ba=point(width/2,r,a),bb=point(width/2,r,b);
      if(s>0){emit(aa,ab,bb,radial(a,s),radial(b,s),radial(b,s));emit(aa,bb,ba,radial(a,s),radial(b,s),radial(a,s));}
      else{emit(aa,bb,ab,radial(a,s),radial(b,s),radial(b,s));emit(aa,ba,bb,radial(a,s),radial(a,s),radial(b,s));}
    }
    for(const side of [-1,1]){
      const aa=point(side*width/2,inner,a),ab=point(side*width/2,inner,b),ba=point(side*width/2,radius,a),bb=point(side*width/2,radius,b),normal=[side,0,0];
      if(side>0){emit(aa,ba,bb,normal,normal,normal);emit(aa,bb,ab,normal,normal,normal);}
      else{emit(aa,bb,ba,normal,normal,normal);emit(aa,ab,bb,normal,normal,normal);}
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));
  g.setAttribute('normal',new Float32BufferAttribute(n,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));return g;
}

export function addChineseFuelDrum(P:TankBuilderPort,x:number,y:number,z:number,radius:number,length:number):void {
  const segments=P.q?48:32;
  const tagged=(g:BufferGeometry,role:string)=>{
    g.userData.chineseFuelDrum={role,x,y,z,radius,length};return g;
  };
  P.addEquipment('hullDetail',tagged(KIT.cylX(radius,length,segments),'body'),x,y,z);
  for(const side of [-1,1]){
    // Rim overlaps only the cylinder's circumference. The central disc has
    // exactly one exposed face, with 6 mm of real inset behind its rim.
    const at=side*(length/2-.007);
    P.addEquipment('hullDark',tagged(fuelDrumHoop(radius+.007,.026,.020,segments),'end-rim'),x+at,y,z);
    P.addEquipment('hullDark',tagged(fuelDrumHoop(radius+.008,.045,.012,segments),'strap'),x+side*length*.30,y,z);
    P.addEquipment('hullDetail',tagged(KIT.box(.068,.022,.06),'tensioner'),x+side*length*.30,y+radius+.010,z);
  }
  P.addEquipment('hullDetail',tagged(KIT.cylY(.035,.043,.028,16),'filler'),x,y+radius+.006,z);
  P.addEquipment('hullDark',tagged(KIT.box(.054,.010,.012),'filler-handle'),x,y+radius+.025,z);
}
