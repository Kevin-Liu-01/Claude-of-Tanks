import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {verifyCarvedMuzzleBore} from '../src/vehicles/carvedMuzzleBore.ts';

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
// 2026-10-12 (cam-netting): the netting lane's field suits leave the masks too (procedural-fidelity.html
// isCamouflageSuit: only alpha-tested _ghillie_ decor; the masks' overrideMaterial drops alphaTest)
assert.match(html,/baseVisible\.set\(o, effectivelyVisible\(o\) && !isShadowHelper\(o\) && !isCamouflageSuit\(o\)\)/,
  'actual mask visibility uses the tested helper classification');

const ids=['leo2a7v','leo2a6m','leo2a5m','leo2a5','merkava4','merkava3d',
  'k2_black_panther','kf51_panther','t90a','t90a_vladimir','t90m','t90sm','t14_armata'];
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
      // 2026-10-10: the owner's carved bores (a28e4d8e6) replaced the toroidal rim/annulus helpers with the native
      // stock's own cut rim around a 12-sided inward wall and recessed backstop; read that physical mouth on its frame
      // (an attached native rim, the wall at three depths, the backstop) at both qualities
      if(o.name==='muzzleBoreInnerWallAndBackstop'){verifyCarvedMuzzleBore(v.root,o.parent);rims++;}
      else if(o.name.endsWith('Rim'))rims++;
    });
    assert.ok(parts>0,`${id}/${quality}: real assembled muzzle was checked`);
    assert.ok(rims>0,`${id}/${quality}: physical rim was checked`);
  }finally{v.dispose();}
}
console.log('fidelity-visibility: all 13 high/low real cannon mouths retained; scene shadow proxies excluded');
