import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTank} from '../src/vehicles/tankFactory.ts';

const html=readFileSync(new URL('./procedural-fidelity.html',import.meta.url),'utf8');
const start=html.indexOf('function isShadowHelper('),end=html.indexOf('\n}',start)+2;
assert.ok(start>=0&&end>start);
const isShadowHelper=Function(`${html.slice(start,end)}; return isShadowHelper;`)();
assert.equal(isShadowHelper({name:'procShadow_hull',userData:{}}),true);
assert.equal(isShadowHelper({name:'ground',userData:{shadowOnly:true}}),true);
assert.equal(isShadowHelper({name:'gun',userData:{}}),false);
assert.equal(isShadowHelper({name:'muzzleBoreShadowFallbackRim',userData:{cannonBoreFallbackPart:true}}),false);
assert.equal(isShadowHelper({name:'muzzleBoreShadowFallbackAnnulus',userData:{cannonBorePrimaryPart:true}}),false);
assert.equal(isShadowHelper({name:'shadow',userData:{shadowOnly:true,cannonBorePrimaryPart:true}}),true);
assert.match(html,/baseVisible\.set\(o, effectivelyVisible\(o\) && !isShadowHelper\(o\)\)/,
  'actual mask visibility uses the tested helper classification');

const ids=['leo2a7v_x','leo2a6m_x','leo2a4m_x','leo2a5_x','merkava4_x','merkava3d_x',
  'k2_x','kf51_x','t90a_x','t90a_vladimir_x','t90m_x','t90sm_x','t14_x'];
for(const id of ids)for(const quality of ['high','low']) {
  const v=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    let rims=0,parts=0;
    v.root.traverse(o=>{
      if(!o.isMesh||!o.visible||!o.userData.cannonBoreFallbackPart)return;
      assert.equal(isShadowHelper(o),false,`${id}/${quality}: actual visible cannon mouth belongs in masks`);
      const materials=Array.isArray(o.material)?o.material:[o.material];
      assert.ok(materials.some(m=>m.colorWrite!==false),`${id}: rim is real color-writing geometry`);
      assert.ok(o.geometry.getAttribute('position').count>0,`${id}: rim has real triangles`);
      parts++;
      if(o.name.endsWith('Rim'))rims++;
    });
    assert.ok(parts>0,`${id}/${quality}: real assembled muzzle was checked`);
    // Existing low quality uses a recessed disc rather than the close-LOD
    // toroidal rim/annulus; test that actual representation, not a fake rim.
    if(quality==='high')assert.ok(rims>0,`${id}: close-LOD physical rim was checked`);
  }finally{v.dispose();}
}
console.log('fidelity-visibility: all 13 high/low real cannon mouths retained; scene shadow proxies excluded');
