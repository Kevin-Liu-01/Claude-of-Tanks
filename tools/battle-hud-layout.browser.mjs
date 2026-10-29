#!/usr/bin/env node
// Committed rendered regression; accepts an existing dev server and Playwright.
// node tools/battle-hud-layout.browser.mjs --url=http://127.0.0.1:5189 --out=/tmp/hud-check
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// the markers over tanks in every state: no flag, whole, the side in shape and colour (?state=markers stages them)
import { markerProblems } from './marker-census.mjs';
const arg = (name, fallback) => process.argv.find(v=>v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const { chromium } = await import(arg('playwright-module','playwright'));
const out = resolve(arg('out','outputs/battle-hud-layout'));
await mkdir(out,{recursive:true});
const browser = await launchGuardedBrowser(chromium, {headless:true,channel:'chrome',args:['--disable-gpu']});
const cases = [
  ['desktop',1920,1080,false],['laptop',1366,768,false],['laptop-short',1280,720,false],
  ['small-desktop',1024,600,false],['tablet-mouse',820,1180,false],['narrow-mouse',540,720,false],
  ['phone-mouse',390,844,false],['tablet',1024,768,true],['tablet-portrait',768,1024,true],
  // the iPads in Safari (item 262): held wide (mini, Pro 11, Pro 13), upright (mini, Pro 11, Pro 13, in zh too) and a Split View half
  ['ipad-mini-land',1133,612,true],['ipad-pro11-land',1210,702,true],['ipad-pro13-land',1376,900,true],['ipad-mini-port',744,1001,true],
  ['ipad-pro11-port',834,1078,true],['ipad-pro13-port',1032,1244,true],['chinese-ipad-pro11-port',834,1078,true,'zh-CN'],['ipad-split-half',601,702,true],
  ['narrow-phone',320,568,true],['short-landscape',568,256,true],['phone',390,844,true],['small-phone',360,640,true],['landscape',844,390,true],
  ['small-landscape',667,375,true],['short-mouse',844,390,false],
  ['tiny-landscape',568,320,true],['browser-landscape',844,300,true],['wide-landscape',932,430,true],
  ['chinese-landscape',667,375,true,'zh-CN'],
  ['chinese-laptop',1280,720,false,'zh-CN'],['chinese-phone',390,844,true,'zh-CN'],
  // The rest of the mouse census (desk-notices 2026-10-16), lite: the centre-notice checks alone (they stage every
  // state that moves a notice and check it against every HUD part; the full state list runs on the cases above).
  ...[[1000,600],[1024,768],[1152,648],[1280,800],[1440,900],[1536,864],[1600,900],[1680,1050],[2560,1440],[3440,1440],[768,1024]]
    .map(([w,h])=>[`mouse-${w}x${h}`,w,h,false,'en-US',{lite:true}]),
  ['chinese-small-desktop',1024,600,false,'zh-CN',{lite:true}],['chinese-short-mouse',844,390,false,'zh-CN',{lite:true}],
  ['chinese-phone-mouse',390,844,false,'zh-CN',{lite:true}],
  // odd windows: 1366 x 768 at 125 % zoom, a 1080p window at 150 % zoom less the browser's chrome, a squat ultrawide, the
  // compact-detection edge, a 768-wide landscape, a 481-wide portrait at the 9 px edge
  ...[[1093,614],[1280,609],[2560,1080],[1000,551],[768,600],[481,700]].map(([w,h])=>[`mouse-${w}x${h}`,w,h,false,'en-US',{lite:true}]),
  // the HUD's out-of-ammo marks among its furniture (r10, tools/fixtures/hud-sight-furniture.json): a mid ring's marks
  // reach the consumables at 800 x 400, and at 1280 x 431 the controls row sends the gun-limit chip over the sight
  ...[[800,400],[1280,431]].map(([w,h])=>[`mouse-${w}x${h}`,w,h,false,'en-US',{lite:true}]),
  // BUI-F8 pseudo-locale: English about 40 % longer and accented (src/ui/i18nPseudo.ts, dev server ?pseudo=1). These
  // and the Chinese cases also fail on clipped text (copy cut by its own box or a clipping ancestor).
  ['pseudo-desktop',1920,1080,false,'en-US',{pseudo:true}],['pseudo-laptop',1366,768,false,'en-US',{pseudo:true}],
  ['pseudo-phone',390,844,true,'en-US',{pseudo:true}],['pseudo-landscape',844,390,true,'en-US',{pseudo:true}],
];
const states = ['idle','feed-burst','notifications','countdown','reports','log','chat','combined','spectator','settings','sniper','large-map','ammo-expanded','special','mode-standard','mode-capture_the_flag','mode-zone_control','mode-turbo_ball','mode-endless_horde','mode-frontline_assault','mode-mars','markers','ended'];
const reports=[];const errors=[];
// Clipped copy (pseudo and Chinese cases): a text element whose own content overflows a box that hides overflow, or
// whose text ends outside the nearest ancestor that clips. Only catalog copy counts — pseudo text (accented Latin-1 or
// its middle-dot padding) or CJK — so names a design ellipsizes on purpose (players, vehicles) stay out of it. Kept out
// of measure(), whose success path reads no styles.
function clippedText(){
  const localized=/[åçðéïñöþüýÅÇÐÉÏÑÖÞÜÝ·]|[\u3400-\u9fff]/;
  const roots=[...document.querySelectorAll('.cot-hud,.cot-settings,.cot-es,.cot-end,.cot-touch,.cot-dp,.cot-minimap,.cot-si-toasthost,.cot-si-cardhost,.cot-kill-lane')];
  const seen=new Set();const found=[];
  const clips=(style)=>/(hidden|clip)/.test(style.overflowX+' '+style.overflow)||style.textOverflow==='ellipsis';
  // (copy kept for screen readers alone, a 1 px box clipped to nothing, is not clipped copy: the score's default team
  // names, the touch chrome's sound and settings labels, a small mouse window's alert words, brand-ui 246)
  const readerOnly=(el)=>{for(let at=el;at&&at!==document.body;at=at.parentElement){const s=getComputedStyle(at);
    if(/inset\(50%\)/.test(s.clipPath)&&at.getBoundingClientRect().width<=1)return true;}return false;};
  for(const root of roots)for(const el of root.querySelectorAll('*')){
    if(seen.has(el))continue;seen.add(el);
    const own=[...el.childNodes].filter(node=>node.nodeType===3&&node.nodeValue.trim()).map(node=>node.nodeValue.trim()).join(' ');
    if(!own||!localized.test(own)||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||readerOnly(el))continue;
    const style=getComputedStyle(el);
    if(clips(style)&&el.scrollWidth>el.clientWidth+1){found.push(`clipped text: ${el.className||el.tagName} "${own.slice(0,48)}"`);continue;}
    const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect();
    if(r.width<1)continue;
    for(let at=el.parentElement;at&&at!==document.body;at=at.parentElement){
      if(!/(hidden|clip)/.test(getComputedStyle(at).overflowX))continue;
      const box=at.getBoundingClientRect();
      if(r.right>box.right+1||r.left<box.left-1){found.push(`clipped text: ${el.className||el.tagName} "${own.slice(0,48)}" cut by ${at.className||at.tagName}`);}
      break;
    }
  }
  return found;
}
// MOUSE CENTRE NOTICES (desk-notices, 2026-10-16: "Keep desktop centre notices off the crosshair"). On every mouse case
// the detection, the alert (all 27 kinds; the four longest in every context), the countdown, the medal card and the
// revive count are staged with 0 and 3 kill rows, in a kill burst, with 14 v 14 rosters, without an objective and in
// capture the flag, in the battle sight and the scope, together (an alert during the countdown, the medal and the
// revive count beside both notices) and with Tab held. The mouse layout must carry its plan (body[data-hud-notice-tiers],
// mouseNoticePlan.ts: main has none, so main fails here), and each element must
// - cover no reticle ink at the keep-out its plan clears (2 unless the plan says otherwise): the ink is the canvas's own
//   pixels (alpha >= 12), the union of both sights at rest and at full bloom with the magazine, SWITCHING and gun-limit
//   readouts and the HUD's out-of-ammo marks (a struck round, a struck rack, a rack reloading under its countdown, each
//   with and without the chip, where the HUD seats them among its furniture) (tier 2), the battle sight alone at full
//   bloom (tier 1) or at rest (tier 0);
// - never cover more of it, nor of the resting crosshair, than main does in the same stage (main's numbers are pinned
//   in tools/fixtures/battle-hud-layout.main-notices.json; --record-main=<file> --main-label=<commit> against a server
//   of main's tree measures them again). "Main" is the tree the notices land on, main's notice places under its HUD:
//   since the HUD's out-of-ammo marks (r10) it is integ/229 ce8b634668, recorded with these masks (3b760c602 never drew
//   those marks, so its numbers could not weigh them);
// - show its whole text (no clamp, nothing outside its six-sided frame; the alert in main's type size or larger; the
//   detection's second line wherever main shows it, above 550 px tall);
// - keep its box through a kill burst and while Tab is held (k0, k3, the burst and Tab stage the same box);
// - overlap no other HUD part (rosters, held Tab rosters too, score, objective, kill lanes, damage toasts, chat, minimap,
//   damage panel, drive, systems, ammunition, consumables, report, network readouts, the scope-vision toggle and the
//   flight console, with the aerial sheet loaded as in battle) and no other element it is shown with (only where its
//   plan marks it sharing a notice's place, tier 's', and only the pair that never shows together: the countdown on the
//   detection's place; the medal card never shows on anything: it waits, tier 'w');
// - the detection and the alert clear the whole reticle (tier 2: a plan fallen back to main's places fails), and a shown
//   countdown or revive count has a planned place;
// - the medal card waits exactly where its place meets a shown element's (a notice, the revive count: a medal can arrive
//   after the death) or in the scope where its place clears the battle sight only (a short window), and shows otherwise;
// and the side lanes keep every kill row main shows while nothing is up, and at least one while anything is (but where
// every place clear of the reticle crosses a lane whole: EMPTY_LANES_OK).
const recordMain = arg('record-main','');
// --notices-only: the mouse cases run the centre-notice stages alone (as the lite cases do); --stages=<regex>: only the
// notice stages whose key matches (a focused re-run, or recording main's numbers for new stages)
const noticesOnly = process.argv.includes('--notices-only');
const stageFilter = arg('stages','') ? new RegExp(arg('stages','')) : null;
/** Tab holds the rosters while the battle has the cursor (hud.ts; INTERACTION-REDESIGN C): a headless page holds no pointer
 *  lock, so the Tab stages stand one in for the press. */
const cursorCaptured=(page,on)=>page.evaluate(on=>{
  if(on)Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.body});
  else delete document.pointerLockElement;
},on);
const MAIN_NOTICES = recordMain ? null : JSON.parse(await readFile(new URL('./fixtures/battle-hud-layout.main-notices.json', import.meta.url),'utf8'));
const mainRecord = {};
const noticeTable = [];
// [label, event, payload]: the census's 26 alert kinds (payload tokens resolved in the page).
const NOTICE_ALERTS = [
  ['wave12','mode:wave_cleared',{wave:12,nextWaveInS:30}],['wave123','mode:wave_cleared',{wave:123,nextWaveInS:120}],
  ['ammoEmpty','ammo:empty','self'],['flagDroppedEnemy','mode:flag_dropped','ours'],['flagDroppedAllied','mode:flag_dropped','theirs'],
  ['reload','ui:magazineReloadStarted',{}],['atgmDeselected','ui:specialActionResult',{kind:'guided_missile',active:false}],
  ['atgmSelected','ui:specialActionResult',{kind:'guided_missile',active:true}],['suspension','ui:specialActionResult',{kind:'hydropneumatic_aim',active:false}],
  ['ammoDepletedNext','ammo:depleted','next'],['allAmmoDepleted','ammo:depleted','all'],['missilesDenied','ui:ammoSelectionDenied',{slot:0,guided:true}],
  ['lineTaken','mode:line_advanced',{line:2,total:3}],['consumablesOff','ui:consumableDenied',{slot:0,reason:'RULESET'}],
  ['readyIn','ui:consumableDenied',{slot:0,reason:'COOLDOWN',remainingS:118}],['ammoAcquired','mode:pickup_collected','pickup'],
  ['autoAimLong','ui:autoAimState','longspec'],['autoAimOff','ui:autoAimState',{on:false,reason:'AUTO-AIM OFF'}],
  ['ending','ending:begin',{captionKey:'ending.scoreReached'}],
  ['endingWave','ending:begin',{captionKey:'ending.lastStand',captionValues:{wave:'123'}}],['waveInbound','mode:wave_started',{wave:123}],
  ['flagTaken','mode:flag_taken','ours'],['reloadDenied','ui:magazineReloadDenied',{reason:'MAGAZINE_RELOADING'}],
  ['specialDenied','ui:specialActionDenied',{reason:'OTHER'}],['crewUnharmed','ui:consumableDenied',{slot:1,reason:'NOTHING'}],
  ['armorOn','ui:armorOverlayState',{on:true}],
];
const LONG_ALERTS = ['wave123','autoAimLong','flagDroppedEnemy','ammoEmpty'];
// Where every place clear of the reticle crosses a side lane whole, that lane holds no row while the element shows
// (mouseNoticePlan.selftest.mjs lists the same: its last resort before any reticle ink).
// Matched against the stage key ('<context>|<set>|<sight>'), its set reduced to the elements that can have emptied the
// lane (those shown; the medal card only where it crosses the lane's column).
const EMPTY_LANES_OK={'mouse-768x600':/alert|revive|medal/,'mouse-481x700':/alert/,
  // three up at once (the revive count beside both notices) on a phone; on a short window the revive count, which keeps
  // off both notices' places: every such place clear of the resting sight crosses the left lane whole (one row deep with
  // an objective, two without)
  'phone-mouse':/alert:[^|]*\+revive/,'chinese-phone-mouse':/alert:[^|]*\+revive/,
  // Since the HUD's out-of-ammo marks (r10; mouseNoticePlan.selftest EMPTIED): on 844 x 390 the systems row sits under the
  // widest gun-limit chip and the scope's stacked zoom plate, so the chip goes over the sight and the plate beside the
  // line, and every place for the detection clear of the whole reticle crosses the left lane whole (with the alert, the
  // medal card, or alone); on 800 x 400 the two 376 px lanes leave a 48 px centre between them and the band over the ring
  // is the marks', so every alert, and the revive count, crosses the left lane whole
  'short-mouse':/^[^|]*\|(det|[^|]*revive)/,'chinese-short-mouse':/^[^|]*\|(det|[^|]*revive)/,
  'mouse-800x400':/^[^|]*\|[^|]*(alert|revive)/};
