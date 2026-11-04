// 2026-11-02 audit F5: a page that hides takes its surfaces with it, and the stack is the one truth for "a modal is open".
// A Garage surface left on the stack under a hidden Garage (a cold Deploy sheet that opened after a quick battle entry, a
// picker menu in the body's top layer) kept its place, and the stack's capture Escape spent the battle's first Escape on
// it; modal.ts knew only its own modals, so Settings' shortcuts ignored the Play menu, Deploy and the tech tree.
import assert from 'node:assert/strict';
import {
  closeSurface, closeSurfacesWithin, modalSurfaceOpen, openSurface, openSurfaceIds,
} from './surfaceStack.ts';
import { isAnyModalOpen } from '../modal.ts';

// stand-in nodes: a node is a path; a root holds the paths under its own
const node = (path) => ({ path, contains: (target) => !!target && target.path.startsWith(path) });
const root = (prefix) => ({ contains: (target) => !!target && target.path.startsWith(prefix) });
const log = [];
const surface = (id, box, { modal = false } = {}) => {
  const s = {
    id,
    modal,
    element: () => node(box),
    owns: (target) => target.path.startsWith(`${box}-trigger`),
    close: (reason) => { log.push(`${id}:${reason}`); closeSurface(s); },
  };
  return s;
};

const garageRoot = root('garage/');
// Deploy's sheet lives inside the Garage root; the quick mode menu's popover lives in the body's top layer but opens
// from the Garage's battle card; the tech tree is a body-level modal opened from the Garage's trigger.
const deploy = surface('deploy', 'garage/deploy', { modal: true });
const quickMode = surface('garage-quick-mode', 'body/top-layer/quick');
const techTree = surface('tech-tree', 'body/tech-tree', { modal: true });
const settings = surface('settings', 'body/settings', { modal: true });
const hudMenu = surface('battle-menu', 'body/hud-menu');

openSurface(deploy, node('garage/battle-card'));
assert.equal(modalSurfaceOpen(), true);
assert.equal(isAnyModalOpen(), true, 'a modal that never came through modal.ts (Deploy) is still a modal');
assert.equal(closeSurfacesWithin(garageRoot), 1, 'the hidden Garage takes its Deploy sheet with it');
assert.deepEqual(openSurfaceIds(), [], 'nothing is left to take the battle\'s first Escape');
assert.deepEqual(log, ['deploy:replace'], 'it closes as a replacement does: no focus goes back into a hidden page');
assert.equal(isAnyModalOpen(), false);

log.length = 0;
openSurface(quickMode, node('garage/battle-card/quick'));
assert.equal(closeSurfacesWithin(garageRoot), 1,
  'a surface opened from the Garage closes with it, wherever its box lives (a top-layer popover)');
openSurface(techTree, node('garage/techtree-trigger'));
assert.equal(closeSurfacesWithin(garageRoot), 1, 'so does a body-level modal the Garage opened (the tech tree)');
openSurface(hudMenu, node('body/hud/gear'));
assert.equal(closeSurfacesWithin(garageRoot), 0, 'a surface of another page stays');
assert.deepEqual(openSurfaceIds(), ['battle-menu']);
closeSurface(hudMenu);

// the stack's top first, and the ones standing on a closed surface close with it
log.length = 0;
const field = surface('deploy-battlefield', 'garage/deploy/field');
openSurface(deploy, node('garage/battle-card'));
openSurface(field, node('garage/deploy/field-trigger'));
assert.deepEqual(openSurfaceIds(), ['deploy', 'deploy-battlefield']);
assert.equal(closeSurfacesWithin(garageRoot), 2);
assert.deepEqual(log, ['deploy-battlefield:replace', 'deploy:replace'], 'the top closes first');
assert.deepEqual(openSurfaceIds(), []);

// Settings keeps its own open state: its own surface is not "a modal" to its readers, one above it is
openSurface(settings, node('body/hud/gear'));
assert.equal(modalSurfaceOpen('settings'), false);
assert.equal(isAnyModalOpen(), false, 'Settings alone does not block its own keys');
const editor = surface('hud-editor', 'body/settings/editor', { modal: true });
openSurface(editor, node('body/settings/editor-trigger'));
assert.equal(isAnyModalOpen(), true, 'a modal standing on Settings owns the keys');
closeSurface(settings);
assert.deepEqual(openSurfaceIds(), []);

console.log('surfaceStackOwnership.selftest: a hidden page takes its surfaces with it; one modal truth PASS');
