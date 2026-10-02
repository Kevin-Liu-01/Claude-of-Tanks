import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const inline=html.match(/<style id="cot-font-faces">([\s\S]*?)<\/style>/)?.[1];
assert.ok(inline,'first-paint font declarations must have a reusable owner');
const rules=css=>[...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([,body])=>
  Object.fromEntries(body.trim().split(';').filter(x=>x.trim()).map(x=>{
    const split=x.indexOf(':');return [x.slice(0,split).trim(),x.slice(split+1).trim()];
  })));
for(const rule of rules(inline)){
  assert.equal(rule['font-display'],'swap','late fonts must still replace the fallback');
  const url=rule.src.match(/url\('([^']+)'\)/)[1];
  assert.equal(readFileSync(new URL(`../../public${url}`,import.meta.url)).subarray(0,4).toString(),'wOF2');
}

const original=globalThis.document;
try{
  for(const supplied of [false,true]){
    const styles=new Map(),loads=[];
    if(supplied)styles.set('cot-font-faces',{textContent:inline});
    globalThis.document={
      getElementById:id=>styles.get(id),createElement:()=>({id:'',textContent:''}),
      head:{appendChild:node=>styles.set(node.id,node)},
      fonts:{load:font=>{loads.push(font);return Promise.resolve([]);}},
    };
    const {ensureFonts}=await import(`./fonts.ts?test=${supplied}`);
    for(let i=0;i<20;i++)ensureFonts();
    assert.equal(styles.size,2,'repeated overlays reuse declarations and type tokens');
    assert.deepEqual(rules(styles.get('cot-font-faces').textContent),rules(inline),'boot/runtime font policies agree');
    assert.deepEqual(loads,["500 16px 'ABC Monument Grotesk'","700 16px 'ABC Monument Grotesk'"],
      'warm only the two physical UI faces once, without eagerly fetching Regular');
  }
}finally{globalThis.document=original;}
console.log('fonts: reusable first-paint rules, hosted WOFF2 files and bounded warming passed');
