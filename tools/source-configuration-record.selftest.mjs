import {BARAK_SOURCE_CONFIGURATION} from './barak-source-openings.mjs';
import {canonicalConfigurationPath} from './source-configuration-path.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {verifyConfigurationSource} from './source-configuration-record.mjs';
const root=fs.mkdtempSync(path.join(tmpdir(),'cot-source-configuration-'));
const id='fixture_x',relative=`public/models/community-candidates/${id}_source.glb`;
const bytes=Buffer.from('immutable original source fixture');
const config={id,roofMachineGuns:0,source:{path:relative,sha256:createHash('sha256').update(bytes).digest('hex')}};
try{
 fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});fs.writeFileSync(path.join(root,relative),bytes);
 assert.equal(verifyConfigurationSource(id,config,root).verified,true);
 assert.equal(verifyConfigurationSource('other_x',config,root).verified,false,'authorization belongs to exact vehicle');
 assert.equal(verifyConfigurationSource(id,{...config,source:{...config.source,path:'../other.glb'}},root).verified,false);
 fs.writeFileSync(path.join(root,relative),'changed source');
 assert.equal(verifyConfigurationSource(id,config,root).verified,false,'changed on-disk source invalidates target');
 fs.rmSync(path.join(root,relative));
 assert.equal(verifyConfigurationSource(id,config,root).verified,false,'missing source fails closed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('source-configuration-record: exact ID/path/hash and missing/changed-source negatives pass');

assert.equal(canonicalConfigurationPath('merkava4_barak'),BARAK_SOURCE_CONFIGURATION.source.path);
assert.equal(canonicalConfigurationPath('aft10_x'),'public/models/community-candidates/aft10_x_source.glb');
assert.equal(canonicalConfigurationPath('../escape'),null);
for(const change of [{source:{...BARAK_SOURCE_CONFIGURATION.source,path:'public/models/community-candidates/merkava4_barak_source.glb'}},{registration:{...BARAK_SOURCE_CONFIGURATION.registration,scale:1}},{originalSha256:'a'.repeat(64)}])
 assert.equal(verifyConfigurationSource('merkava4_barak',{...BARAK_SOURCE_CONFIGURATION,...change},root).reason,'Malformed source configuration',
   'invalid recipe fails before any absent-file fallback');
