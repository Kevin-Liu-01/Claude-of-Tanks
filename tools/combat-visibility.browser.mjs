#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import puppeteer from 'puppeteer';
import {acquireCaptureLock,releaseCaptureLock} from './capture-lock.mjs';
import {nativeBrowserLaunchOptions} from './native-browser-launch.mjs';
await acquireCaptureLock(60000);
let browser,server;const errors=[],out='.qa-dev/combat-visibility';mkdirSync(out,{recursive:true});
try{
 server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:5208,strictPort:true,hmr:false}});await server.listen();
 browser=await puppeteer.launch(nativeBrowserLaunchOptions({headless:true,args:['--use-gl=angle','--enable-webgl','--no-sandbox']}));
 const page=await browser.newPage();await page.setViewport({width:1200,height:700});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5208/tools/fixtures/combat-visibility.html');
 await page.waitForFunction('window.__LOD_QA',{timeout:120000});
 const reports=[];
 for(const far of [false,true]){
  const report=await page.evaluate(far=>__LOD_QA.render(far),far);reports.push(report);
  assert.deepEqual(report.missing,[],`Combat stock receives real color-pass draws at ${report.distance}m`);
  await page.screenshot({path:`${out}/${far?'far':'near'}.png`});
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify({pass:true,reports},null,2));
 console.log(JSON.stringify(reports));
}finally{await browser?.close();await server?.close();releaseCaptureLock();}
