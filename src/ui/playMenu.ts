import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Battle-mode picker and private/LAN/ranked lobby presentation.
 *
 * This module owns the room-entry interface and translates user actions into
 * signaling/lobby commands. Canonical lobby and match state remain in src/net;
 * the menu renders that state and hands established sessions to main.ts.
 */
import {
  createPrivateRoomConnectionRuntime,
  type PrivateRoomConnection,
} from '../net/privateRoomConnectionRuntime.ts';
import { resolveMatchServiceUrl, resolveSignalUrl } from '../net/signalEndpoint.ts';
import { automaticPlayerName, normalizePlayerName } from '../net/playerNames.ts';
import { normalizeRoomCode } from '../net/protocol.ts';
import {
  createRoomInviteUrl,
  roomInviteTitle,
  type RoomInviteMode,
} from '../net/roomInvite.ts';
import { ensureFonts, FONT_STACK, FONT_COND } from './fonts.ts';
import { iconUrl } from './icons.ts';
import { uiIconSVG } from './uiIcons.ts';
import { ensureStyle } from './dom.ts';
import { createRandomMapMosaic } from './randomPreviews.ts';
import { loadIceConfiguration, type IceConfiguration } from '../net/iceConfig.ts';
import {
  GAME_MODE_DEFINITIONS,
  normalizeGameMode,
  type GameModeId,
} from '../sim/matchModes.ts';
import type { LobbyPlayer, LobbyTeam, SerializedLobby } from '../net/lobby.ts';
import type {
  RankedQueueState,
  RankedQueueTicket,
  RankedServiceClient,
} from '../net/rankedServiceClient.ts';

const STYLE_ID = 'cot-play-menu-style';
const PLAYER_ID_KEY = 'cot.player.id.v1';
const PLAYER_NAME_KEY = 'cot.player.name.v1';
const ROOM_SIZE_KEY = 'cot.room.size.v1';
const GAME_MODE_KEY = 'cot.game.mode.v1';
type RankedServiceModule = typeof import('../net/rankedServiceClient.ts');
export type PlayMode = 'solo' | RoomInviteMode | 'ranked';
type RoomSession = PrivateRoomConnection['session'];
type RoomRole = PrivateRoomConnection['role'];
type MaybePromise<T> = T | PromiseLike<T>;

export interface PlayMenuMap {
  id: string;
  name: string;
  thumb?: string;
  hero?: string;
}

export interface PlayMenuVehicle {
  id: string;
  name: string;
  tier?: number;
}

export interface PlayMenuSelection {
  specId: string;
  mapId: string;
  equipment: string[];
  camo: string;
}

export interface PlayMenuLobbyContext {
  state: SerializedLobby;
  playerId: string;
  role: RoomRole;
}

export interface ActiveRoomAdapter {
  state: SerializedLobby;
  playerId: string;
  role: RoomRole;
  command(command: Record<string, RuntimeValue>): RuntimeValue;
  leave(reason?: string): RuntimeValue;
}

export interface PlayMenuOptions {
  maps?: PlayMenuMap[];
  vehicles?: PlayMenuVehicle[];
  getSelection(): PlayMenuSelection;
  getVehicleLoadout?(specId: string): Pick<PlayMenuSelection, 'equipment' | 'camo'>;
  onSolo?(request?: { gameMode?: GameModeId }): RuntimeValue;
  onNetworkStart?(request: {
    role: RoomRole;
    session: RoomSession;
    lobbyState: SerializedLobby;
  }): MaybePromise<RuntimeValue>;
  onNetworkClose?(reason: string): void;
  onRankedStart?(request: {
    serviceUrl: string;
    state: RankedQueueState;
  }): MaybePromise<RuntimeValue>;
  onLobbyChange?(context: PlayMenuLobbyContext | null): void;
  isVehicleAllowed?(specId: string): boolean;
  isCamoAllowed?(camo: string): boolean;
  getCamoName?(camo: string): string;
  getVehicleName?(specId: string): string;
}

export interface PlayMenuInvite {
  roomCode?: RuntimeValue;
  hostName?: RuntimeValue;
  autoJoin?: boolean;
}

export interface PlayMenuRuntime {
  root: HTMLDivElement;
  show(initialMode?: PlayMode | null, invite?: PlayMenuInvite | null): void;
  hide(closeSession?: boolean): void;
  dispose(): void;
  attachActiveRoom(adapter: ActiveRoomAdapter): void;
  updateActiveRoom(state: SerializedLobby): boolean;
  detachActiveRoom(): void;
  showActiveRoom(): boolean;
  showCurrentRoom(): boolean;
  syncGarageSelection(): boolean;
}

interface MenuSelectElement extends HTMLDivElement {
  value: string;
  disabled: boolean;
}

interface MenuSelectController {
  close(restoreFocus?: boolean): void;
  positionList(): void;
}

interface MenuBinding {
  control: MenuSelectElement;
  controller: MenuSelectController;
}

interface LeaderboardPlayer {
  place: string | number;
  name: string;
  rank: string;
  rating: string | number;
}

let rankedServiceModulePromise: Promise<RankedServiceModule> | null = null;
function loadRankedServiceModule(): Promise<RankedServiceModule> {
  if (!rankedServiceModulePromise) {
    const request = import('../net/rankedServiceClient.ts');
    rankedServiceModulePromise = request;
    request.catch(() => {
      if (rankedServiceModulePromise === request) rankedServiceModulePromise = null;
    });
  }
  return rankedServiceModulePromise;
}

/** Warm only code implied by an explicit garage mode selection. */
export function preloadPlayMode(mode: PlayMode): Promise<RankedServiceModule | null> {
  return mode === 'ranked' ? loadRankedServiceModule() : Promise.resolve(null);
}

