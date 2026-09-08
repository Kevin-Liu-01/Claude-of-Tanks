import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer,preview} from 'vite';
import {isExistingProjectDocument} from './existing-document-route.ts';

const fixture=mkdtempSync(join(tmpdir(),'cot-document-routing-'));
const root=join(fixture,'site'),built=join(fixture,'dist');
const document='<!doctype html><title>routing fixture</title><main>real document</main>';
let server,previewServer;
try{
  mkdirSync(join(root,'tools'),{recursive:true});mkdirSync(built);
  for(const dir of [root,built])for(const file of ['index.html','gallery.html','404.html'])writeFileSync(join(dir,file),document);
  writeFileSync(join(root,'tools','audit.html'),document);
  writeFileSync(join(fixture,'outside.html'),document);
  symlinkSync(join(fixture,'outside.html'),join(root,'escape.html'));
  mkdirSync(join(root,'directory.html'));
  for(const route of ['/index.html','/gallery.html','/tools/audit.html','/gallery%2ehtml'])
    assert.equal(isExistingProjectDocument(route,root),true,route);
  for(const route of ['/missing.html','/tools/missing.html','/directory.html','/escape.html',
    '/../outside.html','/%2e%2e/outside.html','//outside.html','/\\outside.html','/%00.html','/%ZZ.html','/gallery'])
    assert.equal(isExistingProjectDocument(route,root),false,route);
  assert.equal(isExistingProjectDocument('/tools/audit.html',built),false,'Preview must not admit a source-only HTML file');

  const configFile=resolve('vite.config.ts');
  server=await createServer({root:process.cwd(),configFile,logLevel:'error',
    server:{host:'127.0.0.1',port:30000+(process.pid%15000),strictPort:false,hmr:false,watch:null,warmup:{clientFiles:[]}},
    optimizeDeps:{noDiscovery:true,include:[]}});
  await server.listen();
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  const check=async(base,route,status,marker)=>{
    const response=await fetch(base+route,{headers:{Accept:'text/html'},redirect:'manual'});
    assert.equal(response.status,status,`${base}${route}: HTTP status`);
    const body=await response.text();assert.ok(body.includes(marker),`${route}: actual requested document body`);
  };
  await check(origin,'/gallery.html?id=merkava3d_x&layer=markup',200,'Tank Gallery');
  // Vite extracts inline module bodies; assert the requested HTML title here.
  // Native track-duplicate-audit separately verifies module execution/readiness.
  await check(origin,'/tools/track-duplicate-audit.html?id=t90a_burlak_x',200,'<title>Track duplicate audit</title>');
  await check(origin,'/gallery?id=merkava3d_x',200,'Tank Gallery');
  await check(origin,'/definitely-missing-document.html',404,'not-found');
  await check(origin,'/definitely-missing-route',404,'not-found');
  await check(origin,'/404.html',404,'not-found');
  await server.close();server=null;

  previewServer=await preview({root:process.cwd(),configFile,logLevel:'error',build:{outDir:built},
    preview:{host:'127.0.0.1',port:31000+(process.pid%15000),strictPort:false}});
  const previewOrigin=`http://127.0.0.1:${previewServer.httpServer.address().port}`;
  await check(previewOrigin,'/gallery.html?id=merkava3d_x',200,'real document');
  await check(previewOrigin,'/gallery?id=merkava3d_x',200,'real document');
  await check(previewOrigin,'/tools/track-duplicate-audit.html',404,'real document');
  await check(previewOrigin,'/missing.html',404,'real document');
  await check(previewOrigin,'/404.html',404,'real document');
}finally{
  await server?.close();
  await new Promise(resolve=>previewServer?previewServer.httpServer.close(resolve):resolve());
  rmSync(fixture,{recursive:true,force:true});
}
console.log('existing-document-route: confined real HTML files, missing routes, explicit 404, actual dev and preview HTTP all pass');
