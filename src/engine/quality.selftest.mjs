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
assert.deepEqual(mobile.MOBILE_PRESET_ORDER, ['mobile-low', 'mobile', 'mobile-high']);

const desktopBrowser = installBrowser('?tier=desktop');
const desktop = await import('./quality.ts?quality-desktop-contract');
assert.equal(desktop.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } }), 'desktop');
assert.equal(desktop.resolvePresetName(), 'high');
assert.equal(desktop.PRESETS.high.maxPixelRatio, 1.5);
for (const name of desktop.PRESET_ORDER) {
  assert.deepEqual(desktop.PRESETS[name].shadowMapSizes,
    desktop.DESKTOP_SHADOW_MAP_SIZES,
    `${name} uses the stable desktop shadow-map layout`);
  assert.equal(desktop.PRESETS[name].shadowMaxFar,
    desktop.DESKTOP_SHADOW_MAX_FAR,
    `${name} keeps cascade splits stable during live quality switches`);
  assert.equal(desktop.PRESETS[name].aoScale, 0,
    `${name} cannot re-enable the grainy temporal GTAO path`);
}

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

const freshDesktop = await import('./quality.ts?quality-fresh-session-contract');
assert.equal(freshDesktop.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } }), 'desktop');
assert.equal(freshDesktop.resolvePresetName(), 'high',
  'a new session re-runs stable hardware policy instead of inheriting load');

console.log('quality.selftest: device, texture, preset, and subscription contracts passed');
