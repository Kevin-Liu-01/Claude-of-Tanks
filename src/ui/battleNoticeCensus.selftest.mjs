// battleNoticeCensus.selftest.mjs — every transient battle message renders through the battle notices, or is named here
// with its reason (notices-audit-275; Kevin approved the audit 2026-11-21, ~/cot-lanes/notices-audit-275-notes/AUDIT.md).
//
// The census reads every surface in src/ui, src/game and src/app that announces itself (role="status" or "alert", or
// aria-live: what a message is), keyed by its module and its class, and holds each to one row of SURFACES:
// - notices: the battle notices themselves (battleNotices.ts's condition lane is the kit's region; battleNoticeEvents.ts
//   the event lane in the planners' alert seat), or the caption line the guidance plan seats beside them;
// - battle: a battle surface that is not a message in words (an instrument's readout, a feed, a timer, a full-screen
//   transition, the killcam's or the tutorial's own screen), with the reason it stays its own;
// - menu: a surface outside the battle (a menu, a lobby, a load screen), not this census's rule.
// A new announcing surface fails until it has a row; a row whose surface is gone fails as stale, unless it names the lane
// removing it (`pending`). And the old ways back are shut: no module but the event lane builds the .cot-alert seat or a
// notice queue for the HUD, and the HUD keeps no band of its own.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');

/** @type {Record<string, { kind: 'notices' | 'battle' | 'menu', why: string, pending?: string }>} */
const SURFACES = {
  // ---- the battle notices
  'src/ui/components/notice.ts#cot-c-notice': { kind: 'notices', why: 'the kit\'s notice: the condition lane\'s markup and every menu toast' },
  'src/ui/components/notice.ts#cot-c-notices': { kind: 'notices', why: 'the kit\'s region: the condition lane (battleNotices.ts) and the menus\' regions' },
  'src/ui/components/notice.ts#null': { kind: 'notices', why: 'the kit\'s toast role (an error is an alert)' },
  'src/ui/battleNoticeEvents.ts#cot-alert': { kind: 'notices', why: 'the event lane in the planners\' alert seat' },
  'src/ui/captionLine.ts#cot-caption-line': { kind: 'notices', why: 'the crew radio\'s captions, seated by the guidance plan beside the notices (Kevin 2026-11-21)' },
  // ---- battle surfaces that are not messages in words
  'src/ui/hud.ts#cot-aim-warning': { kind: 'battle', why: 'the seated gun-limit chip is a reticle mark; parked off the sight it is the condition lane\'s' },
  'src/ui/hud.ts#cot-ammo-switching': { kind: 'battle', why: 'the reticle\'s ammunition readout (SWITCHING), an instrument' },
  'src/ui/hud.ts#cot-drive': { kind: 'battle', why: 'the drive gauge, an instrument' },
  'src/ui/hud.ts#cot-mode-status': { kind: 'battle', why: 'the objective plate, a standing readout' },
  'src/ui/hud.ts#cot-net-units': { kind: 'battle', why: 'the network readout (ping, loss), a standing readout' },
  'src/ui/hud.ts#cot-revive': { kind: 'battle', why: 'the revive count, a timer' },
  'src/ui/hudKillRibbon.ts#cot-ribbon': { kind: 'battle', why: 'the player\'s kill streak and reward, a feed' },
  'src/ui/shotInfo.ts#cot-si-toasthost': { kind: 'battle', why: 'the hits taken, a feed of up to eight rows in the left lane' },
  'src/ui/shotInfo.ts#cot-si-cardhost': { kind: 'battle', why: 'the last shot\'s record card' },
  'src/ui/medalToast.ts#cot-medal-toasts': { kind: 'battle', why: 'a reward card with its art in its own seat, waiting for its place' },
  'src/ui/missionBrief.ts#cot-brief': { kind: 'battle', why: 'the campaign\'s briefing at the countdown' },
  'src/ui/aerialHud.ts#cot-drone-signal-loss': { kind: 'battle', why: 'a full-screen transition as the drone\'s feed drops' },
  'src/ui/airSupportHud.ts#cot-strike-warning': { kind: 'battle', why: 'the INCOMING plate: air-support-275 folds it into the condition lane (P3)', pending: 'air-support-275' },
  'src/ui/airSupportHud.ts#strike-points': { kind: 'battle', why: 'the call-in points, a standing readout' },
  'src/ui/provingRangeCard.ts#rc-at': { kind: 'battle', why: 'the proving ground\'s range card, an instrument' },
  'src/ui/spectatorSwitcher.ts#identity': { kind: 'battle', why: 'the watched tank\'s plate, standing while spectating' },
  'src/ui/watchHud.ts#mark': { kind: 'battle', why: 'Watch mode\'s ridden-tank plate, standing' },
  'src/ui/multiplayerStatus.ts#notice': { kind: 'battle', why: 'the network panel\'s and the touch strip\'s health word, a readout; the battle\'s banner is the condition lane\'s' },
  'src/ui/tutorial/tutorialOverlay.ts#cot-tut-card': { kind: 'battle', why: 'the tutorial\'s card, its own guidance surface placed by the guidance plan' },
  'src/ui/perfHud.ts#null': { kind: 'battle', why: 'the opt-in performance overlay (a developer readout)' },
  'src/ui/transition.ts#cot-trans-say': { kind: 'battle', why: 'the screen transition\'s spoken status' },
  // ---- outside the battle
  'src/ui/battleArrangementPanel.ts#cot-mode-features': { kind: 'menu', why: 'Deploy: the mode\'s features' },
  'src/ui/battleLoad.ts#count': { kind: 'menu', why: 'the load screen\'s countdown' },
  'src/ui/battleLoad.ts#st': { kind: 'menu', why: 'the load screen\'s stage line' },
  'src/ui/couchBriefing.ts#cot-couch-brief-step': { kind: 'menu', why: 'the couch briefing\'s step line' },
  'src/ui/couchLobby.ts#cot-couch-code': { kind: 'menu', why: 'the couch lobby\'s code' },
  'src/ui/couchLobby.ts#cot-couch-note': { kind: 'menu', why: 'the couch lobby\'s reconnecting note, a state line' },
  'src/ui/garage.ts#cot-cards-empty': { kind: 'menu', why: 'the Garage fleet\'s empty filter result' },
  'src/ui/garage.ts#cot-deploy-brief': { kind: 'menu', why: 'Deploy\'s brief' },
  'src/ui/garage.ts#cot-lt-id': { kind: 'menu', why: 'the Garage\'s selected tank' },
  'src/ui/garage.ts#rr-copy': { kind: 'menu', why: 'the Garage\'s room reminder, a state line' },
  'src/ui/garageFacetPanel.ts#cot-facet-tally': { kind: 'menu', why: 'the fleet filter\'s tally' },
  'src/ui/hudEditor.ts#null': { kind: 'menu', why: 'the HUD editor\'s status (the kit\'s inline notice) and its preview' },
  'src/ui/infoGuidePhoto.ts#cot-guide__image-error': { kind: 'menu', why: 'a field guide photo that did not load' },
  'src/ui/infoGuides.ts#cot-guide__detail': { kind: 'menu', why: 'the field guide\'s detail' },
  'src/ui/playMenu.ts#cot-c-notice__text': { kind: 'menu', why: 'the room\'s status line, on the kit\'s notice markup' },
  'src/ui/playMenu.ts#room-failure': { kind: 'menu', why: 'the room\'s failure panel, on the kit\'s notice markup' },
  'src/ui/playMenu.ts#version-refusal': { kind: 'menu', why: 'the version refusal, on the kit\'s notice markup' },
  'src/ui/studioPanel.ts#fvText': { kind: 'menu', why: 'the Studio\'s film view' },
  'src/ui/studioPanel.ts#st-load__label': { kind: 'menu', why: 'the Studio\'s load stage' },
  'src/ui/techTree.ts#tt-detail': { kind: 'menu', why: 'the tech tree\'s detail' },
};

