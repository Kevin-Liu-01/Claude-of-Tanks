import assert from 'node:assert/strict';
import { createCustomCamoStudioAccess } from './customCamoStudioAccess.ts';

const controller = {
  opens: 0,
  open() { this.opens++; },
  syncSelected() {},
  close() {},
  dispose() {},
};

// (round 2 U35) an opener's chunk: a failure is kept for the document. The Garage preloads the studio on every pointer
// over or focus into its swatch; the memo here cleared each failure, so every intent asked the failed chunk again at once
// (11 asks for 10 intents and a press), with no backoff, no offline gate and no reload path. Now the swatch is marked and
// its next press reloads (garage.ts openCustomCamoStudio, components/loadFailure.ts).
{
  let attempts = 0;
  const access = createCustomCamoStudioAccess(async () => {
    attempts++;
    throw new TypeError('Failed to fetch dynamically imported module: ./customCamoStudio.ts');
  });
  assert.equal(access.peek(), null, 'editor is absent before explicit intent');
  for (let i = 0; i < 10; i++) await assert.rejects(access.preload(), /Failed to fetch dynamically imported module/);
  await assert.rejects(access.open(), /Failed to fetch dynamically imported module/, 'the press gets the kept failure');
  assert.equal(attempts, 1, `a failed studio chunk is asked for once in the document (${attempts} asks for 10 intent preloads and a press)`);
  assert.equal(access.peek(), null, 'a failed transfer leaves no editor');
}

{
  let attempts = 0;
  const access = createCustomCamoStudioAccess(async () => {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 1));
    return controller;
  });
  const [first, second] = await Promise.all([access.preload(), access.preload()]);
  assert.equal(first, controller);
  assert.equal(second, controller);
  assert.equal(attempts, 1, 'concurrent intents share one transfer generation');
  assert.equal(controller.opens, 0, 'preload transfers the editor without opening it');
  assert.equal(access.peek(), controller);

  await access.open();
  assert.equal(attempts, 1, 'resident editor does not transfer again');
  assert.equal(controller.opens, 1);
  await access.open(() => false);
  assert.equal(controller.opens, 1, 'a page that is gone opens nothing (audit F5)');
}

console.log('customCamoStudioAccess.selftest: one opener chunk (a failure is asked once in the document, intents share a load, the resident editor opens) PASS');
