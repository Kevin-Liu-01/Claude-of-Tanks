import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [garage, touch, battleLoad] = await Promise.all([
  readFile(new URL('./garage.js', import.meta.url), 'utf8'),
  readFile(new URL('./touchControls.js', import.meta.url), 'utf8'),
  readFile(new URL('./battleLoad.js', import.meta.url), 'utf8'),
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

console.log('mobile responsive layout contracts: PASS');
