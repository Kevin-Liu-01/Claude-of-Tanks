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
