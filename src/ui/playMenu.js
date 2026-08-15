import { PrivateRoomClientSession, PrivateRoomHostSession } from '../net/privateRoomSession.js';
import { RoomSignalingClient } from '../net/signalingClient.js';
import { resolveSignalUrl } from '../net/signalEndpoint.js';
import { serializeLobby } from '../net/lobby.js';
import { automaticPlayerName, normalizePlayerName } from '../net/playerNames.js';
import { normalizeRoomCode } from '../net/protocol.js';
import { ensureFonts, FONT_STACK, FONT_COND } from './fonts.js';

const STYLE_ID = 'cot-play-menu-style';
const PLAYER_ID_KEY = 'cot.player.id.v1';
const PLAYER_NAME_KEY = 'cot.player.name.v1';
const ROOM_SIZE_KEY = 'cot.room.size.v1';
const PUBLIC_STUN_SERVERS = Object.freeze([{
  urls: [
    'stun:stun.cloudflare.com:3478',
    'stun:stun.cloudflare.com:53',
    'stun:stun.l.google.com:19302',
  ],
}]);

const CSS = `
.cot-play{position:fixed;inset:0;z-index:92;display:none;align-items:center;justify-content:center;
  padding:24px;background:rgba(3,5,8,.76);backdrop-filter:blur(12px);font-family:${FONT_STACK};color:#edf3f7;}
.cot-play.show{display:flex}.cot-play *{box-sizing:border-box}.cot-play .panel{position:relative;width:min(980px,96vw);
  max-height:92vh;overflow:auto;background:linear-gradient(155deg,rgba(18,24,30,.985),rgba(7,10,14,.99));
  border:1px solid rgba(181,197,210,.3);box-shadow:0 30px 100px rgba(0,0,0,.72);padding:28px;}
.cot-play .close{position:absolute;right:14px;top:12px;width:40px;height:40px;border:0;background:none;
  color:#95a5b2;font-size:27px;cursor:pointer}.cot-play .eyebrow{font:800 10px ${FONT_COND};letter-spacing:.3em;
  text-transform:uppercase;color:#e69a36}.cot-play h2{margin:7px 0 4px;font-size:32px;letter-spacing:.02em}
.cot-play .lead{margin:0 0 22px;color:#9dadba;font-size:13px}.cot-play .modes{display:grid;
  grid-template-columns:repeat(4,1fr);gap:10px}.cot-play .mode{min-height:156px;text-align:left;padding:18px;
  color:#eef4f8;background:rgba(20,27,34,.86);border:1px solid rgba(161,180,195,.28);cursor:pointer}
.cot-play .mode:hover,.cot-play .mode.on{border-color:#e69a36;background:rgba(230,154,54,.1)}
.cot-play .mode b{display:block;font-size:17px;margin:8px 0}.cot-play .mode span{display:block;color:#9eafbc;
  font-size:11px;line-height:1.55}.cot-play .mode i{font:800 9px ${FONT_COND};font-style:normal;letter-spacing:.2em;
  color:#e69a36;text-transform:uppercase}.cot-play .room{display:none;margin-top:18px;padding-top:18px;
  border-top:1px solid rgba(160,180,195,.2)}.cot-play .room.show{display:block}.cot-play .setup{display:grid;gap:12px}
.cot-play .room.connected .setup{display:none}.cot-play .identity{display:flex;align-items:end;gap:14px}
.cot-play .identity label{width:min(300px,100%)}.cot-play .identity-note{padding-bottom:9px;color:#758794;font-size:10px}
.cot-play .room-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cot-play .room-action{display:grid;gap:14px;
  min-height:142px;padding:16px;border:1px solid rgba(161,180,195,.24);background:rgba(12,17,22,.76)}
.cot-play .room-action:hover{border-color:rgba(230,154,54,.48)}.cot-play .room-action-head{display:grid;gap:4px}
.cot-play .room-action-head i{color:#e69a36;font:800 9px ${FONT_COND};font-style:normal;letter-spacing:.18em;text-transform:uppercase}
.cot-play .room-action-head b{font-size:17px}.cot-play .room-action-head span{color:#8799a6;font-size:10px;line-height:1.45}
.cot-play .room-action-fields{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
.cot-play .code-input{font:900 17px ${FONT_COND}!important;letter-spacing:.16em;text-transform:uppercase}
.cot-play .advanced{border-top:1px solid rgba(160,180,195,.16);padding-top:8px;color:#80929f}
.cot-play .advanced summary{cursor:pointer;font:800 9px ${FONT_COND};letter-spacing:.14em;text-transform:uppercase}
.cot-play .advanced label{margin-top:9px}.cot-play label{display:grid;gap:5px;
  font:800 9px ${FONT_COND};letter-spacing:.16em;text-transform:uppercase;color:#8fa1ae}
.cot-play input,.cot-play select{height:40px;padding:0 11px;color:#edf3f7;background:#090d12;
  border:1px solid rgba(161,180,195,.3);font:700 12px ${FONT_STACK};outline:none}.cot-play input:focus,
.cot-play select:focus{border-color:#e69a36}.cot-play button.action{height:40px;padding:0 16px;border:1px solid #d98c2d;
  background:linear-gradient(#efa944,#ca6d13);color:#190d02;font:800 10px ${FONT_COND};letter-spacing:.15em;
  text-transform:uppercase;cursor:pointer}.cot-play button.action.alt{color:#e9f0f5;border-color:rgba(160,180,195,.4);
  background:rgba(20,27,34,.9)}.cot-play button:disabled{opacity:.42;cursor:not-allowed}.cot-play .status{min-height:18px;
  margin-top:10px;color:#aab9c5;font-size:11px}.cot-play .status.err{color:#f28a7d}.cot-play .lobby{display:none;margin-top:16px}
.cot-play .lobby.show{display:block}.cot-play .roomhead{display:flex;align-items:center;justify-content:space-between;
  gap:12px;padding:13px 15px;background:rgba(230,154,54,.08);border:1px solid rgba(230,154,54,.3)}
.cot-play .code{font:900 25px ${FONT_COND};letter-spacing:.18em;color:#ffd08b}.cot-play .roommeta{color:#91a4b2;
  font-size:10px}.cot-play .players{margin-top:8px;display:grid;gap:5px}.cot-play .player{display:grid;
  grid-template-columns:36px 1.2fr 1fr 1fr 80px;align-items:center;gap:10px;padding:9px 12px;
  background:rgba(13,18,24,.88);border-left:3px solid #657789;font-size:11px}.cot-play .player.alpha{border-left-color:#5da8e8}
.cot-play .player.bravo{border-left-color:#e16b5e}.cot-play .player .host{color:#e69a36;font:800 8px ${FONT_COND};
  letter-spacing:.12em}.cot-play .player .ready{color:#78d78a;text-align:right}.cot-play .player .wait{color:#7f909e;text-align:right}
.cot-play .controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.cot-play .controls select{min-width:140px}
.cot-play .note{margin-top:10px;color:#758794;font-size:10px;line-height:1.5}
.cot-play .ranked{display:none;margin-top:18px;padding-top:18px;border-top:1px solid rgba(160,180,195,.2)}
.cot-play .ranked.show{display:block}.cot-play .ranked-form{display:grid;grid-template-columns:1fr 1.5fr 120px auto auto;
  gap:8px;align-items:end}.cot-play .ladder{margin-top:14px;display:grid;gap:4px}.cot-play .ladder-row{display:grid;
  grid-template-columns:34px 1fr 100px 90px;gap:10px;padding:8px 10px;background:rgba(13,18,24,.88);
  color:#aebdc8;font-size:10px}.cot-play .ladder-row b{color:#edf3f7}.cot-play .rank-profile{margin-top:10px;
  color:#eeb46b;font:800 10px ${FONT_COND};letter-spacing:.1em;text-transform:uppercase}
@media(max-width:780px){.cot-play{padding:8px}.cot-play .panel{padding:20px 14px}.cot-play .modes{grid-template-columns:1fr 1fr}
  .cot-play .mode{min-height:120px}.cot-play .room-actions{grid-template-columns:1fr}.cot-play .identity{display:grid;gap:7px}
  .cot-play .identity-note{padding:0}.cot-play .room-action{min-height:124px}
  .cot-play .ranked-form{grid-template-columns:1fr 1fr}.cot-play .ranked-form label:nth-child(-n+2){grid-column:1/-1}
  .cot-play .player{grid-template-columns:26px 1fr 1fr}.cot-play .player .vehicle,.cot-play .player .team{display:none}}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function stored(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
}

function remember(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* session-only */ }
}

function playerId() {
  let id = stored(PLAYER_ID_KEY, '');
  if (/^[a-zA-Z0-9_-]{8,48}$/.test(id)) return id;
  const uuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  id = `p_${uuid.slice(0, 24)}`;
  remember(PLAYER_ID_KEY, id);
  return id;
}

function defaultSignalUrl(lan = false) {
  return resolveSignalUrl({
    configured: import.meta.env.VITE_SIGNAL_URL,
    lan,
    protocol: location.protocol,
    hostname: location.hostname,
  });
}

function defaultRankedUrl() {
  const configured = import.meta.env.VITE_MATCH_SERVICE_URL;
  if (configured) return configured;
  return `${location.protocol}//${location.hostname}:8790`;
}

