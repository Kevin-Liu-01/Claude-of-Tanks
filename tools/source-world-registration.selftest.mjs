import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCE_WORLD_FRAMES, validateSourceWorldFrame } from './source-world-registration.mjs';

const certificate=SOURCE_WORLD_FRAMES.leo2a5_x;
const frame=()=>({rootMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  hull:[0,0,0],turret:[...certificate.turret],gun:[...certificate.gun]});
const sample=()=>({reference:frame(),procedural:frame()});
const verify=frames=>validateSourceWorldFrame(certificate,certificate.sha256,frames);
assert.deepEqual(verify(sample()).fixedReg,{dAlong:0,dy:0});
assert.equal(validateSourceWorldFrame(certificate,'unverified',sample()).passed,false);
for (const owner of ['reference','procedural']) {
  for (const anchor of ['hull','turret','gun']) {
    for (const axis of [0,1,2]) {
      const frames=sample();frames[owner][anchor][axis]+=.10;
      const result=verify(frames);
      assert.equal(result.passed,false,`${owner}/${anchor}/${axis}: real 10 cm shift must fail`);
      assert.equal(result.fixedReg,undefined,'failed certificates may not supply a fixed transform');
    }
  }
  for (const index of [0,5,10,12,13,14]) {
    const frames=sample();frames[owner].rootMatrix[index]+=.10;
    assert.equal(verify(frames).passed,false,'scale/translation must not self-register away');
  }
}
const missing=sample();delete missing.reference.gun;
assert.equal(verify(missing).passed,false);
const poisoned=sample();poisoned.procedural.gun[0]=NaN;
assert.equal(verify(poisoned).passed,false);

// Execute the authoritative page's exact scoring function, not a second copy.
// Its mask extractor, 96 stations, coverage and 92 floor remain unchanged.
const html=readFileSync(new URL('./procedural-fidelity.html',import.meta.url),'utf8');
// Execute the real page selector/normalization branch in both modes. A small
// outboard marking must not shrink certified structural geometry, while the
// unverified legacy fleet keeps its existing fit behavior.
const expression=html.match(/const sourceWorldCertificate = ([^;\n]+);/)?.[1];
assert.ok(expression,'actual certificate selector exists');
const select=Function('id','params','SOURCE_WORLD_FRAMES',`return ${expression};`);
for(const id of Object.keys(SOURCE_WORLD_FRAMES))for(const query of ['', 'geo=1']) {
  assert.equal(select(id,new URLSearchParams(query),SOURCE_WORLD_FRAMES),SOURCE_WORLD_FRAMES[id],
    `${id}/${query}: fidelity and geometry use the same verified frame`);
}
assert.equal(select('m1a2',new URLSearchParams(),SOURCE_WORLD_FRAMES),null);
const fitStart=html.indexOf('if (!preservation && !sourceWorldCertificate) {');
const fitEnd=html.indexOf('\n}',fitStart)+2;
assert.ok(fitStart>=0&&fitEnd>fitStart);
const fit=Function('preservation','sourceWorldCertificate','reference','procedural','safeScale',
  'targetAnchor','refAnchor','procAnchor',html.slice(fitStart,fitEnd));
