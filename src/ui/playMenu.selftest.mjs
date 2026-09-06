import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./playMenu.ts', import.meta.url), 'utf8');
const responsive = await readFile(new URL('./responsiveSurfaces.css', import.meta.url), 'utf8');
assert.deepEqual([...source.matchAll(/class="mode" data-mode="([^"]+)"/g)].map(match => match[1]),
  ['solo', 'private', 'lan'], 'only supported modes have player-facing entry controls');
assert.doesNotMatch(source, /rankedServiceClient|rankedQueueLifecycle|onRankedStart|data-ranked|data-mode="ranked"/,
  'the removed mode cannot warm, queue, or render through the Play menu');
assert.match(source, /showRoomFailure\(reason: string, mode\?: PlayMode\): void/);
assert.match(source, /class="room-failure" hidden role="alert" aria-atomic="true" tabindex="-1"/);
assert.match(source, /aria-labelledby="cot-room-failure-title" aria-describedby="cot-room-failure-detail"/);
for (const action of ['retry', 'code', 'settings', 'garage']) {
  assert.match(source, new RegExp(`<button[^>]+data-room-failure="${action}"[^>]+type="button"`));
}
assert.match(source, /failureTitle\.textContent = failure\.title/);
assert.match(source, /failureDetail\.textContent = failure\.detail/);
assert.match(source, /retryBtn\.hidden = !failure\.canRetry \|\| !lastConnectionKind/);
assert.match(source, /generation === requestGeneration\) showFailure\(error\)/,
  'a retired request must not repaint a closed or replacement menu');
assert.match(source, /if \(session \|\| activeRoom \|\| connecting \|\| privateRoomConnection\.current\s*\|\| privateRoomConnection\.connecting\) return/,
  'late external failure presentation cannot cancel a newer lobby acquisition');
assert.match(source, /onClose: \(reason\) => \{\s*const wasHandedOff = handedOff \|\| !!activeRoom;\s*closeCurrentSession\(reason, \{ skipTransportClose: true \}\);[\s\S]*?if \(!wasHandedOff\) showRoomFailure\(reason\);\s*onNetworkClose\(reason\)/,
  'retained room ownership is captured before teardown so only parent cleanup presents its failure');
const detach = source.slice(source.indexOf('  function detachActiveRoom()'), source.indexOf('  function showCurrentRoom()'));
assert.match(detach, /if \(connecting \|\| privateRoomConnection\.connecting \|\| \(!handedOff && !activeRoom\)\) return/,
  'delayed room teardown cannot retire an in-flight or waiting replacement');
assert.match(detach, /if \(connection && \(!handedOff \|\| connection\.session !== session\)\) return/,
  'only the exact handed-off acquisition can be retired by frame cleanup');
assert.match(detach, /privateRoomConnection\.close\('room_connection_closed', \{ transportAlreadyClosed: true \}\)/,
  'intentional frame teardown retires the stale acquisition without closing its session twice');
assert.match(detach, /unsubscribeState = null;[\s\S]*roomIce = null/);
assert.match(detach, /clearRoomUrl\(\);\s*resetInvitation\(\)/,
  'retired room cleanup removes its durable invite only after the ownership guards pass');
assert.match(source, /room\.setAttribute\('aria-busy', String\(next\)\)/);
assert.match(source, /invalidInput\?\.setAttribute\('aria-describedby', 'cot-room-failure-detail'\)/);
assert.match(source, /\.room-failure button\.action\{min-height:44px/);
assert.match(source, /\.room-failure:focus-visible\{outline:2px/);
assert.match(responsive, /body\[data-cot-width='compact'\] \.cot-play \.room-failure-actions,\s*body\[data-cot-width='phone'\] \.cot-play \.room-failure-actions\{display:grid;grid-template-columns:1fr\}/,
  'room recovery actions use the shared compact and phone viewport policy');
console.log('playMenu.selftest: supported mode boundary, safe persistent alert/actions, and stale request presentation guards');