async function iceServers(mode) {
  if (mode === 'lan') return { iceServers: [], relayOnly: false };
  const endpoint = import.meta.env.VITE_ICE_CONFIG_URL;
  if (!endpoint) return { iceServers: PUBLIC_STUN_SERVERS, relayOnly: false };
  const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('ICE configuration is unavailable');
  const body = await response.json();
  if (!body || !Array.isArray(body.iceServers)) throw new Error('ICE configuration is invalid');
  return { iceServers: body.iceServers, relayOnly: body.relayOnly === true };
}

export function createPlayMenu({
  maps = [],
  getSelection,
  onSolo,
  onNetworkStart,
  onRankedStart,
  isVehicleAllowed = () => true,
} = {}) {
  ensureFonts();
  ensureStyle();
  const root = document.createElement('div');
  root.className = 'cot-play';
  root.innerHTML = `<div class="panel"><button class="close" type="button" aria-label="Close">×</button>
    <div class="eyebrow">Choose operation</div><h2>Play Claude of Tanks</h2>
    <p class="lead">One vehicle roster. Four direct ways to deploy.</p>
    <div class="modes">
      <button class="mode" data-mode="solo" type="button"><i>Immediate</i><b>Solo vs bots</b><span>Run the same authoritative combat locally against a full bot roster.</span></button>
      <button class="mode" data-mode="private" type="button"><i>Room code</i><b>Private lobby</b><span>Create or join a direct WebRTC match with team switching.</span></button>
      <button class="mode" data-mode="lan" type="button"><i>Local network</i><b>LAN lobby</b><span>Use the same lobby over Wi-Fi with minimal route latency.</span></button>
      <button class="mode" data-mode="ranked" type="button"><i>Dedicated</i><b>Ranked</b><span>Server-authoritative queue and rating. Service endpoint required.</span></button>
    </div>
    <section class="room"><div class="setup">
      <div class="identity"><label>Callsign<input data-field="name" maxlength="24" autocomplete="nickname"></label>
        <span class="identity-note">A unique callsign is ready automatically. Edit it only if you want to.</span></div>
      <div class="room-actions">
        <div class="room-action"><div class="room-action-head"><i>Host</i><b>Create a room</b>
          <span>Choose a format now, then share the six-character code.</span></div>
          <div class="room-action-fields"><label>Battle format<select data-field="create-size">
            <option value="1">1 vs 1</option><option value="2">2 vs 2</option><option value="3">3 vs 3</option>
            <option value="5">5 vs 5</option><option value="7">7 vs 7</option></select></label>
            <button class="action" data-action="create" type="button">Create room</button></div></div>
        <div class="room-action"><div class="room-action-head"><i>Join</i><b>Enter a room code</b>
          <span>Paste the host's code; team and battlefield controls appear after connecting.</span></div>
          <div class="room-action-fields"><label>Room code<input class="code-input" data-field="code" maxlength="6"
            autocomplete="off" spellcheck="false" placeholder="ABC123"></label>
            <button class="action alt" data-action="join" type="button">Join room</button></div></div>
      </div>
      <details class="advanced"><summary>Connection settings</summary>
        <label>Signaling server<input data-field="signal" spellcheck="false"></label></details>
    </div><div class="status"></div><div class="lobby">
      <div class="roomhead"><div><div class="roommeta">ROOM CODE</div><div class="code"></div></div>
        <button class="action alt" data-action="copy" type="button">Copy code</button></div>
      <div class="players"></div><div class="controls">
        <select data-control="team"><option value="alpha">Team Alpha</option><option value="bravo">Team Bravo</option><option value="spectator">Spectator</option></select>
        <select data-control="size"><option value="1">1 vs 1</option><option value="2">2 vs 2</option><option value="3">3 vs 3</option><option value="5">5 vs 5</option><option value="7">7 vs 7</option></select>
        <select data-control="map"></select>
        <button class="action alt" data-action="ready" type="button">Ready</button>
        <button class="action" data-action="start" type="button">Start match</button>
      </div><div class="note"></div>
    </div></section>
    <section class="ranked"><div class="ranked-form">
      <label>Commander name<input data-ranked="name" maxlength="24" autocomplete="nickname"></label>
      <label>Match service<input data-ranked="service" spellcheck="false"></label>
      <label>Format<select data-ranked="size"><option value="1">1 vs 1</option><option value="2">2 vs 2</option><option value="3">3 vs 3</option><option value="5">5 vs 5</option><option value="7">7 vs 7</option></select></label>
      <button class="action" data-ranked="queue" type="button">Find match</button>
      <button class="action alt" data-ranked="cancel" type="button" disabled>Cancel</button>
    </div><div class="rank-profile"></div><div class="ladder"></div></section></div>`;
  document.body.appendChild(root);

  const room = root.querySelector('.room');
  const ranked = root.querySelector('.ranked');
  const lobbyEl = root.querySelector('.lobby');
  const status = root.querySelector('.status');
  const nameInput = root.querySelector('[data-field="name"]');
  const signalInput = root.querySelector('[data-field="signal"]');
  const codeInput = root.querySelector('[data-field="code"]');
  const createSizeSelect = root.querySelector('[data-field="create-size"]');
  const teamSelect = root.querySelector('[data-control="team"]');
  const sizeSelect = root.querySelector('[data-control="size"]');
  const mapSelect = root.querySelector('[data-control="map"]');
  const playersEl = root.querySelector('.players');
  const codeEl = root.querySelector('.code');
  const readyBtn = root.querySelector('[data-action="ready"]');
  const startBtn = root.querySelector('[data-action="start"]');
  const createBtn = root.querySelector('[data-action="create"]');
  const joinBtn = root.querySelector('[data-action="join"]');
  const note = root.querySelector('.note');
  const rankedName = root.querySelector('[data-ranked="name"]');
  const rankedService = root.querySelector('[data-ranked="service"]');
  const rankedSize = root.querySelector('[data-ranked="size"]');
  const rankedQueueBtn = root.querySelector('[data-ranked="queue"]');
  const rankedCancelBtn = root.querySelector('[data-ranked="cancel"]');
  const rankedProfile = root.querySelector('.rank-profile');
  const ladder = root.querySelector('.ladder');
  for (const map of maps) {
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = map.name;
    mapSelect.appendChild(option);
  }
  const ownPlayerId = playerId();
  const storedPlayerName = normalizePlayerName(stored(PLAYER_NAME_KEY, ''));
  nameInput.value = !storedPlayerName || storedPlayerName.toLocaleLowerCase('en-US') === 'commander'
    ? automaticPlayerName(ownPlayerId)
    : storedPlayerName;
  const storedRoomSize = Number(stored(ROOM_SIZE_KEY, '2'));
  createSizeSelect.value = ['1', '2', '3', '5', '7'].includes(String(storedRoomSize))
    ? String(storedRoomSize) : '2';
  rankedName.value = nameInput.value;
  rankedSize.value = createSizeSelect.value;
  rankedService.value = defaultRankedUrl();

  let mode = null;
  let session = null;
  let state = null;
  let role = null;
  let unsubscribeState = null;
  let handedOff = false;
  let connecting = false;
  let rankedClient = null;
  let rankedTicket = null;
  let rankedAbort = null;

  function setStatus(message, error = false) {
    status.textContent = message || '';
    status.classList.toggle('err', !!error);
  }

  function ownId() {
    return session && session.roomInfo && session.roomInfo.peerId;
  }

  function command(command) {
    try {
      const result = role === 'host' ? session.command(command) : session.submit(command);
      Promise.resolve(result).catch((error) => setStatus(error.message, true));
    } catch (error) { setStatus(error.message, true); }
  }

  function setConnecting(next) {
    connecting = next;
    const unavailable = !signalInput.value.trim();
    createBtn.disabled = next || unavailable;
    joinBtn.disabled = next || unavailable || codeInput.value.length !== 6;
  }

  function closeCurrentSession(reason = 'menu_closed') {
    if (unsubscribeState) unsubscribeState();
    unsubscribeState = null;
    if (session) session.close(reason);
    session = null;
    state = null;
    role = null;
    room.classList.remove('connected');
    lobbyEl.classList.remove('show');
    if (rankedAbort) rankedAbort.abort();
    rankedAbort = null;
    if (rankedTicket && rankedTicket.status === 'queued') {
      Promise.resolve(rankedTicket.cancel()).catch(() => {});
    }
    rankedTicket = null;
    rankedQueueBtn.disabled = false;
    rankedCancelBtn.disabled = true;
  }

  function renderLeaderboard(players = []) {
    ladder.textContent = '';
    for (const player of players.slice(0, 8)) {
      const row = document.createElement('div');
      row.className = 'ladder-row';
      const place = document.createElement('b');
      place.textContent = `#${player.place}`;
      const name = document.createElement('b');
      name.textContent = player.name;
      const rank = document.createElement('span');
      rank.textContent = player.rank;
      const rating = document.createElement('span');
      rating.textContent = `${player.rating} ELO`;
      row.append(place, name, rank, rating);
      ladder.appendChild(row);
    }
  }

  async function refreshRanked() {
    const { createRankedServiceClient } = await import('../net/rankedServiceClient.js');
    rankedClient = createRankedServiceClient({ url: rankedService.value.trim() });
    const identity = rankedClient.identity();
    if (identity) {
      try {
        const profile = await rankedClient.profile(identity.playerId);
        rankedProfile.textContent = `${profile.rank} · ${profile.rating} ELO · ${profile.matches} matches`;
      } catch (error) {
        if (error.status !== 404) throw error;
        rankedClient.clearIdentity();
        rankedProfile.textContent = 'New commanders begin at 1000 ELO';
      }
    } else rankedProfile.textContent = 'New commanders begin at 1000 ELO';
    const board = await rankedClient.leaderboard(8);
    renderLeaderboard(board.players);
  }

  async function queueRanked() {
    if (rankedTicket) return;
    const selection = getSelection();
    const name = rankedName.value.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!name) throw new Error('Enter a commander name');
    remember(PLAYER_NAME_KEY, name);
    nameInput.value = name;
    await refreshRanked();
    rankedQueueBtn.disabled = true;
    rankedCancelBtn.disabled = false;
    rankedAbort = new AbortController();
    rankedTicket = await rankedClient.join({
      name,
      specId: selection.specId,
      equipment: selection.equipment,
      teamSize: Number(rankedSize.value),
    });
    setStatus(`Searching ${rankedSize.value}v${rankedSize.value} near ${rankedTicket.rating} ELO…`);
    const state = rankedTicket.status === 'matched' ? rankedTicket : await rankedTicket.wait({
      signal: rankedAbort.signal,
      onUpdate: (next) => setStatus(`Searching near ${next.rating} ELO…`),
    });
    if (rankedAbort.signal.aborted) return;
    handedOff = true;
    hide(false);
    try {
      await Promise.resolve(onRankedStart && onRankedStart({
        serviceUrl: rankedClient.webSocketUrl,
        state,
      }));
    } catch (error) {
      handedOff = false;
      show();
      throw error;
    }
  }

  function renderLobby(next) {
    state = next;
    lobbyEl.classList.add('show');
    room.classList.add('connected');
    codeEl.textContent = next.roomCode;
    mapSelect.value = next.mapId;
    sizeSelect.value = String(next.teamSize || 1);
    createSizeSelect.value = sizeSelect.value;
    const me = next.players.find((player) => player.id === ownId());
    if (me) {
      teamSelect.value = me.team;
      if (nameInput.value !== me.name) {
        nameInput.value = me.name;
        rankedName.value = me.name;
        remember(PLAYER_NAME_KEY, me.name);
      }
      readyBtn.textContent = me.team === 'spectator' ? 'Watching' : me.ready ? 'Not ready' : 'Ready';
      readyBtn.disabled = me.team === 'spectator';
    }
    mapSelect.disabled = role !== 'host';
    sizeSelect.disabled = role !== 'host';
    startBtn.style.display = role === 'host' ? '' : 'none';
    startBtn.disabled = role !== 'host' || next.phase !== 'waiting' ||
      next.players.some((player) => player.team !== 'spectator' && (!player.ready || !player.specId));
    playersEl.textContent = '';
    for (const player of next.players) {
      const row = document.createElement('div');
      row.className = `player ${player.team}`;
      const host = document.createElement('span');
      host.className = 'host';
      host.textContent = player.isHost ? 'HOST' : '';
      const playerName = document.createElement('b');
      playerName.textContent = player.name;
      const vehicle = document.createElement('span');
      vehicle.className = 'vehicle';
      vehicle.textContent = player.specId || 'Selecting vehicle';
      const team = document.createElement('span');
      team.className = 'team';
      team.textContent = player.team === 'spectator' ? 'Spectator' : `Team ${player.team}`;
      const ready = document.createElement('span');
      ready.className = player.ready || player.team === 'spectator' ? 'ready' : 'wait';
      ready.textContent = player.team === 'spectator' ? 'WATCHING' : player.ready ? 'READY' : 'WAITING';
      row.append(host, playerName, vehicle, team, ready);
      playersEl.appendChild(row);
    }
    const fillNote = ` Bots fill empty slots to ${next.teamSize || 1} per team.`;
    note.textContent = (mode === 'lan'
      ? 'LAN uses direct WebRTC paths. Every device must reach the signaling address over the same Wi-Fi.'
      : 'Gameplay travels directly between peers; signaling only exchanges connection metadata.') + fillNote;
    if (next.phase === 'starting' && role === 'client' && !handedOff) {
      handedOff = true;
      hide(false);
      Promise.resolve(onNetworkStart && onNetworkStart({ role, session, lobbyState: next }))
        .catch((error) => { handedOff = false; show(); setStatus(error.message, true); });
    }
  }

  async function connectRoom(kind) {
    if (connecting || session) return;
    const selection = getSelection();
    const name = normalizePlayerName(nameInput.value) || automaticPlayerName(ownPlayerId);
    if (!name) throw new Error('Enter a player name');
    nameInput.value = name;
    remember(PLAYER_NAME_KEY, name);
    const signalUrl = signalInput.value.trim();
    if (!signalUrl) {
      throw new Error(mode === 'lan'
        ? 'Open the game from the LAN host or enter a reachable signaling server address.'
        : 'Private lobby signaling is unavailable on this deployment.');
    }
    const signaling = new RoomSignalingClient({ url: signalUrl });
    const player = { id: ownPlayerId, name };
    setConnecting(true);
    try {
      const ice = await iceServers(mode);
      if (kind === 'create') {
        const teamSize = Number(createSizeSelect.value);
        remember(ROOM_SIZE_KEY, String(teamSize));
        const roomInfo = await signaling.createRoom({ player, mode, maxPlayers: 14 });
        session = new PrivateRoomHostSession({
          signaling,
          roomInfo,
          hostName: name,
          hostSpecId: selection.specId,
          hostEquipment: selection.equipment,
          mapId: selection.mapId,
          teamSize,
          iceServers: ice.iceServers,
          relayOnly: ice.relayOnly,
          isVehicleAllowed,
          onStart: (lobbyState) => {
            if (handedOff) return;
            handedOff = true;
            hide(false);
            Promise.resolve(onNetworkStart && onNetworkStart({ role: 'host', session, lobbyState }))
              .catch((error) => { handedOff = false; show(); setStatus(error.message, true); });
          },
          onError: (error) => setStatus(error.message, true),
        });
        role = 'host';
        unsubscribeState = session.runtime.onState(renderLobby);
        renderLobby(serializeLobby(session.lobby));
      } else {
        const roomInfo = await signaling.joinRoom({ roomCode: codeInput.value, player });
        session = new PrivateRoomClientSession({
          signaling,
          roomInfo,
          iceServers: ice.iceServers,
          relayOnly: ice.relayOnly,
          onError: (error) => setStatus(error.message, true),
        });
        role = 'client';
        const runtime = await session.ready;
        unsubscribeState = runtime.onState(renderLobby);
        await session.submit({ type: 'select_vehicle', specId: selection.specId });
        await session.submit({ type: 'select_equipment', equipment: selection.equipment });
      }
    } catch (error) {
      closeCurrentSession('connection_failed');
      signaling.close('connection_failed');
      throw error;
    } finally {
      setConnecting(false);
    }
  }

  function selectMode(nextMode) {
    const button = root.querySelector(`.mode[data-mode="${nextMode}"]`);
    if (!button) return;
    if (nextMode === 'solo') { hide(); if (onSolo) onSolo(); return; }
    closeCurrentSession('mode_changed');
    mode = nextMode;
    for (const item of root.querySelectorAll('.mode')) item.classList.toggle('on', item === button);
    if (nextMode === 'ranked') {
      room.classList.remove('show');
      ranked.classList.add('show');
      setStatus('Server-authoritative matchmaking. Your rating is owned by the match service.');
      refreshRanked().catch((error) => setStatus(error.message, true));
      return;
    }
    ranked.classList.remove('show');
    room.classList.add('show');
    signalInput.value = defaultSignalUrl(mode === 'lan');
    setConnecting(false);
    if (!signalInput.value) {
      setStatus(mode === 'lan'
        ? 'Open this page from the LAN host or enter a secure Wi-Fi-reachable signaling address.'
        : 'Private lobby signaling is unavailable on this deployment.', true);
    } else {
      setStatus(mode === 'lan'
        ? 'Enter the Wi-Fi-reachable signaling address.'
        : 'Create a code or join an existing room.');
    }
  }
  root.querySelectorAll('.mode').forEach((button) => button.addEventListener('click', () => {
    selectMode(button.dataset.mode);
  }));
  createBtn.addEventListener('click', async () => {
    setStatus('Creating room…');
    try { await connectRoom('create'); setStatus('Room ready. Share the code.'); }
    catch (error) { setStatus(error.message, true); }
  });
  joinBtn.addEventListener('click', async () => {
    setStatus('Joining room…');
    try { await connectRoom('join'); setStatus('Connected. Choose a team and ready up.'); }
    catch (error) { setStatus(error.message, true); }
  });
  rankedQueueBtn.addEventListener('click', async () => {
    setStatus('Joining ranked queue…');
    try { await queueRanked(); }
    catch (error) {
      if (error.name !== 'AbortError') setStatus(error.message, true);
      rankedTicket = null;
      rankedQueueBtn.disabled = false;
      rankedCancelBtn.disabled = true;
    }
  });
  rankedCancelBtn.addEventListener('click', async () => {
    if (rankedAbort) rankedAbort.abort();
    try { if (rankedTicket) await rankedTicket.cancel(); } catch (_) { /* queue may have matched */ }
    rankedTicket = null;
    rankedQueueBtn.disabled = false;
    rankedCancelBtn.disabled = true;
    setStatus('Ranked search cancelled.');
  });
  root.querySelector('[data-action="copy"]').addEventListener('click', async () => {
    if (!state) return;
    try { await navigator.clipboard.writeText(state.roomCode); setStatus('Room code copied.'); }
    catch (_) { setStatus('Copy the code shown above.'); }
  });
  teamSelect.addEventListener('change', () => command({ type: 'set_team', team: teamSelect.value }));
  sizeSelect.addEventListener('change', () => {
    createSizeSelect.value = sizeSelect.value;
    remember(ROOM_SIZE_KEY, sizeSelect.value);
    command({ type: 'set_team_size', teamSize: Number(sizeSelect.value) });
  });
  mapSelect.addEventListener('change', () => command({ type: 'set_map', mapId: mapSelect.value }));
  readyBtn.addEventListener('click', () => {
    const me = state && state.players.find((player) => player.id === ownId());
    command({ type: 'set_ready', ready: !(me && me.ready) });
  });
  startBtn.addEventListener('click', () => {
    const words = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(words);
    else words[0] = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
    command({ type: 'start', matchSeed: words[0] });
  });
  codeInput.addEventListener('input', () => {
    codeInput.value = normalizeRoomCode(codeInput.value).slice(0, 6);
    setConnecting(connecting);
  });
  codeInput.addEventListener('paste', (event) => {
    const pasted = event.clipboardData?.getData('text');
    if (pasted == null) return;
    event.preventDefault();
    codeInput.value = normalizeRoomCode(pasted).slice(0, 6);
    setConnecting(connecting);
  });
  codeInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || joinBtn.disabled) return;
    event.preventDefault();
    joinBtn.click();
  });
  createSizeSelect.addEventListener('change', () => {
    remember(ROOM_SIZE_KEY, createSizeSelect.value);
    rankedSize.value = createSizeSelect.value;
  });
  signalInput.addEventListener('input', () => setConnecting(connecting));
  root.querySelector('.close').addEventListener('click', () => hide());
  root.addEventListener('click', (event) => { if (event.target === root) hide(); });

  function show(initialMode = null) {
    root.classList.add('show');
    if (initialMode) selectMode(initialMode);
  }
  function hide(closeSession = true) {
    root.classList.remove('show');
    if (closeSession && !handedOff) closeCurrentSession('menu_closed');
  }
  function dispose() {
    handedOff = false;
    hide(true);
    root.remove();
  }
  return { root, show, hide, dispose };
}