const CSS = `
.cot-play{position:fixed;inset:0;z-index:92;display:none;align-items:center;justify-content:center;
  padding:24px;background:rgba(3,5,8,.76);backdrop-filter:blur(12px);font-family:${FONT_STACK};color:#edf3f7;}
.cot-play.show{display:flex;animation:cotPlayVeil var(--cot-motion-base) var(--cot-ease-out)}
.cot-play.show .panel{animation:cotPlayPanel var(--cot-motion-slow) var(--cot-ease-drawer) backwards}
@keyframes cotPlayVeil{from{opacity:0}}
@keyframes cotPlayPanel{from{opacity:0;transform:translateY(12px) scale(.992)}}
.cot-play *{box-sizing:border-box}.cot-play .panel{position:relative;width:min(980px,96vw);
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
.cot-play .rule-heading{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:18px 0 8px}
.cot-play .rule-heading b{font:900 10px ${FONT_COND};letter-spacing:.2em;text-transform:uppercase;color:#d9e3e9}
.cot-play .rule-heading span{color:#7e909d;font-size:9px}.cot-play .rules{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
.cot-play .rule{display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;gap:9px;min-height:54px;
  padding:7px 9px;text-align:left;color:#aebdc7;background:rgba(10,15,20,.78);border:1px solid rgba(151,170,184,.22);
  cursor:pointer;transition:border-color var(--cot-motion-fast) ease,
    background-color var(--cot-motion-fast) ease,color var(--cot-motion-fast) ease,
    transform var(--cot-motion-fast) var(--cot-ease-out)}
.cot-play .rule:hover,.cot-play .rule.on{color:#fff0d8;border-color:#e69a36;background:rgba(230,154,54,.1);transform:translateY(-1px)}
.cot-play .rule svg{display:block}.cot-play .rule-copy{display:grid;min-width:0;gap:2px}.cot-play .rule-copy b{overflow:hidden;
  color:inherit;font:900 9px ${FONT_COND};letter-spacing:.08em;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}
.cot-play .rule-copy small{color:#728591;font:700 7px ${FONT_COND};letter-spacing:.08em;text-transform:uppercase}
.cot-play .rule:disabled{transform:none;cursor:not-allowed}.cot-play.lobby-active .rule-heading{margin-top:10px}
.cot-play.lobby-active .rules{grid-template-columns:repeat(5,minmax(110px,1fr))}
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
  position:relative;display:flex;align-items:center;gap:9px;width:100%;height:42px;padding:0 38px 0 12px;text-align:left;
  color:#edf3f7;background:linear-gradient(180deg,#11171d,#080c11);border:1px solid rgba(161,180,195,.36);
  font:700 12px ${FONT_STACK};cursor:pointer;transition:border-color var(--cot-motion-fast) ease,
    background-color var(--cot-motion-fast) ease,box-shadow var(--cot-motion-fast) ease}
.cot-play .menu-select-trigger:hover{border-color:rgba(230,154,54,.72);background:linear-gradient(180deg,#161c22,#0b1015)}
.cot-play .menu-select.open .menu-select-trigger{border-color:#e69a36;box-shadow:0 0 0 2px rgba(230,154,54,.1)}
.cot-play .menu-select-trigger::after{content:"";
  position:absolute;right:13px;top:50%;width:7px;height:7px;border-right:2px solid #cbd6dd;border-bottom:2px solid #cbd6dd;
  transform:translateY(-68%) rotate(45deg);
  transition:transform var(--cot-motion-fast) var(--cot-ease-out)}.cot-play .menu-select.open .menu-select-trigger::after{
  transform:translateY(-30%) rotate(225deg)}.cot-play .menu-select-list{position:fixed;z-index:112;display:none;gap:3px;
  padding:6px;overflow:auto;overscroll-behavior:contain;scrollbar-width:none;background:linear-gradient(155deg,#1b2229,#090d12 82%);
  border:1px solid rgba(230,154,54,.62);box-shadow:0 24px 60px rgba(0,0,0,.72),inset 0 1px rgba(255,255,255,.04)}
.cot-play .menu-select-list::-webkit-scrollbar{display:none}.cot-play .menu-select.open .menu-select-list{display:grid}
.cot-play .menu-select-option{position:relative;display:flex;align-items:center;gap:10px;min-height:40px;padding:0 34px 0 11px;
  overflow:hidden;text-align:left;color:#c8d3db;background:rgba(255,255,255,.015);border:1px solid transparent;
  font:700 12px ${FONT_STACK};cursor:pointer;transition:border-color var(--cot-motion-fast) ease,
    background-color var(--cot-motion-fast) ease,color var(--cot-motion-fast) ease}
.cot-play .menu-select-option::after{content:"";position:absolute;right:13px;top:50%;width:9px;height:5px;border-left:2px solid transparent;
  border-bottom:2px solid transparent;transform:translateY(-65%) rotate(-45deg)}.cot-play .menu-select-option:hover,
.cot-play .menu-select-option.on{color:#fff2df;background:linear-gradient(90deg,rgba(230,154,54,.16),rgba(230,154,54,.05));
  border-color:rgba(230,154,54,.34)}.cot-play .menu-select-option.on::after{border-color:#ffb452}
.cot-play .menu-select-option-copy,.cot-play .menu-select-trigger-copy{display:grid;min-width:0;gap:2px}
.cot-play .menu-select-option-copy b,.cot-play .menu-select-trigger-copy>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cot-play .menu-select-option-copy small,.cot-play .menu-select-trigger-copy small{color:#7f929f;font:800 7px ${FONT_COND};
  letter-spacing:.13em;text-transform:uppercase}.cot-play .menu-select-option.on small{color:#d7a767}
.cot-play .menu-select-mark{width:8px;height:22px;flex:0 0 8px;background:#748593;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.cot-play .menu-select-mark.alpha{background:#5da8e8}.cot-play .menu-select-mark.bravo{background:#e16b5e}
.cot-play .menu-select-mark.spectator{background:#89949c}
.cot-play .menu-select--map .menu-select-trigger{height:50px;padding-left:8px}.cot-play .menu-select-thumb{position:relative;display:block;
  width:60px;height:34px;flex:0 0 60px;overflow:hidden;background-color:#28313a;background-position:center;background-size:cover;
  border:1px solid rgba(181,197,210,.3);box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)}
.cot-play .menu-select-thumb::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,.08),transparent 44%,rgba(0,0,0,.28))}
.cot-play .menu-select-thumb.is-random{background:conic-gradient(from 36deg at 52% 48%,#526473,#9a7a45,#3b5849,#8c9a9f,#526473)}
.cot-play .menu-select--map .menu-select-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:8px}
.cot-play .menu-select--map .menu-select-option{min-height:58px;padding-left:7px}.cot-play .menu-select--map .menu-select-option .menu-select-thumb{
  width:76px;height:44px;flex-basis:76px}.cot-play .menu-select.disabled .menu-select-trigger{cursor:not-allowed;opacity:.62;
  border-color:rgba(161,180,195,.22);background:#090d12}.cot-play .menu-select.disabled .menu-select-trigger::after{opacity:.45}
.cot-play .menu-select--vehicle .menu-select-trigger{height:50px;padding-left:8px}.cot-play .menu-select--vehicle .menu-select-option{
  min-height:52px;padding-left:7px}.cot-play .menu-select--vehicle .menu-select-thumb{width:62px;height:38px;flex-basis:62px;
  object-fit:contain;background-color:#11171c;background-size:contain;background-repeat:no-repeat}
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
  min-height:108px;margin-top:10px;border:1px solid rgba(161,180,195,.24);
  background:linear-gradient(110deg,rgba(12,18,23,.98),rgba(21,27,33,.88))}
.cot-play .battlefield-art{position:relative;min-height:108px;background-position:center;background-size:cover;
  overflow:hidden;border-right:1px solid rgba(161,180,195,.2)}.cot-play .battlefield-art::after{content:"";position:absolute;inset:0;z-index:1;
  background:linear-gradient(90deg,rgba(5,8,11,.08),rgba(8,12,16,.78)),linear-gradient(0deg,rgba(5,8,11,.6),transparent 65%)}
.cot-play .battlefield-art .random-map-mosaic{position:absolute;inset:0;display:none;grid-template-columns:repeat(4,1fr);
  gap:2px;background:#070a0d;transform:scale(1.015)}
.cot-play .battlefield-art.is-random .random-map-mosaic{display:grid}
.cot-play .battlefield-art .random-map-tile{display:block;min-width:0;background-position:center;background-size:cover;
  filter:saturate(.9) contrast(1.08);transform:skewX(-4deg) scale(1.08)}
.cot-play .battlefield-art .random-map-tile:nth-child(even){transform:skewX(-4deg) scale(1.08) translateY(3px)}
.cot-play .battlefield-art .random-map-count{position:absolute;z-index:2;right:13px;top:11px;display:grid;
  min-width:54px;padding:6px 8px 5px;text-align:center;border:1px solid rgba(255,199,104,.52);
  background:rgba(7,11,15,.76);box-shadow:0 6px 18px rgba(0,0,0,.46)}
.cot-play .battlefield-art .random-map-count b{color:#ffd18a;font:900 16px ${FONT_COND};line-height:1}
.cot-play .battlefield-art .random-map-count span{margin-top:2px;color:#a9b6bf;font:800 6px ${FONT_COND};
  letter-spacing:.15em;text-transform:uppercase}
.cot-play .battlefield-art > span{position:absolute;z-index:3;left:13px;bottom:11px;color:#ffd08b;
  font:900 8px ${FONT_COND};letter-spacing:.2em;text-transform:uppercase}
.cot-play .battlefield-copy{display:grid;grid-template-columns:minmax(0,1fr) minmax(170px,.85fr);align-items:center;
  gap:18px;padding:15px 16px}.cot-play .battlefield-id{min-width:0}.cot-play .battlefield-id i{display:block;
  color:#e69a36;font:900 8px ${FONT_COND};font-style:normal;letter-spacing:.2em;text-transform:uppercase}
.cot-play .battlefield-id b{display:block;margin-top:7px;color:#f1f5f8;font-size:18px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}.cot-play .battlefield-id span{display:block;margin-top:5px;color:#8597a5;
  font-size:9px;line-height:1.4}.cot-play .battlefield-card.guest .battlefield-id i{color:#8293a0}
.cot-play .battlefield-picker{min-width:0}.cot-play .battlefield-card.guest .menu-select-trigger{border-color:rgba(161,180,195,.24)}
.cot-play .player .team{font:800 10px ${FONT_COND};
  letter-spacing:.08em;text-transform:uppercase;color:#aebfca}.cot-play .player.alpha .team{color:#82c3f4}
.cot-play .player.bravo .team{color:#f18c82}.cot-play .player .ready{color:#78d78a;text-align:right;font:800 9px ${FONT_COND};
  letter-spacing:.1em}.cot-play .player .wait{color:#e4aa58;text-align:right;font:800 9px ${FONT_COND};letter-spacing:.1em}
.cot-play .controls{display:flex;align-items:end;gap:8px;margin-top:12px}.cot-play .control-options,.cot-play .control-actions{
  display:flex;flex-wrap:wrap;align-items:end;gap:8px}.cot-play .control-actions{margin-left:auto;justify-content:flex-end}
.cot-play .control-options .field{width:140px}.cot-play .control-options .vehicle-field{width:230px}
.cot-play .control-actions .action{min-width:128px}
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
@media(prefers-reduced-motion:reduce){.cot-play,.cot-play .panel,.cot-play button.action.needs-ready,.cot-play button.action.can-start{animation:none;
  box-shadow:0 0 0 3px rgba(230,154,54,.16),0 0 18px rgba(230,154,54,.34)}.cot-play .menu-select-trigger,
  .cot-play .menu-select-trigger::after,.cot-play .menu-select-option{transition:none}}
`;

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`playMenu.ts: required element missing: ${selector}`);
  return element;
}

