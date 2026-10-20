import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { battleSideStack, battleNotificationRows, battleRosterHeight, installBattleHudLayout, objectiveWidth, battleReportDock, REPORT_MAP_GAP,
  portraitSightClearTop, SIGHT_BAND_ABOVE, SIGHT_BAND_BELOW, SCOPE_BAND_BELOW } from './battleHudLayout.ts';
import { sightFurniture, sightNotice } from './sightFurniture.ts';
const layoutSourceR10 = readFileSync(new URL('./battleHudLayout.ts', import.meta.url), 'utf8');

for (const space of [0, 80, 124, 320, 500]) {
  const height = battleRosterHeight(600, space, 124);
  assert.ok(height <= space, 'grid minimum never exceeds the available side lane');
  assert.ok(height >= Math.min(space, 124), 'crowded grid retains readable icon rows');
  if (space >= 320) assert.ok(space - height >= 192, 'grid keeps room for kill notices and the combat report');
}

for (const count of [1, 2, 3, 7, 10, 14]) {
  const normal = battleRosterHeight(1080, 700, 48, count);
  const expanded = battleRosterHeight(1080, 700, 48, count, true);
  assert.equal(normal, 22 + count * 24, 'fewer players do not inflate normal rows');
  assert.equal(expanded, 22 + count * 30, 'only Tab requests taller rows');
  assert.ok(700 - expanded >= 112, 'expanded list still reserves the diagram readout');
  assert.ok(battleRosterHeight(600, 320, 48, count) <= 208, 'short layout preserves readout plus gap');
}

for(const width of [240,280,344,420]) {
  const w=objectiveWidth(width);
  assert.ok((width-w)/2>25, 'objective clears both clipped scoreboard corners');
}

for(const height of [0,30,62,100,150,200,320,600])for(const chat of [false,true])for(const count of [0,1,3,8]){
  const layout=battleSideStack(height,chat,count);
  assert.ok(layout.toastRows<=8&&layout.toastRows<=count);
  assert.ok(layout.toastHeight<=height);
  assert.ok(layout.chatOffset+layout.chatHeight<=height);
  if(chat&&height>=62)assert.ok(layout.chatHeight>=54,'the composer retains room below the alerts');
}
assert.equal(battleSideStack(100,true,3).toastRows,1,'a compact notice fits beside the reserved chat input');
assert.equal(battleSideStack(320,false,3).toastRows,3);
assert.equal(battleSideStack(320,false,20).toastRows,8);
for(let height=0;height<500;height++){
  const rows=battleNotificationRows(height,20);
  assert.ok(rows<=8&&rows>=0);
  assert.ok(!rows||rows*29-3<=height,'only complete notification rows fit');
  assert.ok(rows>=battleNotificationRows(height-1,20),'more space never reduces capacity');
}
assert.equal(battleNotificationRows(84,20),3);
assert.equal(battleNotificationRows(229,20),8);

for(const height of [390,600,720,1080])for(const space of [0,40,100,300,600]) {
  const roster=battleRosterHeight(height,space);
  assert.ok(roster>=0&&roster<=space,'roster cannot exceed its available side lane');
  if(space>=300)assert.ok(space-roster>=180,'large rosters preserve space for combat feedback');
}

// Changing notification counts cannot change this dock: only physical space
// and the deliberate compact report presentation affect its height.
assert.equal(REPORT_MAP_GAP,12);
for (const bottom of [120,240,480,800]) for (const ceiling of [80,180,400]) for (const compact of [false,true]) {
  const dock=battleReportDock(bottom,ceiling,compact);
  assert.equal(dock.bottom,bottom);
  assert.equal(dock.top+dock.height,bottom);
  assert.ok(dock.height>=0&&dock.height<=(compact?160:260));
  assert.ok(dock.height===0||dock.top>=ceiling);
}

