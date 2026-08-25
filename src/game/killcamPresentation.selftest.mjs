import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./killcam.js', import.meta.url), 'utf8');
const responsive = readFileSync(new URL('../ui/responsiveSurfaces.js', import.meta.url), 'utf8');

assert.match(source, /import \{ uiIconSVG \} from '\.\.\/ui\/uiIcons\.js';/,
  'killcam presentation uses the shared SVG icon registry');

for (const icon of ['autoAim', 'battleRecord', 'shell', 'skull', 'ammoRack',
  'scope', 'turretRing', 'shield', 'damage', 'penetration']) {
  assert.ok(source.includes(`'${icon}'`), `killcam presentation includes the ${icon} icon`);
}

for (const moduleIcon of ['track', 'engine', 'transmission', 'fuelTank', 'ammoRack',
  'gun', 'radio', 'optics', 'turretRing']) {
  assert.ok(source.includes(`'${moduleIcon}'`), `module callouts map ${moduleIcon}`);
}

for (const crewIcon of ['crewCommander', 'crewGunner', 'crewDriver', 'crewLoader']) {
  assert.ok(source.includes(`'${crewIcon}'`), `crew callouts map ${crewIcon}`);
}

assert.match(source, /--kc-panel:/, 'killcam owns the tactical panel token set');
assert.match(source, /\.cot-kc-labelhost\{position:absolute;z-index:8;inset:0;overflow:hidden;/,
  'projected callouts remain clipped to the replay frame');
assert.match(source, /pass 2c: keep projected callouts out of the fixed analysis\/killer/,
  'projected labels reserve space for fixed replay cards');
assert.doesNotMatch(source, /@media \([^)]*(?:width|height|orientation)/,
  'killcam presentation must not retain independent device breakpoint logic');
assert.match(responsive, /body\[data-cot-width='phone'\]\[data-cot-orientation='portrait'\] \.cot-kc-killer/,
  'portrait killcam has a dedicated safe-area layout');
assert.match(responsive, /body\[data-cot-height='short'\] \.cot-kc-(?:annot|killer)/,
  'short landscape killcam has a dedicated compact layout');

console.log('killcam presentation selftest passed');
