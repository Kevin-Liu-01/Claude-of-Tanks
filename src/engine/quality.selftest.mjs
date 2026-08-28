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
assert.deepEqual(desktop.PRESETS.high.shadowMapSizes, [2048, 2048, 2048, 1024]);

let notified = null;
const unsubscribe = desktop.onPresetChange((preset) => { notified = preset.label; });
desktop.setPresetName('medium');
assert.equal(desktopBrowser.storage.get('cot.gfxPreset'), 'medium');
assert.equal(desktop.resolvePresetName(), 'medium');
assert.equal(notified, 'Medium');
assert.equal(unsubscribe(), true);
desktop.setPresetName('invalid');
assert.equal(desktop.resolvePresetName(), 'medium', 'invalid choices do not mutate quality');

console.log('quality.selftest: device, texture, preset, and subscription contracts passed');
