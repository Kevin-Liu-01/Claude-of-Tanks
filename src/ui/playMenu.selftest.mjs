import { isPracticeMode } from '../sim/gameModeCatalog.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('./playMenu.ts', import.meta.url), 'utf8');
const responsive = await readFile(new URL('./responsiveSurfaces.css', import.meta.url), 'utf8');
assert.deepEqual([...source.matchAll(/\{ value: '(private|lan|[a-z]+)', label: t\('playMenu\.kind\.\1'\)/g)].map(match => match[1]),
  ['private', 'lan'], 'only supported room kinds have player-facing entry controls');
assert.deepEqual([...source.matchAll(/class="mode" data-mode="([^"]+)"/g)].map(match => match[1]), ['solo'], 'and solo its own link');
assert.doesNotMatch(source, /rankedServiceClient|rankedQueueLifecycle|onRankedStart|data-ranked|data-mode="ranked"/,
  'the removed mode cannot warm, queue, or render through the Play menu');
assert.match(source, /showRoomFailure\(reason: string, mode\?: PlayMode\): void/);
assert.match(source, /class="room-failure cot-c-notice" data-severity="error" hidden role="alert" aria-atomic="true" tabindex="-1"/);
assert.match(source, /aria-labelledby="cot-room-failure-title" aria-describedby="cot-room-failure-detail"/);
for (const action of ['retry', 'code', 'garage']) {
  assert.match(source, new RegExp(`<button[^>]+data-room-failure="${action}"[^>]+type="button"`));
}
// The cutover of 2026-09-29 (docs/MULTIPLAYER-V2.md §13.10): the room host comes from src/mp/session/endpoint.ts;
// there is no signaling-server field, no settings action and no v1 connection runtime behind the menu.
assert.doesNotMatch(source, /data-room-failure="settings"|data-field="signal"|advanced\.signal|advanced\.summary|failure\.settings/,
  'the connection-settings field and its failure action are gone');
assert.doesNotMatch(source, /resolveSignalUrl|VITE_SIGNAL_URL|VITE_ICE_CONFIG_URL|createPrivateRoomConnectionRuntime|privateRoomConnectionRuntime|net\/signalEndpoint|net\/iceConfig|roomIce|connectionVersion|onNetworkClose/,
  'nothing of the v1 signaling path remains in the menu');
assert.match(source, /import \{ resolveRoomsUrl \} from '\.\.\/mp\/session\/endpoint\.ts';/);
assert.match(source, /const roomConnection: RoomConnectionRuntime = createRoomConnectionAdapter\(connectionOptions\);/,
  'the menu drives the room connection adapter directly');
assert.match(source, /const roomsUrl = menuRoomsUrl\(\);\s*if \(!roomsUrl\) \{\s*throw Object\.assign\(new Error\([^)]*\), \{ code: 'room_unconfigured' \}\);/,
  'a deployment without a room host fails as the room service being unavailable');
assert.match(source, /if \(!menuRoomsUrl\(\)\) showFailure\('room_unconfigured'\);/,
  'selecting a multiplayer mode without a room host presents the failure at once');
assert.match(source, /version: 2,/, 'invite links stamp the room version the composition reads');
assert.match(source, /failureTitle\.textContent = failure\.title/);
assert.match(source, /failureDetail\.textContent = failure\.detail/);
assert.match(source, /retryBtn\.hidden = !failure\.canRetry \|\| !lastConnectionKind/);
// The lifecycle proofs (2026-09-30, docs/MULTIPLAYER-V2.md §13.11): a room host that closes the socket and stays away reaches
// the menu as `room_unreachable` (src/mp/room/roomClient.ts closeReasonFor) — the room service being unavailable, with Try
// again — and Return to Garage is unconditional: it closes whatever the menu holds (a pending attempt included) and hides.
assert.match(source, /retryBtn\.addEventListener\('click', \(\) => \{\s*if \(!lastConnectionKind \|\| connecting \|\| session \|\| activeRoom \|\| retryBtn\.hidden\) return;\s*closeCurrentSession\('room_retry'\);\s*void requestRoom\(lastConnectionKind\);/,
  'Try again reconnects with the last kind after releasing the failed acquisition');
assert.match(source, /garageBtn\.addEventListener\('click', \(\) => \{\s*closeCurrentSession\('back_to_menu'\);\s*clearFailure\(\);\s*hide\(false\);\s*\}\);/,
  'Return to Garage always works: no guard, the session closed, the failure cleared, the menu hidden');
assert.match(source, /if \(isIntentionalRoomCloseReason\(reason\)\) return;\s*if \(!wasHandedOff\) showRoomFailure\(reason\);/,
  'every non-intentional close of the menu\'s own seat is presented (an unreachable host included)');
assert.match(source, /generation === requestGeneration\) showFailure\(error\)/,
  'a retired request must not repaint a closed or replacement menu');
assert.match(source, /if \(session \|\| activeRoom \|\| connecting \|\| roomConnection\.current\s*\|\| roomConnection\.connecting\) return/,
  'late external failure presentation cannot cancel a newer lobby acquisition');
assert.match(source, /onClose: \(reason\) => \{\s*const wasHandedOff = handedOff \|\| !!activeRoom;\s*closeCurrentSession\(reason, \{ skipTransportClose: true \}\);[\s\S]*?if \(!wasHandedOff\) showRoomFailure\(reason\);/,
  'retained room ownership is captured before teardown so only the menu\'s own seat presents its failure');
const detach = source.slice(source.indexOf('  function detachActiveRoom()'), source.indexOf('  function showCurrentRoom()'));
assert.match(detach, /if \(connecting \|\| roomConnection\.connecting \|\| \(!handedOff && !activeRoom\)\) return/,
  'delayed room teardown cannot retire an in-flight or waiting replacement');
assert.match(detach, /if \(connection && \(!handedOff \|\| connection\.session !== session\)\) return/,
  'only the exact handed-off acquisition can be retired by frame cleanup');
assert.match(detach, /roomConnection\.close\('room_connection_closed', \{ transportAlreadyClosed: true \}\)/,
  'intentional frame teardown retires the stale acquisition without closing its session twice');
assert.match(detach, /unsubscribeState = null;[\s\S]*session = null;[\s\S]*state = null/);
assert.match(detach, /clearRoomUrl\(\);\s*resetInvitation\(\)/,
  'retired room cleanup removes its durable invite only after the ownership guards pass');
// Multiplayer v2 exit flow (2026-09-26): a seat back in the Garage with the room kept may rejoin the match the room still
// runs; a fresh v2 joiner never auto-hands off into a running match without its own match_start.
assert.match(source, /<button class="action cot-c-btn cot-c-btn--primary" data-action="rejoin" type="button" hidden>\$\{t\('playMenu\.rejoin'\)\}<\/button>/,
  'the lobby carries a Rejoin battle control, hidden until a running match can be re-entered');
assert.match(source, /function canRejoinBattle\(next: SerializedLobby\): boolean \{\s*return !handedOff && \(next\.phase === 'starting' \|\| next\.phase === 'playing'\) && hasMatchStart\(activeRoom\?\.session \?\? session\);/,
  'rejoin needs a room in a match and a match_start for this seat');
assert.match(source, /rejoinBtn\.hidden = !canRejoinBattle\(next\) \|\| !!versionRefusal;/, 'the control follows every lobby render (hidden under a version refusal)');
assert.match(source, /rejoinBtn\.addEventListener\('click', \(\) => \{\s*if \(state && canRejoinBattle\(state\) && !versionRefusal\) beginNetworkHandoff\(state, role\);/,
  'rejoin hands the room back through the same network start');
assert.match(source, /const activeSession = session \?\? \(activeRoom\?\.session as RoomSession \| undefined\) \?\? null;/,
  'a composition-held room hands its own session back for the rejoin');
assert.match(source, /if \(activeSession === session\) handedOff = true;/, 'the handoff flag guards the menu\'s own session only');
assert.match(source, /!handedOff && !activeRoom && hasMatchStart\(session\);/,
  'a client auto-hands off into a running match only with its own match_start');
assert.match(source, /room\.setAttribute\('aria-busy', String\(next\)\)/);
assert.match(source, /invalidInput\?\.setAttribute\('aria-describedby', 'cot-room-failure-detail'\)/);
assert.match(source, /\.room-failure button\.action\{min-height:44px/);
// (2026-10-25 gauntlet r3) a focused failure wears the kit's one focus ring
assert.match(source, /:is\(\.version-refusal,\.room-failure\):focus-visible\{outline:none;box-shadow:var\(--focus-ring\)\}/);
assert.match(responsive, /body\[data-cot-width='compact'\] \.cot-play \.room-failure-actions,\s*body\[data-cot-width='phone'\] \.cot-play \.room-failure-actions\{display:grid;grid-template-columns:1fr\}/,
  'room recovery actions use the shared compact and phone viewport policy');
assert.match(source, /readyBtn\.disabled = spectator \|\| !player\.connected \|\| !player\.specId \|\| next\.phase !== 'waiting'/,
  'ready players retain the enabled unready action while waiting');
assert.match(source, /const ready = !me\?\.ready;\s*if \(me && setReady\(ready\) && ready\) onReadyIntent\?\.\(\);/,
  'only a locally eligible Ready click prepares audio; Unready and guard rejection do not');
assert.equal([...source.matchAll(/onReadyIntent\?\.\(/g)].length, 1,
  'automatic join, replicated state and programmatic setReady never unlock audio');
const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /onReadyIntent: \(\) => audio\.prepare\(\)/);
assert.match(main, /const accepted = multiplayerLobby\?\.setReady\(ready\) \?\? false;[\s\S]{0,230}if \(accepted && ready\) audio\.prepare\(\);/,
  'Garage prepares in the same gesture only after the lobby owner accepts Ready');
// Execute the actual small event bindings, without constructing the menu or
// importing the render graph. The command owners retain their own guard tests.
const readyBinding = source.slice(source.indexOf("  readyBtn.addEventListener('click'"),
  source.indexOf("  leaveBtn.addEventListener('click'"));
for (const [ready, accepted, present] of [[false, true, true], [true, true, true],
  [false, false, true], [false, true, false]]) {
  const calls = [];
  let click;
  runInNewContext(readyBinding, {
    readyBtn: { addEventListener(type, callback) { assert.equal(type, 'click'); click = callback; } },
    state: { players: present ? [{ id: 'viewer', ready }] : [] },
    ownId: () => 'viewer',
    setReady(value) { calls.push(['command', value]); return accepted; },
    onReadyIntent() { calls.push(['prepare']); },
  });
  click();
  assert.deepEqual(calls, present
    ? [['command', !ready], ...(!ready && accepted ? [['prepare']] : [])] : [],
  'the native drawer binding preserves command/gesture order and excludes Unready or stale identity');
}
const garageReadyBinding = main.slice(main.indexOf("bus.on('ui:roomReady'"),
  main.indexOf("bus.on('ui:roomStart'"));
for (const [ready, accepted] of [[true, true], [false, true], [true, false]]) {
  const calls = [];
  let receive;
  runInNewContext(garageReadyBinding, {
    bus: { on(type, callback) { assert.equal(type, 'ui:roomReady'); receive = callback; } },
    multiplayerLobby: { setReady(value) {
      calls.push(['command', value]);
      if (accepted) Promise.resolve().then(() => calls.push(['deferred-menu']));
      return accepted;
    } },
    audio: { prepare() { calls.push(['prepare']); } },
  });
  receive({ ready });
  assert.deepEqual(calls, [['command', ready], ...(ready && accepted ? [['prepare']] : [])],
    'Garage device preparation stays synchronous, before deferred room resolution');
  await Promise.resolve();
  if (accepted) assert.deepEqual(calls.at(-1), ['deferred-menu']);
}
assert.match(source, /setReady\(ready: boolean\): boolean/);
assert.match(source, /\(!activeRoom && !session\) \|\| handedOff \|\| state\?\.phase !== 'waiting'/,
  'the quick control cannot change a handed-off or retired lobby');
const garage = await readFile(new URL('./garage.ts', import.meta.url), 'utf8');
const garageCss = await readFile(new URL('./garage.css', import.meta.url), 'utf8');
assert.match(garage, /class="cot-room-ready" type="button" disabled aria-pressed="false"/);
assert.match(garage, /if \(!roomStatus\?\.canSetReady\) return;\s*emit\('ui:click', \{\}\);\s*emit\('ui:roomReady', \{ ready: !roomStatus\.ready \}\)/,
  'the Garage toggles canonical readiness, without changing it optimistically');
assert.match(garage, /roomReady\.disabled = !status\?\.canSetReady/);
assert.match(garageCss, /\.cot-room-reminder,\.cot-room-ready\{min-height:44px/,
  'both room actions keep full mobile touch targets');
console.log('playMenu.selftest: supported mode boundary, safe persistent alert/actions, and stale request presentation guards');

// (2026-10-27) the room's operation and arrangement are the kit's picker menu over their selects: no select skin of its own
assert.match(source, /createSelectPickerMenu\(operationSelect, \{ id: 'rooms-operation' \}\)/, "the operation is the kit's picker menu");
assert.match(source, /createSelectPickerMenu\(select, \{ id: 'rooms-arrangement' \}\)/, "the arrangement's fields are the kit's picker menu");
assert.doesNotMatch(source, /createCustomSelect|cot-custom-select/, 'no pre-Premiere select skin');
// (2026-10-26, INTERACTION-REDESIGN line 1) the room's battlefield and vehicle are the kit's pickers: no hand-rolled list
assert.doesNotMatch(source, /role="listbox"|function bindMenuSelect/, "the room's choices hold no hand-rolled listbox");

// entry resilience (2026-09-25): every failure panel beacons its classified code. The room-level ICE note of v1
// (a direct-only room) left with the cutover: ICE is negotiated per peer link by the match session, whose status
// surface reports it (src/ui/multiplayerStatus.ts).
assert.match(source, /const failure = roomFailurePresentation\(error\);/,
  'the failure panel classifies the room error; the room-level relay note of v1 is gone');
assert.match(source, /kind: 'room_failure', code: failure\.code/, 'every failure panel beacons its classified code');
assert.doesNotMatch(source, /kind: 'room_failure'[^\n]*(?:roomCode|hostName|codeInput\.value)/, 'the beacon never carries the room code or host name');
assert.doesNotMatch(source, /ice_degraded|relayUnavailable|relayAvailable|degradedReason/, 'no room-level ICE presentation remains');
console.log('playMenu.selftest: the failure panel classifies and beacons every room error');

// Room setup is a separate intent and cannot emit a battle-start or mutate the solo rule.
const openMultiplayer = garage.slice(garage.indexOf('  function openMultiplayer('), garage.indexOf('  function battle('))
  .replace("mode: 'private' | 'lan' = 'private'", "mode = 'private'").replace('): void {', ') {');
// (260, Proving Ground a mode) a room hosts the battle modes only: chosen with the range, it opens on Standard
for (const [battleGameMode, roomMode] of [['mars', 'mars'], ['proving_ground', 'standard']]) {
  for (const requested of [undefined, 'private', 'lan']) {
    const calls = [];
    runInNewContext(openMultiplayer + ';openMultiplayer(requested);', {
      requested, selectedId: 'tank', selectedMapId: 'verdant', battleGameMode, isPracticeMode,
      closeBattleMenu: () => calls.push('close-setup'), closeMobileNavigation: () => {}, setGaragePanel: () => {},
      emit: (event) => { assert.equal(event, 'ui:click'); },
      opts: { onPlayRequest: (request) => calls.push(JSON.parse(JSON.stringify(request))) },
    });
    assert.deepEqual(calls, ['close-setup', {mode: requested || 'private', specId: 'tank', mapId: 'verdant', gameMode: roomMode}]);
  }
}
assert.match(source, /containModalTab\(event, panel, closeBtn\)/);
const failureBody = source.slice(source.indexOf('  function showFailure('), source.indexOf('  function showRoomFailure('));
assert.match(failureBody, /setStatus\(''\)/, 'detailed failure replaces the progress line instead of announcing the same error twice');
// 2026-10-13 (MP plan step 13): a refused entry's lobby notice is worded in the player's locale by its code — the match
// ending during the entry and a host on another build — with the composition's English words as the fallback
{
  const { readFile: read } = await import('node:fs/promises');
  for (const [code, key] of [['match_ended', 'matchEnded'], ['build_mismatch', 'buildMismatch'], ['build_host_older', 'buildHostOlder'], ['build_host_newer', 'buildHostNewer']]) {
    assert.match(source, new RegExp(`${code}: 'playMenu\\.entryRefusal\\.${key}'`), `${code} maps to its catalog key`);
    for (const catalog of ['i18nCatalog.en-US.json', 'i18nCatalog.zh-CN.json']) {
      const strings = JSON.parse(await read(new URL(`./${catalog}`, import.meta.url), 'utf8'));
      assert.ok(strings[`playMenu.entryRefusal.${key}`], `${catalog}: playMenu.entryRefusal.${key}`);
    }
  }
  const notice = source.slice(source.indexOf('  function showActiveRoom('), source.indexOf('  return {', source.indexOf('  function showActiveRoom(')));
  assert.match(notice, /const key = code \? ENTRY_REFUSAL_KEYS\[code\] : undefined;\s*const text = key \? t\(key\) : notice;/, 'a known code is localized, anything else keeps its words');
}
// 2026-10-14 (deploy 223's MP window): a refusal only a refresh resolves is a banner at the top of the menu with Refresh,
// not the lobby's status line (out of view at 1024x640), and Rejoin battle goes while it stands
{
  const { readFile: read } = await import('node:fs/promises');
  assert.match(source, /const VERSION_REFUSAL_CODES: ReadonlySet<string> = new Set\(\['build_mismatch', 'build_host_older', 'build_host_newer'\]\);/);
  assert.match(source, /<h2 id="cot-play-title">[^<]*<\/h2>\s*<section class="version-refusal cot-c-notice" data-severity="info" hidden role="alert"[^>]*>[\s\S]*?data-version-text[\s\S]*?<button class="action cot-c-btn cot-c-btn--primary" data-action="refresh-page" type="button">[\s\S]*?<\/section><\/header>/,
    'the banner lives inside the menu header, above every room section');
  assert.match(source, /\.cot-play \.play-head\{position:sticky;/, 'which stays in view while the panel scrolls (nothing can cover its Refresh)');
  const notice = source.slice(source.indexOf('  function showActiveRoom('), source.indexOf('  return {', source.indexOf('  function showActiveRoom(')));
  assert.match(notice, /if \(code && VERSION_REFUSAL_CODES\.has\(code\) && text\) \{ setStatus\(''\); setVersionRefusal\(text\); return true; \}/,
    'a version refusal takes the banner, not the status line');
  assert.match(source, /rejoinBtn\.hidden = !canRejoinBattle\(next\) \|\| !!versionRefusal;/, 'Rejoin battle hides while a version refusal stands');
  assert.match(source, /if \(state && canRejoinBattle\(state\) && !versionRefusal\) beginNetworkHandoff\(state, role\);/, 'and cannot fire');
  assert.match(source, /refreshBtn\.addEventListener\('click', \(\) => reloadPage\(\)\);/);
  assert.match(source, /reloadPage = \(\) => \{ location\.reload\(\); \},/, 'Refresh reloads the page');
  assert.match(source, /if \(!keepRequest\) requestGeneration\+\+;\s*setVersionRefusal\(null\);/, 'leaving the room ends the refusal');
  assert.match(source.slice(source.indexOf('  function detachActiveRoom()')), /session = null;\s*setVersionRefusal\(null\);/, 'so does a detached room');
  for (const catalog of ['i18nCatalog.en-US.json', 'i18nCatalog.zh-CN.json']) {
    const strings = JSON.parse(await read(new URL(`./${catalog}`, import.meta.url), 'utf8'));
    for (const key of ['playMenu.versionRefusal.title', 'playMenu.versionRefusal.refresh']) assert.ok(strings[key], `${catalog}: ${key}`);
  }
}
console.log('playMenu.selftest: separate multiplayer intent, keyboard containment, single failure presentation, localized entry refusals, and a version refusal banner with Refresh (no Rejoin while it stands)');
