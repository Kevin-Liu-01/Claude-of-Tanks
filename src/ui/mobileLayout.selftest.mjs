import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('./responsiveLayout.selftest.mjs');

const [
  garageSource, touch, battleLoad, hud, shotInfo, playMenu, settings, publicNav, responsiveSurfaces, input,
  networkStatus, transition, perfHud, deviceDiag, renderer, main, pointerLockFeedback, gallery, docs,
] = await Promise.all([
  readFile(new URL('./garage.js', import.meta.url), 'utf8'),
  readFile(new URL('./touchControls.js', import.meta.url), 'utf8'),
  readFile(new URL('./battleLoad.ts', import.meta.url), 'utf8'),
  readFile(new URL('./hud.js', import.meta.url), 'utf8'),
  readFile(new URL('./shotInfo.js', import.meta.url), 'utf8'),
  readFile(new URL('./playMenu.ts', import.meta.url), 'utf8'),
  readFile(new URL('./settings.js', import.meta.url), 'utf8'),
  readFile(new URL('../presentation/publicNav.css', import.meta.url), 'utf8'),
  readFile(new URL('./responsiveSurfaces.css', import.meta.url), 'utf8'),
  readFile(new URL('../game/input.ts', import.meta.url), 'utf8'),
  readFile(new URL('./networkStatus.ts', import.meta.url), 'utf8'),
  readFile(new URL('./transition.ts', import.meta.url), 'utf8'),
  readFile(new URL('./perfHud.ts', import.meta.url), 'utf8'),
  readFile(new URL('../engine/deviceDiag.ts', import.meta.url), 'utf8'),
  readFile(new URL('../engine/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../game/pointerLockFeedbackRuntime.ts', import.meta.url), 'utf8'),
  readFile(new URL('../gallery/gallery.css', import.meta.url), 'utf8'),
  readFile(new URL('../docs/docs.css', import.meta.url), 'utf8'),
]);
const garage = `${garageSource}\n${await readFile(new URL('./garage.css', import.meta.url), 'utf8')}`;

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
  /body\[data-cot-width='phone'\]\[data-cot-orientation='portrait'\] \.cot-battle-control\{[\s\S]*top:max\(64px/,
  'portrait phones must place Battle below the brand and global controls instead of overlapping them');

assert.doesNotMatch(touch, /@media \([^)]*(?:width|height|orientation)/,
  'touch controls must consume the canonical semantic viewport contract');
assert.match(touch,
  /\.cot-touch\{[^}]*z-index:60[\s\S]*\.cot-touch-aim\{[^}]*z-index:39[\s\S]*aimLayer\.className = 'cot-touch-aim'/,
  'visible touch controls must paint above the HUD while aim capture stays behind HUD actions');
assert.match(touch,
  /body\.cot-touch-layout \.cot-shells\{[^}]*width:48px;height:52px;display:block[\s\S]*\.cot-shells\.touch-open \.cot-shell[\s\S]*--touch-ammo-x/,
  'mobile ammunition must collapse to one trigger and expand sideways for selection');
assert.match(hud,
  /const s = el\('button', 'cot-con', conBox\)[\s\S]*bus\.emit\('ui:consumable'[\s\S]*addEventListener\('pointerdown'/,
  'touch consumables must use semantic buttons and act on the primary pointer edge');
assert.match(touch,
  /body\.cot-touch-layout \.cot-top\{top:0;[^}]*z-index:30/,
  'mobile scoreboard must attach to the viewport top and stay above world labels');
assert.match(touch,
  /body\.cot-touch-layout \.cot-net\{top:max\(8px[\s\S]*left:calc\(max\(8px[\s\S]*body\.cot-touch-layout \.cot-drive\{display:block!important/,
  'mobile must reuse the analog drive gauge and place FPS/ping beside the minimap');
assert.match(touch,
  /body\.cot-touch-layout\[data-cot-width='compact'\] \.cot-dp,[\s\S]*data-cot-width='phone'[\s\S]*display:block!important;left:50%!important;[\s\S]*width:clamp\(112px,38vw,184px\)/,
  'phone touch layouts must reuse the canonical damage panel as a bottom health instrument');
assert.match(touch,
  /data-cot-width='phone'\] \.cot-dp canvas,[\s\S]*data-cot-width='phone'\] \.cot-dp \.crew,[\s\S]*display:none!important/,
  'compact health must shed schematic detail instead of creating a duplicate mobile HP owner');
assert.match(responsiveSurfaces,
  /body\[data-cot-height-density='tight'\]\[data-cot-orientation='landscape'\] \.cot-touch \.joy/,
  'very short landscape controls must use the shared tight-height tier');
assert.match(responsiveSurfaces,
  /data-cot-width-density='narrow'\]\[data-cot-orientation='portrait'\] \.cot-touch \.autoaim\{right:152px\}[\s\S]*\.cot-special\{right:96px\}/,
  'ultra-narrow portrait controls must separate auto-aim from the joystick and special action');
assert.match(responsiveSurfaces,
  /data-cot-panels='overlay'\]\[data-cot-orientation='portrait'\] \.cot-sixth\{[\s\S]*\+ 200px\)/,
  'portrait detection must occupy a clear lane below the minimap and global controls');
assert.match(responsiveSurfaces,
  /data-cot-height='short'\]\[data-cot-orientation='landscape'\] \.cot-net\{[\s\S]*top:calc\(max\(8px[\s\S]*left:auto;right:max\(10px/,
  'short landscape FPS and ping must clear both the score plate and minimap');
assert.match(responsiveSurfaces,
  /data-cot-height='short'\]\[data-cot-orientation='landscape'\] \.cot-top\{[\s\S]*left:calc\(50% - 18px\);width:294px[\s\S]*grid-template-columns:minmax\(62px,1fr\) 72px/,
  'short landscape score plate must stay inside the lane between corner controls');
assert.match(responsiveSurfaces,
  /data-cot-height='short'\]\[data-cot-orientation='landscape'\] \.cot-alert\{[\s\S]*top:118px;bottom:auto/,
  'short landscape system alerts must not collide with muzzle warnings or bottom health');
assert.match(responsiveSurfaces,
  /data-cot-width='phone'\]\[data-cot-orientation='portrait'\] \.cot-touch \.scope\{[\s\S]*bottom:105px/,
  'portrait scope must share the auto-aim row instead of covering the health instrument');
assert.match(input,
  /document\.body\?\.dataset\?\.cotInput[\s\S]*responsiveInput === 'coarse'[\s\S]*responsiveInput === 'fine'/,
  'battle input must consume the canonical interaction-mode contract');
assert.doesNotMatch(input, /innerWidth\s*(?:<|<=|>|>=)/,
  'battle input must never infer touch controls from viewport width');

assert.doesNotMatch(battleLoad, /@media \([^)]*(?:width|height|orientation)/,
  'battle loading must not retain independent device breakpoint logic');
assert.match(battleLoad,
  /<main class="briefing">[\s\S]*role="progressbar"[\s\S]*aria-valuenow="0"/,
  'battle loading must use one bounded briefing surface with an accessible real progress meter');
assert.match(responsiveSurfaces,
  /data-cot-width='phone'\] \.cot-bl \.briefing\{[\s\S]*height:calc\(100dvh/,
  'phone loading briefings must consume safe dynamic viewport height instead of a fixed hero split');
assert.match(responsiveSurfaces,
  /body\[data-cot-height='short'\] \.cot-bl \.team\{justify-content:center/,
  'short battle rosters need a height-aware vertical composition');
assert.match(responsiveSurfaces, /\.cot-bl \.count:empty\{display:none/,
  'an empty countdown must not reserve footer height over the final roster row');

assert.doesNotMatch(hud, /cot-dlog|pushDamageLog/,
  'incoming hits must have one canonical combat-intelligence feed, not a duplicate HUD log');
assert.doesNotMatch(hud, /cot-bounce|showBounceMessage|BOUNCE_TEXT/,
  'ricochets must not create a second generic toast beside the hit marker and combat record');
assert.match(hud, /MUZZLE BLOCKED · \$\{Math\.round\(view\.blockedDistM\)\} M[\s\S]*GUN TRAVEL LIMIT/,
  'aim warnings must distinguish a physical bore obstruction from a gun travel limit');
assert.match(hud, /state\.visible = !!view\.blockedLabel/,
  'blocked-path copy must honor the stable dwell gate instead of flickering with every terrain graze');
assert.match(hud, /--hud-layer-world:6;--hud-layer-sight:8;--hud-layer-status:18;[\s\S]*--hud-layer-controls:24;--hud-layer-score:30/,
  'battle UI must declare one ordered layer contract with world indicators below fixed controls');
assert.match(hud, /Detected[\s\S]*Enemy has visual contact/,
  'sixth sense must present one explicit detection state with supporting copy');
assert.match(hud, /uiIconSVG\('lightbulb', 24\)/,
  'the detected state must use the shared lightbulb warning glyph');
assert.match(hud,
  /cot-net-unit fps[\s\S]*cot-net-unit ping[\s\S]*netLastPaintMs[\s\S]*now - netLastPaintMs < 250/,
  'player FPS and latency telemetry must use structured 4 Hz instruments instead of per-frame text churn');
assert.match(hud,
  /MAGAZINE RELOAD IN PROGRESS[\s\S]*MAGAZINE ALREADY FULL/,
  'magazine feedback must distinguish an active reload from a full magazine');
assert.doesNotMatch(hud, /FULL_OR_RELOADING/,
  'the HUD must not collapse distinct magazine reload denials into a generic state');
assert.match(input, /showDebugHud: false[\s\S]*storedSettings\.showDebugHud[\s\S]*key === 'showDebugHud'/,
  'debug HUD visibility must have one persisted input-setting owner');
assert.match(settings, /Debug telemetry dashboard \(top-right\)[\s\S]*ui:debugHud/,
  'Interface settings must expose the lazy debug dashboard');
assert.match(main, /bus\.on\('ui:debugHud'[\s\S]*perfHud\.setVisible[\s\S]*input\.setSetting\('showDebugHud'/,
  'settings and F8 must converge on the same diagnostics visibility path');
assert.doesNotMatch(perfHud, /cot\.perfhud\.v1|PROD_BUILD/,
  'the diagnostics panel must not retain a second private persistence or production gate');
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
assert.match(hud, /const plateX = _sx - bar\.layoutW \* 0\.5;[\s\S]*const plateY = _sy - 42;[\s\S]*translate3d\(\$\{plateX\.toFixed\(1\)\}px,\$\{plateY\.toFixed\(1\)\}px,0\)/,
  'world tank labels must remain centered on their literal projected tank anchors');
assert.doesNotMatch(hud, /updateHpBars\._layout|layout\.sort|placed\.layoutY - 36/,
  'world tank labels must be allowed to overlap instead of entering screen-space lanes');
assert.doesNotMatch(hud, /keep the plate clear of the dispersion circle|aimView\.cy - rNow - 40/,
  'reticle avoidance must not detach world tank labels from their projected anchors');

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
  /body\.cot-touch-layout \.cot-si-cardhost,[\s\S]*body\.cot-touch-layout \.cot-si-log\{display:none!important;\}/,
  'touch battles must remove desktop ballistic analysis surfaces from the battlefield');
assert.match(shotInfo,
  /if \(isTouchBattleLayout\(\)\) return;[\s\S]*const card = buildCard/,
  'touch hits must skip hidden card and diagram construction instead of wasting mobile render work');
assert.match(shotInfo,
  /kv\('Angle',[^\n]*'w'\);[\s\S]*kv\('Armor',[\s\S]*kv\('Damage',[^\n]*'w'\);[\s\S]*const r = kv\('Pen'/,
  'the report must keep only angle, armor, damage, and penetration analysis rows');
assert.doesNotMatch(shotInfo, /kv\('(?:Distance|Result)'/,
  'the compact report must not render distance or result rows');
assert.doesNotMatch(shotInfo, /modChips\(ev, card\)|el\('div', 'cot-si-zone', diag\)|el\('div', 'cot-si-pencap', rows\)/,
  'the compact report must not append module chips, zone copy, or a penetration caption');
assert.match(responsiveSurfaces,
  /body\.cot-touch-layout \.cot-si-cardhost,[\s\S]*\.cot-si-log\{display:none!important\}[\s\S]*\.cot-si-toasthost\{[\s\S]*\+ 108px\)[\s\S]*width:min\(200px,48vw\);min-height:41px/,
  'all touch orientations must suppress the full report and keep one compact incoming reading below the minimap');
assert.match(responsiveSurfaces,
  /data-cot-panels='overlay'\]\[data-cot-orientation='portrait'\] \.cot-minimap\{[\s\S]*\+ 100px\)[\s\S]*data-cot-orientation='portrait'\] \.cot-si-toasthost\{[\s\S]*\+ 208px\)/,
  'portrait touch battles must place the minimap below top chrome and incoming fire below the minimap');
assert.match(shotInfo, /cot-si-toasthost[^}]*min-height:164px/,
  'the canonical incoming feed must reserve stable space for battle readings');

assert.match(responsiveSurfaces,
  /body\[data-cot-height='short'\] \.cot-set-body\{min-height:0;flex:1 1 auto\}/,
  'short landscape settings must shrink their scroll body so the action footer stays on-screen');
assert.match(settings,
  /const touchLayout = !!\(input\.isTouchLayout[\s\S]*touchLayout \? 'Touch aim' : 'Mouse'[\s\S]*if \(!touchLayout\) \{[\s\S]*'Right click \(RMB\)'/,
  'touch settings must show touch aiming language and omit mouse-only RMB controls');
assert.match(settings,
  /body\.cot-touch-layout \.cot-settings button\{min-height:44px;\}[\s\S]*\.cot-set-close\{width:44px;height:44px;\}/,
  'touch settings controls must retain a 44 px finger-target floor');
assert.match(settings,
  /range\.setAttribute\('aria-label', label\)[\s\S]*num\.setAttribute\('aria-label', `\$\{label\} value`\)/,
  'settings sliders and exact-value fields must expose their visible labels to assistive technology');
assert.match(touch,
  /root\.setAttribute\('role', 'group'\)[\s\S]*aimLayer\.setAttribute\('role', 'group'\)[\s\S]*role="group" aria-label="Swipe to aim"[\s\S]*role="toolbar" aria-label="Battle options"[\s\S]*role="group" aria-label="Movement joystick"/,
  'touch HUD labels must sit on semantic roles that expose them without prohibited ARIA');
assert.match(hud,
  /driveEl\.setAttribute\('role', 'status'\)[\s\S]*driveEl\.setAttribute\('aria-label', 'Vehicle speedometer'\)/,
  'the shared analog speedometer must expose its live status semantics on every input mode');

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

assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] \.cot-network-status\{[\s\S]*width:calc\(100vw - \(var\(--cot-edge\) \* 2\)\)[\s\S]*min-width:0/,
  'phone reconnect banners must fit the safe viewport instead of retaining their desktop minimum');
assert.match(responsiveSurfaces,
  /body\[data-cot-width\] \.cot-network-diagnostics\{[\s\S]*white-space:pre-wrap;overflow-wrap:anywhere/,
  'network diagnostics must wrap and scroll rather than escape narrow screens');
assert.match(responsiveSurfaces,
  /body\[data-cot-width\] \.cot-trans \.core\{width:min\(680px,100%\)[\s\S]*body\[data-cot-width='phone'\] \.cot-trans \.title/,
  'state transitions must cap their core and recompose long titles on phones');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] \.cot-resume \.rz-title\{[\s\S]*letter-spacing:\.18em/,
  'the pointer-lock resume veil must keep its title within phone width');
assert.match(responsiveSurfaces,
  /body\[data-cot-width\] \.cot-hints\{[\s\S]*flex-wrap:wrap;white-space:normal/,
  'keyboard hints must wrap as groups instead of clipping on intermediate widths');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] #cot-perfhud \[data-grid\]\{grid-template-columns:1fr!important\}/,
  'the opt-in performance dashboard must remain readable on narrow devices');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] #cot-diag\{[\s\S]*max-height:62dvh!important;overflow:auto!important/,
  'the compatibility diagnostics panel must stay bounded and scrollable on phones');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] #cot-ctxlost>div>div:first-child\{[\s\S]*letter-spacing:\.18em!important/,
  'the graphics recovery title must reflow without overflowing small screens');
assert.match(gallery, /\.toast\{[^}]*max-width:calc\(100vw - 24px\)[^}]*white-space:normal/,
  'Gallery feedback toasts must be viewport-bounded');
assert.match(docs, /\.docs-toast\{[^}]*max-width:calc\(100vw - 24px\)[^}]*white-space:normal/,
  'Docs feedback toasts must be viewport-bounded');

for (const [source, pattern, label] of [
  [networkStatus, /\.cot-network-status\{position:fixed/, 'network status'],
  [transition, /\.cot-trans\{position:fixed/, 'state transition'],
  [perfHud, /el\.id = 'cot-perfhud'/, 'performance dashboard'],
  [deviceDiag, /el\.id = 'cot-diag'/, 'compatibility diagnostics'],
  [renderer, /el\.id = 'cot-ctxlost'/, 'graphics recovery'],
  [pointerLockFeedback, /element\.className = 'cot-lock-toast'/, 'pointer-lock fallback'],
]) assert.match(source, pattern, `${label} surface must remain present while responsive composition owns its geometry`);

const semanticSurfaceFiles = [
  '../game/killcam.js',
  '../gallery/gallery.css',
  '../presentation/mediaArchive.css',
  '../presentation/publicNav.css',
  '../presentation/publicPages.ts',
  '../docs/docs.css',
  '../docs/battleReels.ts',
  '../../public/home.css',
  '../../index.html',
  './battleLoad.ts',
  './contextInfo.ts',
  './endScreen.ts',
  './garage.js',
  './garage.css',
  './hud.js',
  './playMenu.ts',
  './roomChat.ts',
  './networkStatus.ts',
  './perfHud.ts',
  './settings.js',
  './shotInfo.js',
  './studioPanel.js',
  './touchControls.js',
  './transition.ts',
  './responsiveSurfaces.css',
  '../engine/deviceDiag.ts',
  '../engine/renderer.ts',
  '../main.ts',
];
for (const relativePath of semanticSurfaceFiles) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.doesNotMatch(source,
    /@media[^\n]*(?:max-width|min-width|orientation|max-height|min-height)|matchMedia\([^\n]*(?:max-width|min-width|orientation|max-height|min-height)/,
    `${relativePath} must not reintroduce an independent device-layout breakpoint`);
}

console.log('mobile responsive layout contracts: PASS');