// Owner 2026-10-17 (out of ammo, critic r3): a portrait phone's systems row never crosses the sight's band — its
// countdown, rack, struck empty round, aim warning and scope readouts. Measured portrait phones (tools/fixtures/
// battle-hud-layout.html, Chrome): 390x844 parks the row at 416 above its tray (468), across the 422 centre; 360x640
// parks it at 212, clear; 430x932 at 504, across 466; the 768x1024 tablet at 596, under the battle furniture (cy+80).
// The floor is the lower cluster (speedometer, fire, aim hint).
{
  const crossing = (top, height, centre) => top < centre + SIGHT_BAND_BELOW && top + height > centre - SIGHT_BAND_ABOVE;
  assert.equal(portraitSightClearTop(212, 44, 320, 406, 208), 212, '360x640: already clear, untouched');
  assert.equal(portraitSightClearTop(596, 44, 512, 689, 232), 596, '768x1024: already clear of the sight, untouched');
  const tall = portraitSightClearTop(416, 44, 422, 560, 208);
  assert.ok(!crossing(tall, 44, 422) && tall >= 208, `390x844: the row leaves the band within the free space (${tall})`);
  assert.equal(tall, 422 - SIGHT_BAND_ABOVE - 44, 'no room under the scope readouts above the cluster: above the ring');
  assert.ok(!crossing(portraitSightClearTop(504, 44, 466, 626, 208), 44, 466), '430x932: clear too');
  assert.equal(portraitSightClearTop(560, 44, 520, 900, 208), 520 + SCOPE_BAND_BELOW,
    'a tall portrait moves it below the scope readouts too, nearer the thumbs');
  assert.equal(portraitSightClearTop(300, 44, 300, 380, 280), 300, 'no room on either side: the row stays');
  for (let centre = 280; centre <= 560; centre += 7) for (let top = 100; top <= 700; top += 13) {
    const placed = portraitSightClearTop(top, 44, centre, 760, 160);
    if (placed !== top) {
      assert.ok(crossing(top, 44, centre) && placed >= 160 && placed + 44 <= 760
        && (placed >= centre + SCOPE_BAND_BELOW || placed + 44 <= centre - SIGHT_BAND_ABOVE), `moved rows land clear (${top}, ${centre})`);
    } else if (crossing(top, 44, centre)) assert.ok(centre + SCOPE_BAND_BELOW + 44 > 760 && centre - SIGHT_BAND_ABOVE - 44 < 160);
  }
}
const layoutSource = readFileSync(new URL('./battleHudLayout.ts', import.meta.url), 'utf8');
assert.match(layoutSource, /if \(touch && width < height && systemsHeight\) \{[\s\S]{0,600}portraitSightClearTop\(systemsTop, systemsHeight, height \/ 2, floor, ceiling\)/,
  'the solver applies it to touch portraits, centred on the screen-centre sight');
assert.match(layoutSource, /Math\.min\(laneSystemsTop, systemsTop\) - 8/, 'the side lanes never gain the row\'s old space');

// Observer lifecycle in a deterministic DOM: no-op attribute records must not
// turn layout into a per-frame job, but real state/viewport changes still do.
const originals = new Map(['document','window','ResizeObserver','MutationObserver',
  'requestAnimationFrame','getComputedStyle'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
try {
  const frames=new Map(); let nextFrame=1; let measures=0; let writes=0;
  const callbacks={}; const watched=[]; const listeners=new Map();
  const properties=new Map();
  const node=(attrs={})=>({
    attrs:{...attrs},dataset:{},childElementCount:0,visible:true,
    classList:{contains:()=>false,toggle:()=>false},
    style:{getPropertyValue:key=>properties.get(key)||'',setProperty:(key,value)=>{writes++;properties.set(key,value);},removeProperty:key=>{writes++;properties.delete(key);}},
    getAttribute(key){return this.attrs[key]??null;},
    hasAttribute(key){return this.getAttribute(key)!==null;},
    toggleAttribute(key,on){if(on)this.attrs[key]='';else delete this.attrs[key];},
    getClientRects(){measures++;return this.visible?[{}]:[];},
    getBoundingClientRect(){return {top:600,bottom:660,left:0,right:100};},
    querySelector(){return null;},
  });
  const root=node({style:''}); const body=node({class:''});
  const special=node({class:'cot-special deny'});
  const visibleNodes=[special];
  const viewport={height:768,width:1366,addEventListener:(type,fn)=>listeners.set(`viewport:${type}`,fn)};
  // documentElement.clientWidth is the layout viewport a pinch leaves alone
  globalThis.document={body,documentElement:{clientWidth:1366},querySelector:()=>null,querySelectorAll:()=>visibleNodes};
  globalThis.window={innerHeight:768,innerWidth:1366,visualViewport:viewport,document:globalThis.document,
    addEventListener:(type,fn)=>listeners.set(type,fn)};
  globalThis.getComputedStyle=()=>({visibility:'visible'});
  globalThis.requestAnimationFrame=fn=>{const id=nextFrame++;frames.set(id,fn);return id;};
  globalThis.ResizeObserver=class{constructor(fn){callbacks.resize=fn;}observe(){}};
  globalThis.MutationObserver=class{constructor(fn){callbacks.mutation=fn;}observe(target,options){watched.push({target,options});}};
  const flush=()=>{const work=[...frames.values()];frames.clear();for(const fn of work)fn();};
  const change=(target,name,oldValue)=>callbacks.mutation([{type:'attributes',target,attributeName:name,oldValue}]);
  installBattleHudLayout(root);
  assert.equal(frames.size,1); flush();
  const initialMeasures=measures; const initialWrites=writes;
  const transientClass=(target,initial,intermediate)=>callbacks.mutation([
    {type:'attributes',target,attributeName:'class',oldValue:initial},
    {type:'attributes',target,attributeName:'class',oldValue:intermediate},
  ]);
  transientClass(special,'cot-special deny','cot-special');
  assert.equal(frames.size,0,
    'the FIRST callback ignores a deny remove/re-add batch with unchanged final class');
  assert.equal(measures,initialMeasures);
  for(let i=0;i<600;i++)change(special,'class','cot-special deny');
  assert.equal(frames.size,0,'600 unchanged pending-class removals schedule no layout');
  for(let i=0;i<600;i++)transientClass(special,'cot-special deny','cot-special');
  assert.equal(frames.size,0,'600 transient remove/re-add pulses schedule no lane measurements');
  assert.equal(measures,initialMeasures);
  assert.ok(watched.every(({options})=>!options.attributeOldValue),'retained final values avoid capturing redundant old strings on every frame');
  special.attrs.class='cot-special show';change(special,'class','cot-special deny');
  listeners.get('resize')();callbacks.resize();
  assert.equal(frames.size,1,'real mutations and resize coalesce');flush();
  assert.equal(writes,initialWrites,'unchanged geometry does not rewrite CSS properties');
  // Every attribute in the batch must update its baseline, even after the
  // first real change. Subsequent unchanged batches must not schedule again.
  special.attrs.class='cot-special show deny';body.attrs.class='cot-touch-layout';
  callbacks.mutation([
    {type:'attributes',target:special,attributeName:'class',oldValue:'cot-special show'},
    {type:'attributes',target:body,attributeName:'class',oldValue:''},
  ]);
  assert.equal(frames.size,1,'multiple real attribute changes share one measurement');flush();
  transientClass(special,'cot-special show deny','cot-special show');
  transientClass(body,'cot-touch-layout','');
  assert.equal(frames.size,0,'all final attribute values were retained');
  root.visible=false;root.attrs.style='display:none';change(root,'style','');flush();
  assert.equal(body.hasAttribute('data-cot-battle-layout'),false,'hidden battle releases side lanes');
  root.visible=true;root.attrs.style='';change(root,'style','display:none');flush();
  assert.equal(body.hasAttribute('data-cot-battle-layout'),true);
  // a trackpad pinch shrinks the visual viewport by its scale but not the layout the HUD root is sized to: the
  // lanes keep their geometry and nothing is rewritten
  const beforePinch=writes;
  Object.assign(viewport,{scale:2,width:683,height:384});listeners.get('cot:layoutchange')();flush();
  assert.equal(writes,beforePinch,'a 2x pinch leaves every HUD lane where it was');
  // iOS page zoom rests at a scale above 1 with no pinch: the lanes use the visible size as it is
  Object.assign(viewport,{scale:1.25,width:1366,height:768});listeners.get('cot:layoutchange')();flush();
  assert.equal(writes,beforePinch,'a resting page scale is not a pinch either');
  Object.assign(viewport,{scale:1,width:1366,height:768});
  assert.equal(listeners.has('viewport:resize'),false,'no direct visual viewport listener: cot:layoutchange carries real changes');
  const before=properties.get('--hud-right-height');
  viewport.height=420;listeners.get('cot:layoutchange')();flush();
  assert.notEqual(properties.get('--hud-right-height'),before,'virtual keyboard changes available space');
  const late=node({class:'cot-room-chat quiet'});visibleNodes.push(late);
  callbacks.mutation([{type:'childList',target:body}]);
  assert.equal(frames.size,1,'late-added chat/panels still trigger discovery');flush();
  assert.ok(watched.some(entry=>entry.target===late),'newly discovered controls are observed');
  transientClass(late,'cot-room-chat quiet','cot-room-chat');
  assert.equal(frames.size,0,'late-mounted controls also start with a seeded final-value baseline');
  late.attrs.hidden='';change(late,'hidden',null);
  assert.equal(frames.size,1,'real visibility changes on late controls still reflow');flush();
  listeners.get('cot:layoutchange')();assert.equal(frames.size,1);flush();
  listeners.get('transitionend')({target:node()});
  assert.equal(frames.size,0,'unrelated decorative transitions do not measure HUD');
  listeners.get('transitionend')({target:special});
  assert.equal(frames.size,1,'settled panel transforms update lane position');flush();
  listeners.get('transitioncancel')({target:special});assert.equal(frames.size,1);flush();
  // The multiplayer v2 network strip mounts outside the HUD root and asks for a relayout. It is bare text in the
  // top-right corner row (multiplayerStatus.ts: top 8px), above the enemies roster's own lane, so the roster stays
  // level with the allies roster; only the strip's open details reader reaches into that lane and pushes it down.
  const rect=(top,bottom,left,right)=>({top,bottom,left,right,width:right-left,height:bottom-top});
  const earRight=node({class:'cot-ear r'});earRight.getBoundingClientRect=()=>rect(52,120,1172,1366);
  const strip=node({class:'cot-mp-status battle'});strip.getBoundingClientRect=()=>rect(8,36,1210,1356);
  const stripButton=node({class:'cot-mp-strip good'});stripButton.getBoundingClientRect=()=>rect(8,36,1210,1356);
  const plate=node({class:'cot-net'});const score=node({class:'cot-top'});score.getBoundingClientRect=()=>rect(0,64,511,855);
  let stripMounted=true;let plateShown=false;
  const mounted={'.cot-ear.r':()=>earRight,'.cot-mp-status.battle':()=>stripMounted?strip:null,
    '.cot-mp-status.battle .cot-mp-strip':()=>stripMounted?stripButton:null,'.cot-net':()=>plateShown?plate:null,'.cot-top':()=>score};
  globalThis.document.querySelector=selector=>mounted[selector]?.()??null;
  assert.equal(properties.has('--hud-roster-top-right'),false,'no strip, no roster lane variable');
  listeners.get('cot-hud-relayout')();assert.equal(frames.size,1,'the strip\'s relayout request schedules one measurement');flush();
  assert.equal(properties.has('--hud-roster-top-right'),false,'the corner-row strip leaves the enemies roster on its own lane');
  assert.equal(properties.get('--hud-right-top'),'106px','the report budget keeps the default roster start');
  assert.equal(properties.get('--hud-network-corner-right'),'10px','without the fps/ping plate the strip takes the corner itself');
  plateShown=true;plate.getBoundingClientRect=()=>rect(8,36,1248,1356);
  callbacks.resize();flush();
  assert.equal(properties.get('--hud-network-corner-right'),'134px','the strip sits 16 px left of a shown fps/ping plate, in the same row');
  assert.equal(properties.has('--hud-roster-top-right'),false);
  assert.equal(strip.hasAttribute('data-compact'),false,'room for every cell between the score and the plate');
  score.getBoundingClientRect=()=>rect(0,64,300,1100);
  callbacks.resize();flush();
  assert.equal(strip.hasAttribute('data-compact'),true,'a row too narrow for every cell folds the strip to its ping');
  stripButton.getBoundingClientRect=()=>rect(8,36,1258,1313);
  callbacks.resize();flush();
  assert.equal(strip.hasAttribute('data-compact'),true,'the folded strip keeps its full width as the measure: no fold/unfold flicker');
  score.getBoundingClientRect=()=>rect(0,64,511,855);stripButton.getBoundingClientRect=()=>rect(8,36,1210,1356);
  callbacks.resize();flush();
  assert.equal(strip.hasAttribute('data-compact'),false,'a wide enough row unfolds it');
  strip.getBoundingClientRect=()=>rect(8,360,1066,1356);
  callbacks.resize();flush();
  assert.equal(properties.get('--hud-roster-top-right'),'366px','the open details reader pushes the roster 6 px below itself');
  plateShown=false;
  strip.getBoundingClientRect=()=>rect(140,168,20,180);
  listeners.get('cot-hud-relayout')();flush();
  assert.equal(properties.has('--hud-roster-top-right'),false,'a strip on the left lane (touch portrait) leaves the right roster alone');
  assert.equal(properties.get('--hud-right-top'),'106px','the report budget returns to the default roster start');
  // A phone-width mouse window has no roster: the folded strip takes the right lane under the objective, and the
  // right kill feed starts below it.
  body.dataset.cotWidth='phone';mounted['.cot-ear.r']=()=>null;
  viewport.width=390;globalThis.document.documentElement.clientWidth=390;
  strip.getBoundingClientRect=()=>rect(72,100,325,380);
  listeners.get('cot-hud-relayout')();flush();
  assert.equal(properties.get('--hud-kill-right-top'),'108px','the right feed clears the strip under the 64 px objective');
  assert.equal(properties.get('--hud-network-corner-right'),'10px','the phone lane is not the corner row');
  stripMounted=false;
  listeners.get('cot-hud-relayout')();flush();
  assert.equal(properties.get('--hud-kill-right-top'),'72px','without the strip the feed returns under the objective');
  delete body.dataset.cotWidth;mounted['.cot-ear.r']=()=>earRight;
  viewport.width=1366;globalThis.document.documentElement.clientWidth=1366;
  listeners.get('cot-hud-relayout')();flush();
  assert.equal(properties.has('--hud-roster-top-right'),false,'the strip\'s dispose removes the variable');
  assert.equal(properties.get('--hud-network-corner-right'),'10px','and returns the corner offset');
  const map=node({class:'cot-minimap'});
  globalThis.document.querySelector=selector=>selector==='.cot-minimap'?map:null;
  for(const size of [160,220,300]){
    map.getBoundingClientRect=()=>rect(viewport.height-size-16,viewport.height-16,viewport.width-size-16,viewport.width-16);
    callbacks.resize();flush();
    assert.equal(properties.get('--hud-flight-right-clearance'),`${size+28}px`,'aircraft rack reserves the actual resized minimap plus a gap');
  }
  map.getBoundingClientRect=()=>rect(8,100,8,100);callbacks.resize();flush();
  assert.equal(properties.get('--hud-flight-right-clearance'),'12px','a top-left mobile map releases the lower rack lane');
} finally {
  for(const [key,descriptor] of originals){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
}
// Touch portrait, solved end to end (critic r3: the source pins above let the wiring drift). The measured 390x844
// phone (tools/fixtures/battle-hud-layout.html in Chrome, layout-r3): the tray's collapsed slot at 468-520 parks the
// systems row at 416, across the sight centred at 422; the lower cluster (speedometer 594, left FIRE 628, stick 702)
// leaves no room under the scope readouts, so the row moves above the ring (314). The side kill lanes then end above
// the moved row. A taller portrait moves the row below the scope readouts, level with the tray and left of it, and the
// lanes keep the floor the row's natural place gave them: a moved row lends them nothing.
{
  const saved = new Map(['document','window','ResizeObserver','MutationObserver','requestAnimationFrame','getComputedStyle']
    .map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const box = (top,bottom,left,right) => ({top,bottom,left,right,width:right-left,height:bottom-top,x:left,y:top});
  function solvePortrait(width, height, rects, rowWidth) {
    const props = new Map(); let frame = null;
    const element = (rect, extra={}) => ({ getClientRects: () => [rect], getBoundingClientRect: () => rect, children: [],
      childElementCount: 0, dataset: {}, getAttribute: () => null, hasAttribute: () => false, toggleAttribute() {}, ...extra });
    const lane = (rect) => { const children = Array.from({length:8}, () => ({hidden:false}));
      return element(rect, {children, childElementCount: children.length}); };
    const nodes = Object.fromEntries(Object.entries(rects).map(([selector, rect]) => [selector, element(rect)]));
    nodes['.cot-vehicle-controls'] = element(rects['.cot-vehicle-controls'], {scrollWidth: rowWidth - 2});
    const kills = {'.cot-kill-lane.l': lane(box(0,84,0,171)), '.cot-kill-lane.r': lane(box(0,84,219,390))};
    const body = { dataset: {}, classList: { contains: (name) => name === 'cot-touch-layout' },
      style: { getPropertyValue: (key) => props.get(key) ?? '', setProperty: (key, value) => props.set(key, value),
        removeProperty: (key) => props.delete(key) },
      hasAttribute: () => true, toggleAttribute() {}, getAttribute: () => '' };
    globalThis.document = { body, documentElement: { clientWidth: width },
      querySelector: (selector) => nodes[selector] ?? kills[selector] ?? null, querySelectorAll: () => [] };
    globalThis.window = { innerWidth: width, innerHeight: height, visualViewport: { width, height }, document: globalThis.document,
      addEventListener() {} };
    globalThis.getComputedStyle = () => ({ visibility: 'visible' });
    globalThis.requestAnimationFrame = (fn) => { frame = fn; return 1; };
    globalThis.ResizeObserver = class { observe() {} };
    globalThis.MutationObserver = class { observe() {} };
    const root = { getClientRects: () => [{}], dataset: {}, classList: { contains: () => false, toggle() {} },
      getAttribute: () => null, querySelector: (selector) => kills[selector] ?? null };
    installBattleHudLayout(root);
    frame();
    const px = (name) => parseFloat(props.get(`--hud-${name}`));
    return { px, kills };
  }
  try {
    // 390x844, the measured phone
    const phone = solvePortrait(390, 844, {
      '.cot-top': box(0,62,23,367), '.cot-mode-status.show': box(62,103,56,334), '.cot-minimap': box(111,203,8,100),
      '.cot-touch.on .mobile-chrome': box(111,155,240,380), '.cot-shells': box(468,520,332,380),
      '.cot-vehicle-controls': box(416,460,12,378), '.cot-drive': box(593.76,678,14,98.24),
      '.cot-touch.on .fire.alt': box(628,684,137,193), '.cot-touch.on .joy': box(702,820,14,132),
      '.cot-dp': box(797,836,136.5,253.5), '.cot-net': box(822,842,14,102),
    }, 366);
    const centre = 844 / 2;
    assert.equal(phone.px('systems-top'), centre - SIGHT_BAND_ABOVE - 44, '390x844: the row moves above the ring (314)');
    assert.deepEqual([phone.px('systems-left'), phone.px('systems-width')], [12, 366], '390x844: whole, where it was across');
    // the kill lanes end 8 px above the moved row (306): three rows a side under the map and the touch chrome
    assert.equal(phone.px('kill-left-top'), 211, 'the left lane starts under the map');
    assert.equal(phone.px('kill-left-height'), 3 * 29 - 3, '390x844: the left kill lane stops above the moved row');
    assert.equal(phone.px('kill-right-top'), 163, 'the right lane starts under the touch chrome');
    assert.equal(phone.px('kill-right-height'), 5 * 29 - 3, '390x844: the right kill lane stops above the moved row');
    assert.deepEqual(phone.kills['.cot-kill-lane.l'].children.map((row) => row.hidden).filter((hidden) => !hidden).length, 3,
      'the left lane shows only the rows that fit');
    // a taller portrait: room under the scope readouts above the cluster, level with the tray (the map and the touch
    // chrome expanded, so the lanes hold fewer than their eight rows and their floor shows)
    const tall = solvePortrait(430, 1000, {
      '.cot-top': box(0,62,43,387), '.cot-minimap': box(111,403,8,300), '.cot-touch.on .mobile-chrome': box(111,400,280,420),
      '.cot-shells': box(620,672,374,422), '.cot-vehicle-controls': box(568,612,52,418), '.cot-drive': box(820,904,14,98),
      '.cot-touch.on .fire.alt': box(850,906,137,193), '.cot-touch.on .joy': box(860,978,14,132), '.cot-dp': box(952,991,156,274),
    }, 366);
    assert.equal(tall.px('systems-top'), 500 + SCOPE_BAND_BELOW, 'tall: the row moves below the scope readouts (640)');
    assert.deepEqual([tall.px('systems-left'), tall.px('systems-width')], [12, 374 - 12 - 8],
      'tall: level with the tray, the row sits left of it, whole within the space');
    // the lanes keep the row's natural floor (568 - 8 = 560), not the moved row's (632): five rows from 411 and 408
    assert.deepEqual([tall.px('kill-left-top'), tall.px('kill-right-top')], [411, 408], 'tall: under the map and the chrome');
    assert.equal(tall.px('kill-left-height'), 5 * 29 - 3, 'tall: the left kill lane keeps the natural floor');
    assert.equal(tall.px('kill-right-height'), 5 * 29 - 3, 'tall: the right kill lane keeps the natural floor');
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
// r10 (critic r9; owner 2026-10-17, out of ammo): every pass measures the furniture the reticle keeps clear of
// (sightFurniture.ts), so the scope readouts follow the stylesheet; and it seats the scope's vision switch. A mouse
// layout keeps the switch right of the sight; a shot report's host (it takes the pointer over its whole box while it
// holds a card) or the open combat log over that seat sends it to the mirror seat left of the sight when nothing there
// comes within 3 px (900x700, measured: the card at 584-884 x 196-452, the switch 166x48 at 563-729 x 326-374); where
// the left lane's speedometer sits level with the marker (800x400: 184-292 x 164-272) it waits hidden. Touch never moves
// it, and the touch chip the reticle seats under the sight (data-seat) is the reticle's own mark, never furniture.
{
  const saved = new Map(['document','window','ResizeObserver','MutationObserver','requestAnimationFrame','getComputedStyle',
    'DOMMatrixReadOnly'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const box = (left,top,right,bottom) => ({top,bottom,left,right,width:right-left,height:bottom-top,x:left,y:top});
  // (`styles`: a selector's computed style (or one a node), where it differs from shown, opaque and unmoved; the solver's window keeps its
  // listeners, and `dispatch` sends one an event on the selector's node and runs the relayout it asks for, if any)
  function solve(width, height, rects, { touch = false, hidden = false, styles = {} } = {}) {
    const nodes = new Map();
    for (const [selector, list] of Object.entries(rects)) nodes.set(selector, list.map((rect, i) => ({ rect, hidden: false,
      offsetWidth: rect.width, offsetHeight: rect.height, getClientRects: () => [rect], getBoundingClientRect: () => rect,
      contains(other) { return other === this; }, children: [], childElementCount: 0, dataset: {}, getAttribute: () => null,
      hasAttribute: () => false, toggleAttribute() {},
      computed: (Array.isArray(styles[selector]) ? styles[selector][i] : styles[selector]) ?? null,
      matches: (list) => list.split(',').some((part) => part.trim() === selector) })));
    const listeners = new Map();
    const vision = nodes.get('.cot-scope-vision')?.[0];
    if (vision) vision.hidden = hidden;
    const all = (selector) => [...new Set(selector.split(',').flatMap((part) => nodes.get(part.trim()) ?? []))];
    const body = { dataset: {}, classList: { contains: (name) => touch && name === 'cot-touch-layout' },
      style: { getPropertyValue: () => '', setProperty() {}, removeProperty() {} },
      hasAttribute: () => true, toggleAttribute() {}, getAttribute: () => '' };
    let frame = null;
    globalThis.document = { body, documentElement: { clientWidth: width },
      querySelector: (selector) => all(selector)[0] ?? null, querySelectorAll: all };
    globalThis.window = { innerWidth: width, innerHeight: height, visualViewport: { width, height }, document: globalThis.document,
      addEventListener(type, listener) { listeners.set(type, listener); } };
    globalThis.getComputedStyle = (node) => node?.computed ?? { visibility: 'visible', opacity: '1', transform: 'none' };
    globalThis.DOMMatrixReadOnly = class { constructor(text) { this.m42 = Number(/matrix\((.*)\)/.exec(text)[1].split(',')[5]); } };
    globalThis.requestAnimationFrame = (fn) => { frame = fn; return 1; };
    globalThis.ResizeObserver = class { observe() {} };
    globalThis.MutationObserver = class { observe() {} };
    const root = { getClientRects: () => [{}], dataset: {}, classList: { contains: () => false, toggle() {} },
      getAttribute: () => null, querySelector: () => null };
    installBattleHudLayout(root);
    frame();
    const read = () => ({ seat: body.dataset.scopeVision ?? '', boxes: sightFurniture.boxes.slice(0, sightFurniture.count)
      .map((b) => [b.x0, b.y0, b.x1, b.y1]), notice: sightNotice.on ? [sightNotice.x0, sightNotice.y0, sightNotice.x1, sightNotice.y1] : null,
      version: sightFurniture.version });
    return { ...read(), nodes, dispatch(type, selector, index = 0, propertyName = 'opacity') {
      frame = null;
      listeners.get(type)?.({ target: nodes.get(selector)[index], propertyName });
      if (!frame) return null;
      frame();
      return read();
    } };
  }
  try {
    const right = (width, height) => { const left = Math.min(width / 2 + Math.max(Math.min(width, height) * 0.15 + 8, 80), width - 180);
      return box(left, height / 2 - 24, left + 166, height / 2 + 24); };
    const base = { '.cot-shell': [box(12, 636, 76, 688)], '.cot-top': [box(287, 0, 613, 62)], '.cot-dp': [box(12, 389, 172, 572)],
      '.cot-drive': [box(184, 464, 292, 572)], '.cot-aim-warning:not([hidden]):not([data-seat])': [box(8, 118, 114, 142)] };
    // every kind of furniture the reticle keeps clear of is published (r10 critic: dropping .cot-con, the 667x375 defect,
    // went unnoticed): one box a selector, nowhere near the seats
    const kinds = ['.cot-vehicle-controls>button', '.cot-con', '.cot-touch.on .round', '.cot-touch.on .joy', '.cot-touch.on .quick',
      '.cot-touch-aim.on .aimhint', '.cot-minimap', '.cot-mode-status.show', '.flight-identity', '.cot-ear'];
    const every = Object.fromEntries(kinds.map((selector, i) => [selector, [box(300 + i * 30, 600, 320 + i * 30, 620)]]));
    const published = solve(900, 700, { ...every, '.cot-scope-vision': [right(900, 700)] }).boxes;
    for (const [i, selector] of kinds.entries()) {
      assert.ok(published.some((got) => got[0] === 300 + i * 30 && got[1] === 600), `${selector} is furniture`);
    }
    let solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)] });
    assert.equal(solved.seat, '', '900x700: nothing over the seat right of the sight, the switch stays');
    for (const b of [[12, 636, 76, 688], [287, 0, 613, 62], [12, 389, 172, 572], [184, 464, 292, 572], [8, 118, 114, 142],
      [right(900, 700).left, 326, right(900, 700).right, 374]]) {
      assert.ok(solved.boxes.some((got) => got.every((v, i) => Math.abs(v - b[i]) < 1e-9)), `the furniture holds ${b}`);
    }
    assert.equal(solved.boxes.length, 6, 'one box a shown panel');
    solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)], '.cot-si-cardhost:not(:empty)': [box(584, 196, 884, 452)] });
    assert.equal(solved.seat, 'left', '900x700: a shot report over the seat sends the switch left of the sight');
    solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)], '.cot-si-log.open': [box(584, 74, 884, 452)] });
    assert.equal(solved.seat, 'left', '900x700: so does the open combat log');
    solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)], '.cot-si-cardhost:not(:empty)': [box(584, 196, 884, 452)],
      '.cot-kill-lane.l .cot-kf:not([hidden])': [box(0, 330, 240, 356)] });
    assert.equal(solved.seat, 'none', '900x700: a kill notice level with the marker leaves no mirror seat: hidden');
    solved = solve(800, 400, { '.cot-drive': [box(184, 164, 292, 272)], '.cot-scope-vision': [right(800, 400)],
      '.cot-si-cardhost:not(:empty)': [box(484, 74, 784, 244)] });
    assert.equal(solved.seat, 'none', '800x400: the speedometer beside the marker on the left: hidden while the report is up');
    solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)], '.cot-si-cardhost:not(:empty)': [box(584, 196, 884, 452)] },
      { hidden: true });
    assert.equal(solved.seat, '', 'no scope (the switch hidden): no seat');
    solved = solve(390, 844, { '.cot-scope-vision': [box(25, 399, 129, 445)], '.cot-si-cardhost:not(:empty)': [box(12, 380, 378, 520)] },
      { touch: true });
    assert.equal(solved.seat, '', 'touch keeps its own seat left of the sight');
    assert.ok(!layoutSourceR10.includes("'.cot-aim-warning:not([hidden])',") && layoutSourceR10.includes(".cot-aim-warning:not([hidden]):not([data-seat])"),
      'the seated touch chip is the reticle\'s mark, not furniture');
    // r10e: the sixth-sense notice is published for the touch chip to yield to (320x568, measured: the DETECTED notice at
    // 70-250 x 215-262.9, the chip seated over the sight at 82-238 x 233-257 under it), at its settled place whatever frame
    // of its 6 px slide the pass lands on; never on a mouse layout, whose canvas marks never dodge a notice
    const detected = { '.cot-sixth.on': [box(70, 211, 250, 258.875)] };
    const sliding = { '.cot-sixth.on': { visibility: 'visible', opacity: '0', transform: 'matrix(1, 0, 0, 1, -90, -4)' } };
    const before = solve(320, 568, base, { touch: true });
    assert.equal(before.notice, null, '320x568 touch: no notice, none published');
    solved = solve(320, 568, { ...base, ...detected }, { touch: true, styles: sliding });
    assert.deepEqual(solved.notice, [70, 215, 250, 262.875], '320x568 touch: the notice published where it settles');
    assert.ok(solved.version > before.version, 'the notice repaints the reticle');
    assert.equal(solved.boxes.length, before.boxes.length, 'the notice is no furniture: the canvas marks never dodge it');
    assert.equal(solve(900, 700, { ...base, ...detected }, { styles: sliding }).notice, null, 'a mouse layout never publishes it');
    // r10e: a pass that lands while the touch tray's collapsed shell slots fade out (opacity on its way to 0, scale .94)
    // measures them; the end of their fade measures again, and they are gone (two "panel" boxes the furniture recorder
    // caught at 8 touch sizes on integ ce8b634668, at 390x844: 334.57-380 x 469.39-518.61)
    const fading = { visibility: 'visible', opacity: '0.4', transform: 'matrix(0.94, 0, 0, 0.94, 0, 0)' };
    const slots = [box(332, 468, 380, 520), box(334.57, 469.39, 380, 518.61), box(334.57, 469.39, 380, 518.61)];
    const tray = solve(390, 844, { ...base, '.cot-shell': slots }, { touch: true, styles: { '.cot-shell': [null, fading, fading] } });
    assert.equal(tray.boxes.filter((b) => b[0] > 330).length, 3, 'mid-fade, the pass measures the selected slot and the fading two');
    fading.opacity = '0';
    assert.equal(tray.dispatch('transitionend', '.cot-shell', 1, 'background-color'), null, 'another property\'s end asks for nothing');
    const settled = tray.dispatch('transitionend', '.cot-shell', 1);
    assert.ok(settled, 'the end of a furniture\'s fade asks for a relayout');
    assert.deepEqual(settled.boxes.filter((b) => b[0] > 330), [[332, 468, 380, 520]], 'and only the selected slot is furniture');
    // the sheets seat what the solver measures: the touch chip under the sight is the canvas chip's ink box, 24 px tall,
    // placed by its custom properties; the vision switch's mirror seat mirrors the mouse seat (its 180 px edge, 112 px
    // for the compact plate), and waits hidden (r10 critic: no receipt read either rule)
    const layoutCss = readFileSync(new URL('./battleHudLayout.css', import.meta.url), 'utf8');
    const aerialCss = readFileSync(new URL('./aerialHud.css', import.meta.url), 'utf8');
    assert.ok(layoutCss.includes(".cot-aim-warning[data-seat='sight']:not([hidden]){left:var(--hud-aim-warning-x);top:var(--hud-aim-warning-y);"
      + 'width:var(--hud-aim-warning-w);height:24px;min-height:0;padding-block:0;transform:none;'), 'the seated chip\'s rule');
    assert.ok(aerialCss.includes("body[data-scope-vision='left'] .cot-hud .cot-scope-vision{left:auto;right:min(calc(50% + max(15vmin + 8px,80px)),calc(100% - 180px))}")
      && aerialCss.includes("@media(max-width:539px){body[data-scope-vision='left'] .cot-hud .cot-scope-vision{right:min(calc(50% + max(15vmin + 8px,80px)),calc(100% - 112px))}}")
      && aerialCss.includes("body[data-scope-vision='none'] .cot-hud .cot-scope-vision{visibility:hidden}")
      && aerialCss.includes('left:min(calc(50% + max(15vmin + 8px,80px)),calc(100% - 180px))'), 'the switch\'s seats mirror each other');
    assert.ok(layoutSourceR10.includes('const edge = width < 540 ? 112 : 180;') && layoutSourceR10.includes('const reach = Math.max(Math.min(width, height) * 0.15 + 8, 80);'),
      'the solver models those seats');
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
const layout=readFileSync(new URL('./battleHudLayout.ts',import.meta.url),'utf8');
const hud=readFileSync(new URL('./hud.ts',import.meta.url),'utf8');
assert.match(layout,/new ResizeObserver\(schedule\)/,'map zoom and roster size changes relayout the lanes');
assert.match(layout,/window\.addEventListener\('cot:layoutchange', schedule\)/,'virtual keyboard/visual viewport changes reflow through the shared layout event');
assert.match(layout,/layoutViewportSize\(window\)/,'lanes measure the shared pinch-independent viewport');
assert.doesNotMatch(layout,/visualViewport\?\.(width|height)/,'no raw visual viewport size (a pinch shrinks it)');
assert.match(layout,/window\.addEventListener\('cot-hud-relayout', schedule\)/,'the network strip can request a relayout from outside the root');
assert.match(hud,/\.cot-ear\.r\{right:0;top:var\(--hud-roster-top-right,52px\);\}/,'the right roster reads its lane from the layout, with its own lane as the fallback');
assert.match(hud,/installBattleHudLayout\(root\)/);
const shot=readFileSync(new URL('./shotInfo.ts',import.meta.url),'utf8');
assert.doesNotMatch(shot,/t\('shotInfo\.(yourShots|yourShotsLast|damageReceived)'/,'log headings use existing GT catalog entries');

// Execute the maintained browser probe's standalone measurement callback
// without launching its CLI/browser. Its nested helper must survive page
// serialization and preserve thresholds, order and failure-only evidence.
const browserProbe=readFileSync(new URL('../../tools/battle-hud-layout.browser.mjs',import.meta.url),'utf8');
const measureStart=browserProbe.indexOf('function measure(state){');
const measureEnd=browserProbe.indexOf('\ntry {',measureStart);
assert.ok(measureStart>=0&&measureEnd>measureStart);
function measurementFixture(nodes){
  const queries=[];let styleReads=0;
  const dataset={mode:'battle'};
  const document={body:{dataset},querySelectorAll(selector){queries.push(selector);return nodes[selector]||[];}};
  const measure=runInNewContext(`${browserProbe.slice(measureStart,measureEnd)}\nmeasure`,{
    document,innerWidth:100,innerHeight:80,
    getComputedStyle(){styleReads++;return {opacity:'0.5',transform:'matrix(1,0,0,1,2,3)'};},
  });
  return {measure,queries,dataset,get styleReads(){return styleReads;}};
}
function measurementNode(name,x,y,width,height,visible=true){
  return {className:name,
    checkVisibility(options){assert.deepEqual(Object.keys(options),['checkOpacity','checkVisibilityCSS']);return visible;},
    getBoundingClientRect(){return {x,y,width,height,right:x+width,bottom:y+height};},
  };
}
{
  const f=measurementFixture({'.cot-ear.l':[
    measurementNode('left',0,0,20,20),measurementNode('hidden',0,0,90,90,false),
    measurementNode('zero',0,0,0,20)],'.cot-ear.r':[measurementNode('right',30,0,20,20)]});
  const result=f.measure('idle');
  assert.deepEqual(Array.from(result.rects,rect=>rect.name),['left','right']);
  assert.equal(result.failures.length,0);assert.equal(result.ammoTransitions,undefined);
  assert.equal(result.body,f.dataset);assert.equal(f.styleReads,0,'success avoids failure-only animation/style reads');
}
for(const [state,selector] of [['settings','.cot-set-hdr'],['ended','.es-hero']]){
  const f=measurementFixture({[selector]:[measurementNode(state,0,0,20,20)]});
  assert.equal(f.measure(state).rects[0].name,state);
  assert.equal(f.queries.includes('.cot-ear.l'),false,'alternate surfaces retain their own selectors');
}
{
  const shell={className:'cot-shell sel',getAttribute:()=>'false',parentElement:{classList:{contains:()=>true}},
    getAnimations:()=>[{playState:'running',currentTime:25,effect:{getComputedTiming:()=>({duration:180})}}]};
  const f=measurementFixture({'.cot-ear.l':[measurementNode('left',-1,0,20,20)],'.cot-shell':[shell]});
  shell.checkVisibility=()=>false;
  const result=f.measure('idle');
  assert.equal(result.failures[0],'offscreen: left');assert.equal(result.ammoTransitions.length,1);
  assert.equal(result.ammoTransitions[0].drawerOpen,true);assert.equal(result.ammoTransitions[0].opacity,'0.5');
  assert.equal(result.ammoTransitions[0].animations[0].timing.duration,180);
}
for(const [x,expected] of [[19,0],[18.9,1]]){
  const f=measurementFixture({'.cot-ear.l':[measurementNode('a',0,0,20,20)],
    '.cot-ear.r':[measurementNode('b',x,0,20,20)]});
  const result=f.measure('idle');
  assert.equal(result.failures.length,expected,'overlap must exceed one pixel on both axes');
  if(expected)assert.equal(result.failures[0],'a overlaps b');
}
assert.equal(measurementFixture({}).measure('idle').failures[0],'no visible UI checked');
console.log('battleHudLayout.selftest: bounded lanes, responsive ownership and localized headers passed');
