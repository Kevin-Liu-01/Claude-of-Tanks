import type {ArmorPlate} from './specHelpers.ts';
import {convexArmorTraceBounds} from './convexArmorTraceBounds.ts';
type Shape=Pick<ArmorPlate,'name'|'verts'|'convexPolygon'|'surfaceGroup'|'openEdges'|'traceBounds'>;
const shapes=new Map<string,Shape[]>();

function detachedShape(plate:ArmorPlate):Shape {
  const shape:Shape={name:plate.name,verts:plate.verts.map(p=>[...p] as [number,number,number]),
    convexPolygon:plate.convexPolygon,surfaceGroup:plate.surfaceGroup};
  if(plate.openEdges)shape.openEdges=[...plate.openEdges];
  const bounds=plate.convexPolygon?convexArmorTraceBounds(plate.verts):undefined;
  if(bounds)shape.traceBounds=bounds;
  return shape;
}
function applyTemplate(template:ArmorPlate,shape:Shape):ArmorPlate {
  const plate={...template,...shape,verts:shape.verts.map(p=>[...p] as [number,number,number])};
  if(shape.openEdges)plate.openEdges=[...shape.openEdges];
  if(shape.traceBounds)plate.traceBounds={min:[...shape.traceBounds.min],max:[...shape.traceBounds.max]};
  return plate;
}
/** Source course shape is invariant per ID/side. Donor gameplay fields are
 * deliberately not cached: each fresh spec retains its own current ratings.
 * Both stored shapes and returned contours/edge arrays are privately owned. */
export function memoizedAuxiliaryShapes(key:string,template:ArmorPlate,build:()=>ArmorPlate[]):ArmorPlate[] {
  let cached=shapes.get(key);
  if(!cached){cached=build().map(detachedShape);shapes.set(key,cached);}
  return cached.map(shape=>applyTemplate(template,shape));
}