// [key, fixture state, kill rows kept (null: as staged), rosters a side (null: 7), notice set ('' none), sight, Tab held]
function noticeStages(){
  const out=[];
  const sets=['det',...LONG_ALERTS.map(k=>`det+alert:${k}`),'countdown','medal','det+medal','revive'];
  for(const [ctx,state,kills,rosters] of [['k0','idle',0,null],['k3','idle',null,null],['burst','feed-burst',null,null],
    ['r14','idle',null,14],['std','mode-standard',null,null],['ctf','mode-capture_the_flag',null,null]])
    for(const set of sets)out.push([`${ctx}|${set}|battle`,state,kills,rosters,set,'battle',false]);
  for(const set of ['det+alert:wave123','countdown','medal','revive'])for(const ctx of ['k0','k3','burst'])
    out.push([`${ctx}|${set}|scope`,ctx==='burst'?'feed-burst':'idle',ctx==='k0'?0:null,null,set,'scope',false]);
  for(const [k] of NOTICE_ALERTS)if(!LONG_ALERTS.includes(k))out.push([`k3|alert:${k}|battle`,'idle',null,null,`alert:${k}`,'battle',false]);
  // together: an alert during the countdown (H, R and E work before the roll-out), the medal and the revive count
  // beside both notices
  for(const set of ['det+countdown','alert:wave123+countdown','alert:armorOn+countdown','det+alert:atgmSelected+countdown',
    'det+alert:wave123+medal','det+alert:wave123+revive'])out.push([`k3|${set}|battle`,'idle',null,null,set,'battle',false]);
  // a medal arriving after the death (a shell still in flight, a mutual kill) while the revive count shows: the card
  // waits wherever their places meet (with and without an objective, where the count rises under the score)
  for(const [ctx,state] of [['k3','idle'],['std','mode-standard']])out.push([`${ctx}|medal+revive|battle`,state,null,null,'medal+revive','battle',false]);
  // Tab held (wider, taller rosters): the same boxes as without it, clear of the rosters
  for(const set of ['det+alert:wave123','det+medal','countdown','det+alert:wave123+revive'])out.push([`tab|${set}|battle`,'idle',null,null,set,'battle',true]);
  out.push(['tab14|det+alert:wave123|battle','idle',null,14,'det+alert:wave123','battle',true]);
  // nothing up: the lanes hold every row main holds
  out.push(['burst||battle','feed-burst',null,null,'','battle',false]);
  // the revive count needs a reviving mode's rules, which also reshape the systems strip: stage those last
  return [...out.filter(s=>!s[4].includes('revive')),...out.filter(s=>s[4].includes('revive'))];
}
async function noticePrep(alerts){
  const f=window.__HUD_LAYOUT;
  // the game loads the aerial HUD's sheet with hud.ts (battleHudAccess.ts): the scope-vision toggle and the flight console
  // stand where they do in battle
  await import('/src/ui/aerialHud.css');
  const {TANK_SPECS}=await import('/src/vehicles/specs.ts');
  const reg=await import('/src/ui/moduleRegistry.ts');
  const {MEDALS}=await import('/src/game/serviceRecord.ts');
  const {t}=await import('/src/ui/i18n.ts');
  const rules=await import('/src/sim/matchRuleset.ts');
  const names=Object.values(TANK_SPECS).map(s=>s.name).filter(Boolean).sort((a,b)=>b.length-a.length);
  const mods=['engine','ammoRack','gun','turret','fuelTank','transmission','radio','trackL','turretRing','gunBreech','driver','commander','gunner','loader','optics','fireControl'];
  const labels=mods.map(m=>[m,reg.moduleAlertLabel(m)]).sort((a,b)=>b[1].length-a[1].length);
  // the tallest card: the longest name, then the longest description
  const medals=MEDALS.map(m=>[m.id,t(`service.medal.${m.id}.name`),t(`service.medal.${m.id}.desc`)])
    .sort((a,b)=>(b[1].length*3+b[2].length)-(a[1].length*3+a[2].length));
  window.__NOTICE={alerts,longSpec:names[0],longModule:labels[0][0],medal:medals[0][0],reviveRules:rules.matchRulesetFor('capture_the_flag'),
    restingAim:{...f.frame.aim},restingTime:f.frame.timeS};
  window.__stretchTimers=true;
  return true;
}
// The reticle's ink, once per case and furniture context: hud.ts paints .cot-ret at the screen-centre aim point, and since
// the out-of-ammo rounds (r10) seats its marks 3 px from the HUD's panels and controls, which move with the objective panel
// (every mode but the standard battle shows one, each its own size). So the masks are read in each context the notice
// stages use (NOTICE_MASK_CONTEXTS: the mars objective of 'idle' and 'feed-burst', the standard battle without one, capture
// the flag's), the out-of-ammo states under that context's panel, and each stage is weighed against its own (noticeStage).
// The scope's vignette (two full-canvas gradient fills) is shade, not ink, and is skipped while the masks are read.
const NOTICE_MASK_CONTEXTS=['idle','mode-standard','mode-capture_the_flag'];
async function noticeMasks(contexts){
  const f=window.__HUD_LAYOUT,N=window.__NOTICE,c=document.querySelector('.cot-ret'),ctx=c.getContext('2d',{willReadFrequently:true});
  const cssW=c.getBoundingClientRect().width,W=c.width,H=c.height,n=W*H;
  const proto=CanvasRenderingContext2D.prototype,fill=proto.fillRect;
  proto.fillRect=function(x,y,w,h){if(this.canvas===c&&this.fillStyle instanceof CanvasGradient&&w>=cssW-1)return;return fill.call(this,x,y,w,h);};
  const restAim=()=>{for(const k of Object.keys(f.frame.aim))if(!(k in N.restingAim))delete f.frame.aim[k];Object.assign(f.frame.aim,N.restingAim);};
  const masks={};
  try{
    for(const context of contexts){
      const union=new Uint8Array(n),battle=new Uint8Array(n),rest=new Uint8Array(n);
      // (the panels settle on the next frames: the reticle reads the furniture the last relayout published)
      const read=async(sight,bloom)=>{
        for(let i=0;i<150;i++){f.frame.timeS+=1/60;f.hud.update(f.frame);}
        await new Promise(r=>setTimeout(r,170)); // the scope's fade-in runs on the wall clock
        f.frame.aim.distM+=.3;f.frame.timeS+=1/60;f.hud.update(f.frame);
        const d=ctx.getImageData(0,0,W,H).data;
        for(let i=0;i<n;i++)if(d[i*4+3]>=12){union[i]=1;if(sight==='battle'){battle[i]=1;if(bloom==='rest')rest[i]=1;}}
      };
      f.state(context);
      const modeState=f.frame.matchModeState;
      for(const sight of ['battle','scope'])for(const bloom of ['rest','full'])for(const readout of ['none','magazine','switching','warn']){
        f.frame.mode=sight==='scope'?'sniper':'battle';f.hud.setMode(f.frame.mode);restAim();
        Object.assign(f.frame.aim,{zoom:sight==='scope'?25:1,distM:1500,dispersionRadM:bloom==='full'?1e4:1e-4,
          magazine:readout==='magazine'?{capacity:12,rounds:7}:null,
          reload:readout==='magazine'?{t:12.6,totalS:15,kind:'magazine'}:readout==='switching'?{t:2,totalS:4,kind:'shell'}:{t:0,totalS:6},
          ammoSelectionPending:readout==='switching',gunLimitSpec:readout==='warn'});
        await read(sight,bloom);
      }
      // The out-of-ammo marks (owner 2026-10-17, HUD r10): the fixture's real combat states composed by the real aim
      // controller (a dry cannon's struck round, a struck rack, a rack reloading under its 12 s countdown), each with and
      // without the gun-limit chip, in both sights at rest and at the widest ring, under this context's panel.
      for(const stage of ['ammo-dry-cannon','ammo-dry-autoloader','ammo-reload-autoloader-sniper'])
        for(const sight of ['battle','scope'])for(const bloom of ['rest','full'])for(const warn of [false,true]){
          f.state(stage);f.frame.matchModeState=modeState;
          f.frame.mode=sight==='scope'?'sniper':'battle';f.hud.setMode(f.frame.mode);
          Object.assign(f.frame.aim,{zoom:sight==='scope'?25:1,distM:1500,dispersionRadM:bloom==='full'?1e4:1e-4,gunLimitSpec:warn});
          await read(sight,bloom);
        }
      masks[context]={union,battle,rest};
    }
  }finally{
    proto.fillRect=fill;f.state('idle');restAim();f.frame.timeS=N.restingTime;f.frame.mode='battle';f.hud.setMode('battle');f.hud.update(f.frame);
  }
  window.__noticeMasks={W,H,scale:W/cssW,masks};
  let count=0;for(let i=0;i<n;i++)count+=masks[contexts[0]].union[i];
  return Math.round(count/(W/cssW)**2);
}
function noticeStage([state,kills,rosters,set,sight,tab]){
  const f=window.__HUD_LAYOUT,N=window.__NOTICE;
  // the ink this stage is weighed against: its furniture context's (noticeMasks)
  window.__noticeMaskContext=state==='mode-standard'||state==='mode-capture_the_flag'?state:'idle';
  document.querySelector('.cot-hud').classList.remove('rosters-expanded');
  f.bus.emit('battle:presented');
  f.frame.mode='battle';
  f.state(state);
  f.frame.mode='battle';
  if(rosters){f.roster(rosters,rosters);}
  if(kills!==null)for(const lane of document.querySelectorAll('.cot-kill-lane'))while(lane.children.length>kills)lane.lastElementChild.remove();
  for(const part of set?set.split('+'):[]){
    if(part==='det'){f.bus.emit('player:spotted',{timeS:f.frame.timeS-4});f.hud.update(f.frame);}
    else if(part.startsWith('alert:')){
      const [,ev,payload]=N.alerts.find(a=>a[0]===part.slice(6));let p=payload;
      if(payload==='self')p={id:f.frame.player.id};
      if(payload==='ours')p={team:f.frame.player.team};
      if(payload==='theirs')p={team:f.frame.player.team==='player'?'enemy':'player'};
      if(payload==='next')p={id:f.frame.player.id,slot:1,fallbackSlot:0};
      if(payload==='all')p={id:f.frame.player.id,slot:1,fallbackSlot:-1};
      if(payload==='pickup')p={by:f.frame.player.id,kind:'ammo',ammoAdded:120};
      if(payload==='longspec')p={on:true,targetId:'x',targetName:N.longSpec,reason:''};
      if(payload==='longmodule')p={id:f.frame.player.id,module:N.longModule,state:'red'};
      f.bus.emit(ev,p);
    }
    else if(part==='countdown')f.hud.preBattleCountdown(5);
    else if(part==='medal')f.bus.emit('service:medal',{id:N.medal});
    else if(part==='revive'){f.hud.setPreBattleRules(N.reviveRules);f.frame.player.combat.destroyed=true;
      f.bus.emit('tank:destroyed',{id:f.frame.player.id,killerId:f.tanks[8].id,cause:'fire'});f.hud.update(f.frame);}
  }
  if(sight==='scope'){f.frame.mode='sniper';f.hud.setMode('sniper');f.hud.update(f.frame);}
  // Tab (hud.ts): the rosters widen and take 30 px rows while it is held
  if(tab)document.querySelector('.cot-hud').classList.add('rosters-expanded');
  window.dispatchEvent(new Event('cot-hud-relayout'));
}
// Why a hidden (waiting) medal card waits, from what the stage measured: its hidden place on a shown notice or the revive
// count; the scope up where its place clears the battle sight only (`scopedShort`); or, on a phone-width window, the
// layout's 'f' mark (a lane its place cuts shows a kill row) with that lane's shown rows meeting its place. Among the
// receipt's cases only the phone-width ones leave the card no place that keeps the lanes whole (mouseNoticePlan.selftest
// 4c and 4f, on and near the census); off the census some desktop windows do too (768 x 592, 844 x 404, 960 x 410,
// 740 x 360), and a case staged there would need a planner-side flag rather than the width. Exercised without a browser
// in battleHudLayout.selftest.mjs.
function medalWaitCause(got,scopedShort,width){
  const b=got.waitingMedal;
  if(scopedShort)return true;
  if(!b)return false;
  const meets=(x,y)=>b[0]<x[1]+8&&b[0]+b[2]>x[0]-8&&b[1]<y[1]+8&&b[1]+b[3]>y[0]-8;
  if(['d','a','r'].some(k=>got.notices[k]&&meets([got.notices[k].box[0],got.notices[k].box[0]+got.notices[k].box[2]],[got.notices[k].box[1],got.notices[k].box[1]+got.notices[k].box[3]])))return true;
  return /m\d?s?wf/.test(got.tiers??'')&&width<520&&Object.values(got.lanes).some(l=>l.shown>0&&l.x&&l.y&&meets(l.x,l.y));
}
function noticeMeasure(){
  const all=window.__noticeMasks,m={...all,...all.masks[window.__noticeMaskContext??'idle']};
  const vis=e=>!!e&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&e.getBoundingClientRect().width>1&&e.getBoundingClientRect().height>1;
  const ink=(bits,r)=>{let n=0;const s=m.scale;
    const xa=Math.max(0,Math.floor(r.x*s)),xb=Math.min(m.W,Math.ceil((r.x+r.w)*s)),ya=Math.max(0,Math.floor(r.y*s)),yb=Math.min(m.H,Math.ceil((r.y+r.h)*s));
    for(let y=ya;y<yb;y++){const o=y*m.W;for(let x=xa;x<xb;x++)n+=bits[o+x];}
    return Math.round(n/s/s);};
  // text outside the element's six-sided frame (corner cut `cut` px at the top and bottom, 0 at mid-height)
  const clipped=(e,host,cut)=>{
    if(!e||!e.getClientRects().length)return 0;
    // (words kept for screen readers alone: a small mouse window's alert is its glyph, brand-ui 246)
    if(/inset\(50%\)/.test(getComputedStyle(e).clipPath)&&e.getBoundingClientRect().width<=1)return 0;
    const b=host.getBoundingClientRect(),mid=b.top+b.height/2,half=b.height/2,range=document.createRange();range.selectNodeContents(e);
    let worst=0;
    for(const r of range.getClientRects()){
      if(r.width<.5)continue;
      const inset=cut*Math.min(1,Math.max(Math.abs(r.top-mid),Math.abs(r.bottom-mid))/half);
      worst=Math.max(worst,b.left+inset-r.left,r.right-(b.right-inset),b.top-r.top-.5,r.bottom-b.bottom-.5,-r.left,r.right-innerWidth);
    }
    const style=getComputedStyle(e);
    if((style.overflowX!=='visible'&&e.scrollWidth>e.clientWidth+1)||(style.overflowY!=='visible'&&e.scrollHeight>e.clientHeight+1))worst=Math.max(worst,99);
    return Math.round(worst*10)/10;
  };
  const els={d:document.querySelector('.cot-sixth.on'),a:document.querySelector('.cot-alert.show'),c:document.querySelector('.cot-prebattle.on'),
    m:document.querySelector('.cot-medal-toasts[data-placement="ready"] .cot-medal-toast'),r:document.querySelector('.cot-revive.on')};
  const out={tiers:document.body.dataset.hudNoticeTiers??null,notices:{},failures:[],lanes:{}};
  // a waiting card keeps its planned place, hidden: where it would show
  const waiting=document.querySelector('.cot-medal-toasts[data-placement="deferred"] .cot-medal-toast')?.getBoundingClientRect();
  out.waitingMedal=waiting&&waiting.width>1?[waiting.x,waiting.y,waiting.width,waiting.height].map(v=>Math.round(v*10)/10):null;
  for(const side of ['l','r']){
    const lane=document.querySelector(`.cot-kill-lane.${side}`);
    if(lane){const r=lane.getBoundingClientRect();out.lanes[side]={staged:lane.children.length,shown:[...lane.children].filter(c=>!c.hidden&&c.getClientRects().length).length,x:[r.left,r.right],y:[r.top,r.bottom]};}
  }
  const OTHERS=['.cot-ear.l','.cot-ear.r','.cot-top','.cot-pips.show','.cot-mode-status.show','.cot-ribbon.on','.cot-kill-lane.l','.cot-kill-lane.r','.cot-net','.cot-drive','.cot-dp',
    '.cot-minimap','.cot-si-toasthost','.cot-si-cardhost:not(:empty)','.cot-room-chat:not([hidden])','.cot-spec.show','.cot-shell','.cot-con',
    '.cot-vehicle-controls','.cot-mp-status.battle','.cot-scope-vision:not([hidden])','.cot-flight-hud:not([hidden]) .flight-console'];
  const others=[];
  for(const s of OTHERS)for(const e of document.querySelectorAll(s))if(vis(e)&&!(s==='.cot-kill-lane.l'||s==='.cot-kill-lane.r')||(vis(e)&&e.children.length&&[...e.children].some(c=>!c.hidden)))others.push([s,e.getBoundingClientRect()]);
  const R=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  const inter=(a,b)=>Math.min(a.x+a.w,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.height)-Math.max(a.y,b.y)>1;
  for(const [k,e] of Object.entries(els)){
    if(!vis(e))continue;
    const box=R(e);
    const n={box:[box.x,box.y,box.w,box.h].map(v=>Math.round(v*10)/10),union:ink(m.union,box),battle:ink(m.battle,box),rest:ink(m.rest,box),hits:[],clip:0};
    for(const [s,r] of others)if(inter(box,r))n.hits.push(s);
    for(const [k2,e2] of Object.entries(els))if(k2!==k&&vis(e2)&&inter(box,e2.getBoundingClientRect()))n.hits.push(`notice ${k2}`);
    // (its second line is a screen reader's alone: shown is wider than the 1 px it keeps)
    if(k==='d'){n.clip=clipped(e.querySelector('.lb'),e,12);
      const sub=e.querySelector('.sub');n.sub=!!sub&&sub.getBoundingClientRect().width>1&&getComputedStyle(sub).display!=='none';}
    if(k==='a'){const copy=e.querySelector('.cot-alert-copy');n.clip=clipped(copy,e,12);n.font=parseFloat(getComputedStyle(e).fontSize);
      n.clamp=getComputedStyle(copy).webkitLineClamp;}
    if(k==='m')n.clip=Math.max(...['strong','small','.ey'].map(q=>clipped(e.querySelector(q),e,14)));
    out.notices[k]=n;
  }
  return out;
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
      // (the settings tabs and header by their own room: on a short window the header and its close button sit in the
      // end padding the strip keeps for them, responsiveSurfaces.css, the header's own padding over the strip's)
      // (their style alone is read: the success path reads no other, battleHudLayout.selftest.mjs)
      const tabs=!!el.classList?.contains('cot-set-tabs'),hdr=!!el.classList?.contains('cot-set-hdr');
      const style=tabs||hdr?getComputedStyle(el):null;
      const end=tabs?parseFloat(style.paddingInlineEnd)||0:0;
      const start=hdr?parseFloat(style.paddingInlineStart)||0:0;
      rects.push({name:el.className,x:r.x+start,y:r.y,right:r.right-end,bottom:r.bottom});
    }
    return rects;
  }
  const selectors = state==='settings' ? ['.cot-set-hdr','.cot-set-tabs','.cot-set-body','.cot-set-ftr'] :
    state==='ended' ? ['.es-hero','.es-report','.es-actions'] :
    ['.cot-aim-warning:not([hidden])','.cot-battle-notices .cot-aim-notice','.cot-sixth.on','.cot-alert.show','.cot-ear.l','.cot-ear.r','.cot-top','.cot-pips.show','.cot-mode-status.show','.cot-ribbon.on','.cot-kill-lane.l','.cot-kill-lane.r','.cot-net','.cot-drive','.cot-dp','.cot-minimap',
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
  return {failures,rects,body:document.body.dataset,seat:document.body.dataset.objectiveSeat||'',ammoTransitions};
}
try {
  for (const [name,width,height,touch,locale='en-US',options={}] of cases) {
    const pseudo=!!options.pseudo;
    if(arg('case','')&&!arg('case','').split(',').includes(name))continue;
    if(recordMain&&touch)continue;
    const context = await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,
      deviceScaleFactor:1,reducedMotion:arg('motion','reduce')});
    // The notice checks hold alerts (2.4 s), medals (3.4 s) and kill rows (5.2 / 6.2 s) for 50 times as long so a busy
    // machine cannot expire one between staging and measuring; placement code is untouched.
    await context.addInitScript(()=>{const later=window.setTimeout;
      window.setTimeout=function(fn,ms,...rest){if(window.__stretchTimers&&[2400,3400,5200,6200].includes(ms))ms*=50;return later.call(this,fn,ms,...rest);};});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
    await page.goto(`${arg('url','http://127.0.0.1:5189')}/tools/fixtures/battle-hud-layout.html?locale=${locale}${pseudo?'&pseudo=1':''}`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.__HUD_LAYOUT);
    // Exercise the real DOMTokenList/MutationObserver path. Removing a class
    // which is already absent still produces mutation records in browsers.
    // The HUD does this every battle update; it must not measure layout again.
    await page.waitForTimeout(180);
    const idleLayoutReads=await page.evaluate(async()=>{
      const root=document.querySelector('.cot-hud');
      const special=document.querySelector('.cot-special');
      const original=root.getClientRects;
      let reads=0;
      root.getClientRects=function(){reads++;return original.call(this);};
      try {
        for(let i=0;i<24;i++){
          special.classList.remove('pending');
          await new Promise(requestAnimationFrame);
        }
        await new Promise(requestAnimationFrame);
        return reads;
      } finally { root.getClientRects=original; }
    });
    if(idleLayoutReads>1)errors.push(`${name}: unchanged HUD caused ${idleLayoutReads} layout measurements`);
    // The centre notices on a fresh page (record mode measures main's on one too).
    async function centreNotices(){
      await page.evaluate(noticePrep,NOTICE_ALERTS);
      const inked=await page.evaluate(noticeMasks,NOTICE_MASK_CONTEXTS);
      if(inked<200)errors.push(`${name}: the reticle drew too little ink (${inked} px) to weigh the notices against`);
      const pinned=MAIN_NOTICES?.cases?.[name];
      if(!recordMain&&!pinned)errors.push(`${name}: no main notice numbers pinned (tools/fixtures/battle-hud-layout.main-notices.json)`);
      const seen=new Map();
      for(const [key,...stage] of noticeStages().filter(([key])=>!stageFilter||stageFilter.test(key))){
        await page.evaluate(noticeStage,stage);
        await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
          const running=document.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime));
          await Promise.race([Promise.all(running.map(a=>a.finished.catch(()=>{}))),new Promise(r=>setTimeout(r,1500))]);
          await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
        const got=await page.evaluate(noticeMeasure);
        const set=stage[3];
        const want={d:set.includes('det'),a:set.includes('alert:'),c:set.includes('countdown'),r:set.includes('revive')};
        if(recordMain){
          const rec=mainRecord[name]??={};const pick={};
          for(const [k,n] of Object.entries(got.notices))if(n.union||n.battle||n.rest)pick[k]=[n.union,n.battle,n.rest];
          // main's alert type size and the kill rows each lane shows
          if(got.notices.a)pick._f=got.notices.a.font;
          pick._l=[got.lanes.l?.shown??-1,got.lanes.r?.shown??-1];
          rec[key]=pick;
          continue;
        }
        const failures=[];
        const mainStage=pinned?.[key];
        if(got.tiers===null)failures.push('the mouse layout carries no notice plan (body[data-hud-notice-tiers])');
        for(const [k,shown] of Object.entries(want))if(shown&&!got.notices[k])failures.push(`${k} was staged but is not shown`);
        // the keep-out each element's plan clears ('2' unless the plan says less), and whether it shares a notice's place
        const tier=k=>{const m=(got.tiers??'').match(new RegExp(`${k}(\\d|-)(s?)`));return m?(m[1]==='-'?-1:Number(m[1])):2;};
        const shares=k=>new RegExp(`${k}\\ds`).test(got.tiers??'');
        // the medal card waits only on a notice whose place it shares, where its plan has no place at all, and in the
        // scope where its place clears the battle sight only
        const scopedShort=stage[4]==='scope'&&tier('m')<2;
        // The medal card waits (tier 'w', mouseMedalWaits) exactly where its place meets a shown element's, or in the scope
        // where its place clears the battle sight only: a hidden card must be marked waiting, with its (hidden) place on a
        // shown element or the scope as its cause, and a shown card must not be marked.
        const marked=/m\d?s?w/.test(got.tiers??'');
        if(set.includes('medal')&&!got.notices.m&&tier('m')>=0){
          const cause=medalWaitCause(got,scopedShort,width);
          if(!marked||!cause)failures.push(`the medal card has a place but is not shown (${marked?'marked waiting':'not marked waiting'}, ${cause?'with':'without'} a shown element in its place)`);
        }
        if(got.notices.m&&marked)failures.push('the medal card shows while marked waiting');
        if(set.includes('medal')&&got.notices.m&&scopedShort)failures.push(`the medal card shows in the scope where its place clears the battle sight only (tier ${tier('m')})`);
        for(const [k,n] of Object.entries(got.notices)){
          const what={d:'detection',a:'alert',c:'countdown',m:'medal',r:'revive count'}[k];
          const t=tier(k),main=mainStage?.[k]??[0,0,0];
          const own=t===2?n.union:t===1?n.battle:t===0?n.rest:0;
          if(t>=0&&own>0)failures.push(`the ${what} covers ${own} px of reticle ink its plan clears (tier ${t}; ${n.box.join(',')})`);
          // (a medal card whose place clears the battle sight only waits whenever the scope is up, and this receipt fails it
          // if it ever shows there (scopedShort above), so no scope ink is ever under it: its ink is the battle sight's, held
          // to main's battle ink; coordinator ruling 2026-10-20)
          const [shown,mainShown]=k==='m'&&t>=0&&t<2?[n.battle,main[1]]:[n.union,main[0]];
          if(shown>mainShown||n.rest>main[2])failures.push(`the ${what} covers more reticle ink than main (${n.union}/${n.battle}/${n.rest} px; main ${main[0]}/${main[1]}/${main[2]})`);
          if(k==='m'&&t<0)failures.push('the medal card is shown where its plan has no place');
          // a dropped plan fails: the detection and the alert clear the whole reticle (the plan fell back to main's places,
          // '-', or cleared less), and a shown countdown or revive count has a planned place (not the CSS defaults)
          // (a tier 1 place covering no ink of either sight passes: the scope's arms end short of a shown notice,
          // sightFurniture.ts sightNoticeCuts, where the notices' gap leaves the pair over an arm's tip, 1024x600)
          if((k==='d'||k==='a')&&t!==2&&!(t===1&&n.union===0))failures.push(`the ${what}'s plan clears tier ${t<0?'-':t}, not the whole reticle`);
          if((k==='c'||k==='r')&&t<0)failures.push(`the ${what} is shown without a planned place`);
          // only an element its plan marks as sharing a notice's place (tier 's') may meet that notice, and only the pair
          // that never shows together: the countdown and the detection (nothing can spot the player before the roll-out).
          // An alert shows during the countdown (H, R, E) and with the revive count, a detection lit before a death burns
          // on under the revive count, and the medal card waits while anything shown meets its place.
          const sharing=hit=>{const m=hit.match(/^notice ([dacmr])$/);if(!m)return false;
            const pair=[k,m[1]].sort().join('');
            return pair==='cd'&&shares('c');};
          // a place that clears the battle sight only (tier 1 or 0: the countdown on a 481 px portrait, the revive count on a
          // short window) is not kept off the scope's furniture; its ink is held to main's above
          const scopeFurniture=hit=>hit.startsWith('.cot-scope-vision')&&t<2;
          for(const hit of n.hits)if(!sharing(hit)&&!scopeFurniture(hit))failures.push(`the ${what} overlaps ${hit}`);
          if(n.clip>.75)failures.push(`the ${what}'s text runs ${n.clip} px outside its frame`);
          if(k==='a'){
            const mainFont=mainStage?._f??(height<=550||width<=480?9:12);
            if(n.font<mainFont||n.font<9||(n.clamp&&n.clamp!=='none'))failures.push(`the alert is clamped or smaller than main's type (${n.font} px, main ${mainFont}; clamp ${n.clamp})`);
          }
          // (owner 2026-10-22: no secondary labels; the lamp and DETECTED read alone, one row at every size)
          if(k==='d'&&n.sub)failures.push(`the detection's second line shows at ${width}x${height}`);
          noticeTable.push({name,key,k,box:n.box,union:n.union,rest:n.rest,main:main[0],tier:t});
        }
        // the lanes: every row main shows while nothing is up; at least one while anything is (an exemption is matched
        // against the elements that can have emptied that lane: those shown, the medal card only over the lane's column)
        const kindOf=part=>part==='det'?'d':part.startsWith('alert:')?'a':part==='countdown'?'c':part==='medal'?'m':part==='revive'?'r':'';
        const laneKey=lane=>`${key.split('|')[0]}|${set.split('+').filter(part=>{const n=got.notices[kindOf(part)];
          return n&&(part!=='medal'||!lane.x||(n.box[0]<lane.x[1]+8&&n.box[0]+n.box[2]>lane.x[0]-8));}).join('+')}|${key.split('|')[2]}`;
        for(const [i,side] of [[0,'l'],[1,'r']]){
          const lane=got.lanes[side];
          if(!lane||!lane.staged)continue;
          const mainRows=mainStage?._l?.[i]??-1;
          if(!set&&lane.shown<mainRows)failures.push(`the ${side==='l'?'left':'right'} lane shows ${lane.shown} kill rows with nothing up (main ${mainRows})`);
          // (the countdown runs before the first kill: its lanes hold none to keep)
          if(set&&!set.includes('countdown')&&lane.shown<1&&(mainRows<0||mainRows>0)&&!EMPTY_LANES_OK[name]?.test(laneKey(lane)))
            failures.push(`the ${side==='l'?'left':'right'} lane shows no kill row while ${set} is up`);
        }
        // a kill burst and Tab move nothing: the same set and sight in k0, k3, the burst and Tab share every box
        const [ctx,,sight]=key.split('|');
        if(['k0','k3','burst','tab'].includes(ctx)&&set){
          // (a waiting medal card keeps its place, hidden: its place is compared, not whether a kill row holds it back)
          const placed=Object.fromEntries(Object.entries(got.notices).map(([k,n])=>[k,n.box]));
          if(!placed.m&&got.waitingMedal&&/m\d?s?w/.test(got.tiers??''))placed.m=got.waitingMedal;
          const sig=`${set}|${sight}`,boxes=JSON.stringify(Object.fromEntries(Object.entries(placed).sort()));
          const before=seen.get(sig);
          if(before&&before.boxes!==boxes)failures.push(`a notice moved between ${before.ctx} and ${ctx}: ${before.boxes} -> ${boxes}`);
          if(!before)seen.set(sig,{ctx,boxes});
        }
        reports.push({name,...page.viewportSize(),touch,locale,state:`notices-${key}`,failures,rects:[],notices:got.notices,tiers:got.tiers,lanes:got.lanes});
        if(failures.length){console.log(`${name}/notices ${key}: ${failures.join('; ')}`);await page.screenshot({path:resolve(out,`${name}-notices-${key.replaceAll('|','-').replaceAll(':','_')}.png`)});}
      }
      await page.evaluate(()=>{window.__stretchTimers=false;window.__HUD_LAYOUT.bus.emit('battle:presented');window.__HUD_LAYOUT.state('idle');});
    }
    if(!touch&&(recordMain||options.lite||noticesOnly)){await centreNotices();await context.close();continue;}
    async function check(state){
      const result=await page.evaluate(measure,state);
      if(pseudo||locale!=='en-US')result.failures.push(...await page.evaluate(clippedText));
      result.failures.push(...await page.evaluate(markerProblems,state==='markers'));
      const score=result.rects.find(r=>r.name==='cot-top');
      // (the objective shows 'stacked' in two rows where its progress wraps)
      const objective=result.rects.find(r=>r.name.startsWith('cot-mode-status show'));
      const plates=await page.evaluate(()=>({score:getComputedStyle(document.querySelector('.cot-top')).clipPath,
        objective:document.querySelector('.cot-mode-status')?getComputedStyle(document.querySelector('.cot-mode-status')).clipPath:'',
        quiet:!!document.querySelector('.cot-mode-status.quiet')}));
      // a short landscape's side seat (battleHudLayout.ts OBJECTIVE_COMPACT_H): the compact objective in the map's column
      const map=result.rects.find(r=>r.name.split(' ').includes('cot-minimap'));
      if(objective&&result.seat==='side'){
        if(!map||Math.abs(objective.x-map.x)>.5||Math.abs(objective.y-map.bottom-4)>.5)
          result.failures.push('the side-seated objective must sit 4px under the map, in its column');
      }else if(objective&&result.seat==='corner'){
        // the mission plate (owner 2026-10-24: "left objective marker should be another right trapezoid attached to
        // left"): flush in the window's top-left corner, its left edge upright and its right one slanted, clear of the score
        if(Math.abs(objective.x)>.5||Math.abs(objective.y)>.5)result.failures.push('the corner objective must sit flush in the top-left corner');
        if(!/^polygon\(0px 0px, 100% 0px, calc\(100% - [\d.]+px\) 100%, 0px 100%\)$/.test(plates.objective))
          result.failures.push('the corner objective must be a right trapezoid');
        if(score&&objective.right+8>score.x)result.failures.push('the corner objective must keep clear of the score plate');
      }else{
        // under the score, the plate's own tab: flush under it, centred, inside its bottom edge (its slant read from the
        // plate's clip, hud.ts .cot-top)
        const inset=Number(/,\s*([\d.]+)px 100%\)$/.exec(plates.score)?.[1]);
        if(score&&objective&&!(objective.x>=score.x+inset-.5&&objective.right<=score.right-inset+.5))
          result.failures.push('objective must fit inside the scoreboard bottom edge');
        if(score&&objective&&Math.abs((objective.x+objective.right)/2-(score.x+score.right)/2)>.5)
          result.failures.push('objective must be centred under the scoreboard');
        if(score&&objective&&Math.abs(objective.y-score.bottom)>.5) result.failures.push('objective must touch the scoreboard');
      }
      const compactNotices=await page.locator('.cot-si-toast').evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility({checkVisibilityCSS:true})).map(node=>({
        height:node.getBoundingClientRect().height,secondary:!!node.querySelector('.l2'),
      })));
      if(compactNotices.some(row=>row.height!==26||row.secondary))result.failures.push('damage notices must share the 26px single-line kill design');
      const feedChecks=await page.evaluate(()=>{
        const failures=[];
        for(const el of document.querySelectorAll('.cot-si-toasthost,.cot-kill-lane')){
          if(!el.checkVisibility({checkVisibilityCSS:true}))continue;
          const r=el.getBoundingClientRect();
          // (the hit rows take the left lane's width since gauntlet r5: a lane's 400 px is the bound for both)
          if(r.width>400.5)failures.push('notification feed exceeds its maximum width');
          if(el.classList.contains('r')?Math.abs(r.right-innerWidth)>.5:Math.abs(r.left)>.5)
            failures.push('notification feed is indented from the screen edge');
        }
        for(const toast of document.querySelectorAll('.cot-si-toast')){
          if(!toast.checkVisibility({checkVisibilityCSS:true}))continue;
          const icon=toast.querySelector('.si'),name=toast.querySelector('.attacker'),value=toast.querySelector('b');
          if(!icon||!getComputedStyle(icon).maskImage.includes('t90am_side_silhouette.png')){
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
        // (the objective is quiet, shown only as the corner's mission plate, where the score says it all: the Standard
        // battle and the Horde, hud.ts; the detection keeps the notice planners' 6 px from it wherever it stands, under the
        // score, beside it in a side seat or in the corner, and may sit under the sight: UI-GAUNTLET's battle row)
        const apart=(a,b)=>Math.max(a.x-b.right,b.x-a.right,a.y-b.bottom,b.y-a.bottom);
        if(plates.quiet&&result.seat!=='corner'?!!objective:!objective)
          result.failures.push(plates.quiet?'a quiet objective must not show under the score':'objective missing');
        if(!detected)result.failures.push('detection missing');
        else if(objective&&apart(detected,objective)<6)result.failures.push('detection must keep 6px from the objective');
      }
      if(state.startsWith('notifications')) {
        // (each notice's edge and fill are the long hexagon's two layers under the words, owner 2026-10-25: its ::before
        // and ::after carry --notice-cut, the element itself no clip; hud.ts, hudNotices.selftest.mjs)
        const hexagons=await page.locator('.cot-sixth.on,.cot-alert.show').evaluateAll(nodes=>nodes.map(node=>
          [getComputedStyle(node,'::before').clipPath,getComputedStyle(node,'::after').clipPath]));
        if(hexagons.length!==2||hexagons.some(layers=>layers.some(shape=>!shape.startsWith('polygon(')||shape.split(',').length!==6)))
          result.failures.push('status notices must have six-sided outlines');
      }
      if(state!=='settings'&&state!=='ended'){
        const decoration=await page.evaluate(()=>{
          const notice=document.querySelector('.cot-kill-lane.r .cot-kf');
          const style=notice?getComputedStyle(notice):null;
          return {left:style?.borderLeftWidth,right:style?.borderRightWidth,justify:style?.justifyContent,
            mode:document.querySelector('.cot-mode-status')?.dataset.mode};
        });
        // (one plate ringed all round, never a one-sided coloured border, owner 2026-10-25; the enemy's lane mirrored)
        if(decoration.left&&(parseFloat(decoration.left)!==parseFloat(decoration.right)||decoration.justify!=='flex-end'))
          result.failures.push('enemy kill notice must be one plate, mirrored to its lane');
        if(state.startsWith('mode-')&&decoration.mode!==state.slice(5))
          result.failures.push(`expected objective ${state.slice(5)}, saw ${decoration.mode}`);
      }
      if(state==='notifications'||state==='combined'||state==='spectator'||state==='feed-burst'||result.failures.length)
        await page.screenshot({path:resolve(out,`${name}-${state}.png`)});
      reports.push({name,...page.viewportSize(),touch,locale,pseudo,state,...result});
      if(result.failures.length)console.log(`${name}/${state}: ${result.failures.join('; ')}`);
    }
    for(const state of states){
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
      if(state==='ammo-expanded'&&touch){
        await page.locator('.cot-shell.sel').click();
        await page.waitForTimeout(180);
        if(await page.locator('.cot-shell[aria-hidden="true"]').count())errors.push(`${name}: ammo drawer failed to expand`);
      }
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
        // The full Gravity + ATGM kit must remain usable after moving to a side lane. On touch the row is whole 44 px tiles
        // that never scroll, and a row that cannot hold them all pages through the rest behind its More tile (UI-06).
        // what the vehicle-action table gives this tank in this mode (src/game/vehicleActions.ts, read as the Garage reads it),
        // and the event each control raises (hud.ts bindControl)
        const ACTION_EVENT={jump:'ui:selfRight',suspension:'ui:specialAction',atgm:'ui:shellSelect',reload:'ui:magazineReload',
          drone:'ui:drone',smoke:'ui:smoke',lights:'ui:lightsToggle',roofGun:'ui:roofGun'};
        const expectedActions=await page.evaluate(async()=>{
          const [{vehicleActionsFor},{isJumpMode},{matchRulesetFor},{normalizeGameMode}]=await Promise.all([
            import('/src/ui/vehicleActionList.ts'),import('/src/ui/vehicleControlOrder.ts'),import('/src/sim/matchRuleset.ts'),
            import('/src/sim/gameModeCatalog.ts')]);
          const f=window.__HUD_LAYOUT,mode=normalizeGameMode(f.frame.matchModeState?.id);
          return vehicleActionsFor(f.frame.player.spec,{jump:isJumpMode(matchRulesetFor(mode)),drone:mode==='drone'}).map(a=>a.id);
        });
        await page.evaluate(events=>{
          window.__controlEvents=[];
          for(const event of events)window.__HUD_LAYOUT.bus.on(event,()=>window.__controlEvents.push(event));
        },[...new Set(Object.values(ACTION_EVENT))]);
        const pageCount=await page.evaluate(()=>Number(document.querySelector('.cot-vehicle-controls').dataset.pages)||1);
        let pressed=0;
        for(let index=0;index<pageCount;index++){
          // (the page's tiles taken once: a relayout a press sets off must not shift a re-queried nth tile)
          const buttons=await page.locator('.cot-vehicle-controls > button:visible').elementHandles();
          for(const button of buttons){
            const box=await button.boundingBox();
            if(!box)continue;
            if(box.width<44||box.height<(touch?44:32))errors.push(`${name}: vehicle control below touch target minimum`);
            if(touch&&(box.x<-.5||box.x+box.width>width+.5))errors.push(`${name}: vehicle control off the screen`);
            if(await button.evaluate(node=>node.classList.contains('cot-systems-more')))continue;
            await button.click();
            pressed++;
          }
          if(touch&&await page.evaluate(()=>{const row=document.querySelector('.cot-vehicle-controls');return row.scrollWidth>row.clientWidth+1;}))
            errors.push(`${name}: the touch row scrolls`);
          if(index<pageCount-1){
            // (More sets the row's page at once; the layout hides the old page's tiles on its next frame)
            await page.locator('.cot-systems-more').click();
            await page.waitForFunction(i=>document.querySelector('.cot-vehicle-controls').dataset.page===String(i),index+1);
            await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
          }
        }
        if(pageCount>1)await page.locator('.cot-systems-more').click();
        if(pressed!==expectedActions.length)errors.push(`${name}: expected all ${expectedActions.length} vehicle controls (${pressed} reached)`);
        const events=await page.evaluate(()=>window.__controlEvents);
        // Mars is a jump mode: the jump leads the row (vehicleControlOrder.ts), then the loadout in the table's order.
        const expectedEvents=expectedActions.map(id=>ACTION_EVENT[id]).join(',');
        if(events.join(',')!==expectedEvents)
          errors.push(`${name}: vehicle control activation mismatch: ${events} (the table: ${expectedEvents})`);
        await page.evaluate(()=>document.querySelector('.cot-vehicle-controls').scrollLeft=0);
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
    // Same-density count changes used to leave a stale tall container and stretch rows.
    if(!touch && width>=820 && height>=600){
      for(const count of [7,3,2,1,7]){
        await page.evaluate(count=>{const f=window.__HUD_LAYOUT;f.state('reports');f.roster(count,count);},count);
        await page.waitForTimeout(120);
        for(const expanded of [false,true]){
          if(expanded){await cursorCaptured(page,true);await page.keyboard.down('Tab');await page.waitForTimeout(120);}
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
          if(expanded){await page.keyboard.up('Tab');await cursorCaptured(page,false);await page.waitForTimeout(120);}
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
        await cursorCaptured(page,true);
        await page.keyboard.down('Tab');
        await page.waitForTimeout(120);
        const expandedWidth=await page.locator('.cot-ear.l').evaluate(el=>el.getBoundingClientRect().width);
        if(expandedWidth<=normalWidth)errors.push(`${name}: Tab did not widen the roster`);
        await check('rosters-tab-expanded');
        await page.keyboard.up('Tab');
        await cursorCaptured(page,false);
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
              // (each tile names its tank in its hover tip, the kit's hoverTip, and to a screen reader in its .n)
              if(!(tile.dataset.tip||tile.title)||!tile.querySelector('.n')?.textContent.trim())failures.push('grid loses tank identity');
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
    if(!touch){
      await page.goto(`${arg('url','http://127.0.0.1:5189')}/tools/fixtures/battle-hud-layout.html?locale=${locale}`,{waitUntil:'networkidle'});
      await page.waitForFunction(()=>!!window.__HUD_LAYOUT);
      await page.waitForTimeout(180);
      await centreNotices();
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(resolve(out,'report.json'),JSON.stringify({reports,errors},null,2));
  if(recordMain)await writeFile(resolve(recordMain),JSON.stringify({label:arg('main-label','main'),
    note:'Main\'s reticle ink under each centre notice per mouse case and stage: [union of both sights at rest and full bloom with readouts, battle sight, resting battle sight] px (notices on none are omitted); _f its alert type size in px; _l the kill rows its left and right lanes show (-1: no lane).',
    cases:mainRecord})+'\n');
}
if(!recordMain&&noticeTable.length){
  const inked=noticeTable.filter(r=>r.union>0);
  console.log(`centre notices: ${noticeTable.length} boxes, ${inked.length} on reticle ink (main: ${noticeTable.filter(r=>r.main>0).length})`+
    (inked.length?`: ${inked.slice(0,8).map(r=>`${r.name}/${r.key}/${r.k} ${r.union}`).join('; ')}`:''));
}
const failed=reports.filter(r=>r.failures.length);
console.log(`${reports.length} state/viewport checks; ${failed.length} failed; ${errors.length} browser errors. ${out}`);
if(failed.length||errors.length){console.log(errors);process.exitCode=1;}
