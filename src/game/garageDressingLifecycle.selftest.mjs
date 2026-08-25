import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main.js'), 'utf8');

const schedulerAt = main.indexOf('function scheduleGarageDressingBuild()');
assert(schedulerAt >= 0,
  'normal garage sessions must schedule the repair/display dressing after first paint');
const scheduler = main.slice(schedulerAt, schedulerAt + 2400);
assert.match(scheduler,
  /ensureTankBuilders\(\s*garageDressing\.group\.userData\.modernComponentSources,?\s*\)/,
  'garage dressing must load every source vehicle family before synchronous chunk builds');
assert.match(scheduler, /garageDressing\.pump\(\)/,
  'the quiet scheduler must advance the dressing chunks');
assert.match(scheduler, /garageActivityAt/,
  'dressing builds must yield while the player is actively using the garage');

const readyAt = main.indexOf('window.__GAME_READY = true;');
assert(readyAt >= 0);
assert.match(main.slice(readyAt, readyAt + 500), /scheduleGarageDressingBuild\(\)/,
  'the post-ready garage path must arm the dressing scheduler');

const enterGarageAt = main.indexOf('function enterGarage(');
assert(enterGarageAt >= 0);
assert.match(main.slice(enterGarageAt, enterGarageAt + 5000), /scheduleGarageDressingBuild\(\)/,
  'Studio/battle returns must resume any unfinished dressing build');

console.log('garageDressingLifecycle.selftest: source families and every quiet chunk are scheduled');
