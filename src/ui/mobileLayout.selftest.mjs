import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('./responsiveLayout.selftest.mjs');

const [garage, touch, battleLoad, hud, shotInfo, playMenu, publicNav, responsiveSurfaces, input] = await Promise.all([
  readFile(new URL('./garage.js', import.meta.url), 'utf8'),
  readFile(new URL('./touchControls.js', import.meta.url), 'utf8'),
  readFile(new URL('./battleLoad.js', import.meta.url), 'utf8'),
  readFile(new URL('./hud.js', import.meta.url), 'utf8'),
  readFile(new URL('./shotInfo.js', import.meta.url), 'utf8'),
  readFile(new URL('./playMenu.js', import.meta.url), 'utf8'),
  readFile(new URL('../presentation/publicNav.css', import.meta.url), 'utf8'),
  readFile(new URL('./responsiveSurfaces.js', import.meta.url), 'utf8'),
  readFile(new URL('../game/input.js', import.meta.url), 'utf8'),
]);

assert.doesNotMatch(garage, /@media \((?:min|max)-width:\d+px\)/,
  'Garage composition must not retain independent device-width breakpoint logic');
assert.doesNotMatch(garage, /@media \([^)]*orientation:/,
  'Garage composition must consume semantic orientation attributes instead of media-query guesses');
assert.match(garage, /body\[data-cot-width='laptop'\] \.cot-header-nav \.nav-label\{display:none\}/,
  'laptop navigation must collapse through the shared width-band contract');
assert.match(garage,
  /data-garage-panel="maps"[\s\S]*data-garage-panel="appearance"[\s\S]*data-garage-panel="dossier"/,
  'overlay garages must expose explicit Battlefield, Appearance, and Dossier drawers');
assert.match(garage,
  /body\[data-cot-panels='overlay'\] \.cot-leftcol,[\s\S]*\.cot-garage \.stats\{display:none\}/,
  'tablet and phone side panels must stay out of the tank stage until requested');
