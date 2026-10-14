import assert from 'node:assert/strict';

function installBrowser(search, { memory = 8, cores = 8 } = {}) {
  const storage = new Map();
  const session = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search }, localStorage,
      sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, String(value)), removeItem: key => session.delete(key) },
      matchMedia: () => ({ matches: false }),
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'Desktop', maxTouchPoints: 0,
      deviceMemory: memory, hardwareConcurrency: cores,
    },
  });
  return { storage, localStorage };
}

installBrowser('?tier=mobile');
const mobile = await import('./quality.ts?quality-mobile-contract');
assert.equal(mobile.resolveDeviceTier({ capabilities: { maxTextureSize: 8192 } }), 'mobile');
assert.equal(mobile.resolvePresetName(), 'mobile');
assert.equal(mobile.texSize(4096, 'vehicle'), 2048,
  'mobile vehicle textures retain their tier cap');
assert.equal(mobile.shouldReleaseInactivePhaseGpu(), true,
  'mobile devices release phase-exclusive GPU resources');
assert.deepEqual(mobile.MOBILE_PRESET_ORDER, ['mobile-ultralow', 'mobile-low', 'mobile', 'mobile-high']);

const desktopBrowser = installBrowser('?tier=desktop');
const desktop = await import('./quality.ts?quality-desktop-contract');
assert.equal(desktop.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } }), 'desktop');
assert.equal(desktop.resolvePresetName(), 'high');
assert.equal(desktop.shouldReleaseInactivePhaseGpu(), false,
  'normal desktops retain detached Garage resources for fast battle exits');
assert.equal(desktop.PRESETS.high.maxPixelRatio, 1.5);
// 2026-09-12 visual restoration: the 1049e4e preset table is back. Ultra runs
// 4K cascades (near, hero and mid) to 700 m with AO off, High 2K
// cascades to 700 m with AO off, Medium the stable 2K/1K layout at
// 520 m with AO off; Low keeps the near-field 380 m range and no AO.
// (Owner review the same afternoon: the interim 2K mid cascade / 600 m Medium
// range read as fuzzy shadows; both are back at the reference values.)
assert.deepEqual(desktop.PRESETS.ultra.shadowMapSizes, [4096, 4096, 4096, 2048], 'Ultra 4K near/hero/mid cascades, 2K far');
assert.equal(desktop.PRESETS.ultra.shadowMaxFar, 700, 'Ultra shadow range covers whole towns');
assert.equal(desktop.PRESETS.ultra.aoScale, 0, 'Ultra keeps ambient occlusion off');
assert.deepEqual(desktop.PRESETS.high.shadowMapSizes, [2048, 2048, 2048, 1024], 'High 2K cascades');
assert.equal(desktop.PRESETS.high.shadowMaxFar, 700, 'High shadow range covers whole towns');
assert.equal(desktop.PRESETS.high.aoScale, 0, 'High keeps ambient occlusion off');
assert.deepEqual(desktop.PRESETS.medium.shadowMapSizes, desktop.DESKTOP_SHADOW_MAP_SIZES,
  'Medium keeps the stable desktop shadow-map layout');
assert.equal(desktop.PRESETS.medium.shadowMaxFar, 520, 'Medium reference range');
assert.equal(desktop.PRESETS.medium.aoScale, 0, 'Medium keeps ambient occlusion off');
assert.deepEqual(desktop.PRESETS.low.shadowMapSizes, desktop.DESKTOP_SHADOW_MAP_SIZES,
  'Low keeps the stable desktop shadow-map allocation');
assert.equal(desktop.PRESETS.low.shadowMaxFar, 380,
  'Low concentrates the same shadow maps into the legacy near-field range');
assert.equal(desktop.PRESETS.low.aoScale, 0, 'Low stays AO-free');

let notified = null;
const unsubscribe = desktop.onPresetChange((preset) => { notified = preset.label; });
desktop.setPresetName('medium');
assert.equal(desktopBrowser.storage.get('cot.gfxPreset'), 'medium');
assert.equal(desktop.resolvePresetName(), 'medium');
assert.equal(notified, 'Medium');
assert.equal(unsubscribe(), true);
desktop.setPresetName('invalid');
assert.equal(desktop.resolvePresetName(), 'medium', 'invalid choices do not mutate quality');

