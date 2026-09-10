import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript-compiler-api';
import { getMapConfig } from './maps/index.ts';

const url = new URL('./vegetation.ts', import.meta.url), text = readFileSync(url, 'utf8');
const parse = code => ts.createSourceFile('vegetation.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function find(code, predicate) {
  const tree = parse(code), found = [];
  function visit(node) { if (predicate(node)) found.push(node.getText(tree)); node.forEachChild(visit); }
  visit(tree); assert.equal(found.length, 1, 'one actual source owner'); return found[0];
}
const fn = (code, name) => find(code, n => ts.isFunctionDeclaration(n) && n.name?.text === name);
function replaceOnce(code, from, to) {
  assert.equal(code.split(from).length, 2, `one source anchor: ${from.slice(0,80)}`); return code.replace(from,to);
}
// Literal changed branch block from09a58b3d3. Unchanged stem/root/snow/card
// machinery still executes in the complete production module; no runtime Git.
const oldLattice = `() => {
  const leaderCount = 2 + ((rng() * 2) | 0);
  for (let leader = 0; leader < leaderCount; leader += 1) {
    const yaw = (leader / leaderCount) * Math.PI * 2 + rng() * 1.2;
    const tilt = 0.10 + rng() * 0.14;
    const length = H * (0.42 + rng() * 0.16);
    const baseY = H * (0.50 + rng() * 0.10);
    const branch = new THREE.CylinderGeometry(0.035, 0.075, length, 5, 1);
    branch.translate(0, length / 2, 0); branch.rotateZ(tilt); branch.rotateY(yaw);
    branch.translate(0, baseY - length * 0.12, 0);
    _c.setHSL(0.08, 0.04, 0.72 + rng() * 0.10, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(branch, _c.clone(), 0.15));
  }
  const branchCount = (vr.nBr ?? 14) + ((rng() * 4) | 0);
  for (let index = 0; index < branchCount; index += 1) {
    const length = 0.9 + rng() * (H * 0.22), tilt = 0.30 + rng() * 0.55;
    const yaw = rng() * Math.PI * 2, baseY = H * (0.52 + rng() * 0.34);
    const branch = new THREE.CylinderGeometry(0.012, 0.040, length, 4, 1);
    branch.translate(0, length / 2, 0); branch.rotateZ(tilt); branch.rotateY(yaw);
    const branchBaseRadius = 0.035 + rng() * 0.025;
    const branchBaseX = -Math.cos(yaw) * branchBaseRadius, branchBaseZ = Math.sin(yaw) * branchBaseRadius;
    branch.translate(branchBaseX, baseY, branchBaseZ);
    _c.setHSL(0.06, 0.06, 0.46 + rng() * 0.12, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(branch, _c.clone(), 0.3));
    if (rng() >= 0.6) continue;
    const forkLength = length * (0.45 + rng() * 0.3);
    const fork = new THREE.CylinderGeometry(0.008, 0.020, forkLength, 3, 1);
    fork.translate(0, forkLength / 2, 0);
    fork.rotateZ(tilt + (rng() - 0.3) * 0.7); fork.rotateY(yaw + (rng() - 0.5) * 1.1);
    const forkReach = Math.sin(tilt) * length * 0.9;
    fork.translate(branchBaseX - Math.cos(yaw) * forkReach,
      baseY + Math.cos(tilt) * length * 0.9, branchBaseZ + Math.sin(yaw) * forkReach);
    _c.setHSL(0.06, 0.06, 0.50 + rng() * 0.12, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(fork, _c.clone(), 0.4));
  }
}`;
function predecessor(code) {
  const builder = fn(code,'buildBirchGeometry');
  const lattice = find(builder, n => ts.isVariableDeclaration(n) && n.name.getText() === 'addBranchLattice');
  let old = replaceOnce(builder,lattice,`addBranchLattice = ${oldLattice}`);
  const first = old.indexOf('    const limb = crownLimbs[i % crownLimbs.length];');
  const end = old.indexOf('    cardParts.push(',first);
  assert.ok(first>0 && end>first);
  old = old.slice(0,first)+'    const px = dx * rad * crw, py = cy + dy * rad * H * 0.26, pz = dz * rad * crw;\n'+old.slice(end);
  return replaceOnce(code,builder,old);
}
const hook = registerHooks({load(href, context, next) {
  const result = next(href,context);
  if (!href.startsWith(url.href+'?birch-form-')) return result;
  assert.equal(String(result.source),text,'complete actual module, stable source');
  let code = href.endsWith('before') ? predecessor(text) : text;
  for (const name of ['addBirchLimb','birchLimbStation','foliageCard','mergeParts']) {
    const declaration = fn(code,name);
    code = replaceOnce(code,declaration,declaration.replace(`function ${name}(`,`function raw_${name}(`));
  }
  return {...result,source:code+`
    let observed = null;
    function addBirchLimb(parts,limb,...rest) {
      raw_addBirchLimb(parts,limb,...rest);
      if(observed) observed.limbs.push({limb:{...limb}, identity:limb, geometry:parts.at(-1), sides:rest[2], flex:rest[3]});
    }
    function birchLimbStation(limb,t,out) {
      const value=raw_birchLimbStation(limb,t,out);
      if(observed)observed.stations.push({limb,t,point:value.clone()}); return value;
    }
    function foliageCard(...args) {
      const geometry=raw_foliageCard(...args);
      if(observed)observed.cards.push({geometry,center:new THREE.Vector3(...args.slice(2,5)),width:args[0],height:args[1]});
      return geometry;
    }
    function mergeParts(parts) { if(observed)observed.parts.push(parts.slice()); return raw_mergeParts(parts); }
    export function birchForTest(rng,palette,variant) {
      observed={limbs:[],stations:[],cards:[],parts:[]};
      try{return {pair:buildBirchGeometry(rng,palette,variant),observation:observed};} finally{observed=null;}
    }
    export {BIRCH_VAR};
  `};
}});
let current, before;
try {current=await import(url.href+'?birch-form-current');before=await import(url.href+'?birch-form-before');}
finally{hook.deregister();}
const point=(g,i)=>new THREE.Vector3().fromBufferAttribute(g.attributes.position,i);
function ring(g, top) {
  const sides=g.parameters.radialSegments, start=top?0:sides+1, center=new THREE.Vector3();
  for(let i=0;i<sides;i++)center.add(point(g,start+i)); return center.multiplyScalar(1/sides);
}
function station(limb,t) {
  return new THREE.Vector3(0,limb.length*t,0).applyAxisAngle(new THREE.Vector3(0,0,1),limb.tilt)
    .applyAxisAngle(new THREE.Vector3(0,1,0),limb.yaw).add(new THREE.Vector3(limb.x,limb.y,limb.z));
}
const distance=(p,a,b)=>new THREE.Line3(a,b).closestPointToPoint(p,true,new THREE.Vector3()).distanceTo(p);
function exact(a,b,positions=true) {
  assert.deepEqual(Object.keys(b.attributes),Object.keys(a.attributes));
  for(const [name,p]of Object.entries(a.attributes)) {
    const q=b.attributes[name];assert.deepEqual([q.count,q.itemSize,q.normalized,q.array.byteLength],[p.count,p.itemSize,p.normalized,p.array.byteLength]);
    assert.ok(q.array.every(Number.isFinite),'finite geometry');
    if(positions||!['position','normal'].includes(name))assert.deepEqual(q.array,p.array,`exact ${name}`);
  }
  assert.deepEqual(b.index?.array,a.index?.array);assert.deepEqual(b.groups,a.groups);
}
function build(api,seed,palette,variant) {
  const next=api.mulberry32(seed),draws=[];
  const result=api.birchForTest(()=>{const v=next();draws.push(v);return v;},palette,variant);
  return {...result,draws,tail:[next(),next(),next()],H:variant.h0+draws[0]*variant.hr};
}
function connections(result,variant) {
  const {limbs,stations,cards}=result.observation, leaders=limbs.filter(l=>l.sides===5);
  let primary=null;
  for(const row of limbs) {
    const base=ring(row.geometry,false),tip=ring(row.geometry,true);
    assert.ok(base.distanceTo(station(row.limb,0))<2e-6&&tip.distanceTo(station(row.limb,1))<2e-6,'actual limb ring transform');
    if(row.sides===5)assert.ok(Math.hypot(base.x,base.z)<2e-6&&base.y>result.H*.40&&base.y<result.H*.62,'leader seated within original stem');
    if(row.sides===4) {
      assert.ok(leaders.some(l=>distance(base,ring(l.geometry,false),ring(l.geometry,true))<2e-6),'secondary base connected to actual leader');primary=row;
    }
    if(row.sides===3)assert.ok(primary&&base.distanceTo(ring(primary.geometry,false).lerp(ring(primary.geometry,true),.9))<2e-6,'fork seated at actual parent90%');
    assert.ok(tip.y<=result.H*(row.sides===3?.99:.96)+2e-6,'needle tip exceeds bounded crown height');
    assert.ok(Math.hypot(tip.x,tip.z)<=variant.crw*1.1+.12+2e-6,'bounded limb radial reach');
  }
  for(const call of stations)assert.ok(call.point.distanceTo(station(call.limb,call.t))<2e-12,'station agrees with independent rotation');
  const crown=limbs.filter(l=>l.sides!==3);
  assert.ok(cards.length>=crown.length,'every leader/primary receives a terminal spray');
  for(const [i,card]of cards.entries()) {
    const limb=crown[i%crown.length],a=ring(limb.geometry,false),b=ring(limb.geometry,true);
    const center=point(card.geometry,0).add(point(card.geometry,3)).multiplyScalar(.5);
    assert.ok(center.distanceTo(card.center)<2e-6,'actual card center');
    assert.ok(distance(center,a,b)<=.120002,'spray remains near actual parent segment');
    if(i<crown.length)assert.ok(center.distanceTo(a.lerp(b,.94))<=.120002,'first cycle has terminal spray');
    assert.ok(card.width>=1.05&&card.width<=2&&Math.abs(card.height/card.width-1.05)<1e-12,'unchanged card size envelope');
  }
}
function dispose(result) {
  for(const g of new Set([...Object.values(result.pair),...result.observation.parts.flat()]))g.dispose();
}
const palettes=[{}, {snow:.75}, getMapConfig('autumn').vegetation.palettes.birch,
  getMapConfig('autumn').vegetation.palettes.aspen];
