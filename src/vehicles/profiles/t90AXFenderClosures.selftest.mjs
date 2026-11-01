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
    // 267: two twenty-triangle long returns plus two 52-triangle front skirt panels (the 52-triangle bow return walls
    // are gone: the bow guard is a rolled sheet with a lip, and the oracle's separate front panel hangs under it)
    assert.equal(skin.geometry.attributes.position.count/3,144,'two twenty-triangle long returns plus two 52-triangle front skirt panels');
    const added=extrusionStock(skin),old=extrusionStock(hull);
    assert.equal(added.length,4);assert.ok(added.every(s=>s.closed),'all four mirrored finite sheets are closed and outward');
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
    // The bow guard is sheet: a rolled shoulder and a short lip over the hinged front skirt panel, which hangs inboard
    // of the lip with its top buried in the roll, from the long skirt's front edge (a 6 mm hinge line) to the nose.
    const bowRows=[[3.20,1.2758],[3.30,1.265],[3.40,1.247],[3.50,1.216],[3.56,1.179]];
    const panelRows=[[3.192,.825,1.808],[3.45,.82,1.808],[3.55,.838,1.808],[3.62,.842,1.808],[3.68,.862,1.806],[3.700,.880,1.786],[3.712,.900,1.770]];
    const bowBoxes=[];let bowAttachments=0,bowGapRays=0;
    for(const side of [-1,1]){
      for(const [z,top] of bowRows){
        const lip=ray([hull],2,top-.112,z,side);
        assert.ok(lip&&Math.abs(Math.abs(lip.point.x)-1.826)<.002,`${quality}: the guard's rolled lip is its outer face at ${z}`);
        const under=ray([hull],2,top-.15,z,side);
        assert.ok(!under||Math.abs(under.point.x)<1.6,`${quality}: under the lip the guard is no wall (the panel hangs there) at ${z}`);
        const panel=ray([skin],2,top-.15,z,side);
        assert.ok(panel&&Math.abs(Math.abs(panel.point.x)-1.808)<1e-5,`${quality}: the front skirt panel closes the side, 19 mm inboard of the lip`);
        bowGapRays++;
      }
      for(let i=0;i<panelRows.length;i++){
        const [zs,low,outer]=panelRows[i],z=Math.min(Math.max(zs,3.195),3.709);
        // the panel's top is buried in the guard's roll: a point just under its top edge lies inside both
        const hit=new T.Raycaster(new T.Vector3(side*(outer-.006),3,z),new T.Vector3(0,-1,0),0,3).intersectObjects([skin],false)[0];
        assert.ok(hit,`${quality}: the panel is present at ${z}`);
        const point=new T.Vector3(side*(outer-.006),hit.point.y-.0015,z);
        assert.ok(added.some(s=>stockWinding(s,point)===1)&&old.some(s=>stockWinding(s,point)===1),
          `${quality}: the front panel's top edge is buried in the guard's roll at ${z}`);bowAttachments++;
        if(i>0){
          const [z0,low0,outer0]=panelRows[i-1],inner=Math.min(outer,outer0)-.012;
          bowBoxes.push({side,box:new T.Box3(new T.Vector3(side<0?-1.808:inner,Math.min(low,low0),z0),
            new T.Vector3(side<0?-inner:1.808,1.30,zs))});
        }
      }
      const front=ray([skin],2,1.0,3.188,side);
      assert.ok(!front||Math.abs(front.point.x)>1.80,'the hinge line: the panel starts ahead of the long skirt\'s front edge');
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
    console.log(`${quality}: 144 triangles, ${attachments}+${bowAttachments} physical attachment witnesses, ${closedRays}+${bowGapRays} closed-slot/bow-sheet rays, lower wheels visible, ${intervals} continuous neutral-course bounds PASS`);
  }finally{tank.dispose();}
}}finally{restore();}
