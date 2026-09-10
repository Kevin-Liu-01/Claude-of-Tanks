// Test-only inverse of ONE added call. Never bypass the runtime finisher's
// required station guards to force an old unsupported-course fixture through.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const url=new URL('./leopardX.ts',import.meta.url),source=readFileSync(url,'utf8');
const call='  lineUpperReturnBand(P,[-1.94,-.16,1.48,2.30],.01403);\n';
assert.equal(source.split(call).length-1,1,'Exactly one independently qualified A5 lining call');
const inverse=source.replace(call,'').replace(/from (['"])([^'"]+)\1/g,(_all,quote,path)=>
 `from ${quote}${path.startsWith('.')?new URL(path,url).href:import.meta.resolve(path)}${quote}`);
const module=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(inverse)).toString('base64'));
export const unlinedLeopard2A5TestBuilder=module.buildLeopard2A5X;
assert.equal(typeof unlinedLeopard2A5TestBuilder,'function');
