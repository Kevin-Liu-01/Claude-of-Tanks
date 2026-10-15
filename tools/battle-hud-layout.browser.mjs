#!/usr/bin/env node
// Committed rendered regression; accepts an existing dev server and Playwright.
// node tools/battle-hud-layout.browser.mjs --url=http://127.0.0.1:5189 --out=/tmp/hud-check
import { mkdir, writeFile } from 'node:fs/promises';
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
const states = ['idle','feed-burst','notifications','countdown','reports','log','chat','combined','spectator','settings','sniper','large-map','ammo-expanded','special','mode-standard','mode-capture_the_flag','mode-zone_control','mode-turbo_ball','mode-endless_horde','mode-frontline_assault','mode-mars','ended'];
const reports=[];const errors=[];const reticleReach=[];const swipes=[];const droneCues=[];
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
     '.cot-shell','.cot-con','.cot-vehicle-controls','.cot-touch.on .joy','.cot-touch.on .round',
     '.cot-touch.on .mobile-chrome'];
  const rects=collectVisibleRects(selectors);
  const failures=[];
  for(let i=0;i<rects.length;i++){
    const a=rects[i];
    if(a.x<-.5||a.y<-.5||a.right>innerWidth+.5||a.bottom>innerHeight+.5)failures.push(`offscreen: ${a.name}`);
    for(const b of rects.slice(i+1)){
      if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)
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
  return {failures,rects,body:document.body.dataset,ammoTransitions};
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
  const footprint=window.__HUD_LAYOUT.touchReticleFootprint(innerWidth,innerHeight);
  const keepGap=(r,k)=>'r' in k?Math.hypot(Math.max(r.left-k.x,0,k.x-r.right),Math.max(r.top-k.y,0,k.y-r.bottom))-k.r
    :Math.hypot(Math.max(r.left-k.x-k.w,0,k.x-r.right),Math.max(r.top-k.y-k.h,0,k.y-r.bottom));
  const crosses=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
  const tiles=[...row.children].filter(tile=>tile.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(tile=>tile.getBoundingClientRect());
  if(!tiles.length)failures.push('touch action dock shows no tile');
  const controls=[...document.querySelectorAll('.cot-touch.on .joy,.cot-touch.on .round,.cot-touch.on .mobile-chrome,.cot-con,.cot-shell')]
    .filter(node=>node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(node=>node.getBoundingClientRect());
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
    async function check(state){
      const result=await page.evaluate(measure,state);
      if(touch)result.failures.push(...await page.evaluate(dockIssues));
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
      if(state==='feed-burst'){
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

      if(state.startsWith('mode-')) {
        if(await page.locator('.cot-mode-status button').count())result.failures.push('objective must not contain a Brief button');
        const detected=result.rects.find(r=>r.name==='cot-sixth on');
        if(!detected||(state==='mode-standard'?!!objective:!objective||detected.y<objective.bottom+7))result.failures.push('detection must clear the objective by at least 7px');
      }
      if(state.startsWith('notifications')) {
        const hexagons=await page.locator('.cot-sixth.on,.cot-alert.show').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).clipPath));
        if(hexagons.length!==2||hexagons.some(shape=>!shape.startsWith('polygon(')||shape.split(',').length!==6)) result.failures.push('status notices must have six-sided outlines');
      }
      if(state!=='settings'&&state!=='ended'){
        const decoration=await page.evaluate(()=>{
          const notice=document.querySelector('.cot-kill-lane.r .cot-kf');
          const style=notice?getComputedStyle(notice):null;
          return {left:style?.borderLeftWidth,right:style?.borderRightWidth,
            mode:document.querySelector('.cot-mode-status')?.dataset.mode};
        });
        if(decoration.left&& (parseFloat(decoration.left)!==0||parseFloat(decoration.right)<=0))
          result.failures.push('enemy kill notice must use the right border');
        if(state.startsWith('mode-')&&decoration.mode!==state.slice(5))
          result.failures.push(`expected objective ${state.slice(5)}, saw ${decoration.mode}`);
      }
      if(state==='notifications'||state==='combined'||state==='spectator'||state==='feed-burst'||result.failures.length)
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
      await page.evaluate(state=>window.__HUD_LAYOUT.state(state),state);
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
    for(const state of states){
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
        await check(`${state}-${count}-controls`);
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
          let ink=[],path=[],circles=[];
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
            beginPath:()=>{path=[];circles=[];},
            moveTo:(x,y)=>path.push(point(x,y)),lineTo:(x,y)=>path.push(point(x,y)),
            arc:(x,y,r)=>{if(r*lineScale()>6){const [cx,cy]=point(x,y);circles.push({cx,cy,r:r*lineScale()});}else path.push(point(x-r,y-r),point(x+r,y+r),point(x-r,y+r),point(x+r,y-r));},
            ellipse:(x,y,rx,ry)=>path.push(point(x-rx,y-ry),point(x+rx,y+ry),point(x-rx,y+ry),point(x+rx,y-ry)),
            quadraticCurveTo:(a,b,x,y)=>path.push(point(a,b),point(x,y)),
            bezierCurveTo:(a,b,c,d,x,y)=>path.push(point(a,b),point(c,d),point(x,y)),
            rect:(x,y,w,h)=>path.push(point(x,y),point(x+w,y+h),point(x,y+h),point(x+w,y)),
            roundRect:(x,y,w,h)=>path.push(point(x,y),point(x+w,y+h),point(x,y+h),point(x+w,y)),
            stroke:()=>{record(path,ctx.lineWidth*lineScale()/2+.5,'stroke');
              for(const c of circles)ink.push({what:'ring',ring:true,cx:c.cx,cy:c.cy,r:c.r,pad:ctx.lineWidth*lineScale()/2,x0:c.cx-c.r,y0:c.cy-c.r,x1:c.cx+c.r,y1:c.cy+c.r});},
            fill:()=>{if(!full(path))record(path,0,'fill');for(const c of circles)ink.push({what:'disc',ring:true,cx:c.cx,cy:c.cy,r:c.r/2,pad:c.r/2,x0:c.cx-c.r,y0:c.cy-c.r,x1:c.cx+c.r,y1:c.cy+c.r});},
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
          const tiles=[...document.querySelectorAll('.cot-vehicle-controls>button')].filter(t=>t.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(t=>t.getBoundingClientRect());
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
          return {inks:ink.length,text,outside:[...new Set(outside)].slice(0,6),covered:[...new Set(covered)].slice(0,6),reach,
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
        if(result.covered.length)errors.push(`${label}: a dock tile covers reticle ink: ${result.covered.join('; ')}`);
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
        const cue=await page.evaluate(()=>{
          window.__HUD_LAYOUT.droneReturning();
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
  await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors,reticleReach,swipes,droneCues},null,2));
}
const failed=reports.filter(r=>r.failures.length);
console.log(`reticle reach per case: ${reticleReach.join(', ')}\nswipes: ${swipes.join(', ')}\ndrone cue: ${droneCues.join(', ')}`);
console.log(`${reports.length} state/viewport checks; ${failed.length} failed; ${errors.length} browser errors. ${out}`);
if(failed.length||errors.length){console.log(errors);process.exitCode=1;}
