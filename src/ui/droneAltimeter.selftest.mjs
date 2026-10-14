// DR.05 (#100, the owner's "make drones and their platforms much better"): the drone HUD reads the height above the
// ground under the airframe. One decimal in the low-flight band (a human pilot may fly down to 0.15 m), whole metres
// above it, never negative; the instrument sits beside the battery, takes the terrain height field the HUD's spotting
// tests use, and is labelled in every catalog.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDroneAltitude } from './aerialHud.ts';
import { uiIconIds, uiIconSVG } from './uiIcons.ts';

assert.equal(formatDroneAltitude(0.15), '0.1m', 'a skimming pilot reads tenths');
assert.equal(formatDroneAltitude(0.16), '0.2m');
assert.equal(formatDroneAltitude(4.04), '4.0m');
assert.equal(formatDroneAltitude(9.94), '9.9m', 'tenths up to the 10 m band edge');
assert.equal(formatDroneAltitude(9.96), '10m', 'whole metres above it (no "10.0m" step)');
assert.equal(formatDroneAltitude(57.4), '57m');
assert.equal(formatDroneAltitude(-0.03), '0.0m', 'a probe a few centimetres under the ground never reads negative');

assert.ok(uiIconIds().includes('altitude') && uiIconSVG('altitude', 24).includes('<path'), 'the altimeter has its own glyph');
const hud = readFileSync(new URL('./aerialHud.ts', import.meta.url), 'utf8');
assert.match(hud, /const timer=instrument\(telemetry,'reload'[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*const altimeter=instrument\(telemetry,'altitude',t\('flight\.altitude'\)\)/,
  'the altimeter is the second drone instrument, beside the battery');
assert.match(hud, /altimeter\.host\.hidden=!drone/, 'the gunship never shows the drone altimeter');
assert.match(hud, /formatDroneAltitude\(view\.y-field\.getHeightAt\(view\.x,view\.z\)\)/, 'height above the ground under the airframe');
const shell = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
assert.match(shell, /createAerialHud\(root,bus,\(\) => heightFieldRef\)/, 'the HUD hands the drone its terrain height field');
const css = readFileSync(new URL('./aerialHud.css', import.meta.url), 'utf8');
assert.match(css, /\[data-kind=drone\] \.flight-telemetry\{\n grid-column:1\/-1;grid-row:2;display:grid;grid-template-columns:repeat\(4,/, 'four drone instruments in one row');
for (const locale of ['en-US', 'zh-CN']) {
  const catalog = JSON.parse(readFileSync(new URL(`./i18nCatalog.${locale}.json`, import.meta.url), 'utf8'));
  assert.ok(typeof catalog['flight.altitude'] === 'string' && catalog['flight.altitude'].length > 0, `${locale}: flight.altitude`);
}
console.log('droneAltimeter: tenths below 10 m, whole metres above, never negative; the drone HUD shows it beside the battery from the terrain height field');