const resetBrowser = installBrowser('?tier=desktop&gfxreset=1');
resetBrowser.localStorage.setItem('cot.gfxPreset', 'low');
resetBrowser.localStorage.setItem('cot.gfxMobilePreset', 'mobile-low');
resetBrowser.localStorage.setItem('cot.gfxAutoTier', 'low');
resetBrowser.localStorage.setItem('cot.profile', 'keep-player-progress');
window.sessionStorage.setItem('cot.graphicsRecovery.v1', 'low');
const resetDesktop = await import('./quality.ts?quality-reset-contract');
assert.equal(resetDesktop.resolvePresetName(), 'high');
assert.equal(resetDesktop.getStoredChoice(), 'auto', 'repair link resets a persisted desktop choice');
assert.equal(resetBrowser.storage.get('cot.gfxMobilePreset'), undefined);
assert.equal(window.sessionStorage.getItem('cot.graphicsRecovery.v1'), null);
assert.equal(resetBrowser.storage.get('cot.profile'), 'keep-player-progress', 'repair preserves other saved state');
resetDesktop.setPresetName('medium');
assert.equal(resetDesktop.resolvePresetName(), 'medium', 'repair is consumed once, allowing later choices');
resetDesktop.setPresetName('auto');
assert.equal(resetDesktop.reportSustainedOverload(), true);
assert.equal(resetDesktop.resolvePresetName(), 'medium',
  'gfxreset is consumed once instead of erasing the live governor decision');
assert.equal(resetBrowser.storage.get('cot.gfxAutoTier'), undefined,
  'live governor verdicts must not persist transient load across sessions');
assert.equal(resetDesktop.reportSustainedOverload(), true);
assert.equal(resetDesktop.resolvePresetName(), 'low',
  'a second sustained-overload decision can converge to the floor');
// 2026-10-13: Ultra Low is the governor's last step after Low, and stable evidence brings it back up
assert.equal(resetDesktop.reportSustainedOverload(), true);
assert.equal(resetDesktop.resolvePresetName(), 'ultralow', 'a third sustained overload reaches Ultra Low');
assert.equal(resetDesktop.reportSustainedOverload(), false, 'Ultra Low is the floor');
assert.equal(resetDesktop.canRecoverAutoTier(), true);
assert.equal(resetDesktop.reportSustainedRecovery(), true);
assert.equal(resetDesktop.resolvePresetName(), 'low', 'Ultra Low recovers to Low first');
assert.equal(resetDesktop.reportSustainedRecovery(), true);
assert.equal(resetDesktop.resolvePresetName(), 'medium',
  'stable evidence can reverse one transient session demotion');
assert.equal(resetDesktop.reportSustainedRecovery(), true);
assert.equal(resetDesktop.resolvePresetName(), 'high');
assert.equal(resetDesktop.canRecoverAutoTier(), false,
  'automatic recovery stops at the hardware-derived ceiling');
assert.equal(resetDesktop.reportSustainedRecovery(), false);

installBrowser('?tier=desktop', { memory: 4, cores: 8 });
const constrainedDesktop = await import('./quality.ts?quality-constrained-desktop-contract');
assert.equal(constrainedDesktop.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } }), 'desktop');
assert.equal(constrainedDesktop.shouldReleaseInactivePhaseGpu(), true,
  'low-memory desktops favor GPU safety over retained transition speed');

installBrowser('?tier=desktop');
const freshDesktop = await import('./quality.ts?quality-fresh-session-contract');
assert.equal(freshDesktop.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } }), 'desktop');
assert.equal(freshDesktop.resolvePresetName(), 'high',
  'a new session re-runs stable hardware policy instead of inheriting load');

console.log('quality.selftest: device, texture, preset, and subscription contracts passed');

