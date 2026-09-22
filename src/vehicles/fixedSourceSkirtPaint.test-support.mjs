import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildT90AWX} from './profiles/t90AwX.ts';
import {buildT72BUX} from './profiles/t72buX.ts';
import {buildT62MV1X} from './profiles/t62mv1X.ts';

export const FIXED_SOURCE_SKIRTS=Object.freeze({
  t90_x:{build:buildT90AWX,label:'t90-aw-x-fixed-skirt',count:8,file:'t90AwXFenders.ts',
    sha:'a264e62aefd26632100d6bd06f3d747548e9c9dcce06ac7c63603cabf9c1cf54'},
  // 2026-09-22 nation wheel standard (owner: "standardize our wheels across NATIONS! then we can delete any wheels we dont use anymore"): the T-72BU X and T-62MV1 X
  // profiles lost their authored wheel-face dressing and annular-tire declarations (both draw the Russia T-90 nation
  // wheel, nationWheelSets.ts); the pre-finish source digests are repinned from the current profiles.
  t72bu_x:{build:buildT72BUX,label:'t72bu-x-side-leaf',count:12,file:'t72buX.ts',
    sha:'710daa290384935208c765df3b54ab06bb23feb985d223bacf5081a43459890c'},
  t62mv1_x:{build:buildT62MV1X,label:'t62mv1-x-skirt',count:20,file:'t62mv1X.ts',
    // 2026-09-22 (owner: holes are added, not carved, to save triangles): t62mv1X closed its main gun
    // at the source tip (measuredPrimitives cappedTube; the measured bore floor 5.65940 stays recorded
    // in sovietSecondWaveGeometry.selftest), so the authenticated pre-finish geometry moved; the t90_x
    // and t72bu_x rows are untouched. Superseded sha 6ab66f75… (pre-round-38) and fe5b999c… (nation wheels alone);
    // the digest is the combined round-38 source (nation wheel + closed gun).
    sha:'f425c1154d7618e3f2012f157354e947f38cf3a6120f05816dd04e96ac79a9fd'},
});

// Authenticate the exact pre-finish sources independently of rendered meshes.
// Only these literal bucket/wrapper changes are undone, never new goldens.
export function verifyHistoricalFixedSkirtSource(id){
  const row=FIXED_SOURCE_SKIRTS[id];assert.ok(row);
  let source=readFileSync(new URL('./profiles/'+row.file,import.meta.url),'utf8');
  source=source.replace("import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';\n",'');
  if(id==='t90_x')source=source
    .replace("'hullFixedPaintedBodywork',markFixedPaintedPanel(sectionSolid(rows.map", "'hullRubber',sectionSolid(rows.map")
    .replace("}))), 't90-aw-x-fixed-skirt','hullRubber'));", "}))));");
  if(id==='t72bu_x')source=source.replace("'hullFixedPaintedBodywork',markFixedPaintedPanel(box(.011,top-low,b-a),'t72bu-x-side-leaf','hullRubber')", "'hullRubber',box(.011,top-low,b-a)");
  // Fleet track standard 2026-09-12 (band >= 24 mm, pad >= 30 mm, web >= 14 mm):
  // literal gear leaves projected back so the pre-finish source stays exact.
  if(id==='t72bu_x')source=source
    // Russian X track standard 2026-09-12 (band .030, pad .036, web .018) projected back to the .014/.026/.013 source leaf.
    .replace("trackW:.56169,trackTh:.030, // Russian X track standard 2026-09-12: band .030, pad .036, web .018","trackW:.56169,trackTh:.014,")
    .replace("trackShoeDimensions:{padHeight:.036,grouserHeight:.009,webHeight:.018,hornHeight:.042,","trackShoeDimensions:{padHeight:.026,grouserHeight:.009,webHeight:.013,hornHeight:.042,");
  if(id==='t62mv1_x')source=source.replace("'hullFixedPaintedBodywork',markFixedPaintedPanel(sectionSolid([{z,ring},{z:z+.281,ring}]),'t62mv1-x-skirt','hullRubber')", "'hullRubber',sectionSolid([{z,ring},{z:z+.281,ring}])");
  // Russian X track standard 2026-09-12 (band .030, pad .036, web .018) projected back to the .024/.031/.016 source leaf.
  if(id==='t62mv1_x')source=source
    .replace("topY:.891,botY:.073,trackTh:.030, // Russian X track standard 2026-09-12: band .030, pad .036, web .018","topY:.891,botY:.073,trackTh:.024,")
    .replace("trackShoeDimensions:{padHeight:.036,grouserHeight:.012,webHeight:.018,hornHeight:.073,","trackShoeDimensions:{padHeight:.031,grouserHeight:.012,webHeight:.016,hornHeight:.073,");
  assert.equal(createHash('sha256').update(source).digest('hex'),row.sha,`${id}: complete authenticated pre-finish source remains unchanged`);
}

export function withHistoricalFixedSkirtFinish(id,build,wrapBuilder=builder=>builder){
  const row=FIXED_SOURCE_SKIRTS[id];assert.ok(row);let sheets=0;
  registerProfiledBuilders({[id]:wrapBuilder(P=>row.build(new Proxy(P,{get(target,key){
    if(key!=='addMudguard')return Reflect.get(target,key);
    return(label,bucket,g,...pose)=>{
      if(label===row.label){
        assert.equal(bucket,'hullFixedPaintedBodywork');assert.equal(g.userData.fixedPaintedPanel,label);
        assert.equal(g.userData.materialOnlyPaintSourceBucket,'hullRubber');
        assert.equal(g.userData.materialOnlyPaintMigration,true);sheets++;
        g.userData={...g.userData};
        for(const key of ['fixedPaintedPanel','materialOnlyPaintSourceBucket','materialOnlyPaintMigration'])delete g.userData[key];
        bucket='hullRubber';
      }
      return target.addMudguard(label,bucket,g,...pose);
    };
  }})))});
  try{const tank=build();try{assert.equal(sheets,row.count,'only declared fixed sheets have a finish inverse');return tank;}
    catch(error){tank.dispose();throw error;}}
  finally{registerProfiledBuilders({[id]:row.build});}
}
