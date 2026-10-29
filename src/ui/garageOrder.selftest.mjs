import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compareCountryThenTierThenName, countryFilterGroups, createGarageCountrySelectionMemory,
  defaultGarageMapId, GARAGE_LEADING_VEHICLE_IDS, GARAGE_LEADING_VEHICLE_IDS_BY_NATION,
  horizontalRailEndPad, horizontalRailState, horizontalRailWheelDelta, settledRailEndPad,
} from './garageOrder.ts';

const garageSource = `${await readFile(new URL('./garage.ts', import.meta.url), 'utf8')}\n${
  await readFile(new URL('./garage.css', import.meta.url), 'utf8')
}`;

assert.match(garageSource,
  /\.cot-card \.ti\{[^}]*width:140px;height:88px;[^}]*--cot-thumb-scale,1\.22[^}]*\}/,
  'every garage vehicle card lifts and enlarges its shared tank portrait');
assert.match(garageSource,
  /body\[data-cot-panels='overlay'\] \.cot-card \.ti\{[^}]*width:98px;height:52px;[^}]*--cot-thumb-scale,1\.2[^}]*\}/,
  'compact garage cards preserve the lifted, enlarged portrait treatment');
assert.match(garageSource,
  /\.cot-card \.ti\{[^}]*width:140px;height:88px;[^}]*opacity:0;[^}]*transition:opacity[^}]*\}/,
  'tank portraits reserve their final card footprint while load and normalization stay hidden');
assert.match(garageSource,
  /\.cot-card \.ti\[data-cot-portrait-ready='true'\]\{opacity:1;\}/,
  'tank portraits fade in only after their final normalized frame is ready');
assert.match(garageSource,
  /const cardsByCountry = new Map<string, HTMLElement\[\]>\(\);/,
  'nation switches update indexed card groups instead of rescanning the fleet');
