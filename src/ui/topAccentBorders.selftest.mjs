import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');
const [garage, contextInfo, settings, hud, endScreen, killcam, publicNav, docs] = await Promise.all([
  readSource('./garage.js'),
  readSource('./contextInfo.ts'),
  readSource('./settings.ts'),
  readSource('./hud.js'),
  readSource('./endScreen.ts'),
  readSource('../game/killcam.js'),
  readSource('../presentation/publicNav.css'),
  readSource('../docs/docs.css'),
]);

const absent = (source, pattern, message) => assert.doesNotMatch(source, pattern, message);

absent(garage, /\.cot-mobile-nav-menu\{[^}]*border-top:/,
  'the Garage mobile navigation uses one consistent border');
absent(garage, /\.cot-record-dialog\{[^}]*border-top:/,
  'the service record dialog uses one consistent border');
absent(garage, /\.cot-record-outcome\.win\{[^}]*border-top/,
  'record outcomes communicate state without a stray top edge');
absent(garage, /\.cot-card(?:\.sel)?\{[^}]*border-top/,
  'vehicle cards use consistent outlines in default and selected states');
absent(contextInfo, /\.cot-info-popover::before\{/,
  'shared info popovers do not draw a decorative top rule');
absent(settings, /\.cot-set-panel::before\{/,
  'Settings does not draw a decorative top rule');
absent(hud, /\.cot-spec(?:\{[^}]*border-top|::before\{)/,
  'the spectator panel uses one consistent outline');
absent(hud, /\.cot-top \.sc(?:\.[a-z]+)?::after\{/,
  'the battle score plate does not draw colored team underlines');
absent(endScreen, /\.es-debrief\.(?:personal|teams)\{[^}]*border-top/,
  'debrief cards use one consistent outline');
absent(killcam, /\.cot-kc-(?:killer|annot)::before\{/,
  'killcam cards do not draw decorative top rules');
absent(publicNav, /\.public-nav__menu\{[^}]*border-top:/,
  'the public mobile navigation uses one consistent border');
absent(docs, /(?:\.docs-toc|\.topic-layout>aside)\{[^}]*border-top:/,
  'documentation side panels use one consistent outline');
absent(docs, /\.aside-card\.accent\{[^}]*border-top:/,
  'documentation aside cards do not add a special top edge');
console.log('topAccentBorders.selftest: decorative panel top rules removed');
