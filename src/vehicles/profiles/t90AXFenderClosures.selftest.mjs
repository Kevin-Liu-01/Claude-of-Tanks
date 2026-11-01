import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {installCanvasFixture} from '../canvasFixture.test-support.mjs';
import {extrusionStock,stockWinding} from '../../../tools/stock-extrusion-audit.mjs';
import {trackCourseIntervals} from '../../../tools/track-course-intervals.mjs';

const restore=installCanvasFixture();
const localBox=(side,x0,x1,y0,y1)=>new T.Box3(
  new T.Vector3(side<0?-x1:x0,y0,-3.19),new T.Vector3(side<0?-x0:x1,y1,3.19));
const ray=(objects,x,y,z,side)=>new T.Raycaster(new T.Vector3(side*x,y,z),
  new T.Vector3(-side,0,0),0,4).intersectObjects(objects,false)[0];

try{for(const quality of ['high','low']){
  const tank=createTank('t90a',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try{
    const root=tank.root;root.updateMatrixWorld(true);
    const hull=root.getObjectByName('hull'),skin=root.getObjectByName('hullFixedPaintedBodywork');
    assert.ok(skin?.isMesh,'actual permanent fender closure, not metadata');
    assert.equal(skin.parent.name,'rig_hull','fixed bodywork never disappears with greeble LOD');
    assert.equal(skin.userData.combatHitboxRole,'nonArmor','cosmetic skin does not create structural ballistic armor');
    assert.equal(skin.userData.appearanceRole,'armorPaint');
    assert.ok(skin.material === hull.material,'same camouflaged body material');
    assert.ok(skin.material.map&&skin.geometry.attributes.uv&&skin.geometry.attributes.color,'real camo UVs and weathering');
    // 267 fix: the two twenty-triangle long returns only (the 52-triangle bow return walls went in round 1, and the front
    // skirt panels that replaced them go now: the front idler stays exposed under the rolled bow guard)
    assert.equal(skin.geometry.attributes.position.count/3,40,'two twenty-triangle long returns');
    const added=extrusionStock(skin),old=extrusionStock(hull);
    assert.equal(added.length,2);assert.ok(added.every(s=>s.closed),'both mirrored finite sheets are closed and outward');
    let attachments=0,closedRays=0,oldGapRays=0;
    for(const side of [-1,1])for(const z of [-3.18,-2.5,-1.5,-.5,.5,1.5,2.5,3.17]){
      for(const [x,y] of [[1.688,1.287],[1.806,1.142]]){
        const point=new T.Vector3(side*x,y,z);
        assert.ok(added.some(s=>stockWinding(s,point)===1)&&old.some(s=>stockWinding(s,point)===1),
          `${quality}/${side}/${z}: positive shelf and skirt-root attachment`);attachments++;
      }
      for(const y of [1.15,1.18,1.22,1.26]){
        const hit=ray([skin],2,y,z,side);
        assert.ok(hit&&Math.abs(Math.abs(hit.point.x)-1.813)<1e-6,'entire formerly open upper-side slot has an exterior skin');closedRays++;
        const before=ray([hull],2,y,z,side);
        if(y===1.26&&z>=.13){
          assert.ok(before&&Math.abs(Math.abs(before.point.x)-1.828)<1e-6,'existing outer front shelf already closes the topmost row');
        }else{
          assert.ok(!before||Math.abs(before.point.x)<1.79,'without the new return this witness is an actual upper-side gap');oldGapRays++;
        }
      }
    }
    assert.equal(oldGapRays,56,'56 original open-slot witnesses plus eight existing front-shelf witnesses');
    // The bow guard is sheet: a rolled shoulder and a short lip, with the front idler exposed under it (no wall, no panel),
    // and the long return's front end laps the roll.
    const bowRows=[[3.20,1.2758],[3.30,1.265],[3.40,1.247],[3.50,1.216],[3.56,1.179]];
    const bowBoxes=[];let bowAttachments=0,bowGapRays=0;
    for(const side of [-1,1]){
      for(const [z,top] of bowRows){
        const lip=ray([hull],2,top-.112,z,side);
        assert.ok(lip&&Math.abs(Math.abs(lip.point.x)-1.826)<.002,`${quality}: the guard's rolled lip is its outer face at ${z}`);
        for(const y of [top-.15,top-.25,.95]){
          const under=ray([hull,skin],2,y,z,side);
          assert.ok(!under||Math.abs(under.point.x)<1.6,`${quality}: the guard is no wall under its lip; the idler stays open at ${z}/${y}`);
          bowGapRays++;
        }
      }
      const lap=new T.Vector3(side*1.803,1.23,3.185);
      assert.ok(added.some(s=>stockWinding(s,lap)===1)&&old.some(s=>stockWinding(s,lap)===1),
        `${quality}: the long return's front end laps the bow guard's roll`);bowAttachments++;
    }
    // Lower wheel faces remain the first visible physical stock, not filled
    // wheel-bay plates or merely correctly colored hidden meshes.
    const physical=[];root.traverse(o=>{if(o.isMesh&&!o.userData.vehicleMarking&&!o.userData.authoredShadowProxy)physical.push(o);});
    for(const side of [-1,1])for(const z of [-1.848,-1.002,-.147,.728,1.590,2.464]){
      const hit=ray(physical,3,.38,z,side);
      assert.ok(hit&&/^gearRoadWheel/.test(hit.object.name),'lower road-wheel face remains visibly open');
    }
    const r=root.getObjectByName('rig_hull').userData.runningGearReceipts.at(-1);
    let intervals=0;
    for(const side of [-1,1]){
      // Independent finite rectangles cover the complete bent sheet stock.
      // This is deliberately stricter than sparse track/fender ray samples.
      const boxes=[localBox(side,1.684,1.813,1.2765,1.2915),localBox(side,1.795,1.813,1.1394,1.2765),
        ...bowBoxes.filter(row=>row.side===side).map(row=>row.box)];
      const band=root.getObjectByName(side<0?'gearTrackBandL':'gearTrackBandR'),bp=band.geometry.attributes.position;
      assert.equal(bp.count%24,0);
      for(let k=0;k<bp.count;k+=24){
        const box=new T.Box3().setFromPoints(Array.from({length:24},(_,i)=>new T.Vector3().fromBufferAttribute(bp,k+i).applyMatrix4(band.matrixWorld)));
        assert.ok(boxes.every(s=>!s.intersectsBox(box)),'every complete carrier cell clears both sheets');
      }
      for(const name of ['gearTrackPads','gearTrackPadsSimplified']){
        const mesh=root.getObjectByName(name),p=mesh.geometry.attributes.position,u=mesh.userData;
        const vertices=[...new Map(Array.from({length:p.count},(_,i)=>{
          const v=new T.Vector3().fromBufferAttribute(p,i);return[v.toArray().join(','),v];})).values()];
        const x=side*(side<0?r.xcLeft:r.xcRight),course=trackCourseIntervals(band.geometry,r,u.trackShoePitchM,u.trackShoeCenterOffsetM,u.trackRigidLinkChords===true);
        const numeric=course.nativeFloat32ErrorBound(vertices,x);
        function clear(a,b,depth=0){
          const box=course.interval(vertices,a,b,x,numeric).box;
          if(boxes.every(s=>!s.intersectsBox(box))){intervals++;return;}
          assert.ok(depth<26&&b-a>1e-9,`${quality}/${side}/${name}: complete swept shoe may intersect fixed skin`);
          const mid=(a+b)/2;clear(a,mid,depth+1);clear(mid,b,depth+1);
        }
        for(let i=1;i<course.cuts.length;i++)clear(course.cuts[i-1],course.cuts[i]);
      }
    }
    const zones=[...new Set((root.userData.eraVisualBindingReceipt?.plates??[]).filter(p=>p.registered).map(p=>p.name))];
    const before=Float32Array.from(skin.geometry.attributes.position.array);
    for(const zone of zones)tank.stripEra(zone);
    assert.deepEqual(skin.geometry.attributes.position.array,before,'permanent upper closure survives all ERA depletion');
    assert.ok(skin.visible,'ERA does not hide fixed skin');
    console.log(`${quality}: 40 triangles, ${attachments}+${bowAttachments} physical attachment witnesses, ${closedRays}+${bowGapRays} closed-slot/open-idler rays, lower wheels visible, ${intervals} continuous neutral-course bounds PASS`);
  }finally{tank.dispose();}
}}finally{restore();}
