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
const reports=[];const errors=[];
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
// control, and off the crosshair and its dispersion ring at full bloom; the gun-limit warning off the crosshair area.
function dockIssues(){
  const row=document.querySelector('.cot-vehicle-controls');
  if(!row||!row.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return [];
  const failures=[];
  if(!document.body.hasAttribute('data-hud-dock'))failures.push('touch vehicle controls are not docked');
  const style=getComputedStyle(row);
  if(/auto|scroll/.test(`${style.overflowX} ${style.overflowY}`))failures.push('touch action dock can scroll');
  const cx=innerWidth/2,cy=innerHeight/2,ring=Math.max(32,Math.ceil(.15*Math.min(innerWidth,innerHeight)));
  const distance=r=>Math.hypot(Math.max(r.left-cx,0,cx-r.right),Math.max(r.top-cy,0,cy-r.bottom));
  const crosses=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
  const tiles=[...row.children].filter(tile=>tile.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(tile=>tile.getBoundingClientRect());
  if(!tiles.length)failures.push('touch action dock shows no tile');
  const controls=[...document.querySelectorAll('.cot-touch.on .joy,.cot-touch.on .round,.cot-touch.on .mobile-chrome,.cot-con,.cot-shell')]
    .filter(node=>node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(node=>node.getBoundingClientRect());
  for(const [i,tile] of tiles.entries()){
    if(tile.width<44-.01||tile.height<44-.01)failures.push(`touch action tile below 44px (${tile.width}x${tile.height})`);
    if(tile.left<-.5||tile.top<-.5||tile.right>innerWidth+.5||tile.bottom>innerHeight+.5)failures.push('touch action tile offscreen');
    if(distance(tile)<ring-.5)failures.push('touch action tile covers the crosshair');
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
          await page.locator('.cot-vehicle-controls > .cot-dock-more').click();
          errors.push(...(await page.evaluate(dockIssues)).map(issue=>`${name}: open More panel: ${issue}`));
        }
        const box=await button.boundingBox();
        if(!box||box.width<44||box.height<(touch?44:32))errors.push(`${name}: vehicle control below touch target minimum`);
        await button.click();
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
  await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));
}
const failed=reports.filter(r=>r.failures.length);
console.log(`${reports.length} state/viewport checks; ${failed.length} failed; ${errors.length} browser errors. ${out}`);
if(failed.length||errors.length){console.log(errors);process.exitCode=1;}
