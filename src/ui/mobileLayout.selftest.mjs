import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [garage, touch, battleLoad, hud, shotInfo, playMenu, publicNav] = await Promise.all([
  readFile(new URL('./garage.js', import.meta.url), 'utf8'),
  readFile(new URL('./touchControls.js', import.meta.url), 'utf8'),
  readFile(new URL('./battleLoad.js', import.meta.url), 'utf8'),
  readFile(new URL('./hud.js', import.meta.url), 'utf8'),
  readFile(new URL('./shotInfo.js', import.meta.url), 'utf8'),
  readFile(new URL('./playMenu.js', import.meta.url), 'utf8'),
  readFile(new URL('../presentation/publicNav.css', import.meta.url), 'utf8'),
]);

assert.match(garage,
  /@media \(min-width:901px\) and \(orientation:landscape\)[\s\S]*body\.cot-touch-layout \.cot-country-rail/,
  'coarse-pointer tablets need a compact Garage rail layout above the phone width breakpoint');
assert.match(garage, /@media \(max-width:1480px\)[\s\S]*\.cot-nav \.nv \.nav-label\{display:none/,
  'mid-size desktop navigation must collapse before it intersects the centered Battle control');
assert.match(garage,
  /@media \(max-width:900px\) and \(orientation:landscape\) and \(max-height:560px\)[\s\S]*\.cot-camos\{height:100%;overflow-y:auto/,
  'short landscape phones must contain camouflage within its own scroll lane');

assert.match(touch,
  /@media \(orientation:landscape\) and \(max-height:560px\)/,
  'battle controls need a height-aware landscape tier');
assert.match(touch,
  /body\.cot-touch-layout \.cot-shells[\s\S]*bottom:calc\(max\(28px,[^;]+\) \+ 274px\)[\s\S]*body\.cot-touch-layout \.cot-cons[\s\S]*\+ 112px/,
  'ammo and consumables must occupy separate vertical lanes');
assert.match(touch,
  /@media \(orientation:landscape\) and \(max-height:430px\)[\s\S]*\.cot-dp\{display:none/,
  'very short phones must shed the secondary damage panel before it overlaps driving controls');

assert.match(battleLoad,
  /@media \(orientation:landscape\) and \(max-height:560px\)[\s\S]*\.cot-bl \.team\{justify-content:center/,
  'short battle rosters need a height-aware vertical composition');
assert.match(battleLoad, /\.cot-bl \.count:empty\{display:none/,
  'an empty countdown must not reserve footer height over the final roster row');

assert.doesNotMatch(hud, /cot-dlog|pushDamageLog/,
  'incoming hits must have one canonical combat-intelligence feed, not a duplicate HUD log');
assert.match(hud, /\.cot-hpb\{[^}]*width:128px;height:31px[^}]*contain:layout paint style/,
  'world tank labels must start from stable geometry before one-time name measurement');
assert.match(hud, /bar\.layoutW = Math\.max\(128, Math\.min\(280, measured\)\)/,
  'ambient labels must expand once to preserve complete vehicle names');
assert.match(hud, /targetX = Math\.max\(plateHalf \+ 4, Math\.min\(w - plateHalf - 4, _sx\)\)/,
  'variable-width target labels must remain clamped within the viewport while tracking a tank');
assert.doesNotMatch(hud, /tgtEl\.offsetHeight/,
  'target tracking must not force a layout read in the render loop');
assert.match(hud, /\.cot-hpb \.nm\{[\s\S]*?background:none;\}/,
  'ambient labels must use glyph shadows rather than full-width dark panels');
assert.match(hud, /\.cot-tgt \.bk\{[^}]*background:none/,
  'aimed-at labels must not paint a broad dark rectangle over the battlefield');
assert.doesNotMatch(hud, /\.cot-(?:hpb \.nm span|tgt \.nick|tgt \.veh)\{[^}]*text-overflow:ellipsis/,
  'world-space player and vehicle labels must never replace names with ellipses');
assert.match(hud, /layout\.sort\(\(a, b\) => b\.layoutY - a\.layoutY[\s\S]*placed\.layoutY - 36/,
  'clustered world labels must resolve into stable lanes instead of overlapping');

assert.match(shotInfo,
  /\.cot-si-cardhost\{position:absolute;right:16px;top:var\(--cot-si-roster-bottom,272px\);width:340px[\s\S]*\.cot-si-body\{display:flex;flex-direction:column/,
  'desktop ballistic reports must stack vertically below the enemy roster');
assert.match(shotInfo,
  /\.cot-si-diag\{display:grid;grid-template-columns:96px 184px[\s\S]*\.cot-si-diag \.box:first-child\{width:96px!important;height:96px!important;\}[\s\S]*\.cot-si-diag \.box:nth-child\(2\)\{width:184px!important;height:92px!important;\}/,
  'desktop penetration schematics must fill the available report frame');
assert.match(shotInfo,
  /@media \(max-width:700px\), \(pointer:coarse\) and \(max-width:760px\)[\s\S]*\.cot-si-body\{display:block[\s\S]*\.cot-si-diag\{grid-template-columns:82px 164px/,
  'mobile combat cards must reflow and retain both penetration diagram views');
assert.match(shotInfo,
  /@media \(max-width:520px\)[\s\S]*\.cot-si-diag\{grid-template-columns:76px 150px[\s\S]*\.box:nth-child\(2\)\{width:150px!important;height:75px!important;\}/,
  'narrow phones must retain large two-view schematics without overflowing the report');
assert.match(shotInfo,
  /top:max\(var\(--cot-si-roster-bottom,252px\)[\s\S]*document\.querySelector\('\.cot-ear\.r'\)[\s\S]*rosterBottom \+ 8/,
  'ballistic reports must reserve the live enemy-roster footprint before placement');
assert.match(shotInfo,
  /body\.cot-touch-layout \.cot-si-card\{min-height:0;\}[\s\S]*body\.cot-touch-layout \.cot-si-diag\{justify-content:center/,
  'the game touch-layout state must keep the compact shot-card composition independently of pointer heuristics');
assert.match(shotInfo,
  /kv\('Angle',[^\n]*'w'\);[\s\S]*kv\('Armor',[\s\S]*kv\('Damage',[^\n]*'w'\);[\s\S]*const r = kv\('Pen'/,
  'the report must keep only angle, armor, damage, and penetration analysis rows');
assert.doesNotMatch(shotInfo, /kv\('(?:Distance|Result)'/,
  'the compact report must not render distance or result rows');
assert.doesNotMatch(shotInfo, /modChips\(ev, card\)|el\('div', 'cot-si-zone', diag\)|el\('div', 'cot-si-pencap', rows\)/,
  'the compact report must not append module chips, zone copy, or a penetration caption');
assert.match(shotInfo,
  /@media \(orientation:landscape\) and \(max-height:430px\)[\s\S]*width:276px[\s\S]*\.cot-si-body\{display:flex[\s\S]*\.cot-si-diag\{grid-template-columns:72px 152px/,
  'short landscape touch screens must retain the vertical report composition');
assert.doesNotMatch(shotInfo, /\.cot-si-diag\{display:none/,
  'penetration diagrams must not disappear on touch or narrow layouts');
assert.match(shotInfo, /cot-si-toasthost[^}]*min-height:164px/,
  'the canonical incoming feed must reserve stable space for battle readings');

assert.doesNotMatch(playMenu, /<select data-control="(?:map|team|size)"/,
  'live room controls must use the game listbox component instead of browser-native selects');
assert.match(playMenu, /menu-select menu-select--map[^>]*data-control="map"[\s\S]*cot-room-map-list[^>]*role="listbox"/,
  'the battlefield picker must expose the complete map roster through an accessible styled listbox');
assert.match(playMenu, /menu-select--map \.menu-select-list\{grid-template-columns:repeat\(2,/,
  'the battlefield list must present preview tiles in a compact desktop grid');
assert.match(playMenu, /menu-select-list\{position:fixed;[^}]*overflow:auto;overscroll-behavior:contain/,
  'custom room lists must stay inside a viewport-aware scroll lane');
assert.match(playMenu, /@media\(max-width:780px\)[\s\S]*menu-select--map \.menu-select-list\{grid-template-columns:1fr/,
  'the battlefield picker must collapse to one column on phones');
assert.match(playMenu, /Object\.defineProperty\(control, 'disabled',[\s\S]*trigger\.disabled = disabled/,
  'custom room listboxes must preserve native disabled semantics for guests and ready states');
assert.match(publicNav, /\.public-nav__links \.public-nav__github\{gap:9px;padding-inline:15px\}/,
  'the desktop GitHub star control needs comfortable internal spacing');

console.log('mobile responsive layout contracts: PASS');
