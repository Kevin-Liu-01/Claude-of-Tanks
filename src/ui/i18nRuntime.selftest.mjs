import assert from 'node:assert/strict';

const stored = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
  },
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { language: 'en-US', languages: ['zh-CN', 'en-US'] },
});

const css = new Map();
const documentElement = {
  lang: '',
  dir: '',
  style: { setProperty: (key, value) => css.set(key, value) },
};
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { documentElement },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: new EventTarget(),
});

const { formatNumber, getLocale, setLocale, t } = await import('./i18n.ts');

assert.equal(getLocale(), 'zh-CN', 'supported navigator.languages value wins on first boot');
assert.equal(documentElement.lang, 'zh-CN', 'document language follows detected locale');
assert.equal(documentElement.dir, 'ltr');
assert.equal(t('garage.battle'), '出战');
assert.equal(t('test.missing.key'), 'test.missing.key', 'missing English keys stay developer-legible');
assert.equal(formatNumber(1234567), new Intl.NumberFormat('zh-CN').format(1234567),
  'number formatting uses the active locale');

let localeEvent;
window.addEventListener('cot:locale-changed', (event) => { localeEvent = event.detail; });
setLocale('en-US');
assert.equal(stored.get('cot.locale'), 'en-US', 'explicit locale persists');
assert.equal(documentElement.lang, 'en-US');
assert.deepEqual(localeEvent, { locale: 'en-US', previous: 'zh-CN' });
assert.equal(css.get('--cot-garage-variant-label'), '"Battlefield staging areas"');
assert.equal(t('garage.battle'), 'BATTLE');

console.log('i18nRuntime.selftest: detection, persistence, DOM language, events, and lookup passed');
