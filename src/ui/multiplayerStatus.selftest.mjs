// The Multiplayer v2 network status surface: the strip cells and their
// accessible summary, the banner sentence for every banner fact (attempt and
// countdown included), the panel rows, the two-press leave arming, the style
// contract (no device-width breakpoints, the touch lanes, 44 px targets, a
// pointer-transparent root with interactive controls), and the real surface
// driven through its lifecycle on a stub document: paint, panel toggle with
// its remembered state, the banner's leave control once the link is bad, the
// leave key arming and confirming, the panel's leave button, dispose, and
// the lobby host without a leave.
import assert from 'node:assert/strict';

// ------------------------------------------------------------ a stub document (the module never queries markup back)

class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.id = '';
    this.hidden = false;
    this.type = '';
    this.innerHTML = '';
    this.ownText = '';
  }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this.ownText; }
  set textContent(value) { this.ownText = String(value); this.children.length = 0; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; } }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  click() { for (const listener of this.listeners.get('click') ?? []) listener({ type: 'click' }); }
  find(predicate) {
    for (const child of this.children) { if (predicate(child)) return child; const inner = child.find(predicate); if (inner) return inner; }
    return null;
  }
  all(predicate, out = []) { for (const child of this.children) { if (predicate(child)) out.push(child); child.all(predicate, out); } return out; }
}
const body = new FakeNode('body');
body.classList = { names: new Set(), add(name) { this.names.add(name); }, remove(name) { this.names.delete(name); }, contains(name) { return this.names.has(name); } };
const head = new FakeNode('head');
globalThis.document = {
  body, head,
  createElement: (tag) => new FakeNode(tag),
  getElementById: (id) => head.find((node) => node.id === id) ?? body.find((node) => node.id === id),
};

const {
  LEAVE_CONFIRM_MS, MP_STATUS_CSS, MP_STATUS_PANEL_STORAGE_KEY, createLeaveArming, createMultiplayerStatusSurface, dropReasonLabel,
  formatBanner, formatPanelRows, formatStrip, healthLabel, reasonLabel,
} = await import('./multiplayerStatus.ts');
const { NetworkStatusModel } = await import('../mp/session/networkStatus.ts');

const base = () => ({ ...new NetworkStatusModel().snapshot });
// A live snapshot names the rate its WELCOME carried (P3b, 2026-09-29: the host's rate rides the WELCOME and the surface
// prints it; the model's default is SNAPSHOT_HZ, 20 from that lane on) — this fixture is a 30 Hz match.
const live = (patch = {}) => ({
  ...base(), attached: true, transport: 'open', link: 'live', welcomed: true, rttMs: 64.4, rttMedianMs: 71.6, rttJitterMs: 3.6, localStallMs: 0, snapshotHz: 29.7, expectedSnapshotHz: 30, snapshotAgeMs: 41,
  interpolationDelayMs: 100.2, bufferedFrames: 3, lossRate: 0.012, correctionsPerS: 0.4, bytesInPerS: 12_400, bytesOutPerS: 3_380,
  room: 'joined', roomRttMs: 22, roomRegion: 'lan', seat: 4, rosterCount: 12, rosterCapacity: 28, roomPhase: 'playing', matchStatus: 'playing',
  health: 'good', healthReason: 'live', ...patch,
});

// ------------------------------------------------------------ formatting

{
  const strip = formatStrip(live());
  assert.deepEqual([strip.health, strip.ping, strip.pingUnit, strip.seat, strip.roster], ['good', '64', 'MS', 'SEAT 4', '12/28']);
  assert.match(strip.aria, /Good.*64 ms.*seat 4.*12 of 28/);
  const lobby = formatStrip({ ...base(), room: 'joined', roomRttMs: 23.6, seat: 0, rosterCount: 1, health: 'good', healthReason: 'room' });
  assert.deepEqual([lobby.ping, lobby.pingUnit, lobby.seat, lobby.roster], ['24', 'MS', 'SEAT 0', '1/28'], 'the lobby strip shows the room round trip');
  const idle = formatStrip(base());
  assert.deepEqual([idle.ping, idle.pingUnit, idle.seat], ['—', '', '']);
  assert.equal(formatStrip(live({ rttMs: 2500 })).ping, '999', 'the ping cell is bounded');
  assert.equal(healthLabel('degraded'), 'Unstable');
  assert.equal(reasonLabel('stale'), 'no recent updates');
  assert.equal(dropReasonLabel('idle_timeout'), 'idle too long');
  assert.equal(dropReasonLabel('bad_token'), 'reason: bad_token');
}

