import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createCaptureLock} from './capture-lock.mjs';
import {withIsolatedCaptureBrowser} from './isolated-capture-browser.mjs';
const out=resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'.qa-dev/far-tree-trunks');
mkdirSync(out,{recursive:false});const lock=createCaptureLock(),rows=[],errors=[];let refresh;
try{await lock.acquire(45*60*1000);refresh=setInterval(()=>lock.refresh(),30000);refresh.unref();
 await withIsolatedCaptureBrowser({root:process.cwd(),logLevel:'error',server:{port:0,host:'127.0.0.1',hmr:false,watch:null}},
 {headless:'new',args:['--use-gl=angle','--enable-webgl','--no-sandbox']},async({server,browser})=>{
 const page=await browser.newPage();await page.setViewport({width:1280,height:720,deviceScaleFactor:1});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tools/far-tree-trunk-audit.html`,{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>window.__FAR_TREE_AUDIT);
 for(const family of ['oak','pine','palm','birch'])for(const view of ['whole','base']){
 const {image,...row}=await page.evaluate((family,view)=>window.__FAR_TREE_AUDIT.render(family,view),family,view);
 writeFileSync(resolve(out,`${family}-${view}.png`),Buffer.from(image.split(',')[1],'base64'));rows.push(row);
 }
 });
}finally{if(refresh)clearInterval(refresh);lock.release();writeFileSync(resolve(out,'report.json'),JSON.stringify({rows,errors},null,2));}
if(errors.length)throw Error(errors.join('\n'));
