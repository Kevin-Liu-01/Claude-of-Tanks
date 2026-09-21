// Offline C2-only primary-hull union. Independently closed pieces retain
// their real clearance, bearing well and receiving walls after enlargement.
import * as THREE from 'three';
import {registerProfiledBuilders} from '../src/vehicles/tankFactoryCore.ts';
import {buildArieteC2X} from '../src/vehicles/profiles/arieteC2X.ts';
import {ARIETE_X_FAMILY_SCALE} from '../src/vehicles/profiles/arieteXFamilyFrame.ts';
import {KIT} from '../src/vehicles/profiles/kit.ts';
import {chieftain10StockCells,convexStockCell} from './chieftain10-collision.mjs';

const ID='ariete_c2_x';
const STOCKS=[
  ['lower-tub','BufferGeometry'],['stern-fold','BufferGeometry'],
  ['bearing-deck','ExtrudeGeometry'],['bearing-ring','LatheGeometry'],
  ['aft-deck','BufferGeometry'],['front-deck','BufferGeometry'],
  ['left-shoulder','BufferGeometry'],['left-rear-cap','BufferGeometry'],['left-carrier','BoxGeometry'],
  ['right-shoulder','BufferGeometry'],['right-rear-cap','BufferGeometry'],['right-carrier','BoxGeometry'],
];
const point=(position,i)=>[position.getX(i),position.getY(i),position.getZ(i)];

function deckPrisms(stock) {
  const g=stock.geometry,p=g.attributes.position,groups=g.groups;
  if(g.index||groups.length!==2||groups[0].materialIndex!==0||groups[1].materialIndex!==1)
    throw Error('C2 bearing deck must retain its complete unindexed cap/wall extrusion');
  g.computeBoundingBox();const min=g.boundingBox.min.y,max=g.boundingBox.max.y,cells=[];
  const cap=groups[0];
  for(let i=cap.start;i<cap.start+cap.count;i+=3){
    const triangle=[0,1,2].map(j=>point(p,i+j));
    if(!triangle.every(v=>Math.abs(v[1]-min)<1e-7))continue;
    cells.push(convexStockCell([...triangle,...triangle.map(v=>[v[0],max,v[2]])],stock.name));
  }
  if(cells.length<4)throw Error('C2 hollow bearing deck has no complete lower cap');
  return cells;
}

function bearingWedges(stock) {
  const g=stock.geometry,p=g.attributes.position,rows=g.parameters.points.length;
  const segments=g.parameters.segments;
  if(rows!==5||p.count!==(segments+1)*rows||segments!==64)
    throw Error('C2 bearing ring radial topology changed');
  const cells=[];
  for(let segment=0;segment<segments;segment++){
    const vertices=[segment,segment+1].flatMap(s=>Array.from({length:rows-1},(_,r)=>point(p,s*rows+r)));
    cells.push(convexStockCell(vertices,stock.name));
  }
  return cells;
}

export function arieteC2StockCells(stock) {
  const expected=STOCKS.find(([name])=>name===stock.name);
  if(!expected||stock.geometry.type!==expected[1])throw Error(`C2 unexpected primary stock ${stock.name}/${stock.geometry.type}`);
  if(stock.name==='bearing-deck')return deckPrisms(stock);
  if(stock.name==='bearing-ring')return bearingWedges(stock);
  if(stock.geometry.type==='BoxGeometry'){
    const p=stock.geometry.attributes.position;
    return[convexStockCell(Array.from({length:p.count},(_,i)=>point(p,i)),stock.name)];
  }
  return chieftain10StockCells(stock);
}

function capturedBuilder(stocks) {
  return p=>buildArieteC2X(new Proxy(p,{
    get(target,method){
      if(method!=='add')return Reflect.get(target,method);
      return(bucket,geometry,...args)=>{
        if(bucket==='hull'){
          const name=STOCKS[stocks.length]?.[0];
          if(!name)throw Error('C2 primary hull gained an unclassified stock');
          const copy=KIT.xform(geometry.clone(),...args);
          copy.scale(ARIETE_X_FAMILY_SCALE,ARIETE_X_FAMILY_SCALE,ARIETE_X_FAMILY_SCALE);
          stocks.push({name,geometry:copy});
        }
        return target.add(bucket,geometry,...args);
      };
    },
  }));
}

/** Same synchronous acquisition contract as the existing Mk10/TOS adapters.
 * No profile geometry/material is mutated; clones are disposed with the tank. */
export function captureArieteC2Collision(createCallback) {
  const stocks=[];let tank;
  registerProfiledBuilders({[ID]:capturedBuilder(stocks)});
  try {tank=createCallback();}
  catch(error){stocks.forEach(s=>s.geometry.dispose());throw error;}
  finally {registerProfiledBuilders({[ID]:buildArieteC2X});}
  try {
    if(!tank?.root||stocks.length!==STOCKS.length)throw Error('C2 primary stock census changed');
    const hullCollision=stocks.flatMap(arieteC2StockCells),bounds=new THREE.Box3();
    for(const stock of stocks){stock.geometry.computeBoundingBox();bounds.union(stock.geometry.boundingBox);}
    return {tank,hullCollision,stocks,primaryBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},
      dispose(){tank.dispose();stocks.forEach(s=>s.geometry.dispose());}};
  }catch(error){tank?.dispose();stocks.forEach(s=>s.geometry.dispose());throw error;}
}
