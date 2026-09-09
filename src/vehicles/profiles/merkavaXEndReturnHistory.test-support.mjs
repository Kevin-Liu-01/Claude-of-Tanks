// Test-only composition of two separately qualified additive bodywork seams.
// Neither sibling is an inverse for physical geometry or a refreshed golden.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

export const MERKAVA_END_RETURN_BEFORE_SHA256 =
  'a7cb2366ce25ac6c6e3ff9c9d78ad7bf4c8fa2a6b0f6211ef9d92e6391d127f6';
export const MERKAVA_END_RETURN_SEAMS = Object.freeze([
  Object.freeze({id:'merkava3d_x',symbol:'addMerkava3dXFrontReturns',file:'merkava3dXFrontReturn.ts',
    sha256:'31f87c0c11deb1fc86f5fa1ffede512494f2cf2fec0e0e1a555626889c3c5479'}),
  Object.freeze({id:'merkava4_x',symbol:'addMerkava4XEndReturns',file:'merkava4XEndReturns.ts',
    sha256:'28c6b33721161a0c601b1e561a58c635e6d0c242b4be45a7fce6a67ba66da39d'}),
]);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const count=(source,part)=>source.split(part).length-1;
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');

export function authenticateMerkavaEndReturnHistory(requiredId, {
  source=read('merkavaX.ts'), readHelper=read,
}={}) {
  assert.ok(MERKAVA_END_RETURN_SEAMS.some(s=>s.id===requiredId),'Known physical test owner');
  let before=source;
  const present=[];
  for(const s of MERKAVA_END_RETURN_SEAMS){
    const imported=`import { ${s.symbol} } from './${s.file}';\n`;
    const anchor=`  addMerkavaXShoulderReturns(P, '${s.id}');\n`;
    const call=`  ${s.symbol}(P);\n`;
    const occurrences=count(source,s.symbol);
    if(occurrences===0){
      assert.notEqual(s.id,requiredId,'The physical test owner must actually be emitted');
      continue;
    }
    assert.equal(occurrences,2,`${s.id}: exactly one import and one call`);
    assert.equal(count(source,imported),1,`${s.id}: exact single import`);
    assert.equal(count(source,anchor+call),1,`${s.id}: call at its own immutable builder seam`);
    assert.equal(hash(readHelper(s.file)),s.sha256,`${s.id}: entire independently reviewed helper`);
    before=before.replace(imported,'').replace(anchor+call,anchor);
    present.push(s.id);
  }
  assert.equal(hash(before),MERKAVA_END_RETURN_BEFORE_SHA256,
    'Complete original shared profile: no other source change is normalized');
  return Object.freeze({beforeSha256:MERKAVA_END_RETURN_BEFORE_SHA256,present:Object.freeze(present)});
}