function errorMessage(error: RuntimeValue): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function leaderboardPlayers(value: RuntimeValue): LeaderboardPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    return [{
      place: typeof entry.place === 'number' || typeof entry.place === 'string' ? entry.place : '',
      name: String(entry.name || 'Commander'),
      rank: String(entry.rank || 'Unranked'),
      rating: typeof entry.rating === 'number' || typeof entry.rating === 'string' ? entry.rating : 0,
    }];
  });
}

function recordText(value: Record<string, RuntimeValue>, key: string, fallback = ''): string {
  const field = value[key];
  return field == null ? fallback : String(field);
}

function stored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* session-only */ }
}

function rememberRoomUrl(
  roomCode: RuntimeValue,
  mode: RuntimeValue,
  hostName: RuntimeValue = null,
): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const invite = createRoomInviteUrl({ roomCode, mode, hostName, baseUrl: location.href });
    history.replaceState(history.state, '', invite);
  } catch { /* URL persistence is a convenience, never a room dependency */ }
}

function clearRoomUrl(): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('room')) return;
    url.searchParams.delete('room');
    url.searchParams.delete('mode');
    url.searchParams.delete('host');
    history.replaceState(history.state, '', url.href);
  } catch { /* cosmetic */ }
}

function lobbyTeamLabel(team: LobbyTeam): string {
  if (team === 'alpha') return 'Team Alpha';
  if (team === 'bravo') return 'Team Bravo';
  return 'Spectator';
}

function playerId(): string {
  let id = stored(PLAYER_ID_KEY, '');
  if (/^[a-zA-Z0-9_-]{8,48}$/.test(id)) return id;
  const uuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  id = `p_${uuid.slice(0, 24)}`;
  remember(PLAYER_ID_KEY, id);
  return id;
}

