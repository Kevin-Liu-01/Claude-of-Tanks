// Offline exact cells for the concept's two independently closed primary
// turret stocks. Equipment and the pitching launcher never expand this union.
import * as THREE from 'three';
import {registerProfiledBuilders} from '../src/vehicles/tankFactoryCore.ts';
import {buildTos1aTagil} from '../src/vehicles/profiles/tos1aTagil.ts';
import {KIT} from '../src/vehicles/profiles/kit.ts';
import {chieftain10StockCells} from './chieftain10-collision.mjs';

const ID='tos1a_tagil';
const EXPECTED=['yaw-bearing','load-platform'];

export function tos1aTagilStockCells(stock) {
  if(!EXPECTED.includes(stock.name))throw Error(`TOS unexpected primary stock ${stock.name}`);
  if(stock.name==='yaw-bearing'&&stock.geometry.type!=='CylinderGeometry')
    throw Error('TOS yaw bearing must remain a closed convex cylinder');
  if(stock.name==='load-platform'&&stock.geometry.type!=='BufferGeometry')
    throw Error('TOS platform must remain an authored section solid');
  // The existing exact decomposition checks convex occupied volume and splits
  // concave station stock; it does not build a hull around separate objects.
  return chieftain10StockCells(stock);
}

/** Synchronous createCallback constructs only tos1a_tagil in the caller's
 * authoring measurement context. The actual tank and inspection clones are
 * owned by the returned disposer. Nothing enters a playable import path. */
export function captureTos1aTagilCollision(createCallback) {
  const stocks=[];let tank;
  registerProfiledBuilders({[ID]:p=>buildTos1aTagil(new Proxy(p,{
    get(target,method){
      if(method!=='add')return Reflect.get(target,method);
      return(bucket,geometry,...args)=>{
        if(bucket==='turret')stocks.push({name:geometry.userData.tos1aTagil,
          geometry:KIT.xform(geometry.clone(),...args)});
        return target.add(bucket,geometry,...args);
      };
    },
  }))});
  try {tank=createCallback();}
  catch(error){stocks.forEach(s=>s.geometry.dispose());throw error;}
  finally {registerProfiledBuilders({[ID]:buildTos1aTagil});}
  try {
    if(!tank?.root||stocks.length!==2||stocks.some((s,i)=>s.name!==EXPECTED[i]))
      throw Error('TOS primary stock census changed; classify actual geometry before calibration');
    const turretCollision=stocks.flatMap(tos1aTagilStockCells);
    const bounds=new THREE.Box3();
    for(const stock of stocks){stock.geometry.computeBoundingBox();bounds.union(stock.geometry.boundingBox);}
    return {tank,turretCollision,stocks,primaryBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},
      dispose(){tank.dispose();stocks.forEach(s=>s.geometry.dispose());}};
  }catch(error){tank?.dispose();stocks.forEach(s=>s.geometry.dispose());throw error;}
}
