#!/usr/bin/env node
// Committed rendered regression; accepts an existing dev server and Playwright.
// node tools/battle-hud-layout.browser.mjs --url=http://127.0.0.1:5189 --out=/tmp/hud-check
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const arg = (name, fallback) => process.argv.find(v=>v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const { chromium } = await import(arg('playwright-module','playwright'));
const out = resolve(arg('out','outputs/battle-hud-layout'));
await mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const cases = [
  ['desktop',1920,1080,false],['laptop',1366,768,false],['laptop-short',1280,720,false],
  ['small-desktop',1024,600,false],['tablet-mouse',820,1180,false],['narrow-mouse',540,720,false],
  ['phone-mouse',390,844,false],['tablet',1024,768,true],['tablet-portrait',768,1024,true],
  ['narrow-phone',320,568,true],['short-landscape',568,256,true],['phone',390,844,true],['small-phone',360,640,true],['landscape',844,390,true],
  ['small-landscape',667,375,true],['short-mouse',844,390,false],
  ['tiny-landscape',568,320,true],['browser-landscape',844,300,true],['wide-landscape',932,430,true],
  ['chinese-landscape',667,375,true,'zh-CN'],
  ['chinese-laptop',1280,720,false,'zh-CN'],['chinese-phone',390,844,true,'zh-CN'],
];
// combined-spotted: the combined state with detection lit (verifier 2026-10-16: the incoming-damage toast vanished
// under it); alert-*: the longest alerts over detection, in en and zh (round 4 clamped them to two lines).
const states = ['idle','feed-burst','notifications','countdown','reports','log','chat','combined','combined-spotted','spectator','settings','sniper','large-map','ammo-expanded','special','mode-standard','mode-capture_the_flag','mode-zone_control','mode-turbo_ball','mode-endless_horde','mode-frontline_assault','mode-mars','alert-wave','alert-ammo','alert-flag','ended'];
const reports=[];const errors=[];const reticleReach=[];const reticleYields=[];const swipes=[];const droneCues=[];const liveInk=[];const tileTable=[];const inkTable=[];
// MAIN'S FEEDS (verifier 2026-10-16). On every touch screen and state, the kill feed and the incoming-damage feed show
// no fewer rows than main does, the kill rows clear of the battle sight at full bloom no fewer than main's, the alert
// shows its whole text (no clamp, nothing scrolled away), and the detection keeps its second line wherever main shows
// it. Main's numbers (five controls) are pinned in tools/fixtures/battle-hud-layout.main-feeds.json; --record-main=<file>
// (with --main-label=<commit>) against a server of main's tree measures them again (the same states, nothing else).
// The pseudo-states are touch checks (a mouse layout keeps main's own notice places, unchanged).
const TOUCH_ONLY = new Set(['combined-spotted','alert-wave','alert-ammo','alert-flag']);
// ROUND 6 (verifier 2026-10-16). On every touch screen and state: no notice, countdown or dock tile lies on a round
// button's caption (AUTO AIM, SCOPE, FIRE hang 17 px under their buttons; measure() overlaps them like any control), no
// dock tile covers the swipe-to-aim hint, the dock shows at least as many controls whole as main's strip did (main's
// strip scrolled under a hidden scrollbar: tiles, pinned per screen), and no notice or countdown covers more of the
// reticle's ink, or of its resting crosshair, than main's does in the same state (the ink is read from the reticle
// canvas itself, in both sights at rest and at full bloom with the magazine and SWITCHING readouts, and main's boxes
// are pinned per state). The dock may lie on the scope's cross-arm tips: a tile under them must be dimmed.
const recordMain = arg('record-main','');
const MAIN_FEEDS = recordMain ? null : JSON.parse(await readFile(new URL('./fixtures/battle-hud-layout.main-feeds.json', import.meta.url),'utf8'));
const mainRecord = {};
const mainTiles = {};
const feedTable = [];
function feedNumbers(){
  const vis=e=>!e.hidden&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&e.getBoundingClientRect().height>1;
  const rows=[...document.querySelectorAll('.cot-kill-lane .cot-kf')].filter(vis).map(e=>e.getBoundingClientRect());
  const cx=innerWidth/2,cy=innerHeight/2,ring=Math.max(32,Math.ceil(.15*Math.min(innerWidth,innerHeight)));
  const clear=rows.filter(r=>Math.hypot(Math.max(r.left-cx,0,cx-r.right),Math.max(r.top-cy,0,cy-r.bottom))>=ring).length;
  const sixth=document.querySelector('.cot-sixth.on'),sub=sixth?.querySelector('.sub');
  const copy=document.querySelector('.cot-alert.show .cot-alert-copy'),style=copy&&getComputedStyle(copy);
  return {k:rows.length,r:clear,t:[...document.querySelectorAll('.cot-si-toast')].filter(vis).length,sub:sixth?!!(sub&&vis(sub)):null,
    alert:copy?{text:copy.textContent,sh:copy.scrollHeight,ch:copy.clientHeight,sw:copy.scrollWidth,cw:copy.clientWidth,
      clamp:style.webkitLineClamp,size:style.fontSize}:null};
}
// The notices' and the countdown's boxes (round 6: main's are pinned per state, to weigh their reticle ink against).
function noticeBoxes(){
  const box=selector=>{const el=document.querySelector(selector);if(!el||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return null;
    const r=el.getBoundingClientRect();return r.width>=1&&r.height>=1?[r.left,r.top,r.width,r.height].map(v=>Math.round(v*10)/10):null;};
  return {d:box('.cot-sixth.on'),a:box('.cot-alert.show'),c:box('.cot-prebattle.on')};
}
// The tiles of the vehicle controls shown whole at once: main's strip scrolled (tiles past its box are cut off), the
// dock shows every tile not waiting behind More (More itself is no control).
function wholeTiles(){
  const row=document.querySelector('.cot-vehicle-controls');
  if(!row||!row.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return null;
  const box=row.getBoundingClientRect(),docked=document.body.hasAttribute('data-hud-dock');
  const controls=[...row.children].filter(t=>!t.classList.contains('cot-dock-more')&&t.getClientRects().length);
  const shown=controls.filter(t=>{
    if(!t.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||t.hasAttribute('data-dock-overflow'))return false;
    const r=t.getBoundingClientRect();
    return r.left>=-.5&&r.top>=-.5&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5&&(docked||(r.left>=box.left-.5&&r.right<=box.right+.5));
  }).length;
  return {laid:controls.length,shown};
}
// The reticle's ink as the canvas draws it (round 6): the union over both sights at rest and at full bloom, with the
// magazine and SWITCHING readouts, and the battle sight at rest alone (the resting crosshair). Kept in the page.
async function reticleMasks(){
  const f=window.__HUD_LAYOUT,canvas=document.querySelector('.cot-ret'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const W=canvas.width,H=canvas.height,union=new Uint8Array(W*H);let rest=null;
  for(const [sight,bloom,readout] of [['battle','rest','none'],['battle','full','magazine'],['battle','full','switching'],['scope','rest','magazine'],['scope','full','magazine'],['scope','full','switching']]){
    f.state('idle');f.reticle({sight,bloom,readout});
    await new Promise(r=>setTimeout(r,170)); // the scope's 0.1 s fade-in runs on the wall clock
    f.repaint();
    const data=ctx.getImageData(0,0,W,H).data,bits=new Uint8Array(W*H);
    for(let i=0;i<W*H;i++)if(data[i*4+3]>=12){bits[i]=1;union[i]=1;}
    if(sight==='battle'&&bloom==='rest')rest=bits;
  }
  f.restAim();
  window.__retMasks={W,H,cw:canvas.clientWidth||innerWidth,ch:canvas.clientHeight||innerHeight,union,rest};
  let n=0;for(let i=0;i<W*H;i++)n+=union[i];
  return n;
}
// Each notice's reticle ink (union) and resting-crosshair ink, and the same for main's boxes in this state.
function noticeInk(main){
  const m=window.__retMasks;
  if(!m||m.cw!==innerWidth||m.ch!==innerHeight)return null;
  const sx=m.W/m.cw,sy=m.H/m.ch;
  const count=(bits,r)=>{if(!r)return null;let n=0;
    for(let y=Math.max(0,Math.floor(r[1]*sy));y<Math.min(m.H,Math.ceil((r[1]+r[3])*sy));y++)for(let x=Math.max(0,Math.floor(r[0]*sx));x<Math.min(m.W,Math.ceil((r[0]+r[2])*sx));x++)n+=bits[y*m.W+x];
    return Math.round(n/sx/sy);};
  // (Each page function is sent alone: noticeBoxes() restated.)
  const box=selector=>{const el=document.querySelector(selector);if(!el||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return null;
    const r=el.getBoundingClientRect();return r.width>=1&&r.height>=1?[r.left,r.top,r.width,r.height]:null;};
  const here={d:box('.cot-sixth.on'),a:box('.cot-alert.show'),c:box('.cot-prebattle.on')},out={};
  for(const k of ['d','a','c'])if(here[k]&&main?.[k])out[k]={ink:count(m.union,here[k]),core:count(m.rest,here[k]),mainInk:count(m.union,main[k]),mainCore:count(m.rest,main[k]),box:here[k],main:main[k]};
  return out;
}
// The centre notices and the countdown against the reticle (round 4; centreNotices.ts): the widest keep-out each box
// clears, 3 everything the reticle draws at any bloom, 2 the battle sight at full bloom, 1 the crosshair core, 0 none.
// Each touch screen of the receipt must reach its floor (centreNotices.selftest.mjs pins the same table; main reaches 0
// on every phone); a size outside the table (a rotation mid-check) is recorded only. 320 x 568 reaches 1 (round 5): with
// the feeds' rows kept, the whole alert shown and the detection's second line kept, its only room left between the
// minimap, the ammo rail and the ring is too short for both notices.
// Round 6: the dock shows at least main's whole tiles before the notices are weighed, and on three screens the notices'
// clear place was the dock's only room for that (centreNotices.selftest.mjs): 360 x 640 1, 320 x 568 0 and 1, 568 x 320
// 1 and 0; there noticeInk() holds them to main's ink.
const CENTRE_FLOOR={'360x640':[1,3],'390x844':[3,3],'844x390':[3,3],'667x375':[3,3],'320x568':[0,1],'568x256':[0,0],'568x320':[1,0],
  '844x300':[3,3],'932x430':[3,3],'1024x768':[3,3],'768x1024':[3,3]};
function centreClearance(){
  const tiers=window.__HUD_LAYOUT.reticleTiers(innerWidth,innerHeight);
  const hits=(r,k)=>'r' in k?Math.hypot(Math.max(r.left-k.x,0,k.x-r.right),Math.max(r.top-k.y,0,k.y-r.bottom))<k.r
    :r.left<k.x+k.w&&r.right>k.x&&r.top<k.y+k.h&&r.bottom>k.y;
  const level=el=>{
    if(!el||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return null;
    const r=el.getBoundingClientRect();
    for(let l=3;l>=1;l--)if(tiers[l-1].every(k=>!hits(r,k)))return l;
    return 0;
  };
  return {detection:level(document.querySelector('.cot-sixth.on')),alert:level(document.querySelector('.cot-alert.show')),
    countdown:level(document.querySelector('.cot-prebattle.on'))};
}
// Live reticle ink against the touch action dock (round 4; touchDockYield.ts). The gun mark rides the gun's own point and
// the incoming-hit wedges and their figures circle the centre far beyond any static keep-out, so the dock sits under the
// reticle canvas and each tile the ink reaches dims. Read from the canvas's own pixels: every visible tile with reticle
// ink under it (alpha >= 12/255) must be dimmed (data-ret-yield), and the canvas must stack above the row (also with the
// More panel open), so no tile ever covers that ink.
function inkUnderTiles(){
  const canvas=document.querySelector('.cot-ret'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const scale=canvas.width/(canvas.clientWidth||innerWidth);
  const row=document.querySelector('.cot-vehicle-controls');
  const tiles=[...row.children].filter(tile=>tile.checkVisibility({checkVisibilityCSS:true})).map(tile=>{
    const r=tile.getBoundingClientRect();
    const x0=Math.max(0,Math.floor(r.left*scale)),y0=Math.max(0,Math.floor(r.top*scale));
    const w=Math.min(canvas.width-x0,Math.ceil(r.width*scale)),h=Math.min(canvas.height-y0,Math.ceil(r.height*scale));
    let ink=0;
    if(w>0&&h>0){const data=ctx.getImageData(x0,y0,w,h).data;for(let i=3;i<data.length;i+=4)if(data[i]>=12)ink++;}
    return {name:tile.className.split(' ')[0]||'tile',x:r.left,y:r.top,w:r.width,h:r.height,ink:Math.round(ink/scale/scale),
      dimmed:tile.hasAttribute('data-ret-yield'),panel:tile.hasAttribute('data-dock-overflow')};
  });
  const z=el=>Number(getComputedStyle(el).zIndex);
  return {tiles,ret:z(canvas),row:z(row),lens:z(document.querySelector('.cot-ret-lens')),open:document.body.hasAttribute('data-hud-dock-open')};
}
function measure(state){
  // Kept inside the serialized page callback so browser execution needs no
  // Node-side closure. Preserve selector/DOM order for overlap diagnostics.
  function collectVisibleRects(selectors){
    const rects=[];
    for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
      if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
      const r=el.getBoundingClientRect();
      if(r.width<1||r.height<1)continue;
      rects.push({name:el.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom});
    }
    return rects;
  }
  const selectors = state==='settings' ? ['.cot-set-hdr','.cot-set-tabs','.cot-set-body','.cot-set-ftr'] :
    state==='ended' ? ['.es-hero','.es-report','.es-actions'] :
    ['.cot-aim-warning:not([hidden])','.cot-sixth.on','.cot-alert.show','.cot-ear.l','.cot-ear.r','.cot-top','.cot-mode-status.show','.cot-kill-lane.l','.cot-kill-lane.r','.cot-net','.cot-drive','.cot-dp','.cot-minimap',
     '.cot-si-toasthost','.cot-si-log.open','.cot-si-cardhost:not(:empty)',
     '.cot-room-chat:not([hidden])','.cot-spec.show','.cot-prebattle',
     '.cot-shell','.cot-con','.cot-vehicle-controls','.cot-touch.on .joy','.cot-touch.on .round','.cot-touch.on .round>.lb',
     '.cot-touch.on .mobile-chrome'];
  const rects=collectVisibleRects(selectors);
  const failures=[],laneOverlaps=[];
  for(let i=0;i<rects.length;i++){
    const a=rects[i];
    // A caption may hang past the bottom edge where main hangs it (FIRE's on 568 x 256): only what it overlaps counts.
    if(a.name!=='lb'&&(a.x<-.5||a.y<-.5||a.right>innerWidth+.5||a.bottom>innerHeight+.5))failures.push(`offscreen: ${a.name}`);
    for(const b of rects.slice(i+1)){
      if(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1))continue;
      // A dock standing in the notices' lane (touchActionDock.ts inLane: no room at all cleared it, 568 x 256): a notice
      // or the countdown shown there must read over the dock and let a tap through to it; anything else still fails.
      const pair=[a.name,b.name];
      const notice=pair.find(n=>/^cot-(sixth|alert|prebattle)\b/.test(n));
      if(document.body.hasAttribute?.('data-hud-dock-lane')&&notice&&pair.includes('cot-vehicle-controls')){
        const el=document.querySelector(`.${notice.split(' ').join('.')}`),row=document.querySelector('.cot-vehicle-controls');
        const over=el&&Number(getComputedStyle(el).zIndex)>Number(getComputedStyle(row).zIndex)&&getComputedStyle(el).pointerEvents==='none';
        if(over){laneOverlaps.push(`${notice} over the dock in its lane`);continue;}
      }
      failures.push(`${a.name} overlaps ${b.name}`);
    }
  }
  if(!rects.length) failures.push('no visible UI checked');
  const ammoTransitions=failures.length?[...document.querySelectorAll('.cot-shell')].map(el=>({
    className:el.className,ariaHidden:el.getAttribute('aria-hidden'),
    opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform,
    drawerOpen:el.parentElement.classList.contains('touch-open'),
    animations:el.getAnimations().map(animation=>({
      playState:animation.playState,currentTime:animation.currentTime,
      timing:animation.effect?.getComputedTiming(),
    })),
  })):undefined;
  return {failures,rects,body:document.body.dataset,ammoTransitions,laneOverlaps};
}
// The touch action dock's one rule (src/ui/touchActionDock.ts), on every touch screen and state where the row shows:
// docked (never the old scrolling strip), a box that cannot scroll, every visible tile (More and an open More panel
// included) at least 44 x 44 px (Apple's minimum touch target), on screen, not overlapping another tile or a touch
// control, and off the reticle's footprint (the ring at full bloom and every readout of either sight at any bloom,
// touchReticleFootprint); the gun-limit warning off the crosshair area. reticleCheck() below records what the reticle
// canvas really draws and checks it against the tiles and the footprint.
function dockIssues(){
  const row=document.querySelector('.cot-vehicle-controls');
  if(!row||!row.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return [];
  const failures=[];
  if(!document.body.hasAttribute('data-hud-dock'))failures.push('touch vehicle controls are not docked');
  const style=getComputedStyle(row);
  if(/auto|scroll/.test(`${style.overflowX} ${style.overflowY}`))failures.push('touch action dock can scroll');
  const cx=innerWidth/2,cy=innerHeight/2,ring=Math.max(32,Math.ceil(.15*Math.min(innerWidth,innerHeight)));
  const distance=r=>Math.hypot(Math.max(r.left-cx,0,cx-r.right),Math.max(r.top-cy,0,cy-r.bottom));
  // The dock's keep-out: the reticle's footprint less the scope's arm tips (yielded live), and the warning's place.
  const footprint=window.__HUD_LAYOUT.touchAimKeepOut(innerWidth,innerHeight,document.querySelector('.cot-minimap')?.getBoundingClientRect().bottom??114);
  const keepGap=(r,k)=>'r' in k?Math.hypot(Math.max(r.left-k.x,0,k.x-r.right),Math.max(r.top-k.y,0,k.y-r.bottom))-k.r
    :Math.hypot(Math.max(r.left-k.x-k.w,0,k.x-r.right),Math.max(r.top-k.y-k.h,0,k.y-r.bottom));
  const crosses=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
  const tiles=[...row.children].filter(tile=>tile.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(tile=>tile.getBoundingClientRect());
  if(!tiles.length)failures.push('touch action dock shows no tile');
  const controls=[...document.querySelectorAll('.cot-touch.on .joy,.cot-touch.on .round,.cot-touch.on .round>.lb,.cot-touch.on .mobile-chrome,.cot-con,.cot-shell')]
    .filter(node=>node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(node=>node.getBoundingClientRect());
  // The swipe-to-aim hint (round 6): the dock never covers it; an open More panel may, for that moment.
  const hintNode=document.querySelector('.cot-touch-aim.on .aimhint');
  const hint=hintNode?.checkVisibility({checkVisibilityCSS:true})?hintNode.getBoundingClientRect():null;
  const docked=[...row.children].filter(tile=>tile.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!tile.hasAttribute('data-dock-overflow')).map(tile=>tile.getBoundingClientRect());
  if(hint&&hint.width>=1&&docked.some(tile=>crosses(tile,hint)))failures.push('touch action tile covers the swipe-to-aim hint');
  for(const [i,tile] of tiles.entries()){
    if(tile.width<44-.01||tile.height<44-.01)failures.push(`touch action tile below 44px (${tile.width}x${tile.height})`);
    if(tile.left<-.5||tile.top<-.5||tile.right>innerWidth+.5||tile.bottom>innerHeight+.5)failures.push('touch action tile offscreen');
    if(distance(tile)<ring-.5)failures.push('touch action tile covers the crosshair');
    if(footprint.some(k=>keepGap(tile,k)<1.5))failures.push('touch action tile covers the reticle footprint');
    if(tiles.slice(i+1).some(other=>crosses(tile,other)))failures.push('touch action tiles overlap');
    if(controls.some(control=>crosses(tile,control)))failures.push('touch action tile covers a touch control');
  }
  const warning=document.querySelector('.cot-aim-warning:not([hidden])');
  if(warning?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&distance(warning.getBoundingClientRect())<32)
    failures.push('gun-limit warning covers the crosshair');
  return failures;
}
try {
  for (const [name,width,height,touch,locale='en-US'] of cases) {
    if(arg('case','')&&!arg('case','').split(',').includes(name))continue;
    const context = await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,
      deviceScaleFactor:1,reducedMotion:arg('motion','reduce')});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
    await page.goto(`${arg('url','http://127.0.0.1:5189')}/tools/fixtures/battle-hud-layout.html?locale=${locale}`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.__HUD_LAYOUT);
    // Exercise the real DOMTokenList/MutationObserver path. Removing a class
    // which is already absent still produces mutation records in browsers.
    // The HUD does this every battle update; it must not measure layout again.
    await page.waitForTimeout(180);
    const idleLayoutReads=await page.evaluate(async()=>{
      const root=document.querySelector('.cot-hud');
      const special=document.querySelector('.cot-special');
      // A FIRE press toggles down/aiming/autofire on every shot (touchControls.ts): press state, never layout.
      const fire=document.querySelector('.cot-touch .fire:not(.alt)');
      const original=root.getClientRects;
      let reads=0;
      root.getClientRects=function(){reads++;return original.call(this);};
      try {
        // Settle first (round 4: on a loaded machine the first placement's own resize notices, a compact notice taking
        // its planned width, could still be relaying out when the window opened): the press window starts once eight
        // frames pass without a layout pass, and then a press or an unchanged update may cause at most one.
        for(let quiet=0,frames=0;quiet<8&&frames<120;frames++){const before=reads;await new Promise(requestAnimationFrame);quiet=reads===before?quiet+1:0;}
        reads=0;
        for(let i=0;i<24;i++){
          special.classList.remove('pending');
          for(const pressed of ['down','aiming','autofire'])fire?.classList.toggle(pressed);
          await new Promise(requestAnimationFrame);
        }
        await new Promise(requestAnimationFrame);
        return reads;
      } finally { root.getClientRects=original; }
    });
    if(idleLayoutReads>1)errors.push(`${name}: unchanged HUD or FIRE presses caused ${idleLayoutReads} layout measurements`);
    // The reticle's ink, once per screen, for noticeInk() (round 6).
    if(touch&&!recordMain&&(await page.evaluate(reticleMasks))<200)errors.push(`${name}: the reticle drew too little ink to weigh the notices against`);
    // `state` names the report (with -6-controls / -7-controls when the kit grew); `base` is the fixture state.
    async function check(state,base=state){
      const result=await page.evaluate(measure,base);
      if(touch){
        result.failures.push(...await page.evaluate(dockIssues));
        result.centre=await page.evaluate(centreClearance);
        const viewport=page.viewportSize();
        const [noticeFloor,countdownFloor]=CENTRE_FLOOR[`${viewport.width}x${viewport.height}`]??[0,0];
        for(const [what,level] of Object.entries(result.centre)){
          const floor=what==='countdown'?countdownFloor:noticeFloor;
          if(level!==null&&level<floor)result.failures.push(`the ${what} reaches the reticle (clears keep-out ${level}, needs ${floor})`);
        }
        // Never fewer controls whole on screen than main's strip showed (round 6).
        const whole=await page.evaluate(wholeTiles),mainWhole=MAIN_FEEDS?.tiles?.[name];
        if(whole&&mainWhole!=null&&base!=='spectator'&&viewport.width===width&&viewport.height===height){
          result.tiles=whole;
          if(whole.shown<Math.min(whole.laid,mainWhole))result.failures.push(`${whole.shown} of ${whole.laid} controls shown whole (main's strip ${mainWhole})`);
          tileTable.push({name,state,...whole,main:mainWhole});
        }
        // No notice or countdown covers more of the reticle's ink, or of its resting crosshair, than main's (round 6).
        const ink=MAIN_FEEDS?await page.evaluate(noticeInk,MAIN_FEEDS.cases[name]?.[base]??null):null;
        if(ink){
          result.ink=ink;
          for(const [k,v] of Object.entries(ink)){
            const what={d:'detection',a:'alert',c:'countdown'}[k];
            if(v.ink>v.mainInk)result.failures.push(`the ${what} covers ${v.ink} px of reticle ink (main ${v.mainInk}; ${v.box} vs ${v.main})`);
            if(v.core>v.mainCore)result.failures.push(`the ${what} covers ${v.core} px of the resting crosshair (main ${v.mainCore})`);
            inkTable.push({name,state,k,ink:v.ink,main:v.mainInk});
          }
        }
      }
      const score=result.rects.find(r=>r.name==='cot-top');
      const objective=result.rects.find(r=>r.name==='cot-mode-status show');
      if(score&&objective&&(objective.x<=score.x+25 || objective.right>=score.right-25))
        result.failures.push('objective must fit inside the scoreboard bottom edge');
      if(score&&objective&&Math.abs(objective.y-score.bottom)>.5) result.failures.push('objective must touch the scoreboard');
      const compactNotices=await page.locator('.cot-si-toast').evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility({checkVisibilityCSS:true})).map(node=>({
        height:node.getBoundingClientRect().height,secondary:!!node.querySelector('.l2'),
      })));
      if(compactNotices.some(row=>row.height!==26||row.secondary))result.failures.push('damage notices must share the 26px single-line kill design');
      const feedChecks=await page.evaluate(()=>{
        const failures=[];
        for(const el of document.querySelectorAll('.cot-si-toasthost,.cot-kill-lane')){
          if(!el.checkVisibility({checkVisibilityCSS:true}))continue;
          const r=el.getBoundingClientRect();
          if(r.width>(el.classList.contains('cot-kill-lane')?400.5:240.5))failures.push('notification feed exceeds its maximum width');
          if(el.classList.contains('r')?Math.abs(r.right-innerWidth)>.5:Math.abs(r.left)>.5)
            failures.push('notification feed is indented from the screen edge');
        }
        for(const toast of document.querySelectorAll('.cot-si-toast')){
          if(!toast.checkVisibility({checkVisibilityCSS:true}))continue;
          const icon=toast.querySelector('.si'),name=toast.querySelector('.attacker'),value=toast.querySelector('b');
          if(!icon||!getComputedStyle(icon).maskImage.includes('t90m_side_silhouette.png')){
            failures.push('incoming damage must use the attacking tank silhouette');continue;
          }
          const a=icon.getBoundingClientRect(),b=name.getBoundingClientRect(),c=value.getBoundingClientRect();
          if(a.width<21||a.height<11||a.right>b.left+.5||b.right>c.left+.5)
            failures.push('damage icon, attacker and outcome must remain separate in one row');
        }
        return failures;
      });
      result.failures.push(...feedChecks);
      if(base==='feed-burst'){
        const feedIssues=await page.evaluate(()=>{
          const failures=[];
          for(const host of document.querySelectorAll('.cot-kill-lane,.cot-si-toasthost')){
            if(host.children.length!==8)failures.push('burst must retain eight recent notifications');
            const h=host.getBoundingClientRect();
            const shown=[...host.children].filter(row=>!row.hidden);
            for(const row of shown){
              const r=row.getBoundingClientRect();
              if(r.top<h.top-.5||r.bottom>h.bottom+.5)failures.push('notification is partially clipped');
            }
            if(innerWidth>=1366&&innerHeight>=768&&host.classList.contains('cot-kill-lane')&&host.classList.contains('l')&&shown.length<=3)
              failures.push('spacious display did not show more than three kills');
          }
          return failures;
        });
        result.failures.push(...feedIssues);
      }

      if(base.startsWith('mode-')) {
        if(await page.locator('.cot-mode-status button').count())result.failures.push('objective must not contain a Brief button');
        const detected=result.rects.find(r=>r.name==='cot-sixth on');
        if(!detected||(base==='mode-standard'?!!objective:!objective||detected.y<objective.bottom+7))result.failures.push('detection must clear the objective by at least 7px');
      }
      if(base.startsWith('notifications')) {
        const hexagons=await page.locator('.cot-sixth.on,.cot-alert.show').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).clipPath));
        if(hexagons.length!==2||hexagons.some(shape=>!shape.startsWith('polygon(')||shape.split(',').length!==6)) result.failures.push('status notices must have six-sided outlines');
      }
      if(base!=='settings'&&base!=='ended'){
        const decoration=await page.evaluate(()=>{
          const notice=document.querySelector('.cot-kill-lane.r .cot-kf');
          const style=notice?getComputedStyle(notice):null;
          return {left:style?.borderLeftWidth,right:style?.borderRightWidth,
            mode:document.querySelector('.cot-mode-status')?.dataset.mode};
        });
        if(decoration.left&& (parseFloat(decoration.left)!==0||parseFloat(decoration.right)<=0))
          result.failures.push('enemy kill notice must use the right border');
        if(base.startsWith('mode-')&&decoration.mode!==base.slice(5))
          result.failures.push(`expected objective ${base.slice(5)}, saw ${decoration.mode}`);
      }
      if(touch&&MAIN_FEEDS){
        const now=await page.evaluate(feedNumbers);
        result.feeds=now;
        const main=MAIN_FEEDS.cases[name]?.[base];
        if(now.alert&&(now.alert.sh>now.alert.ch+1||now.alert.sw>now.alert.cw+1||(now.alert.clamp&&now.alert.clamp!=='none')))
          result.failures.push(`the alert is cut short ("${now.alert.text}": ${now.alert.sw}x${now.alert.sh} in ${now.alert.cw}x${now.alert.ch}, clamp ${now.alert.clamp})`);
        if(now.alert&&parseFloat(now.alert.size)<8)result.failures.push(`the alert's type (${now.alert.size}) is under main's smallest (8px)`);
        if(main){
          if(now.k<main.k)result.failures.push(`${now.k} kill rows (main ${main.k})`);
          if(now.r<main.r)result.failures.push(`${now.r} kill rows clear of the full-bloom ring (main ${main.r})`);
          if(now.t<main.t)result.failures.push(`${now.t} incoming-damage toasts (main ${main.t})`);
          if(main.sub&&now.sub===false)result.failures.push('the detection dropped its second line (main shows it)');
          feedTable.push({name,state,k:now.k,r:now.r,t:now.t,sub:now.sub,main});
        }
      }
      if(state==='notifications'||state==='combined'||state==='combined-spotted'||state==='spectator'||state==='feed-burst'||state.startsWith('alert-')||result.failures.length)
        await page.screenshot({path:resolve(out,`${name}-${state}.png`)});
      reports.push({name,...page.viewportSize(),touch,locale,state,...result});
      if(result.failures.length)console.log(`${name}/${state}: ${result.failures.join('; ')}`);
    }
    // Every control in the row's order: one tap, or two through More (the panel is checked open). Mars is a jump mode,
    // so the jump leads the row (vehicleControlOrder.ts), then the loadout in its own order.
    // A touch screen taps (the dock's tiles act on the lift of a touch); a mouse clicks.
    async function press(locator){
      if(!touch){await locator.click();return;}
      const box=await locator.boundingBox();
      await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    }
    async function pressControls(expected){
      await page.evaluate(()=>{
        window.__controlEvents=[];
        if(window.__controlListeners)return;
        window.__controlListeners=true;
        for(const event of ['ui:specialAction','ui:selfRight','ui:drone','ui:shellSelect','ui:smoke','ui:lightsToggle','ui:roofGun'])
          window.__HUD_LAYOUT.bus.on(event,()=>window.__controlEvents.push(event));
      });
      const controls=page.locator('.cot-vehicle-controls > button:not(.cot-dock-more)');
      for(let i=0,n=await controls.count();i<n;i++){
        const button=controls.nth(i);
        const {laidOut,behindMore}=await button.evaluate(b=>({laidOut:b.getClientRects().length>0,behindMore:b.hasAttribute('data-dock-overflow')}));
        if(!laidOut)continue;
        if(behindMore){
          await press(page.locator('.cot-vehicle-controls > .cot-dock-more'));
          errors.push(...(await page.evaluate(dockIssues)).map(issue=>`${name}: open More panel: ${issue}`));
        }
        const box=await button.boundingBox();
        if(!box||box.width<44||box.height<(touch?44:32))errors.push(`${name}: vehicle control below touch target minimum`);
        await press(button);
        if(behindMore&&await page.evaluate(()=>document.body.hasAttribute('data-hud-dock-open')))
          errors.push(`${name}: the More panel stayed open after its control acted`);
      }
      const events=await page.evaluate(()=>window.__controlEvents);
      if(events.join(',')!==expected)errors.push(`${name}: vehicle control activation mismatch: ${events}`);
      await page.evaluate(()=>document.querySelector('.cot-vehicle-controls').scrollLeft=0);
    }
    async function enter(state){
      await page.evaluate(state=>{
        const f=window.__HUD_LAYOUT;
        const base={'combined-spotted':'combined','alert-wave':'mode-endless_horde','alert-ammo':'mode-endless_horde','alert-flag':'mode-capture_the_flag'}[state];
        f.state(base??state);
        if(state==='combined-spotted'){f.bus.emit('player:spotted',{timeS:f.frame.timeS-4});f.hud.update(f.frame);}
        if(state==='alert-wave')f.bus.emit('mode:wave_cleared',{wave:12,nextWaveInS:30});
        if(state==='alert-ammo')f.bus.emit('ammo:empty',{id:f.frame.player.id});
        if(state==='alert-flag')f.bus.emit('mode:flag_dropped',{team:f.frame.player.team});
      },state);
      // ResizeObserver + its scheduled layout pass, and spectator's enter state.
      if(state==='ended')await page.waitForFunction(()=>
        ['.es-hero','.es-report','.es-actions'].every(selector=>
          document.querySelector(selector)?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})),
        null,{timeout:10000});
      else await page.evaluate(async()=>{
        // Wait for real finite UI transitions, rather than sleeping half a
        // second for every state. Infinite status pulses cannot block the gate.
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const animations=document.getAnimations().filter(a=>
          a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime));
        await Promise.race([
          Promise.all(animations.map(a=>a.finished.catch(()=>{}))),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('HUD transition did not settle')),1500)),
        ]);
        await new Promise(requestAnimationFrame);
      });
    }
    async function openDrawer(state){
      if(state==='ammo-expanded'&&touch){
        await page.locator('.cot-shell.sel').click();
        await page.waitForTimeout(180);
        if(await page.locator('.cot-shell[aria-hidden="true"]').count())errors.push(`${name}: ammo drawer failed to expand`);
      }
    }
    if(recordMain){
      // Main's numbers only: each touch state as the receipt enters it, five controls, nothing else checked.
      if(touch){
        const record=mainRecord[name]={};
        for(const state of states){
          if(state==='settings'||state==='ended')continue;
          await enter(state);
          await openDrawer(state);
          const {k,r,t,sub}=await page.evaluate(feedNumbers);
          record[state]={k,r,t,sub,...await page.evaluate(noticeBoxes)};
          if(state==='idle')mainTiles[name]=(await page.evaluate(wholeTiles))?.shown??null;
          if(state==='notifications')for(const variant of ['damaged','repaired','empty']){
            await page.evaluate(variant=>{const {bus,frame}=window.__HUD_LAYOUT;
              if(variant==='empty')bus.emit('ammo:empty',{id:frame.player.id});
              else bus.emit('module:state',{id:frame.player.id,module:'engine',state:variant==='damaged'?'red':'yellow',repaired:variant==='repaired'});},variant);
            await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
            const n=await page.evaluate(feedNumbers);
            record[`notifications-${variant}`]={k:n.k,r:n.r,t:n.t,sub:n.sub,...await page.evaluate(noticeBoxes)};
          }
        }
      }
      await context.close();
      continue;
    }
    for(const state of states){
      if(!touch&&TOUCH_ONLY.has(state))continue;
      await enter(state);
      await openDrawer(state);
      await check(state);
      if(state==='notifications') {
        for(const variant of ['damaged','repaired','empty']) {
          await page.evaluate(variant=>{
            const {bus,frame}=window.__HUD_LAYOUT;
            if(variant==='empty')bus.emit('ammo:empty',{id:frame.player.id});
            else bus.emit('module:state',{id:frame.player.id,module:'engine',
              state:variant==='damaged'?'red':'yellow',repaired:variant==='repaired'});
          },variant);
          await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
          await check(`notifications-${variant}`);
        }
      }
      if(state==='idle'){
        // The full Gravity + ATGM kit must remain usable after moving to a side lane (touch: dock rule in check()).
        const shown=await page.locator('.cot-vehicle-controls > button:not(.cot-dock-more)').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length).length);
        if(shown!==5)errors.push(`${name}: expected all five vehicle controls`);
        await pressControls('ui:selfRight,ui:specialAction,ui:smoke,ui:lightsToggle,ui:roofGun');
      }
      if(state==='settings'){
        // Backward Tab at the first control must stay in Settings, not the HUD.
        await page.locator('.cot-set-close').focus();
        await page.keyboard.press('Shift+Tab');
        if(!await page.evaluate(()=>document.querySelector('.cot-settings').contains(document.activeElement)))
          errors.push(`${name}: Tab escaped Settings`);
        for(const tab of ['controls','sound','graphics','language']){
          const button=page.locator(`.cot-set-tab[data-tab="${tab}"]`);
          // Touch deliberately has no physical-keyboard binding tab.
          if(!await button.isVisible())continue;
          await button.click();
          await check('settings');
        }
      }
    }
    // Touch: six and seven controls (a drone, an extra ATGM) keep the same rule in every state, and every control is
    // one tap away, or two through More.
    for(const count of touch?[6,7]:[]){
      for(const state of states){
        await enter(state);
        const shown=await page.evaluate(count=>window.__HUD_LAYOUT.controls(count),count);
        await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
        await openDrawer(state);
        await check(`${state}-${count}-controls`,state);
        if(state==='idle'){
          if(shown!==count)errors.push(`${name}: expected ${count} vehicle controls, saw ${shown}`);
          await pressControls(['ui:selfRight','ui:specialAction','ui:drone',...count>6?['ui:shellSelect']:[],'ui:smoke','ui:lightsToggle','ui:roofGun'].join(','));
        }
      }
    }
    // The reticle as drawn: every glyph and stroke the reticle canvas paints in the battle sight and the scope, at rest
    // and at full bloom, readouts at their widest, recorded from the canvas calls themselves. No tile (nor an open More
    // panel's) may lie on any of it, and all of it must lie inside touchReticleFootprint (2 px hairline), the keep-out
    // the dock is placed by. Then a swipe that starts on a docked tile over the aim pad must aim and not act.
    async function reticleCheck(count){
      await enter('idle');
      await page.evaluate(count=>window.__HUD_LAYOUT.controls(count),count);
      await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
      const stages=[['battle','rest','magazine'],['battle','full','magazine'],['scope','rest','magazine'],['scope','full','magazine'],['scope','full','switching'],['battle','full','switching']];
      let widest=0,dockAt=null;
      for(const [sight,bloom,readout] of stages){
        await page.evaluate(stage=>window.__HUD_LAYOUT.reticle(stage),{sight,bloom,readout});
        await page.waitForTimeout(160); // the scope's 0.1 s fade-in runs on the wall clock
        const result=await page.evaluate(()=>{
          const f=window.__HUD_LAYOUT;
          const canvas=document.querySelector('.cot-ret'),ctx=canvas.getContext('2d');
          const scale=canvas.width/(canvas.clientWidth||innerWidth);
          // Boxes for glyphs, lines and fills; rings (arcs wider than 6 px: the dispersion ring and the reload sweep, taken
          // whole) as circles, so a ring's empty corners never read as ink.
          // A path is kept as its segments (a stroke) and subpaths (a fill), never one box: the scope's four arms are one
          // path, and their common box is mostly empty.
          let ink=[],segs=[],subs=[],cur=null,start=null,circles=[];
          const point=(x,y)=>{const m=ctx.getTransform();return [(m.a*x+m.c*y+m.e)/scale,(m.b*x+m.d*y+m.f)/scale];};
          const lineScale=()=>{const m=ctx.getTransform();return Math.hypot(m.a,m.b)/scale;};
          const record=(points,pad,what)=>{
            if(!points.length||ctx.globalAlpha<=0)return;
            const shadow=ctx.shadowBlur>0&&!/,\s*0\)$|transparent/.test(ctx.shadowColor)?ctx.shadowBlur:0;
            const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
            ink.push({what,x0:Math.min(...xs)-pad-shadow+Math.min(0,ctx.shadowOffsetX),y0:Math.min(...ys)-pad-shadow+Math.min(0,ctx.shadowOffsetY),
              x1:Math.max(...xs)+pad+shadow+Math.max(0,ctx.shadowOffsetX),y1:Math.max(...ys)+pad+shadow+Math.max(0,ctx.shadowOffsetY)});
          };
          const full=(points)=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return Math.max(...xs)-Math.min(...xs)>=innerWidth*.9&&Math.max(...ys)-Math.min(...ys)>=innerHeight*.9;};
          const wraps={
            clearRect:(x,y,w,h)=>{if(w*scale>=canvas.width*.9)ink=[];},
            beginPath:()=>{segs=[];subs=[];cur=null;start=null;circles=[];},
            moveTo:(x,y)=>{cur=start=point(x,y);subs.push([cur]);},
            lineTo:(x,y)=>{const p=point(x,y);if(!cur){cur=start=p;subs.push([p]);return;}segs.push([cur,p]);subs.at(-1).push(p);cur=p;},
            closePath:()=>{if(cur&&start){segs.push([cur,start]);cur=start;}},
            arc:(x,y,r)=>{if(r*lineScale()>6){const [cx,cy]=point(x,y);circles.push({cx,cy,r:r*lineScale()});}else{const box=[point(x-r,y-r),point(x+r,y+r),point(x-r,y+r),point(x+r,y-r)];segs.push(box);subs.push(box);}},
            ellipse:(x,y,rx,ry)=>{const box=[point(x-rx,y-ry),point(x+rx,y+ry),point(x-rx,y+ry),point(x+rx,y-ry)];segs.push(box);subs.push(box);},
            quadraticCurveTo:(a,b,x,y)=>{const p=point(x,y);segs.push([cur??p,point(a,b),p]);subs.at(-1)?.push(point(a,b),p);cur=p;},
            bezierCurveTo:(a,b,c,d,x,y)=>{const p=point(x,y);segs.push([cur??p,point(a,b),point(c,d),p]);subs.at(-1)?.push(point(a,b),point(c,d),p);cur=p;},
            rect:(x,y,w,h)=>{const box=[point(x,y),point(x+w,y+h),point(x,y+h),point(x+w,y)];segs.push(box);subs.push(box);},
            roundRect:(x,y,w,h)=>{const box=[point(x,y),point(x+w,y+h),point(x,y+h),point(x+w,y)];segs.push(box);subs.push(box);},
            stroke:()=>{for(const seg of segs)record(seg,ctx.lineWidth*lineScale()/2+.5,'stroke');
              for(const c of circles)ink.push({what:'ring',ring:true,cx:c.cx,cy:c.cy,r:c.r,pad:ctx.lineWidth*lineScale()/2,x0:c.cx-c.r,y0:c.cy-c.r,x1:c.cx+c.r,y1:c.cy+c.r});},
            fill:()=>{for(const sub of subs)if(sub.length&&!full(sub))record(sub,0,'fill');for(const c of circles)ink.push({what:'disc',ring:true,cx:c.cx,cy:c.cy,r:c.r/2,pad:c.r/2,x0:c.cx-c.r,y0:c.cy-c.r,x1:c.cx+c.r,y1:c.cy+c.r});},
            fillRect:(x,y,w,h)=>{const p=[point(x,y),point(x+w,y+h),point(x,y+h),point(x+w,y)];if(!full(p))record(p,0,'fillRect');},
            strokeRect:(x,y,w,h)=>record([point(x,y),point(x+w,y+h),point(x,y+h),point(x+w,y)],ctx.lineWidth*lineScale()/2,'strokeRect'),
            fillText:(text,x,y)=>{const m=ctx.measureText(text);record([point(x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent),point(x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent)],0,`text ${text}`);},
            strokeText:(text,x,y)=>{const m=ctx.measureText(text);record([point(x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent),point(x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent)],ctx.lineWidth*lineScale()/2,`text ${text}`);},
            drawImage:()=>{ink.push({what:'image',x0:0,y0:0,x1:innerWidth,y1:innerHeight});},
          };
          for(const [name,fn] of Object.entries(wraps)){const original=ctx[name];ctx[name]=function(...args){fn(...args);return original.apply(this,args);};}
          try { f.repaint(); } finally { for(const name of Object.keys(wraps))delete ctx[name]; }
          const footprint=f.touchReticleFootprint(innerWidth,innerHeight);
          const inside=(x,y)=>footprint.some(k=>'r' in k?Math.hypot(x-k.x,y-k.y)<=k.r+2:x>=k.x-2&&x<=k.x+k.w+2&&y>=k.y-2&&y<=k.y+k.h+2);
          const outside=[];
          for(const r of ink){
            if(r.ring){
              for(let a=0;a<360;a+=3)for(const rr of [Math.max(0,r.r-r.pad),r.r+r.pad]){
                const x=r.cx+rr*Math.cos(a*Math.PI/180),y=r.cy+rr*Math.sin(a*Math.PI/180);
                if(!inside(x,y)){outside.push(`${r.what} r ${r.r.toFixed(1)} (${x.toFixed(1)},${y.toFixed(1)})`);break;}
              }
              continue;
            }
            for(let x=r.x0;x<=r.x1+.01;x+=Math.max(.5,Math.min(2,(r.x1-r.x0)/2)))for(let y=r.y0;y<=r.y1+.01;y+=Math.max(.5,Math.min(2,(r.y1-r.y0)/2))){
              if(!inside(x,y)){outside.push(`${r.what} (${x.toFixed(1)},${y.toFixed(1)})`);break;}
            }
          }
          // A tile may lie on the scope's arm tips (touchAimKeepOut): ink under a tile is allowed only on a dimmed one
          // (touchDockYield.ts: the canvas draws over the dock, liveInkCheck() checks the stacking).
          const tiles=[...document.querySelectorAll('.cot-vehicle-controls>button')].filter(t=>t.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!t.hasAttribute('data-ret-yield')).map(t=>t.getBoundingClientRect());
          const yielded=[...document.querySelectorAll('.cot-vehicle-controls>button[data-ret-yield]')].filter(t=>t.checkVisibility({checkVisibilityCSS:true})).length;
          const covered=[];
          const ringHits=(t,r)=>{
            const near=Math.hypot(Math.max(t.left-r.cx,0,r.cx-t.right),Math.max(t.top-r.cy,0,r.cy-t.bottom));
            const far=Math.max(...[[t.left,t.top],[t.right,t.top],[t.left,t.bottom],[t.right,t.bottom]].map(([x,y])=>Math.hypot(x-r.cx,y-r.cy)));
            return near<r.r+r.pad-.5&&far>r.r-r.pad+.5;
          };
          for(const t of tiles)for(const r of ink){
            if(r.ring?ringHits(t,r):Math.min(t.right,r.x1)-Math.max(t.left,r.x0)>.5&&Math.min(t.bottom,r.y1)-Math.max(t.top,r.y0)>.5)covered.push(r.what);
          }
          const text=ink.filter(r=>r.what.startsWith('text ')).map(r=>r.what.slice(5));
          const reach=Math.max(0,...ink.map(r=>Math.max(r.y1-innerHeight/2,Math.abs(r.x1-innerWidth/2),Math.abs(r.x0-innerWidth/2))));
          const row=document.querySelector('.cot-vehicle-controls').getBoundingClientRect();
          return {inks:ink.length,text,outside:[...new Set(outside)].slice(0,6),covered:[...new Set(covered)].slice(0,6),reach,yielded,
            more:!!document.querySelector('.cot-vehicle-controls>.cot-dock-more:not([hidden])'),dock:[row.left,row.top,row.width,row.height].map(v=>Math.round(v)).join(',')};
        });
        widest=Math.max(widest,result.reach);
        // The dock is placed for every sight and bloom at once: it never moves when the sight changes or the ring blooms.
        dockAt??=result.dock;
        if(result.dock!==dockAt)errors.push(`${name}/${count}: the dock moved from ${dockAt} to ${result.dock} in the ${sight} sight (${bloom})`);
        const label=`${name}/${count}-controls/${sight}-${bloom}-${readout}`;
        if(result.inks<5)errors.push(`${label}: the reticle drew nothing to check (${result.inks})`);
        if(sight==='scope'&&!result.text.some(t=>/^×25\.0$/.test(t)))errors.push(`${label}: the zoom plate was not drawn (${result.text})`);
        if(result.outside.length)errors.push(`${label}: reticle ink outside touchReticleFootprint: ${result.outside.join('; ')}`);
        if(result.covered.length)errors.push(`${label}: a dock tile that is not dimmed covers reticle ink: ${result.covered.join('; ')}`);
        if(result.yielded)reticleYields.push(`${name}/${count}/${sight}-${bloom}-${readout}: ${result.yielded}`);
        if(result.more&&sight==='scope'&&bloom==='full'){
          await press(page.locator('.cot-vehicle-controls > .cot-dock-more'));
          const open=await page.evaluate(()=>[...document.querySelectorAll('.cot-vehicle-controls>button[data-dock-overflow]')]
            .filter(t=>t.checkVisibility({checkVisibilityCSS:true})).map(t=>{const r=t.getBoundingClientRect();return {x0:r.left,y0:r.top,x1:r.right,y1:r.bottom};}));
          const footprintIssues=await page.evaluate(dockIssues);
          errors.push(...footprintIssues.map(issue=>`${label}: open More panel: ${issue}`));
          if(!open.length)errors.push(`${label}: More opened no panel`);
          if(readout==='magazine')await page.screenshot({path:resolve(out,`${name}-${count}-scope-more-open.png`)});
          await press(page.locator('.cot-vehicle-controls > .cot-dock-more'));
          if(await page.evaluate(()=>document.body.hasAttribute('data-hud-dock-open')))errors.push(`${label}: a second tap on More did not close the panel`);
        }
        if(bloom==='full'&&readout==='magazine')await page.screenshot({path:resolve(out,`${name}-${count}-${sight}.png`)});
        reports.push({name,...page.viewportSize(),touch,locale,state:`reticle-${count}-${sight}-${bloom}-${readout}`,failures:[...result.outside,...result.covered],rects:[],inks:result.inks});
      }
      reticleReach.push(`${name}/${count}: ${widest.toFixed(1)} px`);
      await page.evaluate(()=>window.__HUD_LAYOUT.restAim());
      // A swipe begun on a docked tile over the aim pad aims, and the tile does not act.
      const swipe=await page.evaluate(()=>{
        const pad=document.querySelector('.cot-touch-aim.on .aimpad')?.getBoundingClientRect();
        if(!pad)return null;
        const tile=[...document.querySelectorAll('.cot-vehicle-controls>button:not(.cot-dock-more)')].map(t=>({t,r:t.getBoundingClientRect()}))
          .find(({t,r})=>t.checkVisibility({checkVisibilityCSS:true})&&!t.hasAttribute('data-dock-overflow')&&r.left+r.width/2>pad.left+2&&r.top+r.height/2>pad.top+2);
        if(!tile)return {none:true};
        const f=window.__HUD_LAYOUT;
        window.__aimed=0;window.__swipeEvents=[];
        if(!window.__aimWrapped){
          window.__aimWrapped=true;
          const original=f.input.addVirtualAim.bind(f.input);
          f.input.addVirtualAim=(dx,dy)=>{window.__aimed+=Math.abs(dx)+Math.abs(dy);return original(dx,dy);};
          for(const event of ['ui:specialAction','ui:selfRight','ui:drone','ui:shellSelect','ui:smoke','ui:lightsToggle','ui:roofGun'])
            f.bus.on(event,()=>window.__swipeEvents.push(event));
        }
        return {x:tile.r.left+tile.r.width/2,y:tile.r.top+tile.r.height/2,name:tile.t.className};
      });
      if(swipe&&!swipe.none){
        const cdp=await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:swipe.x,y:swipe.y,id:1}]});
        // Six 8 x 3 px steps: the first 10 px decide it is a swipe, then the aim pad holds the touch to its end (the
        // pad scales a drag by 1.18), so the whole 66 px of travel must arrive as aim, not only the first step.
        for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipe.x-i*8,y:swipe.y-i*3,id:1}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await cdp.detach();
        const after=await page.evaluate(()=>({aimed:window.__aimed,events:window.__swipeEvents.slice()}));
        if(!(after.aimed>=66*1.18*.9))errors.push(`${name}/${count}: a swipe from the ${swipe.name} tile aimed ${after.aimed.toFixed(1)} of ${(66*1.18).toFixed(1)} px`);
        if(after.events.length)errors.push(`${name}/${count}: a swipe from the ${swipe.name} tile acted: ${after.events}`);
        swipes.push(`${name}/${count}: ${swipe.name} aimed ${after.aimed.toFixed(0)} px`);
      } else swipes.push(`${name}/${count}: ${swipe?'no docked tile over the aim pad':'no aim pad'}`);
      // The drone tile while a recalled drone flies home (item/drone-recall's data-phase; on the dock its cue must win).
      if(count>=6){
        await page.evaluate(()=>window.__HUD_LAYOUT.droneReturning());
        await page.waitForTimeout(250); // the tiles' 90 ms colour and edge transitions
        const cue=await page.evaluate(()=>{
          const tile=document.querySelector('.cot-drone-control');
          if(!tile||!tile.getClientRects().length)return null;
          const style=getComputedStyle(tile),icon=getComputedStyle(tile.querySelector('.si'));
          return {phase:tile.dataset.phase??null,color:style.color,edge:style.borderBottomColor,opacity:style.opacity,icon:icon.opacity,overflow:tile.hasAttribute('data-dock-overflow')};
        });
        if(cue?.phase==='returning'){
          if(cue.color!=='rgb(255, 220, 148)'||cue.edge!=='rgb(239, 184, 78)'||cue.opacity!=='1'||cue.icon!=='1')
            errors.push(`${name}/${count}: the drone's Returning cue lost on the dock: ${JSON.stringify(cue)}`);
          droneCues.push(`${name}/${count}: returning ${cue.color} edge ${cue.edge} icon ${cue.icon}${cue.overflow?' (behind More)':''}`);
          if(!cue.overflow)await page.screenshot({path:resolve(out,`${name}-${count}-drone-returning.png`)});
        } else droneCues.push(`${name}/${count}: ${cue?`no returning phase on this branch (${cue.phase})`:'drone tile hidden'}`);
      }
      await liveInkCheck(count);
    }
    // The gun mark away from the crosshair (a lagging, pinned or blocked gun) on every tile in turn, in the battle sight
    // and the scope at full bloom, a turretless sight (its readouts move with it), a panel tile behind an open More; then
    // an incoming penetration from each of eight bearings, its wedge and "-420" figure round the centre (one with CRIT).
    async function liveInkCheck(count){
      await enter('idle');
      await page.evaluate(count=>window.__HUD_LAYOUT.controls(count),count);
      await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
      const judge=(label,result)=>{
        const failures=[];
        if(!(result.ret>result.row))failures.push(`the reticle canvas (z ${result.ret}) is not above the dock (z ${result.row})`);
        if(!(result.lens<result.ret))failures.push(`the scope lens (z ${result.lens}) is not under the reticle (z ${result.ret})`);
        for(const tile of result.tiles)if(tile.ink>0&&!tile.dimmed)failures.push(`${tile.name} at (${tile.x.toFixed(0)},${tile.y.toFixed(0)}) has ${tile.ink} px of reticle ink and is not dimmed`);
        const inked=result.tiles.filter(t=>t.ink>0).length,dimmed=result.tiles.filter(t=>t.dimmed).length;
        liveInk.push(`${label}: ${inked} tile(s) under ink, ${dimmed} dimmed`);
        reports.push({name,...page.viewportSize(),touch,locale,state:`live-${label.split('/').slice(1).join('-')}`,failures,rects:[],tiles:result.tiles});
        if(failures.length)console.log(`${label}: ${failures.join('; ')}`);
        return inked;
      };
      const tiles=await page.evaluate(()=>[...document.querySelectorAll('.cot-vehicle-controls>button')]
        .filter(t=>t.checkVisibility({checkVisibilityCSS:true})).map(t=>{const r=t.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}));
      let shot=false;
      for(const [i,gun] of tiles.entries()){
        for(const [sight,single] of i===0?[['battle',false],['scope',false],['battle',true]]:[['battle',false]]){
          await page.evaluate(({gun,sight,single})=>{const f=window.__HUD_LAYOUT;f.aimAt(gun,{single});f.reticle({sight,bloom:'full'});},{gun,sight,single});
          await page.waitForTimeout(sight==='scope'?160:0);
          await page.evaluate(async()=>{window.__HUD_LAYOUT.repaint();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
          const result=await page.evaluate(inkUnderTiles);
          const inked=judge(`${name}/${count}/gun-tile${i}-${sight}${single?'-single':''}`,result);
          if(!inked)errors.push(`${name}/${count}: the gun mark on tile ${i} (${sight}) left no ink on any tile`);
          if(!shot&&!single&&sight==='battle'){await page.screenshot({path:resolve(out,`${name}-${count}-gun-on-tile.png`)});shot=true;}
        }
      }
      // A control behind More: the gun mark on its tile while the panel is open.
      const more=page.locator('.cot-vehicle-controls > .cot-dock-more:not([hidden])');
      if(await more.count()){
        await page.evaluate(()=>window.__HUD_LAYOUT.aimAt(null));
        await press(more);
        const panelTile=await page.evaluate(()=>{const t=[...document.querySelectorAll('.cot-vehicle-controls>button[data-dock-overflow]')].find(t=>t.checkVisibility({checkVisibilityCSS:true}));
          if(!t)return null;const r=t.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
        if(panelTile){
          await page.evaluate(gun=>{const f=window.__HUD_LAYOUT;f.aimAt(gun);f.reticle({sight:'battle',bloom:'full'});},panelTile);
          const result=await page.evaluate(inkUnderTiles);
          if(!result.open)errors.push(`${name}/${count}: the More panel closed while the gun mark moved`);
          judge(`${name}/${count}/gun-panel-open`,result);
          await page.screenshot({path:resolve(out,`${name}-${count}-gun-on-panel.png`)});
        } else errors.push(`${name}/${count}: More opened no panel tile`);
        await press(more);
      }
      await page.evaluate(()=>{const f=window.__HUD_LAYOUT;f.aimAt(null);f.restAim();});
      let worst=null;
      const dockBox=()=>page.evaluate(()=>{const r=document.querySelector('.cot-vehicle-controls').getBoundingClientRect();return [r.left,r.top,r.width,r.height].map(Math.round).join(',');});
      const dockBefore=await dockBox();
      for(const bearing of [0,45,90,135,180,225,270,315]){
        const arcs=await page.evaluate(bearing=>window.__HUD_LAYOUT.hitFrom(bearing,{crit:bearing===45}),bearing);
        // Two frames: the relayout a hit's notices and damage panel cause has run, and the dims still hold.
        await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
        const dockNow=await dockBox();
        if(dockNow!==dockBefore)errors.push(`${name}/${count}: a hit from ${bearing} deg moved the dock from ${dockBefore} to ${dockNow}`);
        if(!arcs.length)errors.push(`${name}/${count}: no wedge drawn for a hit from ${bearing} deg`);
        const result=await page.evaluate(inkUnderTiles);
        const text=await page.evaluate(()=>{const ctx=document.querySelector('.cot-ret').getContext('2d');const seen=[];const fill=ctx.fillText;
          ctx.fillText=function(t,...a){seen.push(String(t));return fill.call(this,t,...a);};try{window.__HUD_LAYOUT.repaint();}finally{delete ctx.fillText;}return seen;});
        if(!text.includes('-420'))errors.push(`${name}/${count}: the hit from ${bearing} deg drew no "-420" figure (${text.join(', ')})`);
        if(bearing===45&&!text.includes('CRIT'))errors.push(`${name}/${count}: the critical hit drew no CRIT`);
        const inked=judge(`${name}/${count}/hit-${bearing}`,result);
        if(inked&&(!worst||inked>worst.inked))worst={bearing,inked};
        if(worst?.bearing===bearing)await page.screenshot({path:resolve(out,`${name}-${count}-hit.png`)});
      }
      if(!worst)liveInk.push(`${name}/${count}: no wedge reached a tile`);
      await page.evaluate(()=>window.__HUD_LAYOUT.clearHits());
    }
    for(const count of touch?[5,6,7]:[])await reticleCheck(count);
    // Same-density count changes used to leave a stale tall container and stretch rows.
    if(!touch && width>=820 && height>=600){
      for(const count of [7,3,2,1,7]){
        await page.evaluate(count=>{const f=window.__HUD_LAYOUT;f.state('reports');f.roster(count,count);},count);
        await page.waitForTimeout(120);
        for(const expanded of [false,true]){
          if(expanded){await page.keyboard.down('Tab');await page.waitForTimeout(120);}
          const rowIssues=await page.evaluate(({count,expanded})=>{
            const failures=[];
            for(const ear of document.querySelectorAll('.cot-ear')){
              if(!ear.checkVisibility())continue;
              const rows=[...ear.querySelectorAll('.cot-er')];
              const cap=expanded?30:24;
              for(const row of rows)if(row.getBoundingClientRect().height>cap+.5)failures.push(`${count} players inflated row beyond ${cap}px`);
              const last=rows.at(-1)?.getBoundingClientRect();
              const list=ear.querySelector('.cot-ear-rows').getBoundingClientRect();
              if(last&&list.bottom-last.bottom>1)failures.push('roster kept empty stretched space after count change');
            }
            return failures;
          },{count,expanded});
          errors.push(...rowIssues.map(issue=>`${name}: ${issue}`));
          await check(`row-size-${count}-${expanded?'tab':'normal'}`);
          if(expanded){await page.keyboard.up('Tab');await page.waitForTimeout(120);}
        }
      }
      // Full participant identity survives visibility changes without rebuilding rows.
      const visibilityIssues=await page.evaluate(()=>{
        const f=window.__HUD_LAYOUT;f.roster(7,7);
        const before=[...document.querySelectorAll('.cot-ear.r .cot-er')];
        const names=before.map(row=>row.textContent);
        const full=f.frame.rosterTanks,spotted=f.frame.spotting.isSpotted;
        f.frame.tanks=full.filter(tank=>tank.team==='player');
        f.frame.spotting.isSpotted=()=>false;f.hud.update(f.frame);
        const after=[...document.querySelectorAll('.cot-ear.r .cot-er')];
        const failures=[];
        if(after.length!==7||after.some((row,i)=>row!==before[i]||row.textContent!==names[i]))failures.push('unspotted participants disappeared or changed identity');
        if(after.some(row=>!row.checkVisibility({checkOpacity:true})))failures.push('unspotted participant hidden');
        f.frame.tanks=full;f.frame.spotting.isSpotted=spotted;f.hud.update(f.frame);
        return failures;
      });
      errors.push(...visibilityIssues.map(issue=>`${name}: ${issue}`));
    }
    for(const [allies,enemies] of [[1,41],[41,1],[10,10],[14,14],[21,21],[64,64],[7,7]]) {
      await page.evaluate(([a,e])=>{const f=window.__HUD_LAYOUT;f.state('reports');f.frame.matchModeState={id:'standard'};f.roster(a,e);},[allies,enemies]);
      await page.waitForTimeout(120);
      await check(`rosters-${allies}v${enemies}`);
      if(allies===14&&enemies===14&&!touch&&width>=820&&height>=600){
        const normalWidth=await page.locator('.cot-ear.l').evaluate(el=>el.getBoundingClientRect().width);
        await page.keyboard.down('Tab');
        await page.waitForTimeout(120);
        const expandedWidth=await page.locator('.cot-ear.l').evaluate(el=>el.getBoundingClientRect().width);
        if(expandedWidth<=normalWidth)errors.push(`${name}: Tab did not widen the roster`);
        await check('rosters-tab-expanded');
        await page.keyboard.up('Tab');
        await page.waitForTimeout(120);
        if(await page.locator('.rosters-expanded').count())errors.push(`${name}: releasing Tab did not collapse rosters`);
      }

      const issues=await page.evaluate(([allies,enemies])=>{
        const failures=[];
        const root=document.querySelector('.cot-hud');
        if(root.classList.contains('compact-shot-report')!==(Math.max(allies,enemies)>=14))failures.push('wrong penetration report density');
        const shotHost=document.querySelector('.cot-si-cardhost');
        if(shotHost?.checkVisibility()){
          const style=getComputedStyle(shotHost);
          if(style.overflowX!=='visible'||style.overflowY!=='visible')failures.push('combat card shadow clipped by lane');
          for(const card of shotHost.children){
            const c=card.getBoundingClientRect(),h=shotHost.getBoundingClientRect();
            if(c.top<h.top-1||c.bottom>h.bottom+1)failures.push('combat card exceeds lane height');
          }
        }
        const detail=document.querySelector('.cot-si-rows');
        if(shotHost?.checkVisibility()&&detail&&Math.max(allies,enemies)>=14&&detail.checkVisibility())failures.push('large roster still shows detail rows');
        for(const diagram of document.querySelectorAll('.cot-si-diag')){
          if(!diagram.checkVisibility())continue;
          const d=diagram.getBoundingClientRect(), host=shotHost.getBoundingClientRect();
          if(d.left<host.left-1||d.right>host.right+1||d.top<host.top-1||d.bottom>host.bottom+1)failures.push('diagram clipped by combat readout');
          for(const box of diagram.querySelectorAll('.box')){
            const r=box.getBoundingClientRect();
            if(r.left<d.left-1||r.right>d.right+1||r.top<d.top-1||r.bottom>d.bottom+1)failures.push('tank view clipped by diagram');
            const ratio=box.dataset.view==='Top'?1:2;
            if(r.height>0&&Math.abs(r.width/r.height-ratio)>.02)failures.push('tank diagram aspect ratio distorted');
          }
        }
        if(document.querySelector('.cot-top .wedge'))failures.push('scoreboard still contains roster squares');
        for(const [i,list] of [...document.querySelectorAll('.cot-ear-rows')].entries()) {
          if(list.children.length!==[allies,enemies][i])failures.push('missing roster entries');
          const count=[allies,enemies][i];
          if(list.parentElement.classList.contains('icon-grid')!==(count>14))failures.push('wrong roster presentation');
          if(!list.checkVisibility())continue;
          if(count>14){
            const first=list.children[0].getBoundingClientRect();
            const second=list.children[1].getBoundingClientRect();
            if(first.y!==second.y||first.x===second.x)failures.push('crowded roster did not form columns');
            for(const tile of list.children){
              if(!tile.title)failures.push('grid loses tank identity');
              if(tile.getBoundingClientRect().height<8)failures.push('grid tank too small');
            }
          }
          if(getComputedStyle(list).scrollbarWidth!=='none')failures.push('roster scrollbar visible');
          if(list.scrollHeight>list.clientHeight+1)failures.push('roster must fit every tank without scrolling');
          const before=list.parentElement.getBoundingClientRect();
          list.scrollTop=list.scrollHeight;
          const last=list.lastElementChild?.getBoundingClientRect();
          const after=list.getBoundingClientRect();
          if(last&&last.bottom>after.bottom+1)failures.push('last roster entry cannot be reached');
          if(list.parentElement.getBoundingClientRect().height!==before.height)failures.push('scrolling moves roster bounds');
          list.scrollTop=0;
        }
        const report=document.querySelector('.cot-si-cardhost');
        if(report?.checkVisibility()&&innerHeight>=600&&report.getBoundingClientRect().height<100)failures.push(`roster leaves no readable combat report (${report.getBoundingClientRect().height}px)`);
        return failures;
      },[allies,enemies]);
      for(const issue of issues)errors.push(`${name}/${allies}v${enemies}: ${issue}`);
      if(allies===41||enemies===41)await page.screenshot({path:resolve(out,`${name}-${allies}v${enemies}.png`)});
    }
    // Same open panels must survive a live resize and a larger minimap.
    await page.evaluate(()=>{window.__HUD_LAYOUT.state('combined');window.__HUD_LAYOUT.bus.emit('ui:minimapZoom',{});});
    await page.setViewportSize({width:name==='browser-landscape'?390:Math.max(320,height),height:width});
    await page.waitForTimeout(180);
    await check('resized-combined');
    await page.setViewportSize({width,height});
    await page.waitForTimeout(180);
    await check('returned-combined');
    // Production's killcam phase class must also veil non-HUD siblings.
    const veilLeaks=await page.evaluate(()=>{
      document.body.classList.add('cot-kc-live');
      const leaks=[...document.querySelectorAll('.cot-room-chat,.cot-touch,.cot-touch-aim')]
        .filter(el=>el.checkVisibility({checkVisibilityCSS:true})).map(el=>el.className);
      document.body.classList.remove('cot-kc-live');
      return leaks;
    });
    if(veilLeaks.length)errors.push(`${name}: cinematic veil leaked ${veilLeaks.join(', ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  if(recordMain)await writeFile(resolve(recordMain),`${JSON.stringify({source:`${arg('main-label',`main at ${arg('url','')}`)} (five controls), measured by tools/battle-hud-layout.browser.mjs --record-main on ${new Date().toISOString().slice(0,10)}`,
    fields:{k:'kill rows shown',r:'kill rows clear of the full-bloom ring',t:'incoming-damage toasts shown',sub:'detection shows its second line (null: no detection)',
      d:'detection box [x, y, w, h] (null: none shown)',a:'alert box',c:'countdown box',tiles:'(per screen) vehicle-control tiles the strip showed whole in idle'},
    cases:mainRecord,tiles:mainTiles},null,1)}\n`);
  else await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors,reticleReach,swipes,droneCues,liveInk,feedTable,tileTable,inkTable},null,2));
}
if(recordMain){console.log(`main's feeds recorded for ${Object.keys(mainRecord).length} touch screens: ${resolve(recordMain)}`);process.exit(0);}
// Per touch screen: the fewest kill rows, ring-clear kill rows and toasts against main's, over every state and kit.
const margins={};
for(const row of feedTable){
  const m=margins[row.name]??={k:Infinity,r:Infinity,t:Infinity,states:0};
  m.k=Math.min(m.k,row.k-row.main.k);m.r=Math.min(m.r,row.r-row.main.r);m.t=Math.min(m.t,row.t-row.main.t);m.states++;
}
console.log(`feeds against main (least margin over ${feedTable.length} states; kill rows / ring-clear rows / toasts): ${Object.entries(margins).map(([n,m])=>`${n} ${m.k}/${m.r}/${m.t}`).join(', ')}`);
const tileMargins={};
for(const row of tileTable){const m=tileMargins[row.name]??={least:Infinity,main:row.main};m.least=Math.min(m.least,row.shown);}
console.log(`controls shown whole against main's strip (fewest over ${tileTable.length} states): ${Object.entries(tileMargins).map(([n,m])=>`${n} ${m.least} (main ${m.main})`).join(', ')}`);
const inkMargins={};
for(const row of inkTable){const m=inkMargins[row.name]??={worst:-Infinity,n:0};m.worst=Math.max(m.worst,row.ink-row.main);m.n++;}
console.log(`notice ink against main's (largest excess over ${inkTable.length} notices, px; <= 0 holds): ${Object.entries(inkMargins).map(([n,m])=>`${n} ${m.worst}`).join(', ')}`);
const failed=reports.filter(r=>r.failures.length);
console.log(`reticle reach per case: ${reticleReach.join(', ')}\nswipes: ${swipes.join(', ')}\ndrone cue: ${droneCues.join(', ')}`);
console.log(`dimmed tiles under the reticle's own stages (the scope's arm tips): ${reticleYields.join(', ')||'none'}`);
console.log(`${reports.length} state/viewport checks; ${failed.length} failed; ${errors.length} browser errors. ${out}`);
if(failed.length||errors.length){console.log(errors);process.exitCode=1;}
