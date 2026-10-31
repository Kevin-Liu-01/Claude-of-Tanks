import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { viewportQueryViolations } from './viewportQueries.test-support.mjs';


const [
  garageSource, touch, battleLoad, hud, shotInfo, playMenu, settings, publicNav, responsiveSurfaces, input,
  transition, perfHud, deviceDiag, renderer, main, pointerLockFeedback, gallery, docs, battleHudLayoutCss,
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
  readFile(new URL('./transition.ts', import.meta.url), 'utf8'),
  readFile(new URL('./perfHud.ts', import.meta.url), 'utf8'),
  readFile(new URL('../engine/deviceDiag.ts', import.meta.url), 'utf8'),
  readFile(new URL('../engine/renderer.ts', import.meta.url), 'utf8'),
  readFile(new URL('../main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../game/pointerLockFeedbackRuntime.ts', import.meta.url), 'utf8'),
  readFile(new URL('../gallery/gallery.css', import.meta.url), 'utf8'),
  readFile(new URL('../docs/docs.css', import.meta.url), 'utf8'),
  readFile(new URL('./battleHudLayout.css', import.meta.url), 'utf8'),
]);
const garage = `${garageSource}\n${await readFile(new URL('./garage.css', import.meta.url), 'utf8')}`;

// owner 2026-10-21 (8339df05b1): the countdown sits on the centre line, a dial over the crosshair; a touch layout seats it
// from the touch notice planner (touchNoticePlan.ts placeCountdown), clear of the initial minimap, the room chat and the
// controls, where a fixed portrait seat (top:max(255px,30%)) once kept it off them
assert.match(battleHudLayoutCss,
  /\.cot-touch-layout\[data-touch-notices\] \.cot-prebattle\{top:var\(--hud-touch-countdown-top\);/,
  'a touch countdown takes the touch notice planner\'s seat');
assert.doesNotMatch(responsiveSurfaces, /\.cot-prebattle\{\s*top:max\(255px,30%\)/,
  'no fixed portrait countdown seat outlives the planner');

assert.doesNotMatch(garage, /@media \((?:min|max)-width:\d+px\)/,
  'Garage composition must not retain independent device-width breakpoint logic');
assert.doesNotMatch(garage, /@media \([^)]*orientation:/,
  'Garage composition must consume semantic orientation attributes instead of media-query guesses');
// The laptop bar keeps its destinations labelled (Record among them: the gauntlet 10-25 found it a lone glyph beside a
// half-empty bar) and folds GitHub and the locale to glyphs, all through the width band (36af9d7638 kept the labels; the
// 246 pass moved its sub-1280 fold onto the band itself).
assert.match(garage, /body\[data-cot-width='laptop'\] \.cot-header-nav :is\(\.cot-github,\.cot-locale-switcher\) \.nav-label\{display:none\}/,
  'laptop navigation folds GitHub and the locale through the shared width-band contract');
assert.doesNotMatch(garage, /body\[data-cot-width='laptop'\] \.cot-header-nav \.nav-label\{display:none\}/,
  'laptop navigation keeps Garage, Deploy, Gallery, Studio and Docs labelled');
assert.match(garage, /body\[data-cot-width='laptop'\] \.cot-featured\{display:none\}/,
  'laptop garages must hide the decorative Battle Gallery instead of crowding the vehicle stage');
// The 245 redesign: the band under the name carries the slots and the paint in every layout (every paint opens its
// drawer), and the battle card carries the battlefield (its picture opens the Deploy screen's field); the folded tool
// cards are gone (the 246 CSS diet).
assert.match(garageSource,
  /<div class="cot-lt-band"><div class="cot-lt-group">[\s\S]*?<div class="cot-lt-loadout eqrow"[\s\S]*?<div class="cot-lt-group">[\s\S]*?<div class="cot-lt-paint"/,
  'every layout keeps the equipment slots and the paint in view under the name');
// (the 261 census builds the band's paint on the kit's picker, so the button is made in code, not markup)
assert.match(garageSource, /paintAll\.className = 'cot-c-btn cot-c-btn--icon cot-lt-paint-all';\s*paintAll\.dataset\.garagePanel = 'appearance';/,
  'the band\'s last swatch opens every paint');
assert.match(garageSource, /data-deploy-pic aria-hidden="true"[\s\S]*data-deploy-field aria-expanded="false"/,
  'the battle card shows the battlefield and the Deploy screen\'s field chooses it');
assert.doesNotMatch(garage, /cot-garage-tools|cot-garage-preview-card/, 'the folded tool cards stay gone');
assert.match(garage,
  /--cot-roster-bottom:max\(8px,env\(safe-area-inset-bottom\)\);[\s\S]*--cot-country-bottom:calc\(var\(--cot-roster-bottom\) \+ var\(--cot-roster-height\) \+ var\(--cot-stack-gap\)\);[\s\S]*--cot-side-panel-bottom:calc\(var\(--cot-country-bottom\) \+ var\(--cot-country-height\) \+ var\(--cot-stack-gap\)\)/,
  'the roster, country rail, and side panels must share one non-overlapping stack contract');
assert.match(garage,
  /function refreshBattlefield\(\): void[\s\S]*selected\.thumb[\s\S]*backgroundImage[\s\S]*function refreshBandPaint\(spec: GarageTankSpec, selectedPatternId: string\): void[\s\S]*paintBandSwatch\(canvas, spec,/,
  'the battle card renders the selected map art and the band paints what the tank wears and its quick paints');
assert.match(garage, /loadoutEl\.innerHTML = equipmentSlots\(eqIds\);/, 'every layout keeps the real loadout slots in the band');
assert.match(garage, /<button type="button" class="eqslot" data-slot="\$\{index\}"/, 'each slot is a native, keyboard-operable button');
assert.match(garage, /class="cot-overview-more" data-garage-panel="equipment" aria-expanded="false" aria-controls="cot-garage-dossier"/,
  'the folded figures open the whole dossier through an accessible control');
assert.match(garage,
  /data-cot-panels='overlay'\] \.cot-eqpick\.open\{[\s\S]*left:max\(var\(--cot-overlay-edge\)[\s\S]*right:max\(var\(--cot-overlay-edge\)[\s\S]*bottom:max\(8px,env\(safe-area-inset-bottom\)\)/,
  'the compact equipment picker must stay inside the usable viewport');
assert.match(garageSource,
  /cot-cards" role="listbox" tabindex="0" aria-label="\$\{t\('garage\.carousel\.listAria'\)\}"[\s\S]*card\.setAttribute\('role', 'option'\)[\s\S]*cardsEl\.setAttribute\('aria-activedescendant', card\.id\)/,
  'the horizontally scrolling vehicle catalog must stay keyboard-focusable and expose its active option');
assert.match(garage,
  /data-cot-height='short'\]\[data-cot-orientation='landscape'\]\[data-cot-panels='overlay'\] \.cot-garage\{[\s\S]*--cot-compact-left-width:clamp\(112px,21vw,132px\)[\s\S]*left:calc\(max\(8px,env\(safe-area-inset-left\)\) \+ var\(--cot-compact-left-width\) \+ 8px\)/,
  'short landscape drawers must open beside the live preview stack instead of covering it');
assert.match(garage,
  /body\[data-cot-panels='overlay'\] \.cot-leftcol\{display:none\}[\s\S]*body\[data-cot-panels='overlay'\] \.cot-garage \.stats\{[\s\S]*display:block;z-index:8;right:max\(var\(--cot-overlay-edge\),env\(safe-area-inset-right\)\)[\s\S]*\.cot-performance-grid>\.srow:nth-child\(n\+5\)\{display:none\}/,
  'compact layouts must keep a four-item vehicle summary fixed to the right');
assert.match(garage,
  /--cot-compact-stats-width:clamp\(196px,22vw,230px\)[\s\S]*container:garage-dossier \/ inline-size[\s\S]*stats>:is\(\.cot-technical-section,\.cot-performance-section\)\{display:block\}/,
  'tablet overlays must render one legible dossier with identity and combat stats (the loadout stays in the band)');
assert.match(garage,
  /data-cot-width='tablet'\]\[data-cot-panels='overlay'\] \.cot-header-nav \.cot-github\{\s*width:78px;min-width:78px[\s\S]*data-cot-width='compact'\]\[data-cot-panels='overlay'\] \.cot-nav \.github-stars,[\s\S]*min-width:24px;height:14px/,
  'repository stars must retain a readable inline slot on tablets and a bounded badge on tighter headers');
assert.match(garage,
  /@container garage-dossier \(max-width:205px\)\{[\s\S]*\.cot-performance-grid\{grid-template-columns:1fr\}[\s\S]*data-cot-height='short'[\s\S]*\.cot-performance-grid\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  'narrow tablet dossiers must switch to readable stat rows while short landscape retains its 2x2 summary');
assert.doesNotMatch(garage, /cot-loadout-section/,
  'no layout collapses the loadout slots behind a trigger: the band shows them everywhere');
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
  /body\[data-cot-width='phone'\]\[data-cot-orientation='portrait'\] \.cot-garage\[data-garage-panel='appearance'\] \.cot-leftcol\{[\s\S]*top:calc\(max\(120px,calc\(env\(safe-area-inset-top\) \+ 114px\)\) \+ var\(--cot-room-row-space,0px\)\)/,
  'portrait garage drawers must begin below the lowered Battle control and any room-readiness row');
assert.match(garageSource, /root\.classList\.toggle\('has-room', !!status\)/,
  'room departure must release the space reserved for readiness controls');
assert.match(garage, /\.cot-garage\.has-room\{--cot-room-row-space:52px;\}/,
  'connected rooms must reserve a full touch-target row above compact previews and drawers');
assert.match(playMenu, /\.cot-play button\[data-action="ready"\]\{min-height:44px\}/,
  'drawer readiness must retain a full-size touch target');
// the disclosures, the drawers and Deploy are transient surfaces (components/surfaceStack.ts): opening one replaces the
// open one in the same press, and Escape (the stack's, in the window's capture) closes only the top one
assert.match(garage, /const openMobileNavigation = \(\) => \{\s*openSurface\(mobileNavSurface, mobileNavTrigger\);/,
  'page navigation must close garage disclosures instead of stacking over them');
assert.match(garage, /function openBattleMenu\(\)(?:: void)? \{[\s\S]*?openSurface\(deploySurface, battleModeBtn\);/,
  'battle selection must close garage disclosures instead of stacking over them');
assert.match(garage, /close: \(reason\) => \{ if \(openGaragePanel\(\) === panel\) setGaragePanel\('', \{ restoreFocus: reason === 'escape' \}\); \}/,
  'Escape must close one garage drawer without leaking into the global Settings shortcut (an open picker menu takes its own)');
assert.doesNotMatch(garage, /event\.code !== 'Escape'\) return;/, 'no Garage surface keeps an Escape listener of its own');
assert.match(garage, /id: 'deploy',[\s\S]*?close: \(reason\) => closeBattleMenu\(\{ restoreFocus: reason === 'escape' \}\),\s*modal: true,/,
  'Escape must close the Battle menu without leaking into another UI owner');

assert.doesNotMatch(touch, /@media \([^)]*(?:width|height|orientation)/,
  'touch controls must consume the canonical semantic viewport contract');
assert.match(touch,
  /\.cot-touch\{[^}]*z-index:60[\s\S]*\.cot-touch-aim\{[^}]*z-index:39[\s\S]*aimLayer\.className = 'cot-touch-aim'/,
  'visible touch controls must paint above the HUD while aim capture stays behind HUD actions');
assert.match(touch,
  /body\.cot-touch-layout \.cot-shells\{[^}]*width:52px;height:52px;display:block[\s\S]*\.cot-shells\.touch-open \.cot-shell[\s\S]*--touch-ammo-x/,
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
  /data-cot-height='short'\]\[data-cot-orientation='landscape'\] \.cot-net\{[\s\S]*top:calc\(max\(8px[\s\S]*left:auto;right:max\(10px/,
  'short landscape FPS and ping must clear both the score plate and minimap');
// owner 2026-10-22 (2a5d944a3f, "not centered in screen"): the plate sits on the true centre line and narrows to the lane
// the corner controls leave it, instead of a fixed 294 px set 18 px off centre; since 2026-10-25 ("less so big and wide")
// it hugs its scores and clock inside that lane
assert.match(responsiveSurfaces,
  /data-cot-height='short'\]\[data-cot-orientation='landscape'\] \.cot-top\{[\s\S]*left:50%;max-width:calc\(100vw - 2 \* \(env\(safe-area-inset-right\) \+ 164px\)\)/,
  'short landscape score plate must stay inside the lane between corner controls');
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
  /data-cot-width='phone'\] \.cot-bl \.briefing\{[\s\S]*height:calc\(var\(--cot-viewport-height,100dvh\)/,
  'phone loading briefings must consume the measured visual viewport instead of a fixed hero split');
assert.match(battleLoad,
  /\.cot-bl \.briefing\{[^}]*background:transparent;border:0;box-shadow:none/,
  'every viewport must show full-bleed loading art without the gray briefing panel');
// Roster density, centering and late-asset stability are checked in the
// rendered production component by tools/battle-load-layout.browser.mjs.
assert.doesNotMatch(responsiveSurfaces, /\.cot-bl \.count:empty\{display:none/,
  'starting the countdown must not resize the team sheets');

assert.doesNotMatch(hud, /cot-dlog|pushDamageLog/,
  'incoming hits must have one canonical combat-intelligence feed, not a duplicate HUD log');
assert.match(hud,
  /\.cot-kf\{[^}]*max-width:100%;[^}]*overflow:hidden;white-space:nowrap;[^}]*\}[\s\S]*\.cot-kf \.k,\.cot-kf \.v\{[^}]*min-width:0;[^}]*text-overflow:ellipsis;white-space:nowrap;/,
  'tank destruction readouts must remain one line and truncate long names within the team-list gap');
assert.doesNotMatch(hud, /cot-bounce|showBounceMessage|BOUNCE_TEXT/,
  'ricochets must not create a second generic toast beside the hit marker and combat record');
assert.match(hud,
  // (2026-10-09: main's rapid-fire consolidation, 7095d2058, returns before a desktop zero-damage label is made; the
  // touch layout's one compact outcome label is painted in the zero-damage branch; 2026-10-31: the hull points the hit
  // took off decide it, game/hullPointsRemoved.ts)
  /const removed = hullPointsRemoved\(hit\);[\s\S]*if \(!\(removed > 0\) && !document\.body\.classList\.contains\('cot-touch-layout'\)\) return;[\s\S]*if \(removed > 0\)[\s\S]*\} else \{[\s\S]*outcome\.label/,
  'desktop zero-damage results must use the ballistic card only while touch retains one compact impact label');
assert.doesNotMatch(hud, /d\.textContent = '(?:RICOCHET|NO PENETRATION|ABSORBED)'/,
  'HUD result copy must come from the shared hit-outcome registry');
assert.match(hud,
  /const valueRadius = frame\.radius \+ paint\.thickness \+ \(indicator\.numeric \? 14 : 16\)[\s\S]*sightText\.placeAs\(slot, label, x, y, ctx, ctx\.lineWidth\)/,
  'incoming result labels must sit beyond the wedge instead of inside its glow (DOM over the sight, haloed: UI-LOCKDOWN A)');
assert.match(hud, /directionalHitAmount\(hit, kind === 'bounce' && outcome\.blocked\)/,
  'gray direction wedges must source blocked damage from the authoritative hit outcome');
assert.match(hud,
  /function mergeIncomingHitDirection[\s\S]*existing\.kind !== kind \|\| existing\.mergeKey !== mergeKey[\s\S]*incomingHitFeedbackFor\(hit\)[\s\S]*mergeIncomingHitDirection\([\s\S]*feedback\.mergeKey/,
  'nearby hits may merge only when their canonical outcomes match');
assert.match(hud, /fillStyle = indicator\.labelColor;[\s\S]*sightText\.placeAs\(slot, label, x, y, ctx/,
  'direction labels must retain the canonical damage, splash, and outcome colors');
assert.match(shotInfo,
  /function recordOutgoingHit\(ev: ShotHitEvent\)[\s\S]*const outcome = hitOutcomeFor\(ev\)[\s\S]*function recordIncomingHit\(ev: ShotHitEvent\)[\s\S]*const outcome = hitOutcomeFor\(ev\)/,
  'outgoing and incoming shot records must both classify through the shared hit-outcome registry');
assert.match(shotInfo, /uiIconSVG\(cls\.icon, 11\)[\s\S]*cls\.label/,
  'combat-result surfaces must use the shared result label and icon vocabulary');
// Consecutive hits from one attacker share a toast (54372f83d): the treatment follows the group's damage.
assert.match(shotInfo, /const damaging = group\.damage > 0;[\s\S]{0,600}toast\.classList\.toggle\('deflected', !damaging\)/,
  'zero-damage incoming results must use the neutral deflection treatment instead of damage red');
assert.match(hud,
  /function resetCombatPresentation\(\)[\s\S]*hitDirs\.length = 0[\s\S]*hitMark = null[\s\S]*liveNums\.length = 0[\s\S]*dmgLayer\.replaceChildren\(\)[\s\S]*killLeft\.replaceChildren\(\)[\s\S]*killRight\.replaceChildren\(\)/,
  'phase changes must clear every transient combat-feedback surface together');
assert.doesNotMatch(hud, /t\('hud\.aimWarning\.muzzleBlocked'/,
  'bore obstructions must not add a muzzle-block overlay');
assert.match(hud, /--hud-layer-world:var\(--z-hud-world,6\);--hud-layer-sight:var\(--z-hud-sight,8\);--hud-layer-status:var\(--z-hud-status,18\);[\s\S]*--hud-layer-controls:var\(--z-hud-controls,24\);--hud-layer-score:var\(--z-hud-score,30\)/,
  'battle UI must declare one ordered layer contract with world indicators below fixed controls');
assert.match(hud, /t\('hud\.sixth\.label'\)[\s\S]*t\('hud\.sixth\.sub'\)/,
  'sixth sense must present one explicit detection state with supporting copy');
assert.match(hud, /uiIconSVG\('lightbulb', 24\)/,
  'the detected state must use the shared lightbulb warning glyph');
assert.match(hud,
  /cot-net-unit fps[\s\S]*cot-net-unit ping[\s\S]*netLastPaintMs[\s\S]*now - netLastPaintMs < 250/,
  'player FPS and latency telemetry must use structured 4 Hz instruments instead of per-frame text churn');
assert.match(hud,
  /t\('hud\.alert\.magazineReloadInProgress'\)[\s\S]*t\('hud\.alert\.magazineAlreadyFull'\)/,
  'magazine feedback must distinguish an active reload from a full magazine');
assert.doesNotMatch(hud, /FULL_OR_RELOADING/,
  'the HUD must not collapse distinct magazine reload denials into a generic state');
assert.match(input, /showDebugHud: false[\s\S]*storedSettings\.showDebugHud[\s\S]*key === 'showDebugHud'/,
  'debug HUD visibility must have one persisted input-setting owner');
assert.match(settings, /t\('settings\.interface\.debugHud'\)[\s\S]*ui:debugHud/,
  'Interface settings must expose the lazy debug dashboard');
assert.match(main, /bus\.on\('ui:debugHud'[\s\S]*perfHud\.setVisible[\s\S]*input\.setSetting\('showDebugHud'/,
  'settings and F8 must converge on the same diagnostics visibility path');
assert.doesNotMatch(perfHud, /cot\.perfhud\.v1|PROD_BUILD/,
  'the diagnostics panel must not retain a second private persistence or production gate');
// (its width a stable floor until its copy is measured; its height as its lines compose it, measured with the copy)
assert.match(hud, /\.cot-hpb\{[^}]*width:128px;[^}]*contain:layout paint style/,
  'world tank labels must start from stable geometry before one-time name measurement');
assert.match(hud, /bar\.layoutH = Math\.ceil\(bar\.root\.offsetHeight\)/,
  'a world tank label measures its height once with its copy, never per frame');
// (each line is measured at its own content's width: the vehicle line stretched to the bar read back the width the bar
// had been given, 14 px more at every measure up to 280, 266; tools/hud-self-measure.browser.selftest.mjs measures it live)
assert.match(hud, /\.cot-hpb \.vh\{align-self:center;/, 'a world tank label\'s vehicle line is as wide as its words, never the bar');
assert.match(hud, /const vehicle = bar\.solo \|\| hpBarsShort \? 0 : Math\.ceil\(bar\.nm\.scrollWidth\);/,
  'a world tank label reads its vehicle line\'s own width');
// (a hidden label is placed at the height its lines will have: the two-line default kept a short window's one-line
// labels out of every gap, so none showed to be measured)
assert.match(hud, /if \(bar\.shown\) measureHpBar\(bar\);\s+else measureHiddenHpBar\(bar\);/,
  'a hidden world tank label is measured, unseen, when its copy changes');
assert.match(hud, /bar\.measure = true;\s+if \(!bar\.shown\) measureHiddenHpBar\(bar\);/,
  'a hidden world tank label is measured, unseen, when the window changes');
assert.match(hud, /function measureHiddenHpBar\(bar: HpBar\): void \{\s+const style = bar\.root\.style;\s+style\.visibility = 'hidden';\s+style\.display = 'flex';\s+measureHpBar\(bar\);\s+style\.display = 'none';\s+style\.visibility = '';/,
  'a hidden world tank label is laid out unseen to be measured, then hidden again');
// (owner 2026-10-26, "dont show flags inn inn game enemy markers (*or friends s)"; tools/marker-census.mjs renders it)
assert.doesNotMatch(hud, /class="flg"|tgtRefs\.flg|\.cot-(?:hpb|tgt) [^{]*\.cot-flag/,
  'no marker over a tank carries a nation flag');
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
assert.match(hud, /const plateX = bar\.sx \+ bar\.seatDx - bar\.layoutW \* 0\.5;[\s\S]*const plateY = bar\.sy - bar\.layoutH - bar\.lift \+ bar\.seatDy;[\s\S]*translate3d\(\$\{plateX\.toFixed\(1\)\}px,\$\{plateY\.toFixed\(1\)\}px,0\)/,
  'world tank labels must remain centered on their literal projected tank anchors, but for a slide off a blocked seat');
// (a slide off a blocked seat, markers r20: each frame starts on the seat, the tank's x stays inside the bar, and the
// pointer is moved back over the tank)
assert.match(hud, /bar\.seatDx = 0; bar\.seatDy = 0;\s*if \(!hpBarClear\(x0, y0, x1, y1, count\)\)/,
  'a hull bar must try its own seat over its tank before any slide');
assert.match(hud, /const lo = Math\.max\(0, bar\.sx - width \+ TARGET_ANCHOR_INSET\) - x0, hi = Math\.min\(w - width, bar\.sx - TARGET_ANCHOR_INSET\) - x0;/,
  'a hull bar slide must keep its tank inside the bar');
assert.match(hud, /const pointerDx = bar\.seatDx === 0 \? 0 : Math\.round\(-bar\.seatDx \/ bar\.k\);/,
  'a slid hull bar must move its pointer back over its tank');
assert.match(hud, /\.cot-hpb::after\{[^}]*translate:var\(--hpb-anch-dx,0px\) 0;/,
  'the hull bar pointer must take the slide offset');
assert.doesNotMatch(hud, /updateHpBars\._layout|layout\.sort|placed\.layoutY - 36/,
  'world tank labels must be allowed to overlap instead of entering screen-space lanes');
assert.doesNotMatch(hud, /keep the plate clear of the dispersion circle|aimView\.cy - rNow - 40/,
  'reticle avoidance must not detach world tank labels from their projected anchors');

assert.match(shotInfo,
  /\.cot-si-cardhost\{position:absolute;right:16px;top:var\(--cot-si-card-top,var\(--cot-si-roster-bottom,272px\)\);width:320px[\s\S]*\.cot-si-body\{display:flex;flex-direction:column/,
  'desktop ballistic reports must use the compact centered-lane composition');
assert.match(shotInfo,
  /\.cot-si-diag\{(?:zoom:var\(--hud-report-zoom,1\);)?display:grid;grid-template-columns:90px 172px[\s\S]*\.cot-si-diag \.box:first-child\{width:90px!important;height:90px!important;\}[\s\S]*\.cot-si-diag \.box:nth-child\(2\)\{width:172px!important;height:86px!important;\}/,
  'desktop penetration schematics must fill the available report frame');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='compact'\] \.cot-si-diag\{[\s\S]*grid-template-columns:78px 154px/,
  'compact combat cards must preserve readable penetration diagrams');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] \.cot-si-diag\{display:none\}/,
  'phone combat cards must remove side diagrams to preserve the battlefield and controls');
// 2026-10-06: main's fab8d4a9c anchors the report above the minimap through REPORT_MAP_GAP (12 px) instead of a literal 8.
assert.match(await readFile(new URL('./battleHudLayout.ts', import.meta.url), 'utf8'),
  /export const REPORT_MAP_GAP = \d+;[\s\S]*map\.top - REPORT_MAP_GAP[\s\S]*read\('\.cot-ear\.r'\)/,
  'ballistic reports and logs must share the live lane between the enemy roster and minimap');
assert.doesNotMatch(shotInfo, /\.cot-si-card::before/,
  'ballistic reports must not retain the orange top-edge accent');
// (9cb467b27c: the card is led by its outcome, so its ballistic glyph left with the old header)
assert.match(shotInfo,
  /shell: uiIconSVG\('shell', 10\)[\s\S]*angle: uiIconSVG\('scope', 10\)[\s\S]*armor: uiIconSVG\('shield', 10\)[\s\S]*damage: uiIconSVG\('damage', 10\)[\s\S]*pen: uiIconSVG\('penetration', 10\)/,
  'ballistic reports must use the shared vector icon language for their key readings');
// (bc8de4d713: the rule is the Premiere plates' line token; gauntlet r3: every row on one rhythm, each over its own
// hairline, the penetration row included, so no row's gap is a one-off)
assert.match(shotInfo,
  /\.cot-si-kv\{[^}]*padding:2px 0;border-top:1px solid var\(--line-1\);/,
  'penetration analysis must be separated visually from the damage row');
assert.match(shotInfo,
  /body\.cot-touch-layout \.cot-si-cardhost,[\s\S]*body\.cot-touch-layout \.cot-si-log\{display:none!important;\}/,
  'touch battles must remove desktop ballistic analysis surfaces from the battlefield');
// (main's 395305d45 folds the log view's early return into the same guard: `if (isTouchBattleLayout() || logOpen) return;`)
assert.match(shotInfo,
  /if \(isTouchBattleLayout\(\)(?: \|\| logOpen)?\) return;[\s\S]*const card = buildCard/,
  'touch hits must skip hidden card and diagram construction instead of wasting mobile render work');
assert.match(shotInfo,
  /kv\('angle', t\('shotInfo\.angle'\),[^\n]*'w'\);[\s\S]*kv\('armor', t\('killcam\.stat\.armor'\),[\s\S]*const r = kv\('pen', t\('killcam\.stat\.pen'\)/,
  'the report must keep only angle, armor and penetration analysis rows');
// (no damage row: the hull points the shot took off stand beside the outcome, owner 2026-10-31)
assert.doesNotMatch(shotInfo, /kv\('damage', t\('killcam\.stat\.damage'\)/, 'the shot card carries no damage row');
assert.match(shotInfo, /if \(!header \|\| removed <= 0\) \{ figure\?\.remove\(\); return; \}\s*figure \?\?= markDatum\(el\('span', 'cot-si-dmg', header\), 'shot-damage'\);/,
  'the figure stands beside the outcome, and a shot that took no hull points shows its outcome alone, never −0');
assert.doesNotMatch(shotInfo, /kv\('(?:Distance|Result)'/,
  'the compact report must not render distance or result rows');
assert.doesNotMatch(shotInfo, /modChips\(ev, card\)|el\('div', 'cot-si-zone', diag\)|el\('div', 'cot-si-pencap', rows\)/,
  'the compact report must not append module chips, zone copy, or a penetration caption');
assert.match(responsiveSurfaces,
  /body\.cot-touch-layout \.cot-si-cardhost,[\s\S]*\.cot-si-log\{display:none!important\}[\s\S]*\.cot-si-toasthost\{[\s\S]*\+ 108px\)[\s\S]*width:min\(200px,48vw\);min-height:26px/,
  'all touch orientations must suppress the full report and keep one compact incoming reading below the minimap');
assert.match(responsiveSurfaces,
  /data-cot-panels='overlay'\]\[data-cot-orientation='portrait'\] \.cot-minimap\{[\s\S]*\+ 100px\)[\s\S]*data-cot-orientation='portrait'\] \.cot-si-toasthost\{[\s\S]*\+ 208px\)/,
  'portrait touch battles must place the minimap below top chrome and incoming fire below the minimap');
assert.match(shotInfo, /cot-si-toasthost[^}]*min-height:84px/,
  'the canonical incoming feed must reserve stable space for battle readings');

assert.match(responsiveSurfaces,
  /body\[data-cot-height='short'\] \.cot-set-body\{min-height:0;flex:1 1 auto\}/,
  'short landscape settings must shrink their scroll body so the action footer stays on-screen');
assert.match(settings,
  /const touchLayout = !!\(input\.isTouchLayout[\s\S]*touchLayout \? t\('settings\.aim\.touch'\) : t\('settings\.aim\.mouse'\)/,
  'touch settings must show touch aiming language');
// item 259: the mouse-only Right click mode is on Controls (hidden on touch) and Accessibility's link to it is mouse-only
assert.match(settings, /if \(input\.isTouchLayout && input\.isTouchLayout\(\)\) \{\s*activeTab = 'gameplay';[\s\S]{0,240}tb\.hidden = true;/,
  'touch settings hide the Controls tab');
assert.match(settings, /if \(def\.id === 'freeCamera'\) rmbModeRow\(card\);/, 'the Right click mode lives on Controls');
assert.match(settings, /if \(!\(input\.isTouchLayout && input\.isTouchLayout\(\)\)\) \{\s*const rmbLink/,
  'and touch settings omit the mouse-only RMB link');
assert.match(settings,
  /body\.cot-touch-layout \.cot-settings button\{min-height:44px;\}[\s\S]*\.cot-set-close\{width:44px;height:44px;\}/,
  'touch settings controls must retain a 44 px finger-target floor');
assert.match(settings,
  /range\.setAttribute\('aria-label', label\)[\s\S]*num\.setAttribute\('aria-label', t\('settings\.valueAria', \{ label \}\)\)/,
  'settings sliders and exact-value fields must expose their visible labels to assistive technology');
assert.match(touch,
  /root\.setAttribute\('role', 'group'\)[\s\S]*aimLayer\.setAttribute\('role', 'group'\)[\s\S]*role="group" aria-label="\$\{t\('touch\.aimHint'\)\}"[\s\S]*role="toolbar" aria-label="\$\{t\('touch\.toolbar'\)\}"[\s\S]*role="group" aria-label="\$\{t\('touch\.joystick'\)\}"/,
  'touch HUD labels must sit on semantic roles that expose them without prohibited ARIA');
assert.match(hud,
  /driveEl\.setAttribute\('role', 'status'\)[\s\S]*driveEl\.setAttribute\('aria-label', t\('hud\.drive\.aria'\)\)/,
  'the shared analog speedometer must expose its live status semantics on every input mode');

assert.doesNotMatch(playMenu, /<select data-control="(?:map|team|size)"/,
  "live room controls must use the kit's controls instead of browser-native selects");
assert.match(playMenu, /menu-select menu-select--vehicle[^>]*data-control="vehicle"[\s\S]*aria-controls="cot-room-vehicle-pick"/,
  "ready-up's vehicle trigger must control the picker that holds the production vehicle roster");
assert.match(playMenu, /vehicleSelect\.addEventListener\('change',[\s\S]*type: 'select_vehicle'[\s\S]*type: 'select_equipment'[\s\S]*type: 'select_camo'/,
  'in-lobby tank changes must submit the complete vehicle loadout');
const showCurrentRoomBody = playMenu.match(
  /function showCurrentRoom\(\): boolean \{([\s\S]*?)\n  \}\n  function syncGarageSelection/,
)?.[1] || '';
assert.ok(showCurrentRoomBody, 'the current-room presentation body remains inspectable');
assert.doesNotMatch(showCurrentRoomBody, /syncGarageSelection\(\)/,
  'reopening a room must not overwrite its retained map or tank with stale Garage state');
// (2026-10-26, INTERACTION-REDESIGN part A) the battlefield trigger opens the kit's battlefield picker in the room's
// flow: its cards are the whole roster, and they reflow to the space (components.css, the .cot-bf container queries)
assert.match(playMenu, /menu-select menu-select--map[^>]*data-control="map"[\s\S]*aria-controls="cot-room-bf"[\s\S]*id="cot-room-bf"/,
  'the battlefield trigger must control the picker that holds the complete map roster');
assert.match(playMenu, /createBattlefieldPicker\(battlefieldPick,/,
  "the room's battlefield picker must be the kit's battlefield picker");
assert.doesNotMatch(`${playMenu}\n${responsiveSurfaces}`, /menu-select--map \.menu-select-list/,
  'no rules remain for the retired battlefield list');
// the room's small settings (battle format, deployment) are the kit's segmented control, disabled the native way
assert.match(playMenu, /segmented\(\{ label: t\('playMenu\.deployment'\)[^\n]*className: 'room-team'/,
  "the deployment must be the kit's segmented control");
assert.match(playMenu, /function bindSegmentedSetting[\s\S]*?for \(const option of options\) option\.disabled = disabled/,
  'a guest or a ready seat must find the segmented settings natively disabled');
assert.match(playMenu, /createPicker\(vehiclePick, \{\s*id: 'rooms-tank'/,
  "the room's vehicle must be the kit's picker, with the fleet's search and nation chips");
assert.match(playMenu, /Object\.defineProperty\(vehicleSelect, 'disabled',[\s\S]*vehicleTrigger\.disabled = disabled/,
  "the vehicle trigger must preserve native disabled semantics for guests and ready states");
assert.match(publicNav, /\.public-nav__tools>\.public-nav__lang,\.public-nav__tools>\.public-nav__icon-link\{display:none\}/,
  'the phone bar keeps the mark, Play and the menu; language and source move into the menu sheet');

// (2026-10-17, BUI-F1) the network status banner and diagnostics panel left the tree with the multiplayer cutover
// (stage B, 509170998): their responsive overrides went with the boot CSS they no longer styled.
assert.doesNotMatch(responsiveSurfaces, /\.cot-network-(?:status|diagnostics)\b|\.cot-info-popover\b/,
  'boot CSS carries no rules for surfaces that no longer exist');
assert.match(responsiveSurfaces,
  /body\[data-cot-width\] \.cot-trans \.core\{width:min\(680px,100%\)[\s\S]*body\[data-cot-width='phone'\] \.cot-trans \.title/,
  'state transitions must cap their core and recompose long titles on phones');
assert.match(responsiveSurfaces,
  /body\[data-cot-width\] \.cot-resume \.rz-title\{max-width:100%;overflow-wrap:anywhere[\s\S]*body\[data-cot-width='phone'\] \.cot-resume \.rz-actions\{display:grid;grid-template-columns:1fr/,
  'the pause veil keeps its title within phone width and stacks its buttons');
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
  /body\[data-cot-width='phone'\] \.cot-set-tab\{flex:0 0 auto;padding-inline:4px;font-size:max\(13px,var\(--fs-13\)\)/,
  'phone Settings tabs size to their labels (never squeezed under them)');
assert.match(responsiveSurfaces, /body\[data-cot-width='phone'\] \.cot-set-tabs\{gap:0;justify-content:space-between\}/,
  'phone Settings tabs share the spare width between them, so a short label keeps a short underline (gauntlet 250)');
assert.doesNotMatch(responsiveSurfaces, /body\[data-cot-width='phone'\] \.cot-set-tabs\{overflow-x:hidden\}/,
  'a tab row wider than the phone scrolls instead of clipping a label');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] #cot-diag\{[\s\S]*max-height:62dvh!important;overflow:auto!important/,
  'the compatibility diagnostics panel must stay bounded and scrollable on phones');
assert.match(responsiveSurfaces,
  /body\[data-cot-width='phone'\] #cot-ctxlost h2\{[\s\S]*overflow-wrap:anywhere/,
  'the graphics recovery title must reflow without overflowing small screens');
assert.match(gallery, /\.cot-c-notices\.gallery-notices\{[^}]*width:min\(420px,calc\(100% - 24px\)\)/,
  'Gallery feedback notices must be viewport-bounded');
// the Field Manual's notices are the kit's (components/notices.css): a region bounded to the viewport, text that wraps
assert.match(docs, /@import url\('\.\.\/ui\/components\/notices\.css'\);/, 'the Field Manual loads the kit\'s notices');
assert.match(await readFile(new URL('./components/notices.css', import.meta.url), 'utf8'),
  /\.cot-c-notices\{[^}]*width:min\(420px,calc\(100vw - 32px\)\)/, 'notices are viewport-bounded');

for (const [source, pattern, label] of [
  [transition, /\.cot-trans\{position:fixed/, 'state transition'],
  [perfHud, /el\.id = 'cot-perfhud'/, 'performance dashboard'],
  [deviceDiag, /el\.id = 'cot-diag'/, 'compatibility diagnostics'],
  [renderer, /el\.id = 'cot-ctxlost'/, 'graphics recovery'],
  [pointerLockFeedback, /notices = lazyBattleNotices,/, 'pointer-lock fallback'],
]) assert.match(source, pattern, `${label} surface must remain present while responsive composition owns its geometry`);

// The public pages lay out at first paint, before or without JavaScript (brand-ui SPEC §5.5): their stylesheets read
// media queries at responsiveLayout.ts's band edges instead of the body[data-cot-*] hooks the boot module writes.
for (const relativePath of [
  '../gallery/gallery.css',
  '../presentation/mediaArchive.css',
  '../presentation/publicNav.css',
  '../docs/docs.css',
  '../docs/chapters.css',
  '../presentation/home.css',
]) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.deepEqual(viewportQueryViolations(source, relativePath), [], `${relativePath} keeps the one viewport contract at first paint`);
}
const semanticSurfaceFiles = [
  '../game/killcam.ts',
  '../presentation/publicPages.ts',
  '../docs/battleReels.ts',
  '../../index.html',
  './battleLoad.ts',
  './contextInfo.ts',
  './endScreen.ts',
  './garage.ts',
  './garage.css',
  './hud.ts',
  './playMenu.ts',
  './multiplayerStatus.ts',
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
    /@media[^{\n]*(?:max-width|min-width|orientation|max-height|min-height)|matchMedia\([^\n]*(?:max-width|min-width|orientation|max-height|min-height)/,
    `${relativePath} must not reintroduce an independent device-layout breakpoint`);
}

console.log('mobile responsive layout contracts: PASS');
