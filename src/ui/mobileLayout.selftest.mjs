import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('./responsiveLayout.selftest.mjs');

const [
  garageSource, touch, battleLoad, hud, shotInfo, playMenu, settings, publicNav, responsiveSurfaces, input,
  networkStatus, transition, perfHud, deviceDiag, renderer, main, pointerLockFeedback, gallery, docs,
] = await Promise.all([
  readFile(new URL('./garage.ts', import.meta.url), 'utf8'),
  readFile(new URL('./touchControls.ts', import.meta.url), 'utf8'),
  readFile(new URL('./battleLoad.ts', import.meta.url), 'utf8'),
  readFile(new URL('./hud.ts', import.meta.url), 'utf8'),
  readFile(new URL('./shotInfo.ts', import.meta.url), 'utf8'),
  readFile(new URL('./playMenu.ts', import.meta.url), 'utf8'),
  readFile(new URL('./settings.ts', import.meta.url), 'utf8'),
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
assert.match(garage, /body\[data-cot-width='laptop'\] \.cot-featured\{display:none\}/,
  'laptop garages must hide the decorative Battle Gallery instead of crowding the vehicle stage');
assert.match(garage,
  /data-garage-panel="maps"[\s\S]*data-garage-panel="appearance"/,
  'overlay garages must expose explicit map and camouflage drawers');
assert.match(garageSource,
  /<nav class="cot-garage-tools" aria-label="Garage setup previews">[\s\S]*aria-label="Open battlefield selection"[\s\S]*cot-garage-map-preview[\s\S]*aria-label="Open camouflage selection"[\s\S]*cot-garage-camo-preview/,
  'compact garages must expose real map and camouflage preview cards without a disclosure step');
assert.equal((garageSource.match(/<canvas width="64" height="44">/g) || []).length, 4,
  'the compact camouflage card must mirror the map card with four live previews');
assert.doesNotMatch(garage, /cot-garage-tools-(?:trigger|menu)/,
  'compact garage panel actions must not regress to a single setup dropdown');
assert.match(garage,
  /\.cot-garage-preview-card\{[^}]*height:var\(--cot-preview-card-height,150px\)[^}]*grid-template-rows:18px auto 22px[\s\S]*\.cot-garage-map-preview,\.cot-garage-camo-preview\{[^}]*aspect-ratio:16\/9;[^}]*background-size:cover[\s\S]*body\[data-cot-panels='overlay'\] \.cot-garage-tools\{\s*display:flex;left:max\(var\(--cot-overlay-edge\),env\(safe-area-inset-left\)\);right:auto;\s*top:76px;bottom:auto[\s\S]*body\[data-cot-panels='overlay'\] \.cot-garage-preview-card\{\s*height:var\(--cot-preview-card-height\);min-height:0;flex:0 0 auto/,
  'map and camouflage cards must share one bounded anatomy and preserve widescreen preview proportions');
assert.match(garage,
  /--cot-roster-bottom:max\(8px,env\(safe-area-inset-bottom\)\);[\s\S]*--cot-country-bottom:calc\(var\(--cot-roster-bottom\) \+ var\(--cot-roster-height\) \+ var\(--cot-stack-gap\)\);[\s\S]*--cot-side-panel-bottom:calc\(var\(--cot-country-bottom\) \+ var\(--cot-country-height\) \+ var\(--cot-stack-gap\)\)/,
  'the roster, country rail, and side panels must share one non-overlapping stack contract');
assert.match(garage,
  /function refreshCompactMapPreview\(\): void[\s\S]*selected\.thumb[\s\S]*backgroundImage[\s\S]*function refreshCompactCamoPreview\(spec: GarageTankSpec, selectedPatternId: string\): void[\s\S]*compactCamoPreviews\.forEach[\s\S]*paintAutoCamoSwatch\(canvas, spec\)[\s\S]*paintCamoSwatch\(canvas, spec, previewPattern\)/,
  'compact preview cards must render the selected map art and four deterministic camouflage swatches');
assert.match(garage,
  /class="cot-compact-equipment-trigger"[\s\S]*data-garage-panel="equipment"[\s\S]*aria-controls="cot-garage-dossier"[\s\S]*data-garage-panel='equipment'\] \.stats>\.cot-loadout-section\{[\s\S]*display:block/,
  'compact garages must expose the real tank loadout slots through an accessible equipment drawer');
assert.match(garage,
  /data-cot-panels='overlay'\] \.cot-eqpick\.open\{[\s\S]*left:max\(var\(--cot-overlay-edge\)[\s\S]*right:max\(var\(--cot-overlay-edge\)[\s\S]*bottom:max\(8px,env\(safe-area-inset-bottom\)\)/,
  'the compact equipment picker must stay inside the usable viewport');
assert.match(garageSource,
  /cot-cards" role="listbox" tabindex="0" aria-label="Vehicle catalog"[\s\S]*card\.setAttribute\('role', 'option'\)[\s\S]*cardsEl\.setAttribute\('aria-activedescendant', card\.id\)/,
  'the horizontally scrolling vehicle catalog must stay keyboard-focusable and expose its active option');
assert.match(garage,
  /data-cot-height='short'\]\[data-cot-orientation='landscape'\]\[data-cot-panels='overlay'\] \.cot-garage\{[\s\S]*--cot-compact-left-width:clamp\(112px,21vw,132px\)[\s\S]*left:calc\(max\(8px,env\(safe-area-inset-left\)\) \+ var\(--cot-compact-left-width\) \+ 8px\)/,
  'short landscape drawers must open beside the live preview stack instead of covering it');
assert.match(garage,
  /body\[data-cot-panels='overlay'\] \.cot-leftcol\{display:none\}[\s\S]*body\[data-cot-panels='overlay'\] \.cot-garage \.stats\{[\s\S]*display:block;z-index:8;right:max\(var\(--cot-overlay-edge\),env\(safe-area-inset-right\)\)[\s\S]*\.cot-performance-grid>\.srow:nth-child\(n\+5\)\{display:none\}/,
  'compact layouts must keep a four-item vehicle summary fixed to the right');
assert.match(garage,
  /--cot-compact-stats-width:clamp\(196px,22vw,230px\)[\s\S]*container:garage-dossier \/ inline-size[\s\S]*stats>:is\(\.cot-technical-section,\.cot-performance-section,\.cot-loadout-section\)\{display:block\}/,
  'tablet overlays must render one legible dossier with identity, loadout, and combat stats');
assert.match(garage,
  /data-cot-width='tablet'\]\[data-cot-panels='overlay'\] \.cot-header-nav \.cot-github\{\s*width:78px;min-width:78px[\s\S]*data-cot-width='compact'\]\[data-cot-panels='overlay'\] \.cot-nav \.github-stars,[\s\S]*min-width:24px;height:14px/,
  'repository stars must retain a readable inline slot on tablets and a bounded badge on tighter headers');
assert.match(garage,
  /@container garage-dossier \(max-width:205px\)\{[\s\S]*\.cot-performance-grid\{grid-template-columns:1fr\}[\s\S]*data-cot-height='short'[\s\S]*\.cot-performance-grid\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  'narrow tablet dossiers must switch to readable stat rows while short landscape retains its 2x2 summary');
assert.match(garage,
  /data-cot-width='phone'\]\[data-cot-orientation='portrait'\][\s\S]*\.cot-garage:not\(\[data-garage-panel='equipment'\]\) \.stats>\.cot-loadout-section\{\s*display:none[\s\S]*data-cot-height='short'[\s\S]*\.cot-garage:not\(\[data-garage-panel='equipment'\]\) \.stats>\.cot-loadout-section\{\s*display:none/,
  'only true phone and short-landscape rails may collapse loadout slots behind the equipment trigger');
assert.match(garage,
  /\.cot-garage \.stats\.has-scroll-mask\{[\s\S]*mask-image:linear-gradient\(180deg,transparent 0,[\s\S]*var\(--cot-dossier-head-fade,0px\)[\s\S]*var\(--cot-dossier-tail-fade,0px\)[\s\S]*transparent 100%\)/,
  'the dossier must fade scrolled cards into the garage at both viewport edges instead of clipping them');
assert.match(garageSource,
  /const dossierPassed = Math\.max\(0, statsEl\.scrollTop\)[\s\S]*const dossierRemaining = Math\.max\(0,[\s\S]*has-scroll-head[\s\S]*has-scroll-tail[\s\S]*Math\.min\(64, dossierPassed\)[\s\S]*Math\.min\(64, dossierRemaining\)[\s\S]*statsEl\.addEventListener\('scroll', syncScrollFades, \{ passive: true \}\)/,
  'the dossier fades must track content above and below, then collapse progressively at both scroll ends');
assert.match(garage,
  /body\[data-cot-width='phone'\]\[data-cot-orientation='portrait'\] \.cot-battle-control\{[\s\S]*top:max\(64px/,
  'portrait phones must place Battle below the brand and global controls instead of overlapping them');
assert.match(garage,
  /body\[data-cot-width='phone'\]\[data-cot-orientation='portrait'\] \.cot-garage\[data-garage-panel='maps'\] \.cot-leftcol,[\s\S]*top:max\(120px,calc\(env\(safe-area-inset-top\) \+ 114px\)\)/,
  'portrait garage drawers must begin below the lowered Battle control');
assert.match(garage,
  /const openMobileNavigation = \(\) => \{[\s\S]*closeBattleMenu\(\);[\s\S]*setGaragePanel\(''\);/,
  'page navigation must close garage disclosures instead of stacking over them');
assert.match(garage,
  /function openBattleMenu\(\) \{[\s\S]*closeMobileNavigation\(\);[\s\S]*setGaragePanel\(''\);/,
  'battle selection must close garage disclosures instead of stacking over them');
assert.match(garage,
  /if \(!openGaragePanel\(\) \|\| event\.code !== 'Escape'\) return;[\s\S]*event\.stopImmediatePropagation\(\);[\s\S]*setGaragePanel\('', \{ restoreFocus: true \}\);/,
  'Escape must close one garage drawer without leaking into the global Settings shortcut');
assert.match(garage,
  /if \(!battleMenu\.classList\.contains\('open'\) \|\| event\.code !== 'Escape'\) return;[\s\S]*event\.stopImmediatePropagation\(\);[\s\S]*closeBattleMenu\(\{ restoreFocus: true \}\);/,
  'Escape must close the Battle menu without leaking into another UI owner');

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
  /data-cot-width='compact'\] \.cot-bl \.briefing,[\s\S]*data-cot-width='phone'\] \.cot-bl \.briefing,[\s\S]*data-cot-height='short'\] \.cot-bl \.briefing\{[\s\S]*background:transparent;border-color:transparent;box-shadow:none/,
  'compact, phone, and short battle loading must drop the viewport-sized briefing card shell');
assert.match(responsiveSurfaces,
  /body\[data-cot-height='short'\] \.cot-bl \.team\{justify-content:center/,
  'short battle rosters need a height-aware vertical composition');
assert.match(responsiveSurfaces, /\.cot-bl \.count:empty\{display:none/,
  'an empty countdown must not reserve footer height over the final roster row');

assert.doesNotMatch(hud, /cot-dlog|pushDamageLog/,
  'incoming hits must have one canonical combat-intelligence feed, not a duplicate HUD log');
assert.doesNotMatch(hud, /cot-bounce|showBounceMessage|BOUNCE_TEXT/,
  'ricochets must not create a second generic toast beside the hit marker and combat record');
assert.match(hud,
  /if \(hit\.damage > 0\)[\s\S]*document\.body\.classList\.contains\('cot-touch-layout'\)[\s\S]*outcome\.label[\s\S]*else \{ d\.remove\(\); return; \}/,
  'desktop zero-damage results must use the ballistic card only while touch retains one compact impact label');
assert.doesNotMatch(hud, /d\.textContent = '(?:RICOCHET|NO PENETRATION|ABSORBED)'/,
  'HUD result copy must come from the shared hit-outcome registry');
assert.match(hud,
  /const valueRadius = frame\.radius \+ paint\.thickness \+ \(indicator\.numeric \? 14 : 16\)[\s\S]*strokeText\(label, x, y\)[\s\S]*fillText\(label, x, y\)/,
  'incoming result labels must sit beyond the wedge instead of inside its glow');
assert.match(hud, /directionalHitAmount\(hit, kind === 'bounce' && outcome\.blocked\)/,
  'gray direction wedges must source blocked damage from the authoritative hit outcome');
assert.match(hud,
  /function mergeIncomingHitDirection[\s\S]*existing\.kind !== kind \|\| existing\.mergeKey !== mergeKey[\s\S]*incomingHitFeedbackFor\(hit\)[\s\S]*mergeIncomingHitDirection\([\s\S]*feedback\.mergeKey/,
  'nearby hits may merge only when their canonical outcomes match');
assert.match(hud, /fillStyle = indicator\.labelColor[\s\S]*fillText\(label, x, y\)/,
  'direction labels must retain the canonical damage, splash, and outcome colors');
assert.match(shotInfo,
  /function recordOutgoingHit\(ev: ShotHitEvent\)[\s\S]*const outcome = hitOutcomeFor\(ev\)[\s\S]*function recordIncomingHit\(ev: ShotHitEvent\)[\s\S]*const outcome = hitOutcomeFor\(ev\)/,
  'outgoing and incoming shot records must both classify through the shared hit-outcome registry');
assert.match(shotInfo, /uiIconSVG\(cls\.icon, 11\)[\s\S]*cls\.label/,
  'combat-result surfaces must use the shared result label and icon vocabulary');
assert.match(shotInfo, /if \(!\(ev\.damage > 0\)\) t\.classList\.add\('deflected'\)/,
  'zero-damage incoming results must use the neutral deflection treatment instead of damage red');
assert.match(hud,
  /function resetCombatPresentation\(\)[\s\S]*hitDirs\.length = 0[\s\S]*hitMark = null[\s\S]*liveNums\.length = 0[\s\S]*dmgLayer\.replaceChildren\(\)[\s\S]*killfeed\.replaceChildren\(\)/,
  'phase changes must clear every transient combat-feedback surface together');
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
assert.match(hud, /targetX = Math\.max\(halfWidth \+ 4, Math\.min\(w - halfWidth - 4, _sx\)\)/,
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
assert.match(playMenu, /menu-select menu-select--vehicle[^>]*data-control="vehicle"[\s\S]*cot-room-vehicle-list[^>]*role="listbox"/,
  'ready-up must expose the production vehicle roster through the shared accessible listbox');
assert.match(playMenu, /vehicleSelect\.addEventListener\('change',[\s\S]*type: 'select_vehicle'[\s\S]*type: 'select_equipment'[\s\S]*type: 'select_camo'/,
  'in-lobby tank changes must submit the complete vehicle loadout');
const showCurrentRoomBody = playMenu.match(
  /function showCurrentRoom\(\): boolean \{([\s\S]*?)\n  \}\n  function syncGarageSelection/,
)?.[1] || '';
assert.ok(showCurrentRoomBody, 'the current-room presentation body remains inspectable');
assert.doesNotMatch(showCurrentRoomBody, /syncGarageSelection\(\)/,
  'reopening a room must not overwrite its retained map or tank with stale Garage state');
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
  /body\[data-cot-width='phone'\] #cot-perfhud\{[\s\S]*top:auto!important;bottom:max\(8px,[\s\S]*z-index:70!important[\s\S]*#cot-perfhud:not\(\.mobile-expanded\) \[data-grid\][\s\S]*display:none!important/,
  'phone diagnostics must start collapsed at the bottom instead of covering navigation');
assert.match(perfHud,
  /ph-mobile-toggle[\s\S]*aria-expanded="false"[\s\S]*classList\.toggle\('mobile-expanded'\)/,
  'the compact diagnostics header must expose an accessible expand/collapse control');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] \.cot-set-tab\{[\s\S]*flex:1 1 0;min-width:0;[\s\S]*font-size:9px/,
  'all four Settings tabs must fit at once on phone widths');
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
  '../game/killcam.ts',
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
  './garage.ts',
  './garage.css',
  './hud.ts',
  './playMenu.ts',
  './roomChat.ts',
  './networkStatus.ts',
  './perfHud.ts',
  './settings.ts',
  './shotInfo.ts',
  './studioPanel.ts',
  './touchControls.ts',
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