const seeds=[0,1,1337,2086,2093,2100,2332,2339,2346,7719,0x71ee,0xffffffff],receipts=[];
let floatingOld=0,needleOld=0;
for(const [paletteId,palette]of palettes.entries())for(const [variantId,variant]of current.BIRCH_VAR.entries())for(const seed of seeds) {
  const a=build(before,seed,palette,variant),b=build(current,seed,palette,variant);
  try {
    assert.deepEqual(b.draws,a.draws,'exact original constructor RNG draw sequence');assert.deepEqual(b.tail,a.tail);
    const [oldTrunk,oldCards]=a.observation.parts,[trunk,cards]=b.observation.parts;
    assert.equal(trunk.length,oldTrunk.length);assert.equal(cards.length,oldCards.length,'same fork/snow/card topology');
    for(let i=0;i<trunk.length;i++)exact(oldTrunk[i],trunk[i],i<6);
    for(let i=0;i<cards.length;i++)exact(oldCards[i],cards[i],false);
    for(const key of ['trunk','cards'])exact(a.pair[key],b.pair[key],false);
    connections(b,variant);
    const oldLimbs=oldTrunk.filter(g=>g.parameters?.heightSegments===1&&g.parameters?.radialSegments<=5);
    const oldLeaders=oldLimbs.filter(g=>g.parameters.radialSegments===5);
    floatingOld+=oldLimbs.filter(g=>g.parameters.radialSegments===4&&!oldLeaders.some(l=>distance(ring(g,false),ring(l,false),ring(l,true))<2e-6)).length;
    needleOld+=oldLimbs.filter(g=>ring(g,true).y>b.H*.99+2e-6).length;
    b.pair.cards.computeBoundingBox();receipts.push({paletteId,variantId,seed,H:b.H,cards:cards.length,limbs:b.observation.limbs.length,
      rngCalls:b.draws.length,cardBounds:[b.pair.cards.boundingBox.min.toArray(),b.pair.cards.boundingBox.max.toArray()]});
    if(seed===0&&paletteId===0&&variantId===0) {
      const limb=b.observation.limbs.find(l=>l.sides===4),saved=limb.geometry;
      limb.geometry=saved.clone();limb.geometry.parameters=saved.parameters;limb.geometry.translate(1,0,0);limb.limb.x+=1;
      assert.throws(()=>connections(b,variant),/base connected/,'floating branch negative');
      limb.geometry.dispose();limb.geometry=saved;limb.limb.x-=1;
      const leader=b.observation.limbs[0],oldLength=leader.limb.length;
      leader.limb.length+=b.H;const replacement=new THREE.CylinderGeometry(.014,.075,leader.limb.length,5,1);
      replacement.translate(0,leader.limb.length/2,0).rotateZ(leader.limb.tilt).rotateY(leader.limb.yaw).translate(leader.limb.x,leader.limb.y,leader.limb.z);
      const previous=leader.geometry;leader.geometry=replacement;
      assert.throws(()=>connections(b,variant),/needle tip/,'exposed needle negative');
      leader.geometry=previous;leader.limb.length=oldLength;replacement.dispose();
    }
  } finally {dispose(a);dispose(b);}
}
assert.ok(floatingOld>0&&needleOld>0,'authentic predecessor reaches disconnected and over-height cases');
console.log(JSON.stringify({cases:receipts.length,floatingOld,needleOld,receipts,
  limits:'Actual geometry construction, retained buffer/topology/RNG comparisons. Card-to-limb proximity is not alpha-opaque contact, world slope contact, native art or performance proof.'}));
