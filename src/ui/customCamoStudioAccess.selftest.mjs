import assert from 'node:assert/strict';
import { createCustomCamoStudioAccess } from './customCamoStudioAccess.ts';

let attempts = 0;
let opens = 0;
let fail = true;
const controller = {
  open() { opens++; },
  syncSelected() {},
  close() {},
  dispose() {},
};
const access = createCustomCamoStudioAccess(async () => {
  attempts++;
  if (fail) throw new Error('injected studio transfer failure');
  return controller;
});

assert.equal(access.peek(), null, 'editor is absent before explicit intent');
await assert.rejects(access.open(), /injected studio transfer failure/);
assert.equal(access.peek(), null, 'failed transfer does not poison the optional editor');

fail = false;
const [first, second] = await Promise.all([access.preload(), access.preload()]);
assert.equal(first, controller);
assert.equal(second, controller);
assert.equal(attempts, 2, 'concurrent retry intent shares one transfer generation');
assert.equal(opens, 0, 'preload transfers the editor without opening it');
assert.equal(access.peek(), controller);

await access.open();
assert.equal(attempts, 2, 'resident editor does not transfer again');
assert.equal(opens, 1);

console.log('customCamoStudioAccess.selftest: PASS');