assert.match(garage,
  /body\[data-cot-width-density='narrow'\] \.cot-battle-control\{top:max\(64px/,
  'narrow phones must place Battle below the brand and global controls instead of overlapping them');

assert.doesNotMatch(touch, /@media \([^)]*(?:width|height|orientation)/,
  'touch controls must consume the canonical semantic viewport contract');
assert.match(touch,
  /body\.cot-touch-layout \.cot-shells[\s\S]*bottom:calc\(max\(22px,[^;]+\) \+ 302px\)[\s\S]*body\.cot-touch-layout \.cot-cons[\s\S]*\+ 124px/,
  'ammo and consumables must occupy separate vertical lanes');
assert.match(responsiveSurfaces,
  /body\.cot-touch-layout\[data-cot-width='phone'\] \.cot-dp\{display:none\}/,
  'phone touch layouts must shed the secondary damage panel before it overlaps driving controls');
assert.match(responsiveSurfaces,
  /body\[data-cot-height-density='tight'\]\[data-cot-orientation='landscape'\] \.cot-touch \.joy/,
  'very short landscape controls must use the shared tight-height tier');
assert.match(responsiveSurfaces,
  /data-cot-width-density='narrow'\]\[data-cot-orientation='portrait'\] \.cot-touch \.autoaim\{right:152px\}[\s\S]*\.cot-special\{right:96px\}/,
  'ultra-narrow portrait controls must separate auto-aim from the joystick and special action');
assert.match(input,
  /document\.body\?\.dataset\?\.cotInput[\s\S]*responsiveInput === 'coarse'[\s\S]*responsiveInput === 'fine'/,
  'battle input must consume the canonical interaction-mode contract');
assert.doesNotMatch(input, /innerWidth\s*(?:<|<=|>|>=)/,
  'battle input must never infer touch controls from viewport width');

assert.doesNotMatch(battleLoad, /@media \([^)]*(?:width|height|orientation)/,
  'battle loading must not retain independent device breakpoint logic');
assert.match(responsiveSurfaces,
  /body\[data-cot-height='short'\] \.cot-bl \.team\{justify-content:center/,
  'short battle rosters need a height-aware vertical composition');
assert.match(responsiveSurfaces, /\.cot-bl \.count:empty\{display:none/,
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
  /\.cot-si-cardhost\{position:absolute;right:16px;top:var\(--cot-si-card-top,var\(--cot-si-roster-bottom,272px\)\);width:320px[\s\S]*\.cot-si-body\{display:flex;flex-direction:column/,
  'desktop ballistic reports must use the compact centered-lane composition');
assert.match(shotInfo,
  /\.cot-si-diag\{display:grid;grid-template-columns:90px 172px[\s\S]*\.cot-si-diag \.box:first-child\{width:90px!important;height:90px!important;\}[\s\S]*\.cot-si-diag \.box:nth-child\(2\)\{width:172px!important;height:86px!important;\}/,
  'desktop penetration schematics must fill the available report frame');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='compact'\] \.cot-si-diag\{[\s\S]*grid-template-columns:78px 154px/,
  'compact combat cards must preserve readable penetration diagrams');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] \.cot-si-diag\{display:none\}/,
  'phone combat cards must remove side diagrams to preserve the battlefield and controls');
assert.match(shotInfo,
  /top:var\(--cot-si-card-top,var\(--cot-si-roster-bottom,272px\)\)[\s\S]*document\.querySelector\('\.cot-ear\.r'\)[\s\S]*document\.querySelector\('\.cot-minimap'\)[\s\S]*centeredTop/,
  'ballistic reports must center in the live lane between the enemy roster and minimap');
assert.doesNotMatch(shotInfo, /\.cot-si-card::before/,
  'ballistic reports must not retain the orange top-edge accent');
assert.match(shotInfo,
  /ballistic: uiIconSVG\('scope', 10\)[\s\S]*shell: uiIconSVG\('shell', 10\)[\s\S]*armor: uiIconSVG\('shield', 10\)[\s\S]*damage: uiIconSVG\('damage', 10\)[\s\S]*pen: uiIconSVG\('penetration', 10\)/,
  'ballistic reports must use the shared vector icon language for their key readings');
assert.match(shotInfo,
  /\.cot-si-kv\.pen\{margin-top:2px;padding-top:3px;border-top:1px solid rgba\(146,164,180,\.24\);\}/,
  'penetration analysis must be separated visually from the damage row');
assert.match(shotInfo,
  /body\.cot-touch-layout \.cot-si-card\{min-height:0;\}[\s\S]*body\.cot-touch-layout \.cot-si-diag\{justify-content:center;/,
  'the game touch-layout state must keep the compact shot-card composition independently of pointer heuristics');
assert.match(shotInfo,
  /kv\('Angle',[^\n]*'w'\);[\s\S]*kv\('Armor',[\s\S]*kv\('Damage',[^\n]*'w'\);[\s\S]*const r = kv\('Pen'/,
  'the report must keep only angle, armor, damage, and penetration analysis rows');
assert.doesNotMatch(shotInfo, /kv\('(?:Distance|Result)'/,
  'the compact report must not render distance or result rows');
assert.doesNotMatch(shotInfo, /modChips\(ev, card\)|el\('div', 'cot-si-zone', diag\)|el\('div', 'cot-si-pencap', rows\)/,
  'the compact report must not append module chips, zone copy, or a penetration caption');
assert.match(responsiveSurfaces,
  /data-cot-height-density='tight'[\s\S]*\.cot-si-body\{display:flex[\s\S]*\.cot-si-diag\{grid-template-columns:66px 140px/,
  'short landscape touch screens must retain the vertical report composition');
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
assert.match(responsiveSurfaces, /data-cot-width='compact'[\s\S]*menu-select--map \.menu-select-list,[\s\S]*data-cot-width='phone'[\s\S]*grid-template-columns:1fr/,
  'the battlefield picker must collapse to one column on phones');
assert.match(playMenu, /Object\.defineProperty\(control, 'disabled',[\s\S]*trigger\.disabled = disabled/,
  'custom room listboxes must preserve native disabled semantics for guests and ready states');
assert.match(publicNav, /\.public-nav__links \.public-nav__github\{gap:9px;padding-inline:15px\}/,
  'the desktop GitHub star control needs comfortable internal spacing');

const semanticSurfaceFiles = [
  '../game/killcam.js',
  '../gallery/gallery.css',
  '../presentation/mediaArchive.css',
  '../presentation/publicNav.css',
  '../presentation/publicPages.js',
  '../docs/docs.css',
  '../docs/battleReels.js',
  '../../public/home.css',
  '../../index.html',
  './battleLoad.js',
  './contextInfo.js',
  './endScreen.js',
  './garage.js',
  './hud.js',
  './playMenu.js',
  './roomChat.js',
  './settings.js',
  './shotInfo.js',
  './studioPanel.js',
  './touchControls.js',
];
for (const relativePath of semanticSurfaceFiles) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.doesNotMatch(source,
    /@media[^\n]*(?:max-width|min-width|orientation|max-height|min-height)|matchMedia\([^\n]*(?:max-width|min-width|orientation|max-height|min-height)/,
    `${relativePath} must not reintroduce an independent device-layout breakpoint`);
}

console.log('mobile responsive layout contracts: PASS');