{
  const browser = installBrowser('?tier=desktop');
  const q = await import('./quality.ts?context-pressure');
  q.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } });
  q.setPresetName('high');
  let changes = 0; q.onPresetChange(() => changes++);
  const saved = [...browser.storage];
  q.noteGraphicsContextLoss();
  assert.equal(changes, 0, 'loss does not allocate GPU resources through preset listeners');
  assert.equal(q.resolvePresetName(), 'medium');
  assert.equal(q.shouldReleaseInactivePhaseGpu(), true, 'a reset desktop stops retaining inactive GPU phases');
  assert.deepEqual([...browser.storage], saved, 'recovery preserves the chosen quality setting');
  q.applyGraphicsRecovery(); assert.equal(changes, 1, 'restoration publishes the temporary preset');
  const reload = await import('./quality.ts?context-pressure-reload');
  reload.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } });
  assert.equal(reload.resolvePresetName(), 'medium', 'same-tab reload must not recreate the failing footprint');
  reload.noteGraphicsContextLoss(); assert.equal(reload.resolvePresetName(), 'low', 'repeated resets tighten the cap');
  reload.noteGraphicsContextLoss(); assert.equal(reload.resolvePresetName(), 'ultralow', 'Ultra Low is the last relief');
  reload.noteGraphicsContextLoss(); assert.equal(reload.resolvePresetName(), 'ultralow', 'relief has a floor');
  reload.setPresetName('high'); assert.equal(reload.resolvePresetName(), 'high', 'explicit choice clears recovery relief');
}
{
  installBrowser('?tier=mobile');
  const q = await import('./quality.ts?mobile-context-pressure');
  q.resolveDeviceTier({ capabilities: { maxTextureSize: 8192 } });
  q.noteGraphicsContextLoss(); assert.equal(q.resolvePresetName(), 'mobile-low');
  assert.equal(q.getMobilePresetChoice(), 'mobile', 'saved phone quality is not overwritten');
  q.setMobilePresetName('mobile-high'); assert.equal(q.resolvePresetName(), 'mobile-high');
}
// 2026-10-12 (the perf stream; the owner: "im averaging 11 fps"): on Auto, retina High's raster may fall to 1.0 (0.667 of
// its 1.5 cap) before the auto tier steps down to Medium (which lands on the same 1.0 raster with less grass, a shorter
// shadow reach and no change in light); an explicit High keeps its 1.35 floor, and the floor reaches the governor
// through the active preset (post.ts reads getPreset() and its change listeners).
{
  const browser = installBrowser('?tier=desktop');
  const q = await import('./quality.ts?auto-retina-floor');
  q.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } });
  const { dynamicScaleFloor, internalPixelRatio } = await import('./renderScalePolicy.ts');
  assert.equal(q.getStoredChoice(), 'auto');
  assert.equal(q.resolvePresetName(), 'high');
  const auto = q.getPreset();
  assert.equal(auto.dynMin, 0.667, 'Auto High may lower its retina raster to 1.0');
  assert.equal(auto.maxPixelRatio, 1.5, 'the ceiling is High\'s own');
  assert.equal(auto.adaptiveBasePixelRatio, 1.5, 'Auto High starts at full raster, as before');
  assert.equal(q.getPreset(), auto, 'one stable object for the listeners');
  assert.ok(Math.abs(internalPixelRatio(2, auto, 0.5) - 1.0005) < 1e-9, 'the floor at DPR 2 is a 1.0 raster');
  assert.equal(dynamicScaleFloor(1, auto), 0.67, 'a native-density display keeps nativeDynMin');
  let seen = null;
  q.onPresetChange((p) => { seen = p; });
  q.setPresetName('high');
  assert.equal(seen.dynMin, 0.9, 'an explicit High keeps its 1.35 retina floor');
  assert.equal(q.getPreset(), q.PRESETS.high);
  q.setPresetName('auto');
  assert.equal(seen.dynMin, 0.667, 'back on Auto the governor gets the lower floor');
  assert.equal(q.PRESETS.high.dynMin, 0.9, 'the preset table itself is unchanged');
  assert.equal(browser.storage.get('cot.gfxPreset'), 'auto');
  // 2026-10-13 (the coordinator's DPR ruling): Auto High holds a 1.25 raster under load before it goes toward 1.0, and
  // keeps RCAS down to the 1.0 raster; the explicit High has no hold (its floor is 1.35)
  const { dynamicScaleHold, reconstructionMode } = await import('./renderScalePolicy.ts');
  const autoAgain = q.getPreset();
  assert.equal(autoAgain.dynHold, 0.8334, 'the Auto variant carries the hold rung');
  assert.ok(Math.abs(internalPixelRatio(2, autoAgain, dynamicScaleHold(2, autoAgain)) - 1.2501) < 1e-9, 'held at 1.25');
  assert.equal(dynamicScaleHold(1, autoAgain), 0.67, 'a native-density display has no hold: its floor');
  assert.equal(q.PRESETS.high.dynHold, undefined, 'the explicit High has none');
  assert.equal(dynamicScaleHold(2, q.PRESETS.high), 0.9, 'the explicit High holds at its own floor');
  assert.equal(q.PRESETS.high.rcasMinScale, 0.49);
  assert.equal(reconstructionMode(1729 / 3456, autoAgain.rcasMinScale), 'easu+rcas', 'Auto High\'s 1.0 raster keeps RCAS');
  for (const name of ['mobile', 'mobile-high']) {
    assert.equal(q.PRESETS[name]?.rcasMinScale, undefined, `${name} keeps the default RCAS threshold`);
  }
}
// 2026-10-13 (Ultra Low; the owner: "also lets make an ultra low graphics setting LOL"): the preset below Low is a
// player choice on both ladders, its picture levers are its own, and its raster stays inside EASU + RCAS
{
  const browser = installBrowser('?tier=desktop');
  const q = await import('./quality.ts?ultra-low');
  q.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } });
  const { cappedPixelRatio, dynamicScaleFloor, internalPixelRatio, reconstructionMode } = await import('./renderScalePolicy.ts');
  assert.deepEqual(q.PRESET_ORDER, ['ultralow', 'low', 'medium', 'high', 'ultra'], 'Ultra Low sits below Low');
  assert.equal(q.presetLightWorld(), false, 'Auto builds the full world');
  q.setPresetName('ultralow');
  assert.equal(browser.storage.get('cot.gfxPreset'), 'ultralow');
  assert.equal(q.getStoredChoice(), 'ultralow', 'the choice persists');
  assert.equal(q.resolvePresetName(), 'ultralow');
  const p = q.getPreset();
  assert.equal(p, q.PRESETS.ultralow);
  assert.equal(q.presetLightWorld(), true, 'Ultra Low builds the light world');
  assert.equal(p.bloom, false); assert.equal(p.volumetricClouds, false); assert.equal(p.terrainLite, true);
  assert.equal(p.aoScale, 0); assert.equal(p.msaaSamples, 0); assert.ok(!p.taa && !p.contactShadows && !p.sunShafts && !p.lensFlare);
  assert.ok(p.tallGrass > 0 && p.tallGrass < q.PRESETS.low.tallGrass, 'less tall grass than Low, not none');
  assert.ok(p.shadowMaxFar < q.PRESETS.low.shadowMaxFar && p.shadowMapSizes.every((s, i) => s <= q.PRESETS.low.shadowMapSizes[i]),
    'smaller cascades over a shorter range than Low');
  assert.equal(p.shadowMapSizes.length, 4, 'the desktop cascade count is unchanged (no lit program recompiles)');
  // raster: 0.8 CSS px; 0.4 of a retina panel with RCAS on; below the retina threshold the governor may reach 0.6
  assert.equal(cappedPixelRatio(2, p), 0.8);
  assert.equal(dynamicScaleFloor(2, p), 1, 'a retina panel stays at 0.4 (no linear band)');
  assert.ok(Math.abs(internalPixelRatio(1, p, 0) - 0.6) < 1e-9, 'a native-density display may fall to 0.6 CSS px');
  assert.equal(reconstructionMode(0.4, p.rcasMinScale), 'easu+rcas', 'the retina 0.4 keeps RCAS');
  assert.equal(reconstructionMode(0.6, p.rcasMinScale), 'easu+rcas');
  for (const name of ['low', 'medium', 'high', 'ultra']) {
    const other = q.PRESETS[name];
    assert.ok(other.bloom === undefined && other.volumetricClouds === undefined && other.terrainLite === undefined
      && other.lightWorld === undefined, `${name} keeps the full picture`);
  }
  q.setPresetName('low');
  assert.equal(q.presetLightWorld(), false);
}
{
  installBrowser('?tier=mobile');
  const q = await import('./quality.ts?mobile-ultra-low');
  q.resolveDeviceTier({ capabilities: { maxTextureSize: 8192 } });
  q.setMobilePresetName('mobile-ultralow');
  assert.equal(q.getMobilePresetChoice(), 'mobile-ultralow');
  assert.equal(q.resolvePresetName(), 'mobile-ultralow');
  const p = q.getPreset();
  assert.equal(p.maxPixelRatio, 1, 'the phones keep one 3D sample per CSS pixel');
  assert.equal(p.textureScale, 0.5); assert.equal(p.textureCap, 2048);
  assert.equal(p.bloom, false); assert.equal(p.terrainLite, true);
  q.setPresetName('ultralow');
  assert.equal(q.resolvePresetName(), 'mobile-ultralow', 'a desktop choice never reaches the phone ladder');
}
console.log('quality.selftest: Ultra Low contracts passed');
