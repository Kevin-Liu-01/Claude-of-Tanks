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