assert.match(garageSource,
  /cardsEl\.animate\(\[\{ opacity: 0\.76 \}, \{ opacity: 1 \}\]/,
  'nation switches create one strip animation instead of one animation per vehicle');
assert.match(garageSource,
  /const previousCard = cardById\.get\(previousSelectedId\);[\s\S]*?previousCard\?\.classList\.remove\('sel'\);[\s\S]*?card\?\.classList\.add\('sel'\);/,
  'selection updates only the previous and next cards');
assert.match(garageSource,
  /previousCard\?\.setAttribute\('aria-selected', 'false'\);[\s\S]*?card\?\.setAttribute\('aria-selected', 'true'\);[\s\S]*?aria-activedescendant/,
  'selection keeps the focusable vehicle catalog accessibility state synchronized');
assert.match(garageSource, /t\('garage\.dossier\.shell\.carried', \{ n: shellAmmunitionCapacity\(shell\) \}\)/,
  'the dossier exposes authoritative per-channel ammunition capacity');
// The 245 redesign: the equipment, the paint and the acts live in the band under the name in every layout; the readout
// holds the stations' figures and never scrolls; the battle card shows the battlefield it deploys to.
const showroomSource = await readFile(new URL('./showroom.css', import.meta.url), 'utf8');
assert.match(garageSource, /loadoutEl\.innerHTML = equipmentSlots\(eqIds\);[\s\S]*?statsEl\.innerHTML =\s*technicalSection\.replace\([^)]*\) \+\s*overviewSection\(/,
  'the slots render into the band, and the readout opens with the technical drawing and the overview');
assert.doesNotMatch(garageSource, /cot-loadout-section/, 'the readout carries no second copy of the equipment slots');
assert.match(garageSource,
  /<section class="cot-lower-third"><div class="cot-lt-head"[^`]*`[\s\S]*?<div class="cot-lt-band"><div class="cot-lt-group"><span class="cot-lt-cap"[^>]*>\$\{t\('garage\.band\.equipment'\)\}<\/span>`[\s\S]*?<div class="cot-lt-loadout eqrow"[\s\S]*?<span class="cot-lt-cap"[^>]*>\$\{t\('garage\.band\.paint'\)\}<\/span>`[\s\S]*?<div class="cot-lt-paint"[\s\S]*?<div class="cot-lt-acts">/,
  'the band under the name holds the slots, then the paint, then the acts');
assert.match(garageSource, /const GARAGE_STATIONS = Object\.freeze\(\[\s*\['overview', 'performance'\], \['firepower', 'gun'\], \['mobility', 'speed'\],\s*\['protection', 'shield'\], \['crew', 'crew'\],\s*\] as const\);/,
  'the readout has five stations; the paint left them for the band');
assert.match(garageSource, /\/\^Digit\(\[1-5\]\)\$\//, 'the station keys run 1 to 5');
// the stage's callouts wait for their act (owner 10-24): off by default, the module loads at the first press, and a frame
// does nothing while they are off
assert.match(garageSource, /data-lt-callouts aria-pressed="false"/, 'the callouts act starts unpressed');
// owner 10-24 ("change the vs ... label and show the clips"): the rival waits for a Compare chip, every act and empty
// slot carries a visible label, and a clip- or salvo-fed gun shows its rounds per clip and their interval
assert.match(garageSource, /let compareOn = false;[\s\S]*?const rival = compareOn \? rivalFor\(spec\) : null;/,
  'the rival and its deltas appear only once Compare is on');
assert.match(garageSource, /class="cot-c-chip cot-compare-toggle" data-compare="\$\{compareOn \? 'on' : 'off'\}"/,
  'Compare is a chip that reads Clear once on, an action with no pressed state');
const ltActs = garageSource.match(/<div class="cot-lt-acts">[\s\S]*?<\/div><\/div><\/section>/)?.[0] || '';
assert.equal((ltActs.match(/class="cot-c-btn cot-lt-act"/g) || []).length, 4, 'the band has four acts');
assert.equal((ltActs.match(/<span>\$\{t\('garage\.(?:act|photo)\.[a-zA-Z]+'\)\}<\/span><\/button>/g) || []).length, 4,
  'each act carries a visible label');
assert.match(garageSource, /<span class="plus" aria-hidden="true">\+<\/span><span class="sl">\$\{t\('garage\.equipment\.empty\.name'\)\}<\/span>/,
  'an empty slot is labelled');
assert.equal((garageSource.match(/magazineFigures\(spec\.gun, eqM\.reload\)/g) || []).length, 2,
  'the magazine figures show in the overview and the firepower station');
assert.match(garageSource, /frameHotspots\(camera, model\) \{\s*noteHeroModel\(model\);\s*if \(!calloutsShown \|\| !hotspots\) return;/,
  'no frame projects the callouts while they are off');
assert.doesNotMatch(garageSource, /\n  loadHotspots\(\);/, 'the hotspot module never loads before the act');
assert.match(garageSource, /e\.code === 'KeyI' && document\.body\.dataset\.cotPanels === 'persistent'/, 'I toggles the callouts on the docked stage');
assert.match(garageSource, /aria-orientation="horizontal"/, 'the station tabs are one horizontal row');
assert.match(garageSource, /function fitReadout\(force = false\): void \{[\s\S]*?while \(density < READOUT_DENSITY\.length - 1 && statsEl\.scrollHeight > statsEl\.clientHeight \+ 1\) statsEl\.dataset\.density = READOUT_DENSITY\[\+\+density\];/,
  'the readout steps from roomy through its densities until the station fits');
assert.match(garageSource, /activateTechnicalTab\(view\);\s*queueReadoutFit\(false, true\);/,
  'a station change refits the readout and returns it to its top in the frame, not in the press');
assert.match(garageSource, /else queueReadoutFit\(false, vehicleChanged\);\s*requestAnimationFrame\(syncScrollFades\);/,
  'a tank change refits the readout (and a new tank returns it to its top) in the frame, not in the press');
assert.match(garageSource, /fitReadout\(forced\);\s*if \(reset\) statsEl\.scrollTop = 0;/,
  'the readout\'s scroll reset shares the fit\'s layout (click-perf-248: a scroll write in the press laid the Garage out)');
assert.doesNotMatch(garageSource, /if \(vehicleChanged\) statsEl\.scrollTop = 0;/, 'no scroll write in a tank switch\'s press');
// a folded layout's switch builds the overview's figures only; the dossier builds when it opens or the window unfolds
assert.match(garageSource, /if \(dossierFolded\(\)\) \{\s*statsEl\.innerHTML = overviewSection\(spec, eqM, shells\);[\s\S]*?dossierStale = true;/,
  'a folded switch leaves the hidden dossier for its press (click-perf-248)');
assert.match(garageSource, /if \(next === 'equipment'\) renderStaleDossier\(\);/, 'opening the dossier builds it');
assert.match(garageSource, /renderStaleDossier\(\);\s*fitReadout\(forced\);/, 'an unfolded window builds the dossier before its fit');
assert.match(garageSource, /requestAnimationFrame\(\(\) => \{ cardsEl\.scrollLeft = 0; \}\);/,
  'a nation switch returns the strip to its start in the frame, not in the press');
assert.match(garageSource, /const key = `\$\{station\}\|\$\{statsFor\}\|\$\{window\.innerWidth\}x\$\{window\.innerHeight\}`;/,
  'a station, tank and window fitted before take their density from memory');
assert.match(garageSource, /statsEl\.addEventListener\('load', \(\) => queueReadoutFit\(true\), true\);/, 'the technical drawing refits the readout as it loads');
// click-perf-244 carried into the redesign: one layout per selection, the catalog painted only while it shows
assert.match(garageSource, /requestAnimationFrame\(\(\) => \{\s*if \(selectedId === specId\) card\.scrollIntoView\(/,
  'the selected card is revealed in the frame, after the dossier rebuild, not before it');
assert.match(garageSource, /if \(openGaragePanel\(\) !== 'appearance'\) return;\s*camoPicker\?\.setTank\(selectedId, spec\.nation, selectedPatternId\);/,
  "the camo picker paints this tank's swatches only while every paint is open");
assert.match(garageSource, /if \(next === 'appearance' && previous !== next\) \{\s*refreshCamoSel\(\);[^}]*requestAnimationFrame\(\(\) => fitCamoRows\(\)\);\s*\}/, 'opening every paint repaints the catalog it left');
assert.doesNotMatch(garageSource, /compactCamoPreviews\.forEach/, 'the hidden tool cards no longer repaint their canvases');
assert.match(showroomSource, /body\[data-cot-panels='persistent'\]\[data-cot-width\] \.cot-garage \.stats\{[^}]*overflow:hidden;\}/,
  'the docked readout never scrolls');
for (const density of ['roomy', '1', '2', '3', 'bars', '4', '5']) assert.match(showroomSource, new RegExp(`\\.stats\\[data-density~='${density}'\\]`),
  `the readout's density ${density} has its rules`);
assert.match(garageSource, /const READOUT_DENSITY = Object\.freeze\(\['roomy', '0', '1', '1 2', '1 2 3', '1 2 3 bars', '1 2 3 bars 4', '1 2 3 bars 4 5'\]\);/,
  'each density carries the lighter ones as tokens, so a rule names the lightest density it belongs to');
assert.match(showroomSource, /\.stats\[data-density~='4'\] :is\(\.cot-stat-section:not\(\.cot-primary\)/, 'the densest readout keeps each station\'s first plate');
assert.equal((garageSource.match(/cot-stat-section[^"]*cot-primary/g) || []).length, 5, 'each of the five stations marks one first plate');
assert.match(garageSource, /const floor = sideways \? countryRailEl\.getBoundingClientRect\(\) : head;/,
  'a phone\'s stage ends at the fleet on its side and at the name held upright');
assert.match(garageSource, /const floor = band && band\.height \? band\.top - 10/, 'the docked free stage ends at the band');
assert.match(garageSource, /const above = head && head\.height \? stageRect\(x0, y0, x1, head\.top - 12\) : null;/,
  'the docked hero stands above the name (or beside it), never under it');
assert.match(garageSource, /data-deploy-pic aria-hidden="true"/, 'the battle card carries the battlefield picture');
assert.match(garageSource, /deployPic\.style\.backgroundImage = selected\.id !== 'random' && selected\.thumb \?/,
  'the battle card draws the battlefield\'s 512 px still, never its 4K hero');
assert.match(garageSource, /const BAND_PAINT_PICKS: readonly string\[\] = Object\.freeze\(\['factory', 'auto',/,
  'the band keeps the service coat among its quick paints');
assert.match(garageSource, /panel && \(isOverlayPanelLayout\(\) \|\| panel === 'appearance'\)/, 'every paint opens on a docked layout too');
// every paint is a transient surface (components/surfaceStack.ts): the stack's outside press closes it
assert.match(garageSource, /owns: \(node\) => node instanceof Element && !!node\.closest\(`button\[data-garage-panel="\$\{panel\}"\]`\)/,
  'a press outside every paint closes it (the root carries the panel attribute too, so only its button is exempt)');
assert.match(garageSource,
  /<button type="button" class="eqslot"[\s\S]*<button type="button" class="eqslot empty"/,
  'equipment slots must remain native keyboard-operable controls');
assert.match(garageSource,
  /class="cot-compact-equipment-trigger"[\s\S]*aria-label="\$\{t\('garage\.dossier\.vehicleDossier'\)\}"/,
  'compact dossier affordance labels its selected-tank details action');
assert.match(garageSource,
  /target\?\.closest<HTMLButtonElement>\('\.cot-compact-equipment-trigger, \.cot-overview-more, \.cot-dossier-close'\)[\s\S]*const closing = openGaragePanel\(\) === 'equipment'[\s\S]*setGaragePanel\(closing/,
  'the compact dossier affordance and the folded figures\' more button open the selected tank\'s dossier, and its sheet\'s close shuts it');
assert.match(garageSource,
  /\.cot-card \.nm\{position:absolute;z-index:3;left:var\(--hc-pad\);right:var\(--hc-pad\);bottom:calc\(var\(--hc-pad\) \* 0\.8\);[^}]*white-space:normal;/,
  'tank titles sit on the card padding as a stable bottom inset and wrap instead of truncating');
assert.doesNotMatch(garageSource, /\.cot-card \.nm\{[^}]*text-overflow:ellipsis/, 'tank titles are never truncated');
assert.match(garageSource,
  /const reopening = !firstPresentation && !api\.isOpen;[\s\S]*?if \(reopening\) \{[\s\S]*?classList\.add\('enter'\)/,
  'Garage entrance motion is reserved for later reopens instead of replaying under first boot');
assert.match(garageSource,
  /\.cot-garage\.awaiting-boot\{visibility:hidden;\}/,
  'first-visit Garage construction stays hidden until the boot surface begins its fade');
assert.match(garageSource, /document\.addEventListener\('cot:boot-dismiss'/,
  'Garage listens for the boot fade before revealing first-visit chrome');
assert.match(garageSource,
  /Promise\.all\(\[import\('\.\/heroCard\.ts'\), import\('\.\/heroCard\.css'\)\]\)[\s\S]*?mountRosterHeroCards\(cardsEl, cardById, selectedId, \(id\) => legacyPortraits\(\[id\]\)\)[\s\S]*?\.then\(legacyPortraits, \(\) => legacyPortraits\(\[\.\.\.cardById\.keys\(\)\]\)\)/,
  'garage cards take their hero layers from the lazy hero chunk and keep the packaged portrait when it is unavailable');
assert.match(garageSource,
  /<span class="hc-tier" aria-hidden="true">\$\{tierChipHTML\(tier\)\}<\/span>/,
  'garage cards show the tier as a "Tier X" chip');
assert.match(garageSource, /t\('garage\.card\.aria', \{ tier, name: displayName, nation: nationName \}\)/,
  'the card label carries tier, name and nation (the nation is shown only as the flag)');
assert.doesNotMatch(garageSource, /class="card-era"/, 'garage cards carry no era eyebrow (owner UI rules, 2026-10-17)');
assert.doesNotMatch(garageSource,
  /class="designation">\$\{s\.markings\?\.designation/,
  'garage cards do not expose technical marking identifiers as UI metadata');

const rank = new Map([
  ['USA', 0], ['USSR', 1], ['USSR/Russia', 1], ['Russia', 1], ['UK', 2],
]);
const tiers = new Map([
  ['challenger', 8], ['t72bu_1989', 8], ['m1a1_abrams_hc', 10], ['t90_1992', 9],
  ['t72b3m_2022', 9], ['m1a1', 9],
]);
const tierOf = (id) => tiers.get(id) ?? 6;
const cards = [
  { id: 'challenger', nation: 'UK', name: 'Challenger' },
  { id: 't72bu_1989', nation: 'USSR/Russia', name: 'T-72BU' },
  { id: 'm1a1_abrams_hc', nation: 'USA', name: 'M1A2 Abrams' },
  { id: 't90_1992', nation: 'Russia', name: 'T-90' },
  { id: 't72b3m_2022', nation: 'Russia', name: 'T-72B3M obr. 2022' },
  { id: 'm1a1', nation: 'USA', name: 'M1A1 Abrams' },
];

assert.deepEqual(
  cards.sort((a, b) => compareCountryThenTierThenName(a, b, rank, tierOf)).map((card) => card.id),
  ['m1a1_abrams_hc', 'm1a1', 't90_1992', 't72b3m_2022', 't72bu_1989', 'challenger'],
  'garage cards sort by country first, then descending tier and display name',
);

const usTopRun = [
  'm1a2_abrams', 'm3a3_bradley', 'm1a2_abrams_sepv2', 'm1a3', 'griffin50mm',
  'm1a2_abrams_tusk', 'abramsx', 'm551a1_tts', 'm1a2_abrams_sepv3', 'griffin_viper', 'm6_linebacker',
].map(id => ({ id, nation: 'USA', name: id }));
assert.deepEqual(
  usTopRun.sort((a, b) => compareCountryThenTierThenName(a, b, rank, () => 10))
    .map(card => card.id),
  ['m1a3', 'm1a2_abrams_sepv3', 'm1a2_abrams_sepv2', 'm1a2_abrams_tusk', 'abramsx', 'm551a1_tts', 'm6_linebacker', 'griffin50mm', 'griffin_viper', 'm3a3_bradley', 'm1a2_abrams'],
  'the American showcase preserves the Abrams leaders, then follows the owner’s October 4 order',
);

const nationalShowcaseCases = [
  {
    nation: 'Japan', filler: 'type90a',
    // owner 2026-10-22: the Type 10 Kaitaku (type10_dozer) leads Japan
    expected: ['type10_dozer', 'type10', 'type10b', 'raiju_ifv', 'type89', 'type90'],
  },
  {
    nation: 'Sweden', filler: 'strv81',
    expected: ['strv122', 'cv90_mk4', 'strv103b', 'strv121', 'cv90_mk4_concept', 'cv90', 'cv9040c'],
  },
  {
    nation: 'Germany', filler: 'leo2a4',
    // owner 2026-09-16: Panther, 2A7V, Revolution, 2A6M, 2A6, 2A5M, 2A5, KF51 EVO, KF51-U, Puma S1, MBT-70, then the rest
    expected: [
      'kf51_panther', 'leo2a7v', 'leo2_revolution', 'leo2a6m', 'leo2a6', 'leo2a5m', 'leo2a5',
      'kf41_lynx', 'kf51_evo', 'kf51_u', 'puma_s1', 'spz_wotan', 'marder2', 'mbt70', 'leo2_improved',
    ],
  },
  {
    nation: 'China', filler: 'unlisted_chinese_vehicle',
    // release 264: the Longwei family after its hosts (the Qinglong and Baihu after the ZTZ-99A, the Zhuque and Xuanwu after the Yun)
    expected: ['vt4a1', 'ztz99a2', 'ztz99a', 'ztz99a2_qinglong', 'vt4a1_baihu', 't72b3_qilin', 't72b3m_kunlun', 't80u_yun', 't72b3_zhuque', 't72b3m_xuanwu', 'type96b', 'type96_80_feng', 'type96_72m_lei', 'aft10', 'ztz20', 'ztz20_prototype', 'ztz100', 'type100', 'ztz100_prototype', 'type96_72_long', 'ztz99_longwei', 'ztz85_iii', 'type59'],
  },
  {
    nation: 'Russia', filler: 't90m_proryv',
    expected: ['t90m', 't90sm', 't90ms_tagil', 't90a_burlak', 't14_armata', 't80u_bars_m', 't72b3m_bulat_m', 't72b3_bastion_m', 'kurganets25', 'bmp3m_dragun125', 't90a_vladimir', 't90a', 'object695', 'tos1a_tagil', 'object148_proto', 't90ms_2011'],
  },
  {
    nation: 'USSR/Russia', filler: 't90a_burlak_proto',
    expected: ['t90', 't80u', 't72bu', 't72b_1987', 't62mv1'],
  },
  {
    nation: 'UK', filler: 'challenger3_proto',
    // 2026-10-13 (VEH-11): the tier-X Warrior TES(H) follows the Challenger 3.
    expected: ['challenger3', 'warrior_tes_h', 'challenger1_mk3', 'chieftain_mk10', 'chieftain5'],
  },
  {
    nation: 'France', filler: 'leclerc_s2',
    expected: ['leclerc_xlr', 'amx56', 'amx40', 'amx30b'],
  },
];

for (const { nation, filler, expected } of nationalShowcaseCases) {
  assert.deepEqual(
    GARAGE_LEADING_VEHICLE_IDS_BY_NATION[nation],
    expected,
    `${nation} publishes its reversed owner-directed left-edge run`,
  );
  const shuffled = [
    { id: expected.at(-1), nation, name: expected.at(-1) },
    { id: filler, nation, name: filler },
    ...expected.slice(0, -1).reverse().map((id) => ({ id, nation, name: id })),
  ];
  const sorted = shuffled.sort((a, b) => (
    compareCountryThenTierThenName(a, b, rank, () => 10)
  ));
  assert.deepEqual(
    sorted.slice(0, expected.length).map((card) => card.id),
    expected,
    `${nation} keeps its requested hero tanks in exact reversed left-edge order`,
  );
}

assert.equal(
  new Set(GARAGE_LEADING_VEHICLE_IDS).size,
  GARAGE_LEADING_VEHICLE_IDS.length,
  'national showcase runs do not duplicate a tank across countries',
);

assert.deepEqual(
  [
    { id: 'leo2a4_v', nation: 'Germany', name: 'Leopard 2A5' },
    { id: 'spz_wotan', nation: 'Germany', name: 'Puma S1' },
    { id: 'kf51_u', nation: 'Germany', name: 'KF51B' },
  ].sort((a, b) => compareCountryThenTierThenName(
    a, b, rank, (id) => id === 'leo2a4_v' ? 9 : 10,
  )).map((spec) => spec.id),
  ['kf51_u', 'spz_wotan', 'leo2a4_v'],
  'descending tier remains authoritative even when a lower-tier tank belongs to a hero run',
);


// The requested China order deliberately crosses tiers; reverse input and
// duplicate public names must not change it or lose stable selection IDs.
const chineseRun = nationalShowcaseCases.find(row => row.nation === 'China').expected;
assert.deepEqual(chineseRun.toReversed().map(id => ({id, nation:'China', name:'same'}))
 .sort((a,b) => compareCountryThenTierThenName(a,b,rank,id => id === 'ztz99a' ? 9 : 10))
 .map(row => row.id), chineseRun);
const polishRun = ['t72b3_zubr','pl01','t80u_husarz','pl01_105','t72b3_zubr_ii']
 .map(id => ({id,nation:'Poland',name:id}));
assert.deepEqual(polishRun.sort((a,b) => compareCountryThenTierThenName(a,b,rank,() => 10))
 .slice(0,2).map(row=>row.id), ['pl01_105','pl01']);
const mixedRussian = ['t90ms_2011','t80u_bars_m','t72b3m_bulat_m','t72b3_bastion_m','object148_proto','t90ms_tagil','t90']
 .map((id,i) => ({id, nation: i % 2 ? 'Russia' : 'USSR/Russia', name:id}));
const compareRussian = (a,b) => compareCountryThenTierThenName(a,b,rank,() => 10);
for (const a of mixedRussian) for (const b of mixedRussian) {
 assert.equal(Math.sign(compareRussian(a,b))+Math.sign(compareRussian(b,a)),0,'shared flag comparator is antisymmetric');
}
const russianOrder = mixedRussian.toSorted(compareRussian).map(row=>row.id);
for (const id of ['t80u_bars_m','t72b3m_bulat_m','t72b3_bastion_m','object148_proto'])
 assert.ok(russianOrder.indexOf(id)<russianOrder.indexOf('t90ms_2011'), `${id} precedes T-90MS`);
assert.deepEqual(mixedRussian.toReversed().sort(compareRussian).map(row=>row.id),russianOrder);

let storedSelections = null;
const selectionStorage = {
  getItem: () => storedSelections,
  setItem: (_key, value) => { storedSelections = value; },
};
const selectionSpecs = [
  { id: 'jp_left', nation: 'Japan' },
  { id: 'jp_other', nation: 'Japan' },
  { id: 'se_left', nation: 'Sweden' },
];
const selectionCountryCode = (spec) => spec.nation === 'Japan' ? 'jp' : 'se';
const selectionMemory = createGarageCountrySelectionMemory(
  selectionSpecs, selectionCountryCode, { getStorage: () => selectionStorage },
);
assert.equal(selectionMemory.preferredSpec('jp')?.id, 'jp_left',
  'a nation without history defaults to its leftmost sorted vehicle');
assert.equal(selectionMemory.remember('jp_other'), true,
  'a visible vehicle can become its nation-specific remembered choice');
assert.deepEqual(JSON.parse(storedSelections), { jp: 'jp_other' },
  'nation-specific selection is persisted without changing other nations');
const restoredSelectionMemory = createGarageCountrySelectionMemory(
  selectionSpecs, selectionCountryCode, { getStorage: () => selectionStorage },
);
assert.equal(restoredSelectionMemory.preferredSpec('jp')?.id, 'jp_other',
  'a later Garage restores the last selected vehicle for that nation');
assert.equal(restoredSelectionMemory.preferredSpec('se')?.id, 'se_left',
  'an unvisited nation still opens at its independent left edge');

storedSelections = JSON.stringify({ jp: 'se_left', se: 'missing' });
const invalidSelectionMemory = createGarageCountrySelectionMemory(
  selectionSpecs, selectionCountryCode, { getStorage: () => selectionStorage },
);
assert.equal(invalidSelectionMemory.preferredSpec('jp')?.id, 'jp_left',
  'cross-country stored ids are rejected instead of leaking selection between nations');
assert.equal(invalidSelectionMemory.preferredSpec('se')?.id, 'se_left',
  'stale stored ids safely fall back to the current leftmost vehicle');

const combinedEras = [
  { id: 'm1a1_abrams_hc', nation: 'USA', era: 'modern' },
  { id: 'm4a3', nation: 'USA', era: 'ww2' },
  { id: 't90_1992', nation: 'Russia', era: 'modern' },
  { id: 't34', nation: 'USSR', era: 'ww2' },
];
const countryCode = (spec) => spec.nation === 'USA' ? 'us' : 'ru';
assert.deepEqual(
  countryFilterGroups(combinedEras, countryCode).map(({ id, count }) => [id, count]),
  [['us', 2], ['ru', 2]],
  'country filters combine modern, Cold War and WWII vehicles under one flag',
);

assert.equal(defaultGarageMapId([
  { id: 'verdant' }, { id: 'desert' }, { id: 'random' },
]), 'random', 'garage defaults to random even when it is not the first card');
assert.equal(defaultGarageMapId([{ id: 'verdant' }]), 'verdant',
  'a caller without a random option keeps its first concrete map');

const duplicateNames = [
  { id: 'variant_b', nation: 'Russia', name: 'T-72' },
  { id: 'variant_a', nation: 'Russia', name: 'T-72' },
];
assert.deepEqual(
  duplicateNames.sort((a, b) => compareCountryThenTierThenName(a, b, rank, tierOf)).map((card) => card.id),
  ['variant_b', 'variant_a'],
  'duplicate display names use a deterministic reversed id tie-break',
);

assert.deepEqual(horizontalRailState(0, 900, 400), {
  maxScroll: 500, hasLeft: false, hasRight: true,
}, 'country rail advertises only the right edge at its start');
assert.deepEqual(horizontalRailState(250, 900, 400), {
  maxScroll: 500, hasLeft: true, hasRight: true,
}, 'country rail advertises both edges in its middle');
assert.deepEqual(horizontalRailState(500, 900, 400), {
  maxScroll: 500, hasLeft: true, hasRight: false,
}, 'country rail advertises only the left edge at its end');
assert.deepEqual(horizontalRailState(20, 300, 400), {
  maxScroll: 0, hasLeft: false, hasRight: false,
}, 'a fitting country rail shows no false edge affordances');
assert.equal(horizontalRailEndPad(620, [0, 164, 328, 492, 656, 820]), 36,
  'a rail at its end rests on the next card start, not a sliver of the card before it');
assert.equal(horizontalRailEndPad(656, [0, 164, 328, 492, 656, 820]), 0,
  'a rail whose reach already lands on a card start needs no extra end');
assert.equal(horizontalRailEndPad(0, [0, 164]), 0, 'a fitting rail has no end padding');
// The rail settles (garage.ts settleRailEnd): its scrollWidth rounds to whole pixels while the pad does not. The 259
// Garage, the M1A1 selected at 1600x900 (content 3929.4 px in a 1106 px rail, the last stop at 2823.5): the raw pad flipped
// 0.5 px, none, 0.5 px on every layout; the settled one keeps the first and the rail measures once.
{
  const settle = (content, client, stops, keep) => {
    let extra = 0, key = null, writes = 0;
    for (let pass = 0; pass < 12; pass++) {
      const scrollWidth = Math.round(content + extra);
      const natural = scrollWidth - extra;
      if (key === `${client}|${natural}`) return { writes, settled: true };
      key = `${client}|${natural}`;
      const raw = horizontalRailEndPad(natural - client, stops);
      const pad = keep ? settledRailEndPad(extra, raw) : raw;
      if (pad !== extra) { extra = pad; writes++; }
    }
    return { writes, settled: false };
  };
  const stops = [0, 164.5, 329, 493.5, 658, 822.5, 2823.5];
  assert.equal(settle(3929.4, 1106, stops, false).settled, false, 'the raw pad flips on every layout (the loop)');
  assert.deepEqual(settle(3929.4, 1106, stops, true), { writes: 0, settled: true }, 'a sub-pixel pad is the rounding: kept');
  assert.deepEqual(settle(3700, 1106, [0, 164, 2620], true), { writes: 1, settled: true }, 'a real end pad is written once');
  assert.equal(settledRailEndPad(0, 0.5), 0);
  assert.equal(settledRailEndPad(0.5, 0), 0.5);
  assert.equal(settledRailEndPad(0, 36), 36, 'a pad a pixel or more away is written');
  assert.equal(settledRailEndPad(36, 0), 0, 'and so is its removal');
  assert.match(garageSource, /const pad = settledRailEndPad\(extra, horizontalRailEndPad\(natural - rail\.clientWidth, stops\)\);/,
    'the Garage settles each rail\'s end pad');
}
assert.equal(horizontalRailWheelDelta(4, 60), 60,
  'vertical mouse-wheel motion pans the horizontal country rail');
assert.equal(horizontalRailWheelDelta(-38, 6), -38,
  'native horizontal trackpad motion keeps its direction and magnitude');
assert.equal(horizontalRailWheelDelta(0, 3, 1), 60,
  'line-mode wheel motion is normalized to useful pixels');
assert.match(garageSource,
  /\.cot-country-chips\{[^}]*overflow-x:auto;[^}]*scrollbar-width:none;[^}]*\}/,
  'country selection keeps horizontal scrolling without a visible Firefox scrollbar');
assert.match(garageSource, /\.cot-country-chips::\-webkit-scrollbar\{display:none;\}/,
  'country selection hides its Chromium and Safari scrollbar');
assert.match(garageSource,
  /\.cot-country-chips\{[^}]*justify-content:safe center;[^}]*width:100%;[^}]*overflow-x:auto;/,
  'the complete country list centers when it fits while retaining honest overflow');
assert.doesNotMatch(garageSource, /cot-country-edge/,
  'the nations reach every flag without boxed arrows: the track fades at its ends (owner 10-25 via Main)');
assert.match(garageSource, /\.cot-country-rail\.has-more-right \.cot-country-chips\{-webkit-mask-image:/,
  'a nation track with more beyond its end fades there');
assert.match(garageSource, /\.cot-country-rail\{[^}]*left:50%;[^}]*transform:translateX\(-50%\);/,
  'the desktop nation rail is centered on the Garage stage');
assert.match(garageSource,
  /const preferred = countrySelection\.preferredSpec\(group\.id\);[\s\S]*?api\.setSelected\(preferred\.id\);/,
  'nation chips restore their remembered tank or choose the highest-tier left edge');
assert.match(garageSource, /if \(remember && cardById\.has\(specId\)\) countrySelection\.remember\(specId\);/,
  'visible Garage selections update independent per-nation memory');
assert.match(garageSource, /applySelection\(selectedId, \{ remember: false \}\);/,
  'hidden Garage construction cannot overwrite a persisted nation choice');
assert.match(garageSource,
  /card\.scrollIntoView\(\{ block: 'nearest', inline: 'center', behavior: 'auto' \}\);/,
  'vehicle selection reveals distant cards immediately instead of sweeping across the carousel');
assert.match(garageSource,
  /\.cot-cards\{[^}]*padding:var\(--s2\) calc\(var\(--s2\) \+ var\(--rail-end,0px\)\) 0 var\(--s2\);[^}]*scroll-padding-inline:var\(--s2\);[^}]*scroll-snap-type:x mandatory;/,
  'vehicle rails keep selected end cards inset from their clipping edges');
assert.doesNotMatch(garageSource, /\.cot-dossier-head\{[^}]*border-top:/,
  'the vehicle dossier header uses one consistent neutral border');
assert.doesNotMatch(garageSource, /\.cot-stat-section::before\{/,
  'dossier sections do not draw stray orange rules across their top edges');
assert.match(garageSource,
  /cot-technical-section[\s\S]*?cot-dossier-head[\s\S]*?role="tablist"[\s\S]*?data-technical-image/,
  'vehicle identity and generated technical diagrams share one garage dossier card');
assert.doesNotMatch(garageSource,
  /statSectionTitle\('gallery', 'Technical schematics'/,
  'the merged dossier does not repeat a technical-schematics header');
assert.doesNotMatch(garageSource,
  /cot-dossier-head[\s\S]*?Open in Tank Gallery/,
  'the vehicle header does not duplicate the technical Gallery action');
assert.match(garageSource,
  /class="cot-gallery-link cot-technical-gallery"[\s\S]*?t\('garage\.dossier\.inspectGallery'\)[\s\S]*?class="go"/,
  'the layer-specific Gallery action reuses the primary orange-accent CTA treatment');
assert.match(garageSource,
  /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\][\s\S]*?activateTechnicalTab/,
  'technical schematic tabs support standard keyboard navigation');
assert.match(garageSource,
  /\.cot-technical-figure img\{[^}]*aspect-ratio:2\/1;[^}]*object-fit:contain;/,
  'technical diagrams preserve their authored two-to-one frame at every dossier width');
assert.match(garageSource,
  /data-technical-expand[^]*?aria-haspopup="dialog"[^]*?aria-controls="cot-technical-viewer-dialog"/,
  'every compact technical diagram exposes an accessible expanded-view trigger');
assert.match(garageSource,
  /createModal\(\{[^]*?className: 'cot-technical-viewer'[^]*?data-technical-modal-view/,
  'the expanded schematic reuses the shared accessible modal and all three technical views');
assert.match(garageSource,
  /cot-technical-viewer-figure img\{[^}]*aspect-ratio:2\/1;[^}]*object-fit:contain;/,
  'expanded schematics preserve the authored two-to-one frame instead of cropping the diagram');
// the loading census 262: the drawing's box is 2:1 from the first paint (an auto width collapsed it, CLS 0.35), its tone
// stands under it, it fades in through the kit's reveal and loads again once the network is back
assert.match(garageSource, /\.cot-technical-viewer-figure img\{[^}]*width:min\(100%,calc\(var\(--tv-max-h\) \* 2\)\)/,
  'the expanded drawing holds its 2:1 box before its file arrives');
assert.match(garageSource, /\.cot-technical-viewer-figure::before\{[^}]*aspect-ratio:2\/1;[^}]*background:var\(--fill-quiet\)/,
  'a tone stands where the drawing will be');
assert.match(garageSource, /technicalModalImage\.src = iconUrl\([^;]+;[^]{0,120}?revealWhenReady\(technicalModalPanel, technicalModalImage\)/,
  'the drawing fades in through the kit\'s reveal');
assert.match(garageSource, /addEventListener\('online', \(\) => \{[^]{0,200}?data-failed[^]{0,80}?technicalModalImage\.src = src/,
  'a drawing the network dropped loads again once it is back');
// the loading census 264: a failed chunk is not asked for again in this document (Chrome 151 keeps a failed import and
// a failed modulepreload, 156 does not, and a failed chunk stylesheet never applies in either: components/loadFailure.ts),
// so the failure offers Reload page and its triggers keep a quiet error state that needs no chunk, their next press
// reloading the page once it is online
assert.match(garageSource, /const reportLoadFailure = [^]{0,200}?markLoadFailed\(triggers, text\);[^]{0,400}?actions: \[\{ label: t\('loadFailed\.reload'\), primary: true, keep: true, run: \(\) => \{ if \(navigator\.onLine !== false\) location\.reload\(\); \} \}\]/,
  'a failed surface marks its triggers (the kit\'s markLoadFailed) and offers Reload page');
assert.match(garageSource, /const reloadsForFailure = [^]{0,200}?if \(!pressFailed\(trigger\)\) return false;/,
  'a marked trigger\'s press reloads the page once it is online (the kit\'s pressFailed)');
assert.match(garageSource, /if \(recordOpening \|\| reloadsForFailure\(recordTrigger, 'cot-record-load'/, 'the Service Record\'s open reads its trigger\'s failure');
assert.match(garageSource, /if \(techTreeOpening \|\| reloadsForFailure\(techTreeTrigger, 'cot-techtree-load'/, 'the tech tree\'s open reads its trigger\'s failure');
assert.match(garageSource, /reportLoadFailure\('cot-techtree-load', t\('garage\.techTree\.loadError'\),\s*\[techTreeTrigger, root\.querySelector<HTMLElement>\('\[data-mobile-nav="techTree"\]'\)\]\)/,
  'the tech tree\'s failure marks the bar\'s trigger and the phone menu\'s');
assert.match(await readFile(new URL('./components/components.css', import.meta.url), 'utf8'),
  /\[data-load-state='error'\]::after\{[^}]*background:var\(--danger\)/, 'a failed trigger shows the kit\'s danger dot');
// the labels' overlay lays itself out only once its stylesheet stands (unstyled, it grew the dialog and snapped back), and
// a phone's drawing sheet stands at its full height (the key arriving in flow raised a content-sized sheet)
const labelsSource = await readFile(new URL('./technicalDiagramLabels.ts', import.meta.url), 'utf8');
assert.match(labelsSource, /const render = \(\): void => \{\s*if \(!styled\) return;/, 'the overlay does not lay out before its sheet');
assert.match(labelsSource, /void sheetReady\.then\(\(\) => \{ if \(disposed\) return; styled = true; render\(\); \}/,
  'the overlay lays out once its sheet stands, unless it was disposed');
assert.match(garageSource, /body\[data-cot-width='phone'\] \.cot-modal\.cot-technical-viewer\{height:calc\(var\(--cot-viewport-height,100dvh\) - 16px\)\}/,
  'a phone\'s drawing sheet stands at its full height from the press');

console.log('garageOrder.selftest: ordering, map default, filters, hidden horizontal rail and its settled end pad verified');