{
  assert.equal(formatBanner(null), '');
  assert.equal(formatBanner({ kind: 'reconnecting', scope: 'match', attempt: 2, nextRetryS: 3 }), 'Reconnecting · attempt 2 · next try in 3\u00a0s');
  assert.equal(formatBanner({ kind: 'reconnecting', scope: 'match', attempt: 1, nextRetryS: 0 }), 'Reconnecting · attempt 1');
  assert.equal(formatBanner({ kind: 'reconnecting', scope: 'room', attempt: 3, nextRetryS: 8 }), 'Room link lost · reconnecting (attempt 3, next try in 8\u00a0s)');
  assert.equal(formatBanner({ kind: 'reconnecting', scope: 'room', attempt: 3, nextRetryS: 0 }), 'Room link lost · reconnecting (attempt 3)');
  assert.equal(formatBanner({ kind: 'stalled' }), 'Server not responding · waiting for updates');
  assert.equal(formatBanner({ kind: 'dropped', reason: 'replaced' }), 'Removed from the battle · your seat reconnected from elsewhere');
  assert.equal(formatBanner({ kind: 'failed' }), 'Connection lost · the battle continues without you');
  assert.equal(formatBanner({ kind: 'degraded', reason: 'loss' }), 'Unstable connection · packet loss');
}

{
  const snapshot = live();
  const rows = formatPanelRows(snapshot);
  assert.equal(rows.length, 13);
  assert.deepEqual(rows.map(([label]) => label), ['Link', 'Round trip', 'Updates', 'Last update', 'Buffer', 'Loss', 'Corrections', 'Traffic', 'Reconnects', 'Room', 'Region', 'Seat', 'Seated']);
  const value = (label) => rows.find(([name]) => name === label)[1];
  assert.equal(value('Link'), 'Live');
  assert.equal(value('Round trip'), '64 ms (median 72) ± 4');
  assert.equal(value('Updates'), `29.7 of ${snapshot.expectedSnapshotHz} Hz`, 'the measured rate against the rate the WELCOME named');
  assert.equal(value('Last update'), '41 ms ago');
  assert.equal(value('Buffer'), '100 ms · 3 frames');
  assert.equal(value('Loss'), '1.2 %');
  assert.equal(value('Corrections'), '0.4 per s');
  assert.equal(value('Traffic'), '12.1 KB/s down · 3.3 KB/s up');
  assert.equal(value('Room'), 'Joined · In battle · 22 ms');
  assert.equal(value('Region'), 'lan');
  assert.equal(value('Seated'), '12 / 28');
  const reconnecting = formatPanelRows(live({ transport: 'reconnecting', link: 'reconnecting', reconnectAttempt: 2, rttMs: null }));
  assert.equal(reconnecting[0][1], 'Reconnecting · attempt 2');
  assert.equal(reconnecting[1][1], '—');
  const lobbyRows = formatPanelRows({ ...base(), room: 'connecting' });
  assert.deepEqual(lobbyRows.map(([label]) => label), ['Room', 'Region', 'Seat', 'Seated']);
  // (the strip's cells shown beside its ping: the panel leaves seat and seated to them and gives the round trip's median
  // and spread, never its figure again: UI-LOCKDOWN B12)
  const stripRows = formatPanelRows(snapshot, true);
  assert.deepEqual(stripRows.map(([label]) => label), ['Link', 'Round trip', 'Updates', 'Last update', 'Buffer', 'Loss', 'Corrections', 'Traffic', 'Reconnects', 'Room', 'Region']);
  assert.equal(stripRows.find(([label]) => label === 'Round trip')[1], 'median 72 ms ± 4');
  assert.deepEqual(lobbyRows.map(([, value]) => value), ['Connecting', '—', '—', '0 / 28']);
}

{
  let at = 1000;
  const arming = createLeaveArming({ now: () => at, confirmMs: 2000 });
  assert.equal(arming.armed(), false);
  assert.equal(arming.press(), 'armed');
  assert.equal(arming.armed(), true);
  at += 1999;
  assert.equal(arming.press(), 'left', 'a second press inside the window confirms');
  assert.equal(arming.armed(), false, 'confirming disarms');
  assert.equal(arming.press(), 'armed');
  at += 2001;
  assert.equal(arming.armed(), false, 'the window expires');
  assert.equal(arming.press(), 'armed', 'an expired arming starts over');
  arming.disarm();
  assert.equal(arming.armed(), false);
  assert.equal(LEAVE_CONFIRM_MS, 2500);
}

