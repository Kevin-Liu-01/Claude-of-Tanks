import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
execFileSync(process.execPath,['tools/generate-manual-reference.mjs','--check'],{stdio:'inherit'});
const data=JSON.parse(readFileSync('src/docs/reference.generated.json','utf8'));
assert.equal(new Set(data.vehicles.map(v=>v.id)).size,data.vehicles.length);
for(const vehicle of data.vehicles){
 for(const key of ['hp','speed','reverse','hull','turret','dispersion','reload','aim','view'])
  assert.ok(Number.isFinite(vehicle[key])&&vehicle[key]>=0,`${vehicle.id}: finite ${key}`);
 assert.equal(vehicle.lights,true,`${vehicle.id}: public capability must expose working lights`);
}
assert.deepEqual(Object.keys(data),['vehicles'],'the reference projects the fleet only (maps and modes are the chapters\' own)');
for(const locale of ['en-US','zh-CN']){
 const catalog=JSON.parse(readFileSync(`src/ui/i18nCatalog.${locale}.json`,'utf8'));
 assert.ok(catalog['docs.reference.vehicles.title']);
}
console.log('Manual references: fresh fleet data, complete values and light capabilities PASS');
