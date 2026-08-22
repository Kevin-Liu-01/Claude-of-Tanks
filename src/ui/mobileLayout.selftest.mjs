import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [garage, touch, battleLoad, hud, shotInfo, publicNav] = await Promise.all([
  readFile(new URL('./garage.js', import.meta.url), 'utf8'),
  readFile(new URL('./touchControls.js', import.meta.url), 'utf8'),
  readFile(new URL('./battleLoad.js', import.meta.url), 'utf8'),
  readFile(new URL('./hud.js', import.meta.url), 'utf8'),
  readFile(new URL('./shotInfo.js', import.meta.url), 'utf8'),
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
  'world tank labels must reserve fixed geometry to avoid per-frame layout shifts');
assert.match(hud, /targetX = Math\.max\(92, Math\.min\(w - 92, _sx\)\)/,
  'target labels must remain clamped within the viewport while tracking a tank');
assert.doesNotMatch(hud, /tgtEl\.offsetHeight/,
  'target tracking must not force a layout read in the render loop');
assert.match(hud, /layout\.sort\(\(a, b\) => b\.layoutY - a\.layoutY[\s\S]*placed\.layoutY - 36/,
  'clustered world labels must resolve into stable lanes instead of overlapping');

assert.match(shotInfo,
  /@media \(max-width:700px\), \(pointer:coarse\)[\s\S]*\.cot-si-diag\{grid-template-columns:84px 116px/,
  'mobile combat cards must reflow and retain both penetration diagram views');
assert.match(shotInfo,
  /body\.cot-touch-layout \.cot-si-cardhost[\s\S]*body\.cot-touch-layout \.cot-si-diag\{grid-template-columns:84px 116px/,
  'the game touch-layout state must drive mobile shot-card composition independently of pointer heuristics');
assert.doesNotMatch(shotInfo, /\.cot-si-diag\{display:none/,
  'penetration diagrams must not disappear on touch or narrow layouts');
assert.match(shotInfo, /cot-si-toasthost[^}]*min-height:164px/,
  'the canonical incoming feed must reserve stable space for battle readings');
assert.match(publicNav, /\.public-nav__links \.public-nav__github\{gap:9px;padding-inline:15px\}/,
  'the desktop GitHub star control needs comfortable internal spacing');

console.log('mobile responsive layout contracts: PASS');
