// The loose-part class (270, Main 2026-11-06): the reference loader fits a print to the published width over the whole
// file, so a part modelled clear of the vehicle shrinks the reference. tools/oracle-width-audit.mjs finds the class
// (whole-file width against the main body's); tools/oracle-excision.mjs repairs a hit by the §E excision route, its recipe
// the provenance row. Here: the detector on the M3A3 print's measured boxes (and a print with nothing loose, the control);
// the excision recipe's shape (and its negative controls); and the M3A3's registration naming the excised file its recipe
// writes, pinned to the recipe's output, the pristine file neither registered nor pinned. No GLB is read.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mainBody, widthDeparture, pageOverrides } from './oracle-width-audit.mjs';
import { recipeError } from './oracle-excision.mjs';
import { ORACLE_PINS } from './oracle-pins.mjs';

// the M3A3 print in the loader's frame (yaw pi), raw metres: hull, two track runs, a skirt course each side, a turret,
// and the three parts on the ground to the vehicle's left after the yaw (two TOW rounds, a launch tube)
const box = (min, max, name) => ({ name, min, max });
const vehicle = [
  box([-1.156, -0.062, -2.252], [1.778, 1.731, 3.581], 'hull'),
  box([-1.125, -0.062, -2.033], [-0.625, 1.0, 3.504], 'trackL'),
  box([1.25, -0.062, -2.033], [1.75, 1.0, 3.504], 'trackR'),
  box([-1.219, 0.438, -1.781], [-1.15, 0.862, 2.281], 'skirtL'),
  box([1.775, 0.438, -1.781], [1.844, 0.862, 3.469], 'skirtR'),
  box([-0.969, 1.625, -1.39], [1.481, 3.719, 2.863], 'turret'),
];
const loose = [
  box([-3.588, 0.05, 1.281], [-3.487, 0.15, 2.106], 'roundA'),
  box([-2.9, -0.05, 1.281], [-2.8, 0.05, 2.106], 'roundB'),
  box([-2.316, -0.048, 1.238], [-2.134, 0.123, 2.225], 'tube'),
];
const found = mainBody([...vehicle, ...loose]);
const departure = widthDeparture(found.whole, found.body);
assert.deepEqual(found.outside.map((i) => [...vehicle, ...loose][i].name), ['roundA', 'roundB', 'tube'], 'the loose parts stay outside the body');
assert.ok(Math.abs(departure.bodyWidth - 3.063) < 1e-9 && Math.abs(departure.wholeWidth - 5.432) < 1e-9, `widths ${JSON.stringify(departure)}`);
assert.ok(departure.pct > 3, 'the M3A3 print is a hit');
const control = mainBody(vehicle);
assert.equal(control.outside.length, 0, 'control: a print with nothing loose keeps every mesh in its body');
assert.equal(widthDeparture(control.whole, control.body).pct, 0, 'control: its whole-file width is its body width');
// a part touching the body (a stowage box on the skirt) joins it however far it reaches
const bin = box([1.84, 0.5, 0], [2.4, 1.2, 1], 'bin');
assert.equal(mainBody([...vehicle, bin]).outside.length, 0, 'a part that meets the body is body');

// the recipe: the committed M3A3 one, and the shapes a recipe may not take
const recipe = JSON.parse(fs.readFileSync(new URL('../docs/references/oracle-excisions/m3a3_bradley_sipriv_excised.json', import.meta.url), 'utf8'));
assert.equal(recipeError(recipe), null, 'the M3A3 recipe is complete');
assert.deepEqual(recipe.removed.map((row) => row.node), ['bone52_278', 'bone63_296', 'bone61_298']);
for (const [patch, why] of [
  [{ output: recipe.source }, 'the pristine source overwritten'],
  [{ outputSha256: 'abc' }, 'a short hash'],
  [{ removed: [] }, 'nothing removed'],
  [{ removed: [...recipe.removed, recipe.removed[0]] }, 'a node twice'],
  [{ reason: 'loose' }, 'no reason in words'],
  [{ source: '/models/tanks/community/m2_bradley_ifv.glb' }, 'a source outside the private candidates'],
]) assert.notEqual(recipeError({ ...recipe, ...patch }), null, `refused: ${why}`);

// the registration: the excised file, pinned to the recipe's output; the pristine one neither registered nor pinned
const table = await pageOverrides();
assert.equal(table.m3a3_bradley?.glb?.path, recipe.output, 'the M3A3 measures against the excised print');
assert.equal(table.m3a3_bradley.glb.turretNode, '^bone11_169$', 'the turret node survives the excision');
assert.equal(ORACLE_PINS[recipe.output]?.sha256, recipe.outputSha256, 'the pin is the recipe\'s output');
assert.equal(ORACLE_PINS[recipe.source], undefined, 'the pristine print is not pinned');
assert.ok(!Object.values(table).some((row) => row?.glb?.path === recipe.source), 'the pristine print is not registered');
console.log(`oracle-width-audit.selftest: the M3A3 print reads ${departure.pct.toFixed(1)}% wider than its body (three loose parts), `
  + 'a clean print 0%; the excision recipe is complete and its six malformed shapes refused; the M3A3 registers the pinned excised print');
