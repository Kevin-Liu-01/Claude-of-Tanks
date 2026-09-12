import assert from 'node:assert/strict';

function installBrowser(search, { memory = 8, cores = 8 } = {}) {
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search }, localStorage,
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
assert.deepEqual(mobile.MOBILE_PRESET_ORDER, ['mobile-low', 'mobile', 'mobile-high']);

const desktopBrowser = installBrowser('?tier=desktop');
const desktop = await import('./quality.ts?quality-desktop-contract');
assert.equal(desktop.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } }), 'desktop');
assert.equal(desktop.resolvePresetName(), 'high');
assert.equal(desktop.shouldReleaseInactivePhaseGpu(), false,
  'normal desktops retain detached Garage resources for fast battle exits');
assert.equal(desktop.PRESETS.high.maxPixelRatio, 1.5);
// 2026-09-12 visual restoration: the 1049e4e preset table is back. Ultra runs
// 4K hero cascades to 700 m with full-res GTAO, High 2K cascades to 700 m with
// half-res GTAO, Medium the stable 2K/1K layout at 520 m with half-res GTAO;
// Low keeps the near-field 380 m range and no AO.
assert.deepEqual(desktop.PRESETS.ultra.shadowMapSizes, [4096, 4096, 2048, 2048], 'Ultra hero cascades, 2K far');
assert.equal(desktop.PRESETS.ultra.shadowMaxFar, 700, 'Ultra shadow range covers whole towns');
assert.equal(desktop.PRESETS.ultra.aoScale, 1.0, 'Ultra full-resolution GTAO');
assert.deepEqual(desktop.PRESETS.high.shadowMapSizes, [2048, 2048, 2048, 1024], 'High 2K cascades');
assert.equal(desktop.PRESETS.high.shadowMaxFar, 700, 'High shadow range covers whole towns');
assert.equal(desktop.PRESETS.high.aoScale, 0.5, 'High half-resolution GTAO');
assert.deepEqual(desktop.PRESETS.medium.shadowMapSizes, desktop.DESKTOP_SHADOW_MAP_SIZES,
  'Medium keeps the stable desktop shadow-map layout');
assert.equal(desktop.PRESETS.medium.shadowMaxFar, 600, 'Medium mid range');
assert.equal(desktop.PRESETS.medium.aoScale, 0.5, 'Medium half-resolution GTAO');
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
const resetDesktop = await import('./quality.ts?quality-reset-contract');
assert.equal(resetDesktop.resolvePresetName(), 'high');
assert.equal(resetDesktop.reportSustainedOverload(), true);
assert.equal(resetDesktop.resolvePresetName(), 'medium',
  'gfxreset is consumed once instead of erasing the live governor decision');
assert.equal(resetBrowser.storage.get('cot.gfxAutoTier'), undefined,
  'live governor verdicts must not persist transient load across sessions');
assert.equal(resetDesktop.reportSustainedOverload(), true);
assert.equal(resetDesktop.resolvePresetName(), 'low',
  'a second sustained-overload decision can converge to the floor');
assert.equal(resetDesktop.canRecoverAutoTier(), true);
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