// ---- the census: every announcing surface, by module and class
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(path);
  }
};
for (const dir of ['src/ui', 'src/game', 'src/app']) walk(dir);
const ANNOUNCE = /role["']?\s*[,=:]\s*\\?["'](status|alert)\\?["']|aria-live/;
const CLASS = /(?:class(?:Name)?=\\?["']|el\(\s*'[a-z]+',\s*'|node\(\s*'[a-z]+',\s*'|createElement\(\s*'[a-z]+',\s*'|className\s*=\s*['`])([a-z][\w-]*)/g;
const found = new Map();
for (const file of files) {
  const lines = read(file).split('\n');
  lines.forEach((line, i) => {
    if (!ANNOUNCE.test(line)) return;
    // (the surface: the nearest class named on this line or the eight before it)
    let cls = null;
    for (let j = i; j >= Math.max(0, i - 8) && !cls; j--) {
      const matches = [...lines[j].matchAll(CLASS)];
      if (matches.length) cls = matches.at(-1)[1];
    }
    const key = `${file}#${cls}`;
    if (!found.has(key)) found.set(key, `${file}:${i + 1}`);
  });
}
const unnamed = [...found].filter(([key]) => !SURFACES[key]).map(([key, at]) => `${key} (${at})`);
assert.deepEqual(unnamed, [], 'an announcing surface with no row: raise it through battleNotices (condition) or the HUD\'s event lane '
  + '(battleNoticeEvents.ts), or name it here with its reason');
const stale = Object.entries(SURFACES).filter(([key, row]) => !found.has(key) && !row.pending).map(([key]) => key);
assert.deepEqual(stale, [], 'a row whose surface is gone: drop it');
for (const [key, row] of Object.entries(SURFACES)) assert.ok(row.why.length > 12, `${key}: a row says why`);

// ---- the old ways back are shut
const hud = read('src/ui/hud.ts');
assert.doesNotMatch(hud, /\bNoticeQueue\b/, 'the HUD keeps no notice queue of its own (its events are the event lane\'s)');
assert.doesNotMatch(hud, /\bshowAlert\b|\balertQueue\b|cot-alert-(icon|copy|count|bound)/, 'the HUD keeps no band of its own');
assert.match(hud, /createBattleEventLane\(/, 'the HUD mounts the event lane');
for (const file of files) {
  if (file === 'src/ui/battleNoticeEvents.ts') continue;
  assert.doesNotMatch(read(file), /\(\s*'div',\s*'cot-alert'|className\s*=\s*'cot-alert'/, `${file}: only the event lane builds the .cot-alert seat`);
}
// every battle condition raised through the port takes its rung from the one ladder
for (const file of files) {
  const text = read(file);
  for (const match of text.matchAll(/\.condition\(\{[^}]*?priority:\s*(-?\d+)/g)) {
    assert.fail(`${file}: a condition at a bare priority ${match[1]}: name its rung (NOTICE_PRIORITY)`);
  }
}

const counts = { notices: 0, battle: 0, menu: 0 };
for (const key of found.keys()) counts[SURFACES[key].kind]++;
console.log(`battleNoticeCensus.selftest: PASS (${found.size} announcing surfaces: ${counts.notices} the battle notices, `
  + `${counts.battle} battle surfaces named with their reason, ${counts.menu} outside the battle; the HUD keeps no band of its own)`);