// ------------------------------------------------------------ the style contract

{
  assert.doesNotMatch(MP_STATUS_CSS, /@media[^\n]*(?:max-width|min-width|orientation|max-height|min-height)|matchMedia\(/, 'no device-layout breakpoints');
  assert.match(MP_STATUS_CSS, /body\.cot-touch-layout\[data-cot-panels='overlay'\]\[data-cot-orientation='portrait'\] \.cot-mp-status\{/, 'the portrait touch lane');
  assert.match(MP_STATUS_CSS, /body\.cot-touch-layout\[data-cot-height='short'\]\[data-cot-orientation='landscape'\] \.cot-mp-status\{/, 'the short landscape lane');
  assert.match(MP_STATUS_CSS, /body\[data-cot-width='phone'\] \.cot-mp-panel\{width:calc\(100vw - \(var\(--cot-edge\) \* 2\)\)/, 'the phone panel width');
  assert.match(MP_STATUS_CSS, /body\.cot-touch-layout \.cot-mp-strip\{min-height:44px/, 'a 44 px touch target for the strip');
  assert.match(MP_STATUS_CSS, /\.cot-mp-leave\{min-height:44px/, 'a 44 px leave control');
  assert.match(MP_STATUS_CSS, /\.cot-mp-status\{[^}]*pointer-events:none/, 'the root never takes the pointer');
  assert.match(MP_STATUS_CSS, /\.cot-mp-banner\{[^}]*pointer-events:none/, 'the banner never blocks input');
  assert.match(MP_STATUS_CSS, /\.cot-mp-strip\{[^}]*pointer-events:auto/, 'the strip is the tap target');
  assert.match(MP_STATUS_CSS, /\.cot-mp-banner\.leaving \.leave\{display:block\}/, 'the leave control shows in the banner only once leaving is on');
  assert.match(MP_STATUS_CSS, /body\.cot-debug-hud \.cot-mp-status\.battle\{display:none!important\}/, 'the engineering dashboard folds the strip in');
  // The battle strip is bare text in the top-right corner row, level with the fps/ping plate (2026-10-16 owner
  // review: it pushed the enemies roster down and was drawn as a boxed pill): it never stacks under the plate.
  assert.match(MP_STATUS_CSS, /\.cot-mp-status\{[^}]*top:8px;right:var\(--hud-network-corner-right,10px\)/, 'the corner row; the HUD lanes set its right edge');
  assert.doesNotMatch(MP_STATUS_CSS, /top:38px/, 'no lane under the fps/ping plate');
  assert.match(MP_STATUS_CSS, /\.cot-mp-status\.battle \.cot-mp-strip\{[^}]*border:0;background:none;box-shadow:none;text-shadow:0 1px 3px #000,0 0 5px #000\}/,
    'in battle: no box, no border, the bare HUD text shadow');
  assert.match(MP_STATUS_CSS, /\.cot-mp-strip\{[^}]*background:linear-gradient/, 'the lobby strip keeps its plate');
  assert.match(MP_STATUS_CSS, /\.cot-mp-status\.battle\[data-compact\] \.unit:not\(\.ping\)\{display:none\}/, 'a narrow corner row folds the strip to its ping');
  assert.match(MP_STATUS_CSS, /\.cot-mp-strip \.unit\[hidden\]\{display:none!important\}/, 'a hidden cell (the host badge off) takes no room');
  assert.match(MP_STATUS_CSS, /body:not\(\.cot-touch-layout\)\[data-cot-width='phone'\] \.cot-mp-status\.battle\{top:calc\(var\(--hud-objective-bottom,64px\) \+ 8px\)\}/,
    'a phone-width mouse window: the right lane under the objective');
}

// ------------------------------------------------------------ the surface on the stub document

{
  let at = 50_000;
  const stored = new Map();
  const storage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, value); } };
  let leaves = 0;
  // (the battle's banner is the kit's notice in the battle's region, battleNotices.ts: the receipt reads what it raised)
  let notice = null;
  let raised = 0;
  const notices = {
    show: (options) => { raised++; notice = { ...options }; },
    dismiss: (id) => { assert.equal(id, 'cot-mp-banner'); notice = null; },
  };
  const surface = createMultiplayerStatusSurface({ host: 'battle', onLeave: () => { leaves++; }, storage, now: () => at, leaveConfirmMs: 2000, notices });
  const root = surface.root;
  assert.ok(body.children.includes(root), 'the root mounts on the body');
  assert.equal(root.className, 'cot-mp-status battle');
  assert.ok(head.find((node) => node.id === 'cot-mp-status-style'), 'the style is injected once');
  // (one link readout, owner 2026-10-25: the strip holds body.cot-mp-battle while it is up, and a second strip's exit leaves it)
  assert.ok(body.classList.contains('cot-mp-battle'), 'a battle strip owns the link readout: the HUD corner drops its own');
  createMultiplayerStatusSurface({ host: 'battle', storage, now: () => at }).dispose();
  assert.ok(body.classList.contains('cot-mp-battle'), 'the class stays while a strip is still up');
  assert.equal(head.all((node) => node.id === 'cot-mp-status-style').length, 1);
  const strip = root.children.find((node) => node.className.startsWith('cot-mp-strip'));
  const panel = root.children.find((node) => node.id === 'cot-mp-panel');
  assert.ok(strip && panel, 'strip and panel exist');
  assert.ok(!body.children.some((node) => node.className.startsWith('cot-mp-banner')), 'no fixed banner box of its own in battle');
  assert.equal(strip.type, 'button');
  assert.equal(strip.getAttribute('aria-expanded'), 'false');
  assert.equal(strip.getAttribute('aria-controls'), 'cot-mp-panel');
  assert.equal(panel.hidden, true);
  assert.equal(notice, null);
  const cell = (name) => strip.children.find((node) => node.className === `unit ${name}`);
  assert.equal(cell('ping').children[0].textContent, '—');
  assert.equal(cell('seat').hidden, true);

  // a good sample
  surface.set(live(), null, at);
  assert.equal(strip.className, 'cot-mp-strip good');
  assert.equal(cell('ping').children[0].textContent, '64');
  assert.equal(cell('ping').children[1].textContent, 'MS');
  assert.equal(cell('seat').hidden, false);
  assert.equal(cell('seat').children[0].textContent, 'SEAT 4');
  assert.equal(cell('roster').children[0].textContent, '12/28');
  assert.match(strip.getAttribute('aria-label'), /Good/);
  assert.equal(notice, null, 'a good link raises nothing');

  // the panel: toggled, remembered, painted from the last sample
  surface.togglePanel();
  assert.equal(surface.panelOpen, true);
  assert.equal(panel.hidden, false);
  assert.equal(strip.getAttribute('aria-expanded'), 'true');
  assert.equal(stored.get(MP_STATUS_PANEL_STORAGE_KEY), '1');
  const rows = panel.children.find((node) => node.className === 'rows');
  const visibleRows = rows.children.filter((row) => !row.hidden);
  assert.equal(visibleRows.length, 13);
  assert.equal(visibleRows[0].children[0].textContent, 'Link');
  assert.equal(visibleRows[0].children[1].textContent, 'Live');
  assert.equal(panel.children.find((node) => node.className === 'head').children[1].textContent, 'Good · stable link');
  const panelLeave = panel.children.find((node) => node.className === 'cot-mp-leave');
  assert.equal(panelLeave.hidden, false);
  assert.equal(panelLeave.textContent, 'Leave battle');

  // a bad sample: the banner names the attempt and the countdown and offers the leave
  surface.set(live({ transport: 'reconnecting', link: 'reconnecting', reconnectAttempt: 2, health: 'bad', healthReason: 'reconnecting' }),
    { kind: 'reconnecting', scope: 'match', attempt: 2, nextRetryS: 3 }, at);
  // (the panel is open: its notice holds the text, never the banner as well, UI-LOCKDOWN B13)
  assert.equal(notice, null);
  assert.equal(panel.children.find((node) => node.className === 'notice').textContent, 'Reconnecting · attempt 2 · next try in 3\u00a0s');
  surface.togglePanel(false);
  assert.equal(notice.id, 'cot-mp-banner');
  assert.equal(notice.text, 'Reconnecting · attempt 2 · next try in 3\u00a0s');
  assert.equal(notice.severity, 'warning');
  assert.equal(notice.durationMs, null, 'it stays while the link is bad');
  assert.equal(notice.dismissible, false);
  assert.deepEqual(notice.actions.map((action) => action.label), ['Leave battle'], 'a bad link offers the leave');
  const shownOnce = raised;
  surface.set(live({ transport: 'reconnecting', link: 'reconnecting', reconnectAttempt: 2, health: 'bad', healthReason: 'reconnecting' }),
    { kind: 'reconnecting', scope: 'match', attempt: 2, nextRetryS: 3 }, at);
  assert.equal(raised, shownOnce, 'an unchanged sentence is not raised again');
  surface.togglePanel(true);
  assert.equal(notice, null, 'opening the panel takes the notice down');
  surface.togglePanel(false);
  assert.ok(notice, 'and closing it puts it back');
  assert.equal(strip.className, 'cot-mp-strip bad');
  assert.equal(panel.className, 'cot-mp-panel bad');
  assert.equal(rows.children.filter((row) => !row.hidden)[0].children[1].textContent, 'Reconnecting · attempt 2');
  // degraded: the banner explains, the leave stays out of the way
  surface.set(live({ rttMs: 210, health: 'degraded', healthReason: 'rtt' }), { kind: 'degraded', reason: 'rtt' }, at);
  assert.equal(notice.text, 'Unstable connection · high latency');
  assert.equal(notice.severity, 'warning');
  assert.deepEqual(notice.actions, [], 'the leave stays out of the way');
  // a server drop
  surface.set(live({ transport: 'closed', link: 'closed', closeReason: 'idle_timeout', seatDropped: true, health: 'offline', healthReason: 'dropped' }),
    { kind: 'dropped', reason: 'idle_timeout' }, at);
  assert.equal(notice.text, 'Removed from the battle · idle too long');
  assert.equal(notice.severity, 'error', 'a link the match let go is an error');
  assert.equal(notice.actions.length, 1);
  // the notice's leave leaves at once
  notice.actions[0].run();
  assert.equal(leaves, 1);
  assert.equal(notice.actions[0].keep, true, 'the leave keeps the notice until the battle goes');
  // back to good: the banner goes
  surface.set(live(), null, at);
  assert.equal(notice, null);
  surface.togglePanel(true);

  // the leave key: arm, expire, arm, confirm
  assert.equal(surface.pressLeave(), 'armed');
  assert.equal(notice, null, 'the open panel holds the notice');
  assert.equal(panel.children.find((node) => node.className === 'notice').textContent, 'Leave the battle? Press again to confirm');
  surface.togglePanel(false);
  assert.equal(notice.text, 'Leave the battle? Press again to confirm');
  assert.equal(notice.severity, 'warning', 'an armed leave is a warning, never an error');
  assert.equal(notice.actions.length, 1);
  surface.togglePanel(true);
  assert.equal(leaves, 1);
  at += 2001;
  surface.set(live(), null, at);
  assert.equal(notice, null, 'an expired arming clears the banner on the next sample');
  assert.equal(surface.pressLeave(), 'armed');
  at += 500;
  assert.equal(surface.pressLeave(), 'left');
  assert.equal(leaves, 2);
  // the panel's own button leaves at once
  panelLeave.click();
  assert.equal(leaves, 3);
  // the strip toggles the panel by tap
  strip.click();
  assert.equal(surface.panelOpen, false);
  assert.equal(stored.get(MP_STATUS_PANEL_STORAGE_KEY), '0');
  surface.set(live({ rttMs: 210, health: 'degraded', healthReason: 'rtt' }), { kind: 'degraded', reason: 'rtt' }, at);
  assert.ok(notice);
  surface.dispose();
  assert.ok(!body.children.includes(root), 'dispose removes the root');
  assert.equal(notice, null, 'and takes its notice down');
  assert.equal(surface.pressLeave(), 'ignored');
  assert.ok(!body.classList.contains('cot-mp-battle'), 'the last strip out hands the link back to the HUD corner');

  // a remembered panel opens at once; the lobby host is inline, without a leave
  stored.set(MP_STATUS_PANEL_STORAGE_KEY, '1');
  const container = new FakeNode('div');
  const lobby = createMultiplayerStatusSurface({ host: 'lobby', container, storage, now: () => at });
  assert.ok(container.children.includes(lobby.root));
  assert.equal(lobby.root.className, 'cot-mp-status lobby');
  assert.equal(lobby.panelOpen, true, 'the remembered panel state applies');
  const lobbyPanel = lobby.root.children.find((node) => node.id === 'cot-mp-panel');
  assert.equal(lobbyPanel.children.find((node) => node.className === 'cot-mp-leave').hidden, true, 'no leave in the lobby');
  assert.ok(lobby.root.children.some((node) => node.className.startsWith('cot-mp-banner lobby')), 'the lobby banner lives inside the strip root');
  lobby.set({ ...base(), room: 'reconnecting', roomReconnectAttempt: 1, health: 'bad', healthReason: 'room_reconnecting' },
    { kind: 'reconnecting', scope: 'room', attempt: 1, nextRetryS: 1 }, at);
  const lobbyBanner = lobby.root.children.find((node) => node.className.startsWith('cot-mp-banner'));
  assert.equal(lobbyBanner.children[0].textContent, 'Room link lost · reconnecting (attempt 1, next try in 1\u00a0s)');
  assert.equal(lobbyBanner.className, 'cot-mp-banner lobby bad', 'no leave control without a leave');
  assert.equal(lobby.pressLeave(), 'ignored');
  lobby.dispose();
  assert.equal(container.children.length, 0);
}

console.log('multiplayerStatus.selftest: strip, banner, panel rows, leave arming, style contract and the stub-document lifecycle PASS');

// ------------------------------------------------------------ peer-to-peer (P2 client lane): the host badge, the rows, the migration banner
{
  const peer = live({ role: 'peer', generation: 2, hostId: 'alice', candidateType: 'srflx', viaTurn: false, hostUplinkKbps: 0, peersConnected: 0, migrating: false, migrationHostId: null });
  const stripPeer = formatStrip(peer);
  assert.equal(stripPeer.host, '', 'a peer wears no badge');
  const host = live({ role: 'host', generation: 2, hostId: 'me', candidateType: null, viaTurn: true, hostUplinkKbps: 96.4, peersConnected: 5, migrating: false, migrationHostId: null });
  const stripHost = formatStrip(host);
  assert.equal(stripHost.host, 'HOST');
  assert.match(stripHost.aria, /Hosting the match for 5 peers/);
  const rowsPeer = formatPanelRows(peer);
  assert.equal(rowsPeer.length, 13 + 3, 'a peer adds role, path and generation');
  const valueOf = (rows, label) => rows.find(([name]) => name === label)?.[1];
  assert.equal(valueOf(rowsPeer, 'Role'), 'Peer');
  assert.equal(valueOf(rowsPeer, 'Path'), 'direct (NAT)');
  assert.equal(valueOf(rowsPeer, 'Generation'), '2');
  const rowsHost = formatPanelRows(host);
  assert.equal(rowsHost.length, 13 + 4, 'a host adds its uplink too');
  assert.equal(valueOf(rowsHost, 'Role'), 'Hosting for 5');
  assert.equal(valueOf(rowsHost, 'Path'), 'this browser · via TURN');
  assert.equal(valueOf(rowsHost, 'Host uplink'), '96 kbit/s');
  assert.equal(formatPanelRows(live()).length, 13, 'the WebSocket path keeps its 13 rows');
  assert.equal(formatBanner({ kind: 'migrating', host: 'Bob', self: false }), 'New host: Bob · resuming…');
  assert.equal(formatBanner({ kind: 'migrating', host: 'Me', self: true }), 'You are the new host · resuming the match…');
  // the real surface: the badge cell appears with the role and goes with it; the migration banner is not a leave banner
  let notice = null;
  const notices = { show: (options) => { notice = options; }, dismiss: () => { notice = null; } };
  const root = createMultiplayerStatusSurface({ host: 'battle', now: () => 1000, onLeave: () => {}, notices });
  const badge = root.root.find((node) => node.className === 'unit host');
  assert.ok(badge && badge.hidden, 'the badge cell exists, hidden');
  root.set(host, null, 1000);
  assert.equal(badge.hidden, false);
  assert.equal(badge.textContent, 'HOST');
  root.set(peer, { kind: 'migrating', host: 'Carol', self: false }, 1000);
  assert.equal(badge.hidden, true);
  assert.ok(notice, 'the banner shows');
  assert.equal(notice.severity, 'info', 'a new host is information');
  assert.deepEqual(notice.actions, [], 'a migration is not a reason to leave');
  assert.equal(notice.text, 'New host: Carol · resuming…');
  root.dispose();
  console.log('multiplayerStatus.selftest: the host badge, the peer-to-peer rows and the migration banner verified');
}