const root=()=>({root:{scale:{value:1,multiplyScalar(n){this.value*=n;}}}});
for(const certified of [true,false]) {
  const ref=root(),proc=root();
  fit(false,certified?SOURCE_WORLD_FRAMES.kf51_x:null,ref,proc,(target,current)=>target/current,
    3.5603123,3.5603123,3.56422358396);
  assert.equal(ref.root.scale.value,1);
  if(certified)assert.equal(proc.root.scale.value,1,'marking extent cannot rescale verified metre geometry');
  else assert.ok(proc.root.scale.value<1,'legacy normalization remains unchanged');
}
const start=html.indexOf('  const curveScore = ')+21;
const end=html.indexOf('\n  const sub =',start);
assert.ok(start>21 && end>start,'authoritative curve scorer must remain discoverable');
const score=Function(`return (${html.slice(start,end).trim().replace(/;$/,'')});`)();
const source=Array.from({length:96},(_,i)=>{
  const x=-1.7+i*.035;
  return [x,2.5+(x>-.4&&x<1.1?.8:0),1.7+(x>1?.2:0)];
});
const fixed={dAlong:0,dy:0};
assert.equal(score(source,source,3.2,fixed).score,100,'source-self must be exactly 100');
const vertical=source.map(([x,t,b])=>[x,t+.10,b+.10]);
assert.ok(score(source,vertical,3.2,fixed).score<92,'real vertical shape displacement must fail');
const longitudinal=source.map(([x,t,b])=>[x+.10,t,b]);
assert.ok(score(source,longitudinal,3.2,fixed).score<92,'real longitudinal outline displacement must fail');
assert.ok(Math.abs(score(source,vertical,3.2).score-100)<1e-10,'legacy translation behavior is preserved');
assert.equal(SOURCE_WORLD_FRAMES.m1a2,undefined,'old fleet cannot silently change registration');
console.log('source-world-registration: hashes/datums fail closed; exact scorer self100, displaced geometry fails92, legacy preserved');

// Mk3D's source file is already normalized. Preserve the measured source
// datums and expose only this missing evaluator row, never all WEST overrides.
const mk3Packet=JSON.parse(readFileSync(new URL('../docs/references/tanks/merkava3d_x.source-measurements.json',import.meta.url),'utf8'));
const mk3=SOURCE_WORLD_FRAMES.merkava3d_x;
assert.deepEqual(mk3,{sha256:'68aab556c5202455881862e5beae79fbe6b6dec4cf690ab3f1c73716e3bb3a5c',
  fused:true,turret:mk3Packet.turretPivotM,gun:mk3Packet.gunAxisM});
assert.deepEqual(mk3Packet.normalization,{translationM:[0,.02034,.2258175],uniformScale:1,axes:'+Y up, +Z forward'});
const mk3Sample=()=>({reference:{rootMatrix:frame().rootMatrix,hull:[0,0,0],turret:[0,0,0],gun:[0,0,0]},
  procedural:{rootMatrix:frame().rootMatrix,hull:[0,0,0],turret:[...mk3Packet.turretPivotM],gun:[...mk3Packet.gunAxisM]}});
const mk3Verify=f=>validateSourceWorldFrame(mk3,mk3.sha256,f);
assert.equal(mk3Verify(mk3Sample()).passed,true,'fused source has no fabricated articulated pivots');
assert.equal(validateSourceWorldFrame(mk3,'unverified',mk3Sample()).passed,false,'Mk3 source bytes are mandatory');
for(const owner of ['reference','procedural'])for(const anchor of ['hull','turret','gun']){
  const f=mk3Sample();f[owner][anchor][2]+=.04;
  assert.equal(mk3Verify(f).passed,false,`${owner}/${anchor}: real Mk3 shift cannot fit itself away`);
}
for(const owner of ['reference','procedural'])for(const index of [0,5,10,12,13,14]){
  const f=mk3Sample();f[owner].rootMatrix[index]+=.01;
  assert.equal(mk3Verify(f).passed,false,'No additional scale, centering or ground correction');
}
const evaluator=readFileSync(new URL('./visual-evaluator-page.html',import.meta.url),'utf8');
const mk3Rows=[...evaluator.matchAll(/^  merkava3d_x: (.+),$/gm)];assert.equal(mk3Rows.length,1,'one explicit Mk3 evaluator route');
const mk3Route=Function(`return (${mk3Rows[0][1]});`)();
assert.deepEqual(mk3Route,{source:'glb',qualityBar:'exemplar',glb:{path:'/models/community-candidates/merkava3d_x_source.glb',fixedMount:true,componentMasks:false,paintUntextured:true}});
assert.ok(!evaluator.includes('WEST_X_REFERENCE_OVERRIDES'),'This registration does not add unrelated WEST routes');
console.log('Mk3D: pinned independent source datums, fused owner checks, explicit evaluator row and displaced/scaled/hash negatives PASS');
