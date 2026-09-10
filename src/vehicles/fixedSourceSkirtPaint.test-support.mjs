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
  t72bu_x:{build:buildT72BUX,label:'t72bu-x-side-leaf',count:12,file:'t72buX.ts',
    sha:'f792d5eeffd4fa3e36148737eb21b8445283244f3b14da49136beff72e16dfa7'},
  t62mv1_x:{build:buildT62MV1X,label:'t62mv1-x-skirt',count:20,file:'t62mv1X.ts',
    sha:'6ab66f75a3390f8132f84598b4720d081b750f6012b019f59c52c4f8500ba952'},
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
  if(id==='t62mv1_x')source=source.replace("'hullFixedPaintedBodywork',markFixedPaintedPanel(sectionSolid([{z,ring},{z:z+.281,ring}]),'t62mv1-x-skirt','hullRubber')", "'hullRubber',sectionSolid([{z,ring},{z:z+.281,ring}])");
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