function bindMenuSelect(
  control: MenuSelectElement,
  { beforeOpen = null }: {
    beforeOpen?: ((control: MenuSelectElement) => void) | null;
  } = {},
): MenuSelectController {
  const trigger = requiredElement<HTMLButtonElement>(control, '[data-select-trigger]');
  const list = requiredElement<HTMLElement>(control, '[role="listbox"]');
  const valueLabel = requiredElement<HTMLElement>(trigger, '[data-select-value]');
  const metaLabel = trigger.querySelector<HTMLElement>('[data-select-meta]');
  const triggerThumb = trigger.querySelector<HTMLElement>('[data-select-thumb]');
  const options = [...control.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  let disabled = false;

  function selectedIndex(): number {
    const index = options.findIndex((option) => option.dataset.value === control.dataset.value);
    return index < 0 ? 0 : index;
  }

  function setValue(nextValue: RuntimeValue, emit = false): void {
    const option = options.find((item) => item.dataset.value === String(nextValue));
    if (!option) return;
    control.dataset.value = option.dataset.value;
    valueLabel.textContent = option.dataset.label || option.textContent.trim();
    if (metaLabel) metaLabel.textContent = option.dataset.meta || '';
    if (triggerThumb) {
      const thumb = option.dataset.thumb || '';
      triggerThumb.style.backgroundImage = thumb ? `url("${thumb.replace(/"/g, '%22')}")` : '';
      triggerThumb.classList.toggle('is-random', !thumb);
    }
    for (const item of options) {
      const selected = item === option;
      item.classList.toggle('on', selected);
      item.setAttribute('aria-selected', String(selected));
    }
    if (emit) control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function close(restoreFocus = false): void {
    if (!control.classList.contains('open')) return;
    control.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function positionList(): void {
    const rect = trigger.getBoundingClientRect();
    const margin = 10;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const wide = control.classList.contains('menu-select--map');
    const width = wide
      ? Math.min(540, viewportWidth - margin * 2)
      : Math.min(Math.max(rect.width, 180), viewportWidth - margin * 2);
    const left = wide
      ? Math.max(margin, Math.min(rect.right - width, viewportWidth - width - margin))
      : Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
    list.style.width = `${Math.round(width)}px`;
    list.style.maxHeight = 'none';
    const naturalHeight = list.scrollHeight;
    const below = viewportHeight - rect.bottom - margin - 6;
    const above = rect.top - margin - 6;
    const openBelow = below >= Math.min(naturalHeight, 260) || below >= above;
    const availableHeight = Math.max(104, openBelow ? below : above);
    const maxHeight = Math.min(naturalHeight, availableHeight, wide ? 420 : 300);
    const top = openBelow ? rect.bottom + 6 : rect.top - maxHeight - 6;
    list.style.left = `${Math.round(left)}px`;
    list.style.top = `${Math.round(Math.max(margin, top))}px`;
    list.style.maxHeight = `${Math.round(maxHeight)}px`;
    control.classList.toggle('drop-up', !openBelow);
  }

  function open(index = selectedIndex()): void {
    if (disabled) return;
    if (beforeOpen) beforeOpen(control);
    control.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    positionList();
    const option = options[Math.max(0, Math.min(options.length - 1, index))];
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: 'nearest' });
  }

  Object.defineProperty(control, 'value', {
    configurable: true,
    get: () => control.dataset.value,
    set: (nextValue: RuntimeValue) => setValue(nextValue),
  });
  Object.defineProperty(control, 'disabled', {
    configurable: true,
    get: () => disabled,
    set: (nextDisabled: RuntimeValue) => {
      disabled = !!nextDisabled;
      control.classList.toggle('disabled', disabled);
      control.setAttribute('aria-disabled', String(disabled));
      trigger.disabled = disabled;
      if (disabled) close();
    },
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

  return { close, positionList };
}

function defaultSignalUrl(): string {
  return resolveSignalUrl({
    configured: import.meta.env.VITE_SIGNAL_URL,
    protocol: location.protocol,
    hostname: location.hostname,
  });
}

function defaultRankedUrl(): string {
  return resolveMatchServiceUrl({
    configured: import.meta.env.VITE_MATCH_SERVICE_URL,
    protocol: location.protocol,
    hostname: location.hostname,
  });
}

async function iceServers(mode: string): Promise<IceConfiguration> {
  const configured = import.meta.env.VITE_ICE_CONFIG_URL;
  const endpoint = configured || (location.protocol === 'https:' ? '/api/ice' : '');
  return loadIceConfiguration({ mode, endpoint });
}

export function createPlayMenu({
  maps = [],
  vehicles = [],
  getSelection,
  getVehicleLoadout = (specId) => {
    const selection = getSelection();
    return specId === selection.specId
      ? { equipment: selection.equipment, camo: selection.camo }
      : { equipment: [], camo: 'factory' };
  },
  onSolo,
  onNetworkStart,
  onNetworkClose = () => {},
  onRankedStart,
  onLobbyChange,
  isVehicleAllowed = () => true,
  isCamoAllowed = () => true,
  getCamoName = (camo) => camo || 'Factory',
  getVehicleName = (specId) => specId,
}: PlayMenuOptions): PlayMenuRuntime {
  ensureFonts();
  ensureStyle(STYLE_ID, CSS);
  const root = document.createElement('div');
  root.className = 'cot-play';
  const ruleCards = Object.values(GAME_MODE_DEFINITIONS).map((rule) =>
    `<button class="rule" data-game-mode="${rule.id}" type="button" title="${rule.description}">
      ${uiIconSVG(rule.icon, 23)}<span class="rule-copy"><b>${rule.label}</b><small>${rule.shortLabel}</small></span></button>`).join('');
  root.innerHTML = `<div class="panel"><button class="close" type="button" aria-label="Close">×</button>
    <div class="eyebrow">Choose operation</div><h2>Play Claude of Tanks</h2>
    <p class="lead">One vehicle roster. Four direct ways to deploy.</p>
    <div class="modes">
      <button class="mode" data-mode="solo" type="button"><span class="mode-icon">${uiIconSVG('battleBots', 24)}</span><i>Immediate</i><b>Solo vs bots</b><span class="mode-desc">Run the same authoritative combat locally against a full bot roster.</span></button>
      <button class="mode" data-mode="private" type="button"><span class="mode-icon">${uiIconSVG('battlePrivate', 24)}</span><i>Room code</i><b>Private lobby</b><span class="mode-desc">Create or join a direct WebRTC match with team switching.</span></button>
      <button class="mode" data-mode="lan" type="button"><span class="mode-icon">${uiIconSVG('battleLan', 24)}</span><i>Local network</i><b>LAN lobby</b><span class="mode-desc">Use the same lobby over Wi-Fi with minimal route latency.</span></button>
      <button class="mode" data-mode="ranked" type="button"><span class="mode-icon">${uiIconSVG('battleRanked', 24)}</span><i>Dedicated</i><b>Ranked</b><span class="mode-desc">Server-authoritative queue and rating. Service endpoint required.</span></button>
    </div>
    <div class="rule-heading"><b>Battle rules</b><span>One deterministic ruleset for solo, private, and LAN play.</span></div>
    <div class="rules" role="list" aria-label="Battle rules">${ruleCards}</div>
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
                <span id="cot-create-size-value" data-select-value>2 vs 2</span></button>
              <div class="menu-select-list" id="cot-create-size-list" role="listbox" aria-labelledby="cot-create-size-label">
                <button class="menu-select-option" type="button" role="option" data-value="1" data-label="1 vs 1" aria-selected="false">1 vs 1</button>
                <button class="menu-select-option" type="button" role="option" data-value="2" data-label="2 vs 2" aria-selected="true">2 vs 2</button>
                <button class="menu-select-option" type="button" role="option" data-value="3" data-label="3 vs 3" aria-selected="false">3 vs 3</button>
                <button class="menu-select-option" type="button" role="option" data-value="5" data-label="5 vs 5" aria-selected="false">5 vs 5</button>
                <button class="menu-select-option" type="button" role="option" data-value="7" data-label="7 vs 7" aria-selected="false">7 vs 7</button>
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
          <div class="field battlefield-picker"><span class="field-label" id="cot-room-map-label">Battlefield</span>
            <div class="menu-select menu-select--map" data-control="map" data-value="random">
              <button class="menu-select-trigger" data-select-trigger type="button" aria-haspopup="listbox" aria-expanded="false"
                aria-controls="cot-room-map-list" aria-labelledby="cot-room-map-label cot-room-map-value">
                <span class="menu-select-thumb is-random" data-select-thumb aria-hidden="true"></span>
                <span class="menu-select-trigger-copy"><span id="cot-room-map-value" data-select-value>Random</span>
                  <small data-select-meta>Any battlefield</small></span></button>
              <div class="menu-select-list" id="cot-room-map-list" role="listbox" aria-labelledby="cot-room-map-label"></div>
            </div></div></div></div>
      <div class="players"></div><div class="controls">
        <div class="control-options"><div class="field vehicle-field"><span class="field-label" id="cot-room-vehicle-label">Vehicle</span>
          <div class="menu-select menu-select--vehicle" data-control="vehicle" data-value="">
            <button class="menu-select-trigger" data-select-trigger type="button" aria-haspopup="listbox" aria-expanded="false"
              aria-controls="cot-room-vehicle-list" aria-labelledby="cot-room-vehicle-label cot-room-vehicle-value">
              <span class="menu-select-thumb" data-select-thumb aria-hidden="true"></span>
              <span class="menu-select-trigger-copy"><span id="cot-room-vehicle-value" data-select-value>Select vehicle</span>
                <small data-select-meta>Ready-up loadout</small></span></button>
            <div class="menu-select-list" id="cot-room-vehicle-list" role="listbox" aria-labelledby="cot-room-vehicle-label"></div>
          </div></div>
        <div class="field"><span class="field-label" id="cot-room-team-label">Deployment</span>
          <div class="menu-select" data-control="team" data-value="alpha">
            <button class="menu-select-trigger" data-select-trigger type="button" aria-haspopup="listbox" aria-expanded="false"
              aria-controls="cot-room-team-list" aria-labelledby="cot-room-team-label cot-room-team-value">
              <span id="cot-room-team-value" data-select-value>Team Alpha</span></button>
            <div class="menu-select-list" id="cot-room-team-list" role="listbox" aria-labelledby="cot-room-team-label">
              <button class="menu-select-option" type="button" role="option" data-value="alpha" data-label="Team Alpha" aria-selected="true"><span class="menu-select-mark alpha" aria-hidden="true"></span>Team Alpha</button>
              <button class="menu-select-option" type="button" role="option" data-value="bravo" data-label="Team Bravo" aria-selected="false"><span class="menu-select-mark bravo" aria-hidden="true"></span>Team Bravo</button>
              <button class="menu-select-option" type="button" role="option" data-value="spectator" data-label="Spectator" aria-selected="false"><span class="menu-select-mark spectator" aria-hidden="true"></span>Spectator</button>
            </div></div></div>
          <div class="field"><span class="field-label" id="cot-room-size-label">Battle format</span>
            <div class="menu-select" data-control="size" data-value="1">
              <button class="menu-select-trigger" data-select-trigger type="button" aria-haspopup="listbox" aria-expanded="false"
                aria-controls="cot-room-size-list" aria-labelledby="cot-room-size-label cot-room-size-value">
                <span id="cot-room-size-value" data-select-value>1 vs 1</span></button>
              <div class="menu-select-list" id="cot-room-size-list" role="listbox" aria-labelledby="cot-room-size-label">
                <button class="menu-select-option" type="button" role="option" data-value="1" data-label="1 vs 1" aria-selected="true">1 vs 1</button>
                <button class="menu-select-option" type="button" role="option" data-value="2" data-label="2 vs 2" aria-selected="false">2 vs 2</button>
                <button class="menu-select-option" type="button" role="option" data-value="3" data-label="3 vs 3" aria-selected="false">3 vs 3</button>
                <button class="menu-select-option" type="button" role="option" data-value="5" data-label="5 vs 5" aria-selected="false">5 vs 5</button>
                <button class="menu-select-option" type="button" role="option" data-value="7" data-label="7 vs 7" aria-selected="false">7 vs 7</button>
              </div></div></div></div>
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

  const panel = requiredElement<HTMLElement>(root, '.panel');
  const closeBtn = requiredElement<HTMLButtonElement>(root, '.close');
  const room = requiredElement<HTMLElement>(root, '.room');
  const ranked = requiredElement<HTMLElement>(root, '.ranked');
  const lobbyEl = requiredElement<HTMLElement>(root, '.lobby');
  const eyebrow = requiredElement<HTMLElement>(root, '.eyebrow');
  const menuTitle = requiredElement<HTMLHeadingElement>(root, 'h2');
  const menuLead = requiredElement<HTMLParagraphElement>(root, '.lead');
  const status = requiredElement<HTMLElement>(root, '.status');
  const nameInput = requiredElement<HTMLInputElement>(root, '[data-field="name"]');
  const signalInput = requiredElement<HTMLInputElement>(root, '[data-field="signal"]');
  const codeInput = requiredElement<HTMLInputElement>(root, '[data-field="code"]');
  const createSizeSelect = requiredElement<MenuSelectElement>(root, '[data-field="create-size"]');
  const vehicleSelect = requiredElement<MenuSelectElement>(root, '[data-control="vehicle"]');
  const teamSelect = requiredElement<MenuSelectElement>(root, '[data-control="team"]');
  const sizeSelect = requiredElement<MenuSelectElement>(root, '[data-control="size"]');
  const mapSelect = requiredElement<MenuSelectElement>(root, '[data-control="map"]');
  const ruleButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-game-mode]')];
  const mapList = requiredElement<HTMLElement>(mapSelect, '[role="listbox"]');
  const vehicleList = requiredElement<HTMLElement>(vehicleSelect, '[role="listbox"]');
  const mapById = new Map<string, PlayMenuMap>();
  const battlefieldCount = maps.filter((map) => map.id !== 'random').length;
  for (const map of maps) {
    mapById.set(map.id, map);
    const option = document.createElement('button');
    option.className = 'menu-select-option';
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.dataset.value = map.id;
    option.dataset.label = map.name;
    option.dataset.meta = map.id === 'random' ? `${battlefieldCount} battlefields` : 'Battlefield';
    option.dataset.thumb = map.thumb || '';
    const thumb = document.createElement('span');
    thumb.className = `menu-select-thumb${map.thumb ? '' : ' is-random'}`;
    thumb.setAttribute('aria-hidden', 'true');
    if (map.thumb) thumb.style.backgroundImage = `url("${map.thumb.replace(/"/g, '%22')}")`;
    const copy = document.createElement('span');
    copy.className = 'menu-select-option-copy';
    const name = document.createElement('b');
    name.textContent = map.name;
    const detail = document.createElement('small');
    detail.textContent = option.dataset.meta;
    copy.append(name, detail);
    option.append(thumb, copy);
    mapList.appendChild(option);
  }
  const initialSelection = getSelection();
  const selectableVehicles = vehicles.length > 0 ? vehicles : [{
    id: initialSelection.specId,
    name: getVehicleName(initialSelection.specId),
  }];
  for (const vehicle of selectableVehicles) {
    const option = document.createElement('button');
    option.className = 'menu-select-option';
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.dataset.value = vehicle.id;
    option.dataset.label = vehicle.name;
    option.dataset.meta = Number.isFinite(vehicle.tier) ? `Tier ${vehicle.tier}` : 'Combat vehicle';
    option.dataset.thumb = iconUrl(vehicle.id, 'angle');
    const thumb = document.createElement('img');
    thumb.className = 'menu-select-thumb';
    thumb.src = option.dataset.thumb;
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.decoding = 'async';
    thumb.addEventListener('error', markMissingVehicleIcon, { once: true });
    const copy = document.createElement('span');
    copy.className = 'menu-select-option-copy';
    const name = document.createElement('b');
    name.textContent = vehicle.name;
    const detail = document.createElement('small');
    detail.textContent = option.dataset.meta;
    copy.append(name, detail);
    option.append(thumb, copy);
    vehicleList.appendChild(option);
  }
  vehicleSelect.dataset.value = selectableVehicles.some((vehicle) => vehicle.id === initialSelection.specId)
    ? initialSelection.specId
    : selectableVehicles[0]?.id || '';
  const menuBindings: MenuBinding[] = [];
  function closeMenuSelects(except: MenuSelectElement | null = null): void {
    for (const binding of menuBindings) {
      if (binding.control !== except) binding.controller.close();
    }
  }
  function bindRoomMenu(control: MenuSelectElement): MenuSelectController {
    const controller = bindMenuSelect(control, { beforeOpen: closeMenuSelects });
    const binding: MenuBinding = { control, controller };
    menuBindings.push(binding);
    return controller;
  }
  bindRoomMenu(createSizeSelect);
  bindRoomMenu(vehicleSelect);
  bindRoomMenu(teamSelect);
  bindRoomMenu(sizeSelect);
  bindRoomMenu(mapSelect);
  const battlefieldCard = requiredElement<HTMLElement>(root, '.battlefield-card');
  const battlefieldArt = requiredElement<HTMLElement>(root, '.battlefield-art');
  battlefieldArt.appendChild(createRandomMapMosaic(maps, { showCount: true }));
  const battlefieldName = requiredElement<HTMLElement>(root, '[data-map-name]');
  const battlefieldRole = requiredElement<HTMLElement>(root, '[data-map-role]');
  const playersEl = requiredElement<HTMLElement>(root, '.players');
  const codeEl = requiredElement<HTMLElement>(root, '.code');
  const readyBtn = requiredElement<HTMLButtonElement>(root, '[data-action="ready"]');
  const startBtn = requiredElement<HTMLButtonElement>(root, '[data-action="start"]');
  const leaveBtn = requiredElement<HTMLButtonElement>(root, '[data-action="leave"]');
  const createBtn = requiredElement<HTMLButtonElement>(root, '[data-action="create"]');
  const joinBtn = requiredElement<HTMLButtonElement>(root, '[data-action="join"]');
  const copyBtn = requiredElement<HTMLButtonElement>(root, '[data-action="copy"]');
  const note = requiredElement<HTMLElement>(root, '.note');
  const rankedName = requiredElement<HTMLInputElement>(root, '[data-ranked="name"]');
  const rankedService = requiredElement<HTMLInputElement>(root, '[data-ranked="service"]');
  const rankedSize = requiredElement<HTMLSelectElement>(root, '[data-ranked="size"]');
  const rankedQueueBtn = requiredElement<HTMLButtonElement>(root, '[data-ranked="queue"]');
  const rankedCancelBtn = requiredElement<HTMLButtonElement>(root, '[data-ranked="cancel"]');
  const rankedProfile = requiredElement<HTMLElement>(root, '.rank-profile');
  const ladder = requiredElement<HTMLElement>(root, '.ladder');
  const defaultDocumentTitle = document.documentElement.dataset.baseTitle || document.title;
  const defaultEyebrow = eyebrow.textContent;
  const defaultMenuTitle = menuTitle.textContent;
  const defaultMenuLead = menuLead.textContent;
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

  let mode: PlayMode | null = null;
  let session: RoomSession | null = null;
  let roomIce: IceConfiguration | null = null;
  let state: SerializedLobby | null = null;
  let role: RoomRole | null = null;
  let unsubscribeState: (() => void) | null = null;
  let handedOff = false;
  let activeRoom: ActiveRoomAdapter | null = null;
  let connecting = false;
  let rankedClient: RankedServiceClient | null = null;
  let rankedTicket: RankedQueueTicket | null = null;
  let rankedAbort: AbortController | null = null;
  let invitedHostName: string | null = null;
  let selectedGameMode = normalizeGameMode(stored(GAME_MODE_KEY, 'standard'));

  function showSelectedGameMode(
    next: RuntimeValue = selectedGameMode,
    { fromLobby = false }: { fromLobby?: boolean } = {},
  ): void {
    selectedGameMode = normalizeGameMode(next);
    remember(GAME_MODE_KEY, selectedGameMode);
    for (const button of ruleButtons) {
      button.classList.toggle('on', button.dataset.gameMode === selectedGameMode);
      button.setAttribute('aria-pressed', String(button.dataset.gameMode === selectedGameMode));
      button.disabled = fromLobby && (role !== 'host' || state?.phase !== 'waiting');
    }
  }
  showSelectedGameMode();

  function adoptRoomConnection(connection: PrivateRoomConnection): void {
    session = connection.session;
    role = connection.role;
    roomIce = connection.ice;
  }

  const privateRoomConnection = createPrivateRoomConnectionRuntime({
    loadIce: iceServers,
    isVehicleAllowed,
    isCamoAllowed,
    isMapAllowed: (mapId) => maps.some((map) => map.id === mapId),
    onHostStart: (lobbyState, connection) => {
      adoptRoomConnection(connection);
      beginNetworkHandoff(lobbyState, 'host');
    },
    onClientClose: (reason) => {
      closeCurrentSession(reason, { skipTransportClose: true });
      setStatus('The host closed this room.', true);
      onNetworkClose(reason);
    },
    onError: (error) => setStatus(errorMessage(error), true),
  });

  function hostNameFromRoom(value: RuntimeValue): string {
    if (!isRecord(value)) return '';
    const explicit = normalizePlayerName(value.hostName);
    if (explicit) return explicit;
    const hostId = value.hostId;
    const players = Array.isArray(value.players) ? value.players : value.peers;
    const host = Array.isArray(players)
      ? players.find((player) => isRecord(player) && (
        player.isHost === true || player.id === hostId || player.peerId === hostId))
      : null;
    if (!isRecord(host)) return '';
    const nestedPlayer = isRecord(host.player) ? host.player : null;
    return normalizePlayerName(host.name || nestedPlayer?.name);
  }

  function presentInvitation(hostName: RuntimeValue, roomCode: RuntimeValue, connected = false): void {
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

  function resetInvitation(): void {
    invitedHostName = null;
    root.classList.remove('invite-entry');
    eyebrow.textContent = defaultEyebrow;
    menuTitle.textContent = defaultMenuTitle;
    menuLead.textContent = defaultMenuLead;
    if (document.title.startsWith('Join ')) document.title = defaultDocumentTitle;
  }

  function setStatus(message: RuntimeValue, error = false): void {
    status.textContent = message == null ? '' : String(message);
    status.classList.toggle('err', !!error);
  }

  function roomConnectionStatus(action: 'created' | 'joined'): string {
    if (mode === 'private' && roomIce && !roomIce.relayAvailable) {
      const reason = roomIce.degradedReason === 'turn_service_unconfigured'
        ? 'the production TURN service is not configured'
        : 'the TURN relay is temporarily unavailable';
      return `Direct-only room ${action}; ${reason}, so some external networks cannot connect.`;
    }
    return action === 'created'
      ? 'Room ready. Copy the invite link.'
      : 'Connected. Choose a team and ready up.';
  }

  function notifyLobbyChange(next: SerializedLobby | null = state): void {
    if (typeof onLobbyChange !== 'function' || activeRoom) return;
    try {
      const currentPlayerId = ownId();
      if (next && !currentPlayerId) return;
      onLobbyChange(next ? {
        state: next,
        playerId: currentPlayerId || '',
        role: role || 'client',
      } : null);
    } catch (error) {
      console.error('[play-menu] lobby presentation failed', error);
    }
  }

  function setClosePurpose(inRoom: boolean): void {
    const label = inRoom ? 'Back to garage — stay in room' : 'Close';
    closeBtn.setAttribute('aria-label', label);
    closeBtn.title = label;
  }

  function ownId(): string | undefined {
    return activeRoom?.playerId || session?.roomInfo.peerId;
  }

  function command(command: Record<string, RuntimeValue>): void {
    try {
      if (activeRoom) {
        Promise.resolve(activeRoom.command(command))
          .catch((error: RuntimeValue) => setStatus(errorMessage(error), true));
        return;
      }
      const activeSession = session;
      if (!activeSession) throw new Error('Room session is unavailable');
      const result = role === 'host' && 'command' in activeSession
        ? activeSession.command(command)
        : 'submit' in activeSession
          ? activeSession.submit(command)
          : Promise.reject(new Error('Room command channel is unavailable'));
      Promise.resolve(result).catch((error: RuntimeValue) => setStatus(errorMessage(error), true));
    } catch (error) { setStatus(errorMessage(error), true); }
  }

  function setConnecting(next: boolean): void {
    connecting = next;
    const unavailable = !signalInput.value.trim();
    createBtn.disabled = next || unavailable;
    joinBtn.disabled = next || unavailable || codeInput.value.length !== 6;
  }

  function closeCurrentSession(
    reason = 'menu_closed',
    { skipTransportClose = false }: { skipTransportClose?: boolean } = {},
  ): void {
    if (unsubscribeState) unsubscribeState();
    unsubscribeState = null;
    if (activeRoom && !skipTransportClose) activeRoom.leave(reason);
    else privateRoomConnection.close(reason, {
      transportAlreadyClosed: skipTransportClose,
    });
    session = null;
    roomIce = null;
    activeRoom = null;
    state = null;
    role = null;
    handedOff = false;
    notifyLobbyChange(null);
    clearRoomUrl();
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

  function renderLeaderboard(players: LeaderboardPlayer[] = []): void {
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

  async function refreshRanked(): Promise<void> {
    const { createRankedServiceClient } = await loadRankedServiceModule();
    rankedClient = createRankedServiceClient({ url: rankedService.value.trim() });
    const identity = rankedClient.identity();
    if (identity) {
      try {
        const profile = await rankedClient.profile(identity.playerId);
        rankedProfile.textContent = `${recordText(profile, 'rank', 'Unranked')} · ${recordText(profile, 'rating', '1000')} ELO · ${recordText(profile, 'matches', '0')} matches`;
      } catch (error) {
        if (!isRecord(error) || error.status !== 404) throw error;
        rankedClient.clearIdentity();
        rankedProfile.textContent = 'New commanders begin at 1000 ELO';
      }
    } else rankedProfile.textContent = 'New commanders begin at 1000 ELO';
    const board = await rankedClient.leaderboard(8);
    renderLeaderboard(leaderboardPlayers(board.players));
  }

  async function queueRanked(): Promise<void> {
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
    const activeRankedClient = rankedClient;
    if (!activeRankedClient) throw new Error('Ranked service is unavailable');
    rankedTicket = await activeRankedClient.join({
      name,
      specId: selection.specId,
      equipment: selection.equipment,
      camo: selection.camo,
      teamSize: Number(rankedSize.value),
    });
    const activeTicket = rankedTicket;
    const activeAbort = rankedAbort;
    setStatus(`Searching ${rankedSize.value}v${rankedSize.value} near ${recordText(activeTicket, 'rating', '1000')} ELO…`);
    const queueState: RankedQueueState = activeTicket.status === 'matched'
      ? { ...activeTicket, status: 'matched' }
      : await activeTicket.wait({
      signal: activeAbort.signal,
      onUpdate: (next) => setStatus(`Searching near ${recordText(next, 'rating', '1000')} ELO…`),
    });
    if (activeAbort.signal.aborted) return;
    handedOff = true;
    try {
      // Let the battle owner mount its opaque transition synchronously before
      // this menu disappears. A cold dedicated-client import used to expose
      // one or more garage frames between these two operations.
      const handoff = onRankedStart?.({
        serviceUrl: activeRankedClient.webSocketUrl,
        state: queueState,
      });
      hide(false);
      await Promise.resolve(handoff);
    } catch (error) {
      handedOff = false;
      show();
      throw error;
    }
  }

  function beginNetworkHandoff(
    next: SerializedLobby,
    nextRole: RoomRole | null = role,
  ): boolean {
    if (handedOff) return false;
    const activeSession = session;
    if (!activeSession || !nextRole) {
      setStatus('Room session is unavailable.', true);
      return false;
    }
    handedOff = true;
    let start;
    try {
      // The callback's synchronous prefix mounts the opaque battle cover.
      // Invoke it before any more lobby DOM work and before closing the menu;
      // guest machines otherwise pay that work with the garage underneath.
      start = Promise.resolve(onNetworkStart?.({
        role: nextRole,
        session: activeSession,
        lobbyState: next,
      }));
    } catch (error) {
      handedOff = false;
      setStatus(errorMessage(error), true);
      return false;
    }
    notifyLobbyChange(null);
    hide(false);
    start.catch((error: RuntimeValue) => {
      handedOff = false;
      show();
      setStatus(errorMessage(error), true);
    });
    return true;
  }

  function rememberLiveRoom(next: SerializedLobby): void {
    if (!next.roomCode) return;
    const roomHostName = hostNameFromRoom(next);
    rememberRoomUrl(next.roomCode, next.mode || mode, roomHostName);
    if (role === 'client') presentInvitation(roomHostName, next.roomCode, true);
  }

  function shouldBeginClientHandoff(next: SerializedLobby): boolean {
    return (next.phase === 'starting' || next.phase === 'playing') &&
      role === 'client' && !handedOff && !activeRoom;
  }

  function renderLobbyBattlefield(next: SerializedLobby): void {
    codeEl.textContent = next.roomCode;
    mapSelect.value = next.mapId;
    const selectedMap = mapById.get(next.mapId) || mapById.get('random') || maps[0];
    battlefieldName.textContent = selectedMap?.name || next.mapId || 'Random battlefield';
    const randomBattlefield = selectedMap?.id === 'random' || !selectedMap?.thumb;
    battlefieldArt.classList.toggle('is-random', randomBattlefield);
    battlefieldArt.style.backgroundImage = randomBattlefield
      ? 'none'
      : `url("${String(selectedMap?.hero || selectedMap?.thumb || '').replace(/"/g, '%22')}")`;
    battlefieldRole.textContent = role === 'host' ? 'Host selectable' : 'Selected by host';
    battlefieldCard.classList.toggle('guest', role !== 'host');
    sizeSelect.value = String(next.teamSize || 1);
    createSizeSelect.value = sizeSelect.value;
    showSelectedGameMode(next.gameMode || 'standard', { fromLobby: true });
  }

  function renderLobbySelf(player: LobbyPlayer | undefined, next: SerializedLobby): void {
    if (!player) {
      readyBtn.classList.remove('needs-ready', 'is-ready');
      readyBtn.removeAttribute('aria-pressed');
      return;
    }
    if (player.specId) vehicleSelect.value = player.specId;
    teamSelect.value = player.team;
    if (nameInput.value !== player.name) {
      nameInput.value = player.name;
      rankedName.value = player.name;
      remember(PLAYER_NAME_KEY, player.name);
    }
    const spectator = player.team === 'spectator';
    readyBtn.textContent = spectator ? 'Watching' : player.ready ? 'Not ready' : "I'm ready";
    readyBtn.disabled = spectator || next.phase !== 'waiting';
    readyBtn.classList.toggle('needs-ready', !spectator && !player.ready && next.phase === 'waiting');
    readyBtn.classList.toggle('is-ready', !spectator && player.ready);
    readyBtn.setAttribute('aria-pressed', String(!spectator && player.ready));
    readyBtn.setAttribute('aria-label', player.ready ? 'Mark yourself not ready' : 'Mark yourself ready');
  }

  function updateLobbyControls(
    next: SerializedLobby,
    player: LobbyPlayer | undefined,
  ): void {
    vehicleSelect.disabled = !player || next.phase !== 'waiting' || !!player.ready ||
      player?.team === 'spectator';
    teamSelect.disabled = next.phase !== 'waiting' || !!player?.ready ||
      next.gameMode === 'endless_horde';
    mapSelect.disabled = role !== 'host' || next.phase !== 'waiting';
    sizeSelect.disabled = role !== 'host' || next.phase !== 'waiting';
    startBtn.style.display = role === 'host' ? '' : 'none';
    const activePlayers = next.players.filter((candidate) => candidate.team !== 'spectator');
    const everyoneReady = activePlayers.length > 0 &&
      activePlayers.every((candidate) => candidate.ready && candidate.specId);
    const canStart = role === 'host' && next.phase === 'waiting' && everyoneReady;
    startBtn.disabled = !canStart;
    startBtn.classList.toggle('can-start', canStart);
  }

  function markMissingVehicleIcon(event: Event): void {
    if (event.currentTarget instanceof HTMLImageElement) {
      event.currentTarget.classList.add('missing');
    }
  }

  function createLobbyVehicle(player: LobbyPlayer): HTMLDivElement {
    const vehicle = document.createElement('div');
    vehicle.className = 'vehicle';
    const vehicleName = document.createElement('span');
    vehicleName.className = 'vehicle-name';
    if (!player.specId) {
      vehicleName.textContent = 'Selecting vehicle';
      vehicle.appendChild(vehicleName);
      return vehicle;
    }
    const icon = document.createElement('img');
    icon.className = 'vehicle-icon';
    icon.src = iconUrl(player.specId, 'angle');
    icon.alt = '';
    icon.loading = 'lazy';
    icon.decoding = 'async';
    icon.addEventListener('error', markMissingVehicleIcon, { once: true });
    const vehicleCopy = document.createElement('span');
    vehicleCopy.className = 'vehicle-copy';
    try { vehicleName.textContent = getVehicleName(player.specId) || player.specId; }
    catch (_) { vehicleName.textContent = player.specId; }
    const vehicleCamo = document.createElement('span');
    vehicleCamo.className = 'vehicle-camo';
    vehicleCamo.textContent = `${getCamoName(player.camo || 'factory')} camouflage`;
    vehicleCopy.append(vehicleName, vehicleCamo);
    vehicle.append(icon, vehicleCopy);
    return vehicle;
  }

  function createLobbyPlayerRow(player: LobbyPlayer, playerId: string | undefined): HTMLDivElement {
    const row = document.createElement('div');
    const isMe = player.id === playerId;
    row.className = `player ${player.team}${isMe ? ' self' : ''}${
      isMe && player.team !== 'spectator' && !player.ready ? ' awaiting-ready' : ''}`;
    const host = document.createElement('span');
    host.className = 'host';
    host.textContent = player.isHost ? 'HOST' : '';
    const playerName = document.createElement('b');
    playerName.className = 'name';
    playerName.textContent = player.name;
    const team = document.createElement('span');
    team.className = 'team';
    team.textContent = lobbyTeamLabel(player.team);
    const ready = document.createElement('span');
    ready.className = player.ready || player.team === 'spectator' ? 'ready' : 'wait';
    ready.textContent = player.team === 'spectator' ? 'WATCHING' : player.ready ? 'READY' : 'NOT READY';
    row.append(host, playerName, createLobbyVehicle(player), team, ready);
    return row;
  }

  function renderLobbyPlayers(next: SerializedLobby, playerId: string | undefined): void {
    playersEl.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const player of next.players) fragment.appendChild(createLobbyPlayerRow(player, playerId));
    playersEl.appendChild(fragment);
  }

  function renderLobbyNote(next: SerializedLobby): void {
    const fillNote = next.gameMode === 'endless_horde'
      ? ' All players deploy together; escalating enemy waves are authority-owned.'
      : ` Bots fill empty slots to ${next.teamSize || 1} per team.`;
    const relayNote = mode === 'private' && roomIce && !roomIce.relayAvailable
      ? ' TURN relay is unavailable; restrictive networks may not connect.'
      : '';
    note.textContent = (mode === 'lan'
      ? 'LAN gameplay stays on direct Wi-Fi WebRTC paths; signaling only introduces the peers.'
      : 'Gameplay travels directly between peers; signaling only exchanges connection metadata.') +
      fillNote + relayNote;
  }

  function renderLobby(next: SerializedLobby): void {
    state = next;
    // Every browser carries the live room in its canonical URL. A guest can
    // reattach to the current authority, while a reloaded browser host
    // reconstructs the waiting room and lets guests resubmit their retained
    // selections over replacement WebRTC channels.
    rememberLiveRoom(next);
    // A client learns that the host started through this state callback. Cover
    // immediately; rebuilding the now-obsolete lobby first creates a guest-
    // only window in which a constrained renderer can present the garage.
    // A refreshed guest rejoins the durable room after authority has already
    // crossed the starting barrier. Treat the live `playing` receipt as the
    // same battle-entry intent; the match runtime reclaims this stable player
    // id and streams the current authority snapshot into the rebuilt world.
    if (shouldBeginClientHandoff(next)) {
      beginNetworkHandoff(next, 'client');
      return;
    }
    setClosePurpose(true);
    notifyLobbyChange(next);
    lobbyEl.classList.add('show');
    room.classList.add('connected');
    root.classList.add('lobby-active');
    renderLobbyBattlefield(next);
    const playerId = ownId();
    const me = next.players.find((player) => player.id === playerId);
    renderLobbySelf(me, next);
    updateLobbyControls(next, me);
    renderLobbyPlayers(next, playerId);
    renderLobbyNote(next);
  }

  async function connectRoom(kind: 'create' | 'join'): Promise<boolean> {
    if (connecting || session || privateRoomConnection.connecting || privateRoomConnection.current) return false;
    const selection = { ...getSelection(), gameMode: selectedGameMode };
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
    const player = { id: ownPlayerId, name };
    setConnecting(true);
    try {
      const teamSize = Number(createSizeSelect.value);
      if (kind === 'create') {
        remember(ROOM_SIZE_KEY, String(teamSize));
      }
      const connection = await privateRoomConnection.connect({
        kind,
        mode: mode === 'lan' ? 'lan' : 'private',
        signalUrl,
        roomCode: kind === 'join' ? codeInput.value : undefined,
        player,
        selection,
        teamSize,
        maxPlayers: 14,
      });
      if (!connection) return false;
      adoptRoomConnection(connection);
      if (handedOff) return true;
      if (kind === 'join' && role === 'host') resetInvitation();
      else if (role === 'client') {
        presentInvitation(
          hostNameFromRoom(connection.roomInfo),
          connection.roomInfo.roomCode,
          false,
        );
      }
      unsubscribeState = privateRoomConnection.observe(renderLobby);
      return true;
    } catch (error) {
      closeCurrentSession('connection_failed');
      throw error;
    } finally {
      setConnecting(false);
    }
  }

  function selectMode(nextMode: PlayMode): void {
    const button = root.querySelector<HTMLButtonElement>(`.mode[data-mode="${nextMode}"]`);
    if (!button) return;
    closeMenuSelects();
    if (nextMode === 'solo') {
      hide();
      if (onSolo) onSolo({ gameMode: selectedGameMode });
      return;
    }
    closeCurrentSession('mode_changed');
    mode = nextMode;
    for (const item of root.querySelectorAll('.mode')) item.classList.toggle('on', item === button);
    if (nextMode === 'ranked') {
      room.classList.remove('show');
      ranked.classList.add('show');
      setStatus('Server-authoritative matchmaking. Your rating is owned by the match service.');
      refreshRanked().catch((error: RuntimeValue) => setStatus(errorMessage(error), true));
      return;
    }
    ranked.classList.remove('show');
    room.classList.add('show');
    signalInput.value = defaultSignalUrl();
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
  root.querySelectorAll<HTMLButtonElement>('.mode').forEach((button) => button.addEventListener('click', () => {
    const requested = button.dataset.mode;
    if (requested === 'solo' || requested === 'private' || requested === 'lan' || requested === 'ranked') {
      selectMode(requested);
    }
  }));
  for (const button of ruleButtons) {
    button.addEventListener('click', () => {
      const next = normalizeGameMode(button.dataset.gameMode);
      if (state && (role !== 'host' || state.phase !== 'waiting')) return;
      showSelectedGameMode(next, { fromLobby: !!state });
      if (state) command({ type: 'set_game_mode', gameMode: next });
    });
  }
  createBtn.addEventListener('click', async () => {
    setStatus('Creating room…');
    try {
      if (await connectRoom('create')) setStatus(roomConnectionStatus('created'));
    }
    catch (error) { setStatus(errorMessage(error), true); }
  });
  joinBtn.addEventListener('click', async () => {
    setStatus('Joining room…');
    try {
      if (await connectRoom('join')) setStatus(roomConnectionStatus('joined'));
    }
    catch (error) { setStatus(errorMessage(error), true); }
  });
  rankedQueueBtn.addEventListener('click', async () => {
    setStatus('Joining ranked queue…');
    try { await queueRanked(); }
    catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') {
        setStatus(errorMessage(error), true);
      }
      rankedTicket = null;
      rankedQueueBtn.disabled = false;
      rankedCancelBtn.disabled = true;
    }
  });
  rankedCancelBtn.addEventListener('click', async () => {
    if (rankedAbort) rankedAbort.abort();
    try { if (rankedTicket) await rankedTicket.cancel(); } catch { /* queue may have matched */ }
    rankedTicket = null;
    rankedQueueBtn.disabled = false;
    rankedCancelBtn.disabled = true;
    setStatus('Ranked search cancelled.');
  });
  copyBtn.addEventListener('click', async () => {
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
    } catch {
      setStatus(`Invite link: ${inviteUrl}`);
    }
  });
  teamSelect.addEventListener('change', () => command({ type: 'set_team', team: teamSelect.value }));
  vehicleSelect.addEventListener('change', () => {
    const specId = vehicleSelect.value;
    if (!specId || !isVehicleAllowed(specId)) return;
    const loadout = getVehicleLoadout(specId);
    command({ type: 'select_vehicle', specId });
    command({ type: 'select_equipment', equipment: loadout.equipment });
    command({ type: 'select_camo', camo: loadout.camo });
  });
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
  closeBtn.addEventListener('click', () => hide());
  root.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.menu-select')) {
      closeMenuSelects();
    }
  });
  panel.addEventListener('scroll', () => closeMenuSelects(), { passive: true });
  const closeMenusOnResize = () => closeMenuSelects();
  window.addEventListener('resize', closeMenusOnResize, { passive: true });
  root.addEventListener('click', (event) => { if (event.target === root) hide(); });

  function show(
    initialMode: PlayMode | null = null,
    invite: PlayMenuInvite | null = null,
  ): void {
    if (showCurrentRoom()) return;
    root.classList.add('show');
    if (initialMode) selectMode(initialMode);
    const inviteCode = normalizeRoomCode(invite?.roomCode);
    if (inviteCode.length !== 6 || !invite?.autoJoin || session || connecting) return;
    codeInput.value = inviteCode;
    presentInvitation(invite.hostName, inviteCode, false);
    setConnecting(false);
    setStatus(invitedHostName
      ? 'Joining ' + invitedHostName + '’s game…'
      : 'Joining invited game…');
    connectRoom('join')
      .then((connected) => {
        if (connected) setStatus(roomConnectionStatus('joined'));
      })
      .catch((error: RuntimeValue) => setStatus(errorMessage(error), true));
  }
  function hide(closeSession = true): void {
    closeMenuSelects();
    root.classList.remove('show');
    // Closing the presentation must never mean leaving an established room.
    // The live lobby state remains authoritative while the player browses the
    // Garage and is rendered unchanged when this modal is opened again.
    if (closeSession && !handedOff && !activeRoom && !session) {
      closeCurrentSession('menu_closed');
    }
  }
  function dispose(): void {
    handedOff = false;
    if (activeRoom || session) closeCurrentSession('menu_disposed');
    else hide(false);
    window.removeEventListener('resize', closeMenusOnResize);
    root.remove();
  }
  function attachActiveRoom(adapter: ActiveRoomAdapter): void {
    if (!adapter || !adapter.state || !adapter.playerId ||
        typeof adapter.command !== 'function' || typeof adapter.leave !== 'function') {
      throw new TypeError('active room adapter is incomplete');
    }
    // The network room coordinator now owns this transport. Relinquish the
    // menu acquisition generation without closing the handed-off session.
    privateRoomConnection.forget();
    session = null;
    activeRoom = adapter;
    role = adapter.role;
    mode = adapter.state.mode === 'lan' ? 'lan' : 'private';
    handedOff = false;
    renderLobby(adapter.state);
  }
  function updateActiveRoom(next: SerializedLobby): boolean {
    if (!activeRoom || !next) return false;
    activeRoom.state = next;
    renderLobby(next);
    return true;
  }
  function detachActiveRoom(): void {
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
  function showCurrentRoom(): boolean {
    const next = activeRoom?.state || state;
    if (!next || (!activeRoom && !session)) return false;
    ranked.classList.remove('show');
    room.classList.add('show');
    root.classList.add('show');
    renderLobby(next);
    return true;
  }
  function syncGarageSelection(): boolean {
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
