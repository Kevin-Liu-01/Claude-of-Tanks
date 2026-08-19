/**
 * Battle-mode picker and private/LAN/ranked lobby presentation.
 *
 * This module owns the room-entry interface and translates user actions into
 * signaling/lobby commands. Canonical lobby and match state remain in src/net;
 * the menu renders that state and hands established sessions to main.js.
 */
import { PrivateRoomClientSession, PrivateRoomHostSession } from '../net/privateRoomSession.js';
import { RoomSignalingClient } from '../net/signalingClient.js';
import { resolveSignalUrl } from '../net/signalEndpoint.js';
import { serializeLobby } from '../net/lobby.js';
import { automaticPlayerName, normalizePlayerName } from '../net/playerNames.js';
import { normalizeRoomCode } from '../net/protocol.js';
import { createRoomInviteUrl, roomInviteTitle } from '../net/roomInvite.js';
import { ensureFonts, FONT_STACK, FONT_COND } from './fonts.js';
import { iconUrl } from './icons.js';
import { uiIconSVG } from './uiIcons.js';
import { ensureStyle } from './dom.js';

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
  grid-template-columns:repeat(4,1fr);gap:10px}.cot-play .mode{position:relative;min-height:156px;text-align:left;padding:18px;
  color:#eef4f8;background:rgba(20,27,34,.86);border:1px solid rgba(161,180,195,.28);cursor:pointer}
.cot-play .mode:hover,.cot-play .mode.on{border-color:#e69a36;background:rgba(230,154,54,.1)}
.cot-play.invite-entry .panel{border-color:rgba(230,154,54,.62);box-shadow:0 30px 100px rgba(0,0,0,.72),0 0 48px rgba(230,154,54,.08)}
.cot-play.invite-entry h2{color:#fff4df}.cot-play.invite-entry .lead{color:#c5d0d8}
.cot-play.lobby-active .modes{display:none}.cot-play.lobby-active .lead{margin-bottom:8px}.cot-play.lobby-active .room{margin-top:10px}
.cot-play .mode b{display:block;font-size:17px;margin:8px 0}.cot-play .mode-desc{display:block;color:#9eafbc;
  font-size:11px;line-height:1.55}.cot-play .mode i{display:block;padding-right:44px;font:800 9px ${FONT_COND};
  font-style:normal;letter-spacing:.2em;color:#e69a36;text-transform:uppercase}.cot-play .mode-icon{position:absolute;
  right:15px;top:13px;display:grid;width:36px;height:36px;place-items:center;color:#d7e1e8;background:rgba(5,9,13,.6);
  border:1px solid rgba(159,178,192,.26)}.cot-play .mode:hover .mode-icon,.cot-play .mode.on .mode-icon{color:#ffb452;
  border-color:rgba(230,154,54,.72);background:rgba(230,154,54,.09)}.cot-play .mode-icon svg{display:block}
.cot-play .room{display:none;margin-top:18px;padding-top:18px;
  border-top:1px solid rgba(160,180,195,.2)}.cot-play .room.show{display:block}.cot-play .setup{display:grid;gap:12px}
.cot-play .room.connected .setup{display:none}.cot-play .identity{display:flex;align-items:end;gap:14px}
.cot-play .identity label{width:min(300px,100%)}.cot-play .identity-note{padding-bottom:9px;color:#758794;font-size:10px}
.cot-play .room-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cot-play .room-action{display:grid;gap:14px;
  min-height:142px;padding:16px;border:1px solid rgba(161,180,195,.24);background:rgba(12,17,22,.76)}
.cot-play .room-action:hover{border-color:rgba(230,154,54,.48)}.cot-play .room-action-head{display:grid;gap:4px}
.cot-play .room-action-head i{color:#e69a36;font:800 9px ${FONT_COND};font-style:normal;letter-spacing:.18em;text-transform:uppercase}
.cot-play .room-action-head b{font-size:17px}.cot-play .room-action-head span{color:#8799a6;font-size:10px;line-height:1.45}
.cot-play .room-action-fields{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
.cot-play .field{display:grid;gap:5px}.cot-play .field-label{font:800 9px ${FONT_COND};letter-spacing:.16em;
  text-transform:uppercase;color:#8fa1ae}.cot-play .menu-select{position:relative;min-width:0}.cot-play .menu-select-trigger{
  position:relative;width:100%;height:40px;padding:0 38px 0 12px;text-align:left;color:#edf3f7;background:#090d12;
  border:1px solid #d98c2d;font:700 12px ${FONT_STACK};cursor:pointer}.cot-play .menu-select-trigger::after{content:"";
  position:absolute;right:13px;top:50%;width:7px;height:7px;border-right:2px solid #cbd6dd;border-bottom:2px solid #cbd6dd;
  transform:translateY(-68%) rotate(45deg);transition:transform .14s ease}.cot-play .menu-select.open .menu-select-trigger::after{
  transform:translateY(-30%) rotate(225deg)}.cot-play .menu-select-list{position:absolute;left:0;right:0;bottom:calc(100% + 5px);
  z-index:12;display:none;padding:5px;background:linear-gradient(160deg,rgba(24,29,34,.99),rgba(11,15,19,.995));
  border:1px solid rgba(230,154,54,.55);box-shadow:0 18px 40px rgba(0,0,0,.58)}.cot-play .menu-select.open .menu-select-list{
  display:grid}.cot-play .menu-select-option{min-height:40px;padding:0 12px;text-align:left;color:#c8d3db;background:transparent;
  border:1px solid transparent;font:700 12px ${FONT_STACK};cursor:pointer}.cot-play .menu-select-option:hover,
.cot-play .menu-select-option.on{color:#fff2df;background:rgba(230,154,54,.12);border-color:rgba(230,154,54,.32)}
.cot-play .menu-select-trigger:focus-visible,.cot-play .menu-select-option:focus-visible,.cot-play .mode:focus-visible,
.cot-play .close:focus-visible,.cot-play button.action:focus-visible{outline:2px solid #ffb452;outline-offset:2px}
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
  font-size:10px}.cot-play .players{margin-top:8px;display:grid;gap:6px}.cot-play .player{display:grid;
  grid-template-columns:42px minmax(120px,1fr) minmax(190px,1.35fr) minmax(90px,.55fr) 82px;align-items:center;
  gap:12px;min-height:58px;padding:7px 12px;background:rgba(13,18,24,.88);border:1px solid rgba(142,160,174,.12);
  border-left:3px solid #657789;font-size:11px;transition:border-color .2s ease,background .2s ease,box-shadow .2s ease}
.cot-play .player.alpha{border-left-color:#5da8e8}.cot-play .player.bravo{border-left-color:#e16b5e}
.cot-play .player.self.awaiting-ready{border-color:rgba(230,154,54,.35);border-left-color:#e69a36;
  background:linear-gradient(90deg,rgba(230,154,54,.09),rgba(13,18,24,.88) 32%)}
.cot-play .player .host{color:#e69a36;font:800 8px ${FONT_COND};letter-spacing:.12em}.cot-play .player .name{
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.cot-play .player .vehicle{display:flex;
  align-items:center;gap:10px;min-width:0;color:#dbe5eb}.cot-play .vehicle-icon{width:58px;height:42px;flex:0 0 58px;
  object-fit:contain;filter:drop-shadow(0 3px 5px rgba(0,0,0,.6));transform:scale(1.06)}.cot-play .vehicle-icon.missing{display:none}
.cot-play .vehicle-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cot-play .vehicle-copy{display:grid;min-width:0;gap:3px}.cot-play .vehicle-camo{color:#8fa1ae;font:800 8px ${FONT_COND};
  letter-spacing:.13em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cot-play .battlefield-card{position:relative;display:grid;grid-template-columns:minmax(220px,.85fr) minmax(280px,1.15fr);
  min-height:108px;margin-top:10px;overflow:hidden;border:1px solid rgba(161,180,195,.24);
  background:linear-gradient(110deg,rgba(12,18,23,.98),rgba(21,27,33,.88))}
.cot-play .battlefield-art{position:relative;min-height:108px;background-position:center;background-size:cover;
  border-right:1px solid rgba(161,180,195,.2)}.cot-play .battlefield-art::after{content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,rgba(5,8,11,.08),rgba(8,12,16,.78)),linear-gradient(0deg,rgba(5,8,11,.6),transparent 65%)}
.cot-play .battlefield-art span{position:absolute;z-index:1;left:13px;bottom:11px;color:#ffd08b;
  font:900 8px ${FONT_COND};letter-spacing:.2em;text-transform:uppercase}
.cot-play .battlefield-copy{display:grid;grid-template-columns:minmax(0,1fr) minmax(170px,.85fr);align-items:center;
  gap:18px;padding:15px 16px}.cot-play .battlefield-id{min-width:0}.cot-play .battlefield-id i{display:block;
  color:#e69a36;font:900 8px ${FONT_COND};font-style:normal;letter-spacing:.2em;text-transform:uppercase}
.cot-play .battlefield-id b{display:block;margin-top:7px;color:#f1f5f8;font-size:18px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}.cot-play .battlefield-id span{display:block;margin-top:5px;color:#8597a5;
  font-size:9px;line-height:1.4}.cot-play .battlefield-card.guest .battlefield-id i{color:#8293a0}
.cot-play .battlefield-card select{width:100%;border-color:#d98c2d}.cot-play .battlefield-card.guest select{border-color:rgba(161,180,195,.3)}
.cot-play .player .team{font:800 10px ${FONT_COND};
  letter-spacing:.08em;text-transform:uppercase;color:#aebfca}.cot-play .player.alpha .team{color:#82c3f4}
.cot-play .player.bravo .team{color:#f18c82}.cot-play .player .ready{color:#78d78a;text-align:right;font:800 9px ${FONT_COND};
  letter-spacing:.1em}.cot-play .player .wait{color:#e4aa58;text-align:right;font:800 9px ${FONT_COND};letter-spacing:.1em}
.cot-play .controls{display:flex;align-items:end;gap:8px;margin-top:12px}.cot-play .control-options,.cot-play .control-actions{
  display:flex;flex-wrap:wrap;align-items:end;gap:8px}.cot-play .control-actions{margin-left:auto;justify-content:flex-end}
.cot-play .controls select{min-width:140px}.cot-play .control-actions .action{min-width:128px}
.cot-play .leave-room{border-color:rgba(230,113,94,.4)!important;color:#efaaa0!important}
@keyframes cot-ready-attention{0%,100%{box-shadow:0 0 0 0 rgba(230,154,54,0),0 0 0 rgba(230,154,54,0)}
  48%{box-shadow:0 0 0 4px rgba(230,154,54,.16),0 0 24px rgba(230,154,54,.48);transform:translateY(-1px)}}
@keyframes cot-start-attention{0%,100%{box-shadow:0 0 0 0 rgba(255,185,80,0),0 0 0 rgba(255,185,80,0)}
  48%{box-shadow:0 0 0 5px rgba(255,185,80,.2),0 0 30px rgba(255,155,37,.62);transform:translateY(-1px)}}
.cot-play button.action.needs-ready{color:#fff0d8;border-color:#e69a36;background:rgba(88,52,17,.78);
  animation:cot-ready-attention 1.7s ease-in-out infinite}.cot-play button.action.is-ready{color:#a6edb2;
  border-color:rgba(120,215,138,.62);background:rgba(25,67,38,.6)}.cot-play button.action.can-start{
  animation:cot-start-attention 1.35s ease-in-out infinite}
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
  .cot-play .player{grid-template-columns:32px minmax(0,1fr) 72px;grid-template-rows:auto auto;min-height:80px;
    padding:7px 9px;column-gap:8px;row-gap:3px}.cot-play .player .host{grid-column:1;grid-row:1}.cot-play .player .name{
    grid-column:2;grid-row:1}.cot-play .player .ready,.cot-play .player .wait{grid-column:3;grid-row:1}.cot-play .player .vehicle{
    grid-column:1/3;grid-row:2;display:flex}.cot-play .player .team{grid-column:3;grid-row:2;display:block;text-align:right;font-size:8px}
  .cot-play .vehicle-icon{width:46px;height:32px;flex-basis:46px}.cot-play .vehicle-name{font-size:10px}.cot-play .controls{
    align-items:stretch;flex-direction:column}.cot-play .control-options,
  .cot-play .control-actions{width:100%}.cot-play .control-actions{margin-left:0}.cot-play .control-options select{flex:1 1 130px}
  .cot-play .battlefield-card{grid-template-columns:1fr}.cot-play .battlefield-art{min-height:82px;border-right:0;
    border-bottom:1px solid rgba(161,180,195,.2)}.cot-play .battlefield-copy{grid-template-columns:1fr;padding:12px;gap:10px}
  .cot-play .control-actions .action{flex:1 1 128px}}
@media(prefers-reduced-motion:reduce){.cot-play button.action.needs-ready,.cot-play button.action.can-start{animation:none;
  box-shadow:0 0 0 3px rgba(230,154,54,.16),0 0 18px rgba(230,154,54,.34)}}
`;

function stored(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
}

function remember(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* session-only */ }
}

function rememberClientRoomUrl(roomCode, mode, hostName = null) {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const invite = createRoomInviteUrl({ roomCode, mode, hostName, baseUrl: location.href });
    history.replaceState(history.state, '', invite);
  } catch (_) { /* URL persistence is a convenience, never a room dependency */ }
}

function clearClientRoomUrl() {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('room')) return;
    url.searchParams.delete('room');
    url.searchParams.delete('mode');
    url.searchParams.delete('host');
    history.replaceState(history.state, '', url.href);
  } catch (_) { /* cosmetic */ }
}

function lobbyTeamLabel(team) {
  if (team === 'alpha') return 'Team Alpha';
  if (team === 'bravo') return 'Team Bravo';
  return 'Spectator';
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

function bindMenuSelect(control) {
  const trigger = control.querySelector('[data-select-trigger]');
  const valueLabel = trigger.querySelector('span');
  const options = [...control.querySelectorAll('[role="option"]')];

  function selectedIndex() {
    const index = options.findIndex((option) => option.dataset.value === control.dataset.value);
    return index < 0 ? 0 : index;
  }

  function setValue(nextValue, emit = false) {
    const option = options.find((item) => item.dataset.value === String(nextValue));
    if (!option) return;
    control.dataset.value = option.dataset.value;
    valueLabel.textContent = option.textContent;
    for (const item of options) {
      const selected = item === option;
      item.classList.toggle('on', selected);
      item.setAttribute('aria-selected', String(selected));
    }
    if (emit) control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function close(restoreFocus = false) {
    if (!control.classList.contains('open')) return;
    control.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function open(index = selectedIndex()) {
    control.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    options[Math.max(0, Math.min(options.length - 1, index))]?.focus();
  }

  Object.defineProperty(control, 'value', {
    configurable: true,
    get: () => control.dataset.value,
    set: (nextValue) => setValue(nextValue),
  });
  setValue(control.dataset.value);

  trigger.addEventListener('click', () => {
    if (control.classList.contains('open')) close();
    else open();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      open(event.key === 'Home' ? 0 : options.length - 1);
    }
  });
  options.forEach((option, index) => {
    option.tabIndex = -1;
    option.addEventListener('click', () => {
      setValue(option.dataset.value, true);
      close(true);
    });
    option.addEventListener('keydown', (event) => {
      let nextIndex = index;
      if (event.key === 'ArrowDown') nextIndex = (index + 1) % options.length;
      else if (event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = options.length - 1;
      else if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
        return;
      } else if (event.key === 'Tab') {
        close();
        return;
      } else return;
      event.preventDefault();
      options[nextIndex].focus();
    });
  });

  return { close };
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
  onLobbyChange,
  isVehicleAllowed = () => true,
  isCamoAllowed = () => true,
  getCamoName = (camo) => camo || 'Factory',
  getVehicleName = (specId) => specId,
} = {}) {
  ensureFonts();
  ensureStyle(STYLE_ID, CSS);
  const root = document.createElement('div');
  root.className = 'cot-play';
  root.innerHTML = `<div class="panel"><button class="close" type="button" aria-label="Close">×</button>
    <div class="eyebrow">Choose operation</div><h2>Play Claude of Tanks</h2>
    <p class="lead">One vehicle roster. Four direct ways to deploy.</p>
    <div class="modes">
      <button class="mode" data-mode="solo" type="button"><span class="mode-icon">${uiIconSVG('battleBots', 24)}</span><i>Immediate</i><b>Solo vs bots</b><span class="mode-desc">Run the same authoritative combat locally against a full bot roster.</span></button>
      <button class="mode" data-mode="private" type="button"><span class="mode-icon">${uiIconSVG('battlePrivate', 24)}</span><i>Room code</i><b>Private lobby</b><span class="mode-desc">Create or join a direct WebRTC match with team switching.</span></button>
      <button class="mode" data-mode="lan" type="button"><span class="mode-icon">${uiIconSVG('battleLan', 24)}</span><i>Local network</i><b>LAN lobby</b><span class="mode-desc">Use the same lobby over Wi-Fi with minimal route latency.</span></button>
      <button class="mode" data-mode="ranked" type="button"><span class="mode-icon">${uiIconSVG('battleRanked', 24)}</span><i>Dedicated</i><b>Ranked</b><span class="mode-desc">Server-authoritative queue and rating. Service endpoint required.</span></button>
    </div>
    <section class="room"><div class="setup">
      <div class="identity"><label>Callsign<input data-field="name" maxlength="24" autocomplete="nickname"></label>
        <span class="identity-note">A unique callsign is ready automatically. Edit it only if you want to.</span></div>
      <div class="room-actions">
        <div class="room-action"><div class="room-action-head"><i>Host</i><b>Create a room</b>
          <span>Choose a format, then send the invite link to another player.</span></div>
          <div class="room-action-fields"><div class="field"><span class="field-label" id="cot-create-size-label">Battle format</span>
            <div class="menu-select" data-field="create-size" data-value="2">
              <button class="menu-select-trigger" data-select-trigger type="button" aria-haspopup="listbox" aria-expanded="false"
                aria-controls="cot-create-size-list" aria-labelledby="cot-create-size-label cot-create-size-value">
                <span id="cot-create-size-value">2 vs 2</span></button>
              <div class="menu-select-list" id="cot-create-size-list" role="listbox" aria-labelledby="cot-create-size-label">
                <button class="menu-select-option" type="button" role="option" data-value="1" aria-selected="false">1 vs 1</button>
                <button class="menu-select-option" type="button" role="option" data-value="2" aria-selected="true">2 vs 2</button>
                <button class="menu-select-option" type="button" role="option" data-value="3" aria-selected="false">3 vs 3</button>
                <button class="menu-select-option" type="button" role="option" data-value="5" aria-selected="false">5 vs 5</button>
                <button class="menu-select-option" type="button" role="option" data-value="7" aria-selected="false">7 vs 7</button>
              </div>
            </div></div>
            <button class="action" data-action="create" type="button">Create room</button></div></div>
        <div class="room-action"><div class="room-action-head"><i>Join</i><b>Enter a room code</b>
          <span>Paste the host's code; team and battlefield controls appear after connecting.</span></div>
          <div class="room-action-fields"><label>Room code<input class="code-input" data-field="code" maxlength="6"
            autocomplete="off" spellcheck="false" placeholder="ABC123"></label>
            <button class="action alt" data-action="join" type="button">Join room</button></div></div>
      </div>
      <details class="advanced"><summary>Connection settings</summary>
        <label>Signaling server<input data-field="signal" spellcheck="false"></label></details>
    </div><div class="status" aria-live="polite"></div><div class="lobby">
      <div class="roomhead"><div><div class="roommeta">ROOM CODE</div><div class="code"></div></div>
        <button class="action alt" data-action="copy" type="button">Copy invite link</button></div>
      <div class="battlefield-card"><div class="battlefield-art"><span>Battlefield briefing</span></div>
        <div class="battlefield-copy"><div class="battlefield-id"><i data-map-role>Host selectable</i><b data-map-name>Random battlefield</b>
          <span>Changing the operation resets readiness so every commander sees the final choice.</span></div>
          <label>Battlefield<select data-control="map" aria-label="Battlefield"></select></label></div></div>
      <div class="players"></div><div class="controls">
        <div class="control-options"><select data-control="team" aria-label="Team"><option value="alpha">Team Alpha</option><option value="bravo">Team Bravo</option><option value="spectator">Spectator</option></select>
          <select data-control="size" aria-label="Battle format"><option value="1">1 vs 1</option><option value="2">2 vs 2</option><option value="3">3 vs 3</option><option value="5">5 vs 5</option><option value="7">7 vs 7</option></select></div>
        <div class="control-actions"><button class="action alt leave-room" data-action="leave" type="button">Leave room</button>
          <button class="action alt" data-action="ready" type="button">I'm ready</button>
          <button class="action" data-action="start" type="button">Start match</button></div>
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

  const closeBtn = root.querySelector('.close');
  const room = root.querySelector('.room');
  const ranked = root.querySelector('.ranked');
  const lobbyEl = root.querySelector('.lobby');
  const eyebrow = root.querySelector('.eyebrow');
  const menuTitle = root.querySelector('h2');
  const menuLead = root.querySelector('.lead');
  const status = root.querySelector('.status');
  const nameInput = root.querySelector('[data-field="name"]');
  const signalInput = root.querySelector('[data-field="signal"]');
  const codeInput = root.querySelector('[data-field="code"]');
  const createSizeSelect = root.querySelector('[data-field="create-size"]');
  const createSizeMenu = bindMenuSelect(createSizeSelect);
  const teamSelect = root.querySelector('[data-control="team"]');
  const sizeSelect = root.querySelector('[data-control="size"]');
  const mapSelect = root.querySelector('[data-control="map"]');
  const battlefieldCard = root.querySelector('.battlefield-card');
  const battlefieldArt = root.querySelector('.battlefield-art');
  const battlefieldName = root.querySelector('[data-map-name]');
  const battlefieldRole = root.querySelector('[data-map-role]');
  const playersEl = root.querySelector('.players');
  const codeEl = root.querySelector('.code');
  const readyBtn = root.querySelector('[data-action="ready"]');
  const startBtn = root.querySelector('[data-action="start"]');
  const leaveBtn = root.querySelector('[data-action="leave"]');
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
  const defaultDocumentTitle = document.documentElement.dataset.baseTitle || document.title;
  const defaultEyebrow = eyebrow.textContent;
  const defaultMenuTitle = menuTitle.textContent;
  const defaultMenuLead = menuLead.textContent;
  const mapById = new Map();
  for (const map of maps) {
    mapById.set(map.id, map);
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
  let activeRoom = null;
  let connecting = false;
  let rankedClient = null;
  let rankedTicket = null;
  let rankedAbort = null;
  let invitedHostName = null;

  function hostNameFromRoom(value) {
    const explicit = normalizePlayerName(value?.hostName);
    if (explicit) return explicit;
    const hostId = value?.hostId;
    const players = Array.isArray(value?.players) ? value.players : value?.peers;
    const host = Array.isArray(players)
      ? players.find((player) =>
        player?.isHost || player?.id === hostId || player?.peerId === hostId)
      : null;
    return normalizePlayerName(host?.name || host?.player?.name);
  }

  function presentInvitation(hostName, roomCode, connected = false) {
    const resolvedHost = normalizePlayerName(hostName);
    if (resolvedHost) invitedHostName = resolvedHost;
    const code = normalizeRoomCode(roomCode);
    root.classList.add('invite-entry');
    eyebrow.textContent = mode === 'lan' ? 'LAN invitation' : 'Private invitation';
    menuTitle.textContent = roomInviteTitle(invitedHostName);
    menuLead.textContent = connected
      ? 'You are in room ' + code + '. Choose your vehicle, team, and ready state.'
      : 'Room ' + code + ' is ready. Connecting you directly to the host.';
    document.title = menuTitle.textContent + ' — Claude of Tanks';
  }

  function resetInvitation() {
    invitedHostName = null;
    root.classList.remove('invite-entry');
    eyebrow.textContent = defaultEyebrow;
    menuTitle.textContent = defaultMenuTitle;
    menuLead.textContent = defaultMenuLead;
    if (document.title.startsWith('Join ')) document.title = defaultDocumentTitle;
  }

  function setStatus(message, error = false) {
    status.textContent = message || '';
    status.classList.toggle('err', !!error);
  }

  function notifyLobbyChange(next = state) {
    if (typeof onLobbyChange !== 'function' || activeRoom) return;
    try {
      onLobbyChange(next ? {
        state: next,
        playerId: ownId(),
        role: role || 'client',
      } : null);
    } catch (error) {
      console.error('[play-menu] lobby presentation failed', error);
    }
  }

  function setClosePurpose(inRoom) {
    const label = inRoom ? 'Back to garage — stay in room' : 'Close';
    closeBtn.setAttribute('aria-label', label);
    closeBtn.title = label;
  }

  function ownId() {
    return activeRoom?.playerId || (session && session.roomInfo && session.roomInfo.peerId);
  }

  function command(command) {
    try {
      const result = activeRoom
        ? activeRoom.command(command)
        : role === 'host' ? session.command(command) : session.submit(command);
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
    if (activeRoom) activeRoom.leave(reason);
    else if (session) session.close(reason);
    session = null;
    activeRoom = null;
    state = null;
    role = null;
    notifyLobbyChange(null);
    clearClientRoomUrl();
    resetInvitation();
    setClosePurpose(false);
    room.classList.remove('connected');
    lobbyEl.classList.remove('show');
    root.classList.remove('lobby-active');
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
      camo: selection.camo,
      teamSize: Number(rankedSize.value),
    });
    setStatus(`Searching ${rankedSize.value}v${rankedSize.value} near ${rankedTicket.rating} ELO…`);
    const state = rankedTicket.status === 'matched' ? rankedTicket : await rankedTicket.wait({
      signal: rankedAbort.signal,
      onUpdate: (next) => setStatus(`Searching near ${next.rating} ELO…`),
    });
    if (rankedAbort.signal.aborted) return;
    handedOff = true;
    try {
      // Let the battle owner mount its opaque transition synchronously before
      // this menu disappears. A cold dedicated-client import used to expose
      // one or more garage frames between these two operations.
      const handoff = onRankedStart && onRankedStart({
        serviceUrl: rankedClient.webSocketUrl,
        state,
      });
      hide(false);
      await Promise.resolve(handoff);
    } catch (error) {
      handedOff = false;
      show();
      throw error;
    }
  }

  function beginNetworkHandoff(next, nextRole = role) {
    if (handedOff) return false;
    handedOff = true;
    let start;
    try {
      // The callback's synchronous prefix mounts the opaque battle cover.
      // Invoke it before any more lobby DOM work and before closing the menu;
      // guest machines otherwise pay that work with the garage underneath.
      start = Promise.resolve(onNetworkStart &&
        onNetworkStart({ role: nextRole, session, lobbyState: next }));
    } catch (error) {
      handedOff = false;
      setStatus(error.message, true);
      return false;
    }
    notifyLobbyChange(null);
    hide(false);
    start.catch((error) => { handedOff = false; show(); setStatus(error.message, true); });
    return true;
  }

  function renderLobby(next) {
    state = next;
    const roomHostName = hostNameFromRoom(next);
    // A joined browser carries its room in the canonical URL. Reloading after
    // a finished round therefore re-enters the still-live host room instead
    // of silently forgetting the session. Hosts keep the clean URL because a
    // browser-hosted authority cannot survive its own document being killed.
    if (role === 'client' && next.roomCode) {
      rememberClientRoomUrl(next.roomCode, next.mode || mode, roomHostName);
      presentInvitation(roomHostName, next.roomCode, true);
    }
    // A client learns that the host started through this state callback. Cover
    // immediately; rebuilding the now-obsolete lobby first creates a guest-
    // only window in which a constrained renderer can present the garage.
    if (next.phase === 'starting' && role === 'client' && !handedOff && !activeRoom) {
      beginNetworkHandoff(next, 'client');
      return;
    }
    setClosePurpose(true);
    notifyLobbyChange(next);
    lobbyEl.classList.add('show');
    room.classList.add('connected');
    root.classList.add('lobby-active');
    codeEl.textContent = next.roomCode;
    mapSelect.value = next.mapId;
    const selectedMap = mapById.get(next.mapId) || mapById.get('random') || maps[0];
    battlefieldName.textContent = selectedMap?.name || next.mapId || 'Random battlefield';
    battlefieldArt.style.backgroundImage = selectedMap?.thumb
      ? `url("${selectedMap.thumb.replace(/"/g, '%22')}")`
      : 'conic-gradient(from 25deg,#314931,#8b7446,#7d8c98,#474b51,#314931)';
    battlefieldRole.textContent = role === 'host' ? 'Host selectable' : 'Selected by host';
    battlefieldCard.classList.toggle('guest', role !== 'host');
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
      readyBtn.textContent = me.team === 'spectator' ? 'Watching' : me.ready ? 'Not ready' : "I'm ready";
      readyBtn.disabled = me.team === 'spectator' || next.phase !== 'waiting';
      readyBtn.classList.toggle('needs-ready', me.team !== 'spectator' && !me.ready && next.phase === 'waiting');
      readyBtn.classList.toggle('is-ready', me.team !== 'spectator' && me.ready);
      readyBtn.setAttribute('aria-pressed', String(me.team !== 'spectator' && me.ready));
      readyBtn.setAttribute('aria-label', me.ready ? 'Mark yourself not ready' : 'Mark yourself ready');
    } else {
      readyBtn.classList.remove('needs-ready', 'is-ready');
      readyBtn.removeAttribute('aria-pressed');
    }
    teamSelect.disabled = next.phase !== 'waiting' || !!me?.ready;
    mapSelect.disabled = role !== 'host' || next.phase !== 'waiting';
    sizeSelect.disabled = role !== 'host' || next.phase !== 'waiting';
    startBtn.style.display = role === 'host' ? '' : 'none';
    const activePlayers = next.players.filter((player) => player.team !== 'spectator');
    const everyoneReady = activePlayers.length > 0 &&
      activePlayers.every((player) => player.ready && player.specId);
    const canStart = role === 'host' && next.phase === 'waiting' && everyoneReady;
    startBtn.disabled = !canStart;
    startBtn.classList.toggle('can-start', canStart);
    playersEl.textContent = '';
    for (const player of next.players) {
      const row = document.createElement('div');
      const isMe = player.id === ownId();
      row.className = `player ${player.team}${isMe ? ' self' : ''}${
        isMe && player.team !== 'spectator' && !player.ready ? ' awaiting-ready' : ''}`;
      const host = document.createElement('span');
      host.className = 'host';
      host.textContent = player.isHost ? 'HOST' : '';
      const playerName = document.createElement('b');
      playerName.className = 'name';
      playerName.textContent = player.name;
      const vehicle = document.createElement('div');
      vehicle.className = 'vehicle';
      if (player.specId) {
        const icon = document.createElement('img');
        icon.className = 'vehicle-icon';
        icon.src = iconUrl(player.specId, 'angle');
        icon.alt = '';
        icon.loading = 'lazy';
        icon.decoding = 'async';
        icon.addEventListener('error', () => icon.classList.add('missing'), { once: true });
        const vehicleCopy = document.createElement('span');
        vehicleCopy.className = 'vehicle-copy';
        const vehicleName = document.createElement('span');
        vehicleName.className = 'vehicle-name';
        try { vehicleName.textContent = getVehicleName(player.specId) || player.specId; }
        catch (_) { vehicleName.textContent = player.specId; }
        const vehicleCamo = document.createElement('span');
        vehicleCamo.className = 'vehicle-camo';
        vehicleCamo.textContent = `${getCamoName(player.camo || 'factory')} camouflage`;
        vehicleCopy.append(vehicleName, vehicleCamo);
        vehicle.append(icon, vehicleCopy);
      } else {
        const vehicleName = document.createElement('span');
        vehicleName.className = 'vehicle-name';
        vehicleName.textContent = 'Selecting vehicle';
        vehicle.appendChild(vehicleName);
      }
      const team = document.createElement('span');
      team.className = 'team';
      team.textContent = lobbyTeamLabel(player.team);
      const ready = document.createElement('span');
      ready.className = player.ready || player.team === 'spectator' ? 'ready' : 'wait';
      ready.textContent = player.team === 'spectator' ? 'WATCHING' : player.ready ? 'READY' : 'NOT READY';
      row.append(host, playerName, vehicle, team, ready);
      playersEl.appendChild(row);
    }
    const fillNote = ` Bots fill empty slots to ${next.teamSize || 1} per team.`;
    note.textContent = (mode === 'lan'
      ? 'LAN gameplay stays on direct Wi-Fi WebRTC paths; signaling only introduces the peers.'
      : 'Gameplay travels directly between peers; signaling only exchanges connection metadata.') + fillNote;
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
        ? 'Automatic LAN signaling is unavailable. Open connection settings to enter a fallback address.'
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
          hostCamo: selection.camo,
          mapId: selection.mapId,
          teamSize,
          iceServers: ice.iceServers,
          relayOnly: ice.relayOnly,
          isVehicleAllowed,
          isCamoAllowed,
          isMapAllowed: (mapId) => maps.some((map) => map.id === mapId),
          onStart: (lobbyState) => {
            beginNetworkHandoff(lobbyState, 'host');
          },
          onError: (error) => setStatus(error.message, true),
        });
        role = 'host';
        unsubscribeState = session.runtime.onState(renderLobby);
        renderLobby(serializeLobby(session.lobby));
      } else {
        const roomInfo = await signaling.joinRoom({ roomCode: codeInput.value, player });
        presentInvitation(hostNameFromRoom(roomInfo), roomInfo.roomCode, false);
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
        await session.submit({ type: 'select_camo', camo: selection.camo });
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
    createSizeMenu.close();
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
        ? 'Automatic LAN signaling is unavailable. Open connection settings to enter a fallback address.'
        : 'Private lobby signaling is unavailable on this deployment.', true);
    } else {
      setStatus(mode === 'lan'
        ? 'LAN is ready. Create a room and share its invite link; gameplay stays on your Wi-Fi.'
        : 'Create a code or join an existing room.');
    }
  }
  root.querySelectorAll('.mode').forEach((button) => button.addEventListener('click', () => {
    selectMode(button.dataset.mode);
  }));
  createBtn.addEventListener('click', async () => {
    setStatus('Creating room…');
    try { await connectRoom('create'); setStatus('Room ready. Copy the invite link.'); }
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
    const inviteUrl = createRoomInviteUrl({
      roomCode: state.roomCode,
      mode,
      hostName: hostNameFromRoom(state),
      baseUrl: location.href,
    });
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setStatus('Invite link copied. Send it to another player.');
    } catch (_) {
      setStatus(`Invite link: ${inviteUrl}`);
    }
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
  leaveBtn.addEventListener('click', () => {
    closeCurrentSession('left_room');
    hide(false);
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
  root.addEventListener('pointerdown', (event) => {
    if (!createSizeSelect.contains(event.target)) createSizeMenu.close();
  });
  root.addEventListener('click', (event) => { if (event.target === root) hide(); });

  function show(initialMode = null, invite = null) {
    if (showCurrentRoom()) return;
    root.classList.add('show');
    if (initialMode) selectMode(initialMode);
    const inviteCode = normalizeRoomCode(invite && invite.roomCode);
    if (inviteCode.length !== 6 || !invite?.autoJoin || session || connecting) return;
    codeInput.value = inviteCode;
    presentInvitation(invite.hostName, inviteCode, false);
    setConnecting(false);
    setStatus(invitedHostName
      ? 'Joining ' + invitedHostName + '’s game…'
      : 'Joining invited game…');
    connectRoom('join')
      .then(() => setStatus('Connected. Choose a team and ready up.'))
      .catch((error) => setStatus(error.message, true));
  }
  function hide(closeSession = true) {
    createSizeMenu.close();
    root.classList.remove('show');
    const parkedInGarage = !!(session && state?.phase === 'waiting');
    if (closeSession && !handedOff && !activeRoom && !parkedInGarage) {
      closeCurrentSession('menu_closed');
    }
  }
  function dispose() {
    handedOff = false;
    if (activeRoom || session) closeCurrentSession('menu_disposed');
    else hide(false);
    root.remove();
  }
  function attachActiveRoom(adapter) {
    if (!adapter || !adapter.state || !adapter.playerId ||
        typeof adapter.command !== 'function' || typeof adapter.leave !== 'function') {
      throw new TypeError('active room adapter is incomplete');
    }
    activeRoom = adapter;
    role = adapter.role;
    mode = adapter.state.mode || 'private';
    handedOff = false;
    renderLobby(adapter.state);
  }
  function updateActiveRoom(next) {
    if (!activeRoom || !next) return false;
    activeRoom.state = next;
    renderLobby(next);
    return true;
  }
  function detachActiveRoom() {
    activeRoom = null;
    session = null;
    state = null;
    role = null;
    handedOff = false;
    room.classList.remove('connected');
    lobbyEl.classList.remove('show');
    root.classList.remove('lobby-active');
    setClosePurpose(false);
  }
  function showCurrentRoom() {
    const next = activeRoom?.state || state;
    if (!next || (!activeRoom && !session)) return false;
    ranked.classList.remove('show');
    room.classList.add('show');
    root.classList.add('show');
    renderLobby(next);
    syncGarageSelection();
    return true;
  }
  function syncGarageSelection() {
    if (!session || activeRoom || handedOff || state?.phase !== 'waiting') return false;
    const me = state.players?.find((player) => player.id === ownId());
    if (!me || me.ready) return false;
    const selection = getSelection();
    if (me.specId !== selection.specId) {
      command({ type: 'select_vehicle', specId: selection.specId });
    }
    command({ type: 'select_equipment', equipment: selection.equipment });
    if (me.camo !== selection.camo) command({ type: 'select_camo', camo: selection.camo });
    if (role === 'host' && selection.mapId && state.mapId !== selection.mapId) {
      command({ type: 'set_map', mapId: selection.mapId });
    }
    return true;
  }
  const showActiveRoom = showCurrentRoom;
  return {
    root, show, hide, dispose,
    attachActiveRoom, updateActiveRoom, detachActiveRoom,
    showActiveRoom, showCurrentRoom, syncGarageSelection,
  };
}
