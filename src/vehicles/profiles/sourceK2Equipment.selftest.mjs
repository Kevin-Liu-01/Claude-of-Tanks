import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const near=(actual,expected,tolerance,label)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,
  `${label}: ${actual} versus ${expected} ± ${tolerance}`);
const cast=(root,origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction).normalize(),0,4)
  .intersectObject(root,true).filter(h=>{for(let o=h.object;o;o=o.parent)if(!o.visible)return false;return !/shadow/i.test(h.object.name);});
const mouths=[
  [1.39065,2.01214,1.80947,.494,.218,.842],[1.53905,1.92169,1.64687,.786,.289,.548],
  [1.50245,2.01004,1.64442,.729,.417,.544],[1.42385,1.92029,1.80947,.642,.098,.760],
  [1.29930,1.93954,1.96767,.310,.150,.939],[1.25245,2.02849,1.97202,.174,.356,.918],
];

for(const quality of['high','low']){
  const tank=createTank('k2_x',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try{
    tank.root.updateMatrixWorld(true);
    for(const y of[2.54,2.64,2.70]){
      const hit=cast(tank.root,[-.6365,y,1.2],[0,0,-1])[0];
      near(hit?.point.z,.78627002,.001,`${quality}: rounded GPS has true recessed source viewing slot`);
      assert.equal(hit.object.name,'turretGlass',`${quality}: no armor fills GPS viewing slot`);
    }
    const corner=cast(tank.root,[-.82,2.64,1.2],[0,0,-1])[0];
    assert.ok(corner.point.z<.79,`${quality}: rounded GPS corners are not the old rectangular front face`);
    const seat=cast(tank.root,[-.6365,2.35,1.0],[0,0,-1])[0];
    near(seat?.point.z,.78917,.001,`${quality}: real source pedestal seats the GPS above the roof`);
    const eye=cast(tank.root,[-.1222,2.84784,-1.2],[0,0,-1])[0];
    near(eye?.point.z,-1.55555157,.001,`${quality}: source commander eye has 9 cm physical recess`);
    assert.equal(eye.object.name,'turretGlass');
    for(const [x,y]of[[-.1222,2.75314],[.0373,2.75994],[.137,2.75314],
      [-.1222,2.84784],[-.0142,2.85469],[.137,2.84784],[-.07505,2.93424],[.08335,2.93424]]){
      const opening=cast(tank.root,[x,y,-1.2],[0,0,-1])[0];
      assert.equal(opening.object.name,'turretGlass',`${quality}: separate eye at ${x}/${y}`);
      const rim=cast(tank.root,[x+.037,y,-1.2],[0,0,-1])[0];
      assert.equal(rim.object.name,'turretDetail',`${quality}: real ring beside eye`);
      assert.ok(opening.distance-rim.distance>.05,`${quality}: eye is recessed, not a flat painted disc`);
    }
    for(const side of[-1,1])for(const [x,y,z,ax,ay,az]of mouths){
      const axis=new THREE.Vector3(side*ax,ay,az).normalize(),center=new THREE.Vector3(side*x,y,z);
      const origin=center.clone().addScaledVector(axis,.2);
      const hit=cast(tank.root,origin.toArray(),axis.clone().negate().toArray())[0];
      assert.equal(hit.object.name,'turretDark',`${quality}: source-position launcher mouth is not buried ${side*x}/${z}`);
      near(hit.distance,.1935,.0002,`${quality}: true recessed launcher mouth station`);
    }
    const armor=tank.root.getObjectByName('turret');
    for(const side of[-1,1]){
      const hit=cast(armor,[side*2.5,2.03,1.972],[-side,0,0])[0];
      near(Math.abs(hit?.point.x),1.197585,.001,`${quality}: source permanent armor supports the forward bank`);
      const lower=cast(armor,[side*2.5,1.90,1.972],[-side,0,0])[0];
      assert.ok(Math.abs(lower.point.x)>1.28,`${quality}: relief retains thick lower armor, not a detached tube rack`);
      for(const [z,y]of[[1.7,2.24955],[1.9,2.24075],[2.05,2.23483],[2.2,2.22662]]){
        const blade=cast(armor,[side*.48,3,z],[0,-1,0])[0];
        near(blade?.point.y,y,.003,`${quality}: steep inboard blade survives source launcher relief`);
      }
      const underside=cast(armor,[side*.48,1.55,1.9],[0,1,0])[0];
      near(underside?.point.y,1.693939917,.003,`${quality}: blade has the actual sloped lower skin`);
    }
  }finally{tank.dispose();}
}
console.log('sourceK2Equipment: rounded open GPS, eight physically recessed eyes, twelve unobstructed source mouths and permanent cheek support pass high/low');
