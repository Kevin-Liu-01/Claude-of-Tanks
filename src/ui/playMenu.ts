import { createSelectPickerMenu } from './selectPickerMenu.ts';
import { createBattlefieldPicker, type BattlefieldCard, type BattlefieldPicker } from './battlefieldPicker.ts';
import { pickerText } from './pickerText.ts';
import { createPicker, type PickerItem } from './components/picker.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';
import { createModePicker, modeRuleLines, type ModeCard, type ModePicker } from './modePicker.ts';
import { battlefieldFacts } from './battlefieldFacts.ts';
import type { IconId } from './icons/icon.ts';
import { mapRegionTags } from './regionTags.ts';
import { createEnemyNationSelect } from './enemyNationSelect.ts';
import { containModalTab } from './modal.ts';
import { segmented, setRoving, setToggle, toggle, wireRoving } from './components/components.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { frontlineSummary } from '../game/campaignProgress.ts';
import { CAMPAIGN_OPERATIONS, campaignLadder, campaignOperationById, campaignSummary } from '../game/campaignOperations.ts';
import {
  ENEMY_NATION_OPTIONS, readBrainSettings, readTeamArrangement, readTeamNations, writeBrainSettings, writeTeamArrangement,
  writeTeamNations,
} from '../game/teamArrangement.ts';
import { createTeamNationsControl } from './teamNationsControl.ts';
import { COUNTRIES, countryNation, countryOfVehicle, type CountryId } from '../sim/countries.ts';
import {
  BATTLE_FIELD_LIMIT, SIDES_PRESETS, TEAM_ARRANGEMENT_LIMITS, acceptsTeamArrangement, isWaveMode, modeCopyValues,
  normalizeTeamArrangement, rulesetSides, sidesPresetOf, type TeamArrangement,
} from '../sim/matchRuleset.ts';
/**
 * Battle-mode picker and private/LAN lobby presentation.
 *
 * This module owns the room-entry interface and translates user actions into
 * room commands. Canonical room and match state live in the room host
 * (src/mp/room) and the match session (src/mp/session); the menu renders the
 * lobby the room publishes and hands established sessions to main.ts.
 */
import {
  createRoomConnectionAdapter,
  type RoomConnection,
  type RoomConnectionOptions,
  type RoomConnectionRuntime,
} from '../mp/session/playMenuAdapter.ts';
import { resolveRoomsUrl } from '../mp/session/endpoint.ts';
import { normalizePlayMode, type PlayMode } from '../mp/session/playMode.ts';
import { isIntentionalRoomCloseReason } from '../mp/session/roomFailure.ts';
// entry resilience (2026-09-25): room failure codes and ICE degradation are beaconed (never prose or codes of rooms)
import { getEntryTelemetry } from '../entry/telemetry.ts';
import { roomFailurePresentation } from './roomFailurePresentation.ts';
import { createRoomServiceLimit } from '../mp/session/roomServiceLimit.ts';
export type { PlayMode } from '../mp/session/playMode.ts';
import { automaticPlayerName, normalizePlayerName } from '../mp/session/playerNames.ts';
import { normalizeRoomCode } from '../mp/room/protocol.ts';
import { createRoomInviteUrl } from '../mp/session/roomInvite.ts';
import { ensureFonts } from './fonts.ts';
import { iconUrl } from './icons.ts';
import { tierNumeral } from '../techTree/tiers.ts';
import { uiIconSVG } from './uiIcons.ts';
import { datumAttr } from './dom.ts';
import { ensureStyle } from './styleLayers.ts';
import { getLocale, t } from './i18n.ts';
import { createRandomMapMosaic } from './randomPreviews.ts';
import {
  applySiteMetadataToDocument,
  localizedGameMetadata,
  privateRoomMetadata,
} from '../presentation/siteMetadata.ts';
import {
  BATTLE_MODE_IDS,
  GAME_MODE_DEFINITIONS,
  MODE_PRESENTATION_ORDER,
  normalizeGameMode,
  type GameModeId,
} from '../sim/gameModeCatalog.ts';
import { isCoopGameMode } from '../mp/room/roomPolicy.ts';
import { MARS_CACHE_IDS, MARS_GRAVITY_IDS, matchRulesetFor } from '../sim/matchRuleset.ts';
import type { LobbyPlayer, LobbyTeam, SerializedLobby } from '../mp/room/lobbyShape.ts';

const STYLE_ID = 'cot-play-menu-style';
const PLAYER_ID_KEY = 'cot.player.id.v1';
const PLAYER_NAME_KEY = 'cot.player.name.v1';
const ROOM_SIZE_KEY = 'cot.room.size.v1';
const GAME_MODE_KEY = 'cot.game.mode.v1';
type RoomSession = RoomConnection['session'];
type RoomRole = RoomConnection['role'];
type MaybePromise<T> = T | PromiseLike<T>;

interface PlayMenuMap {
  id: string;
  name: string;
  thumb?: string;
  hero?: string;
}

interface PlayMenuVehicle {
  id: string;
  name: string;
  tier?: number;
  /** The spec nation (TEAM NATIONS: MONO's switch leads with its flag). */
  nation?: string;
}

interface PlayMenuSelection {
  specId: string;
  mapId: string;
  equipment: string[];
  /** The consumable in each slot (game/consumableLoadout.ts). */
  consumables?: string[];
  camo: string;
}

interface PlayMenuLobbyContext {
  state: SerializedLobby;
  playerId: string;
  role: RoomRole;
}

export interface ActiveRoomAdapter {
  state: SerializedLobby;
  playerId: string;
  role: RoomRole;
  /** The room's session (the object `onNetworkStart` routes on): Rejoin battle hands it back while its match runs. */
  session?: RuntimeValue;
  command(command: Record<string, RuntimeValue>): RuntimeValue;
  leave(reason?: string): RuntimeValue;
}

export interface PlayMenuOptions {
  /** The version refusal's Refresh button (location.reload by default; receipts inject it). The banner is checked in a
   *  real browser by tools/mp-refusal-banner-check.mjs (in view at 1024x640, Refresh reloads, Rejoin hidden). */
  reloadPage?: () => void;
  maps?: PlayMenuMap[];
  vehicles?: PlayMenuVehicle[];
  getSelection(): PlayMenuSelection;
  getVehicleLoadout?(specId: string): Pick<PlayMenuSelection, 'equipment' | 'consumables' | 'camo'>;
  onSolo?(request?: { gameMode?: GameModeId; mapId?: string; campaignOperationId?: string }): RuntimeValue;
  /** Accepted native Ready gesture, never auto-join or replicated room state. */
  onReadyIntent?(): void;
  onNetworkStart?(request: {
    role: RoomRole;
    session: RoomSession;
    lobbyState: SerializedLobby;
  }): MaybePromise<RuntimeValue>;
  onLobbyChange?(context: PlayMenuLobbyContext | null): void;
  isVehicleAllowed?(specId: string): boolean;
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
  /** The held room's lobby again; `notice` (why the last battle entry failed) takes the status line. */
  /** `code`: a known entry refusal, worded in the player's locale (ENTRY_REFUSAL_KEYS); `notice` is the fallback. */
  showActiveRoom(notice?: string | null, code?: string | null): boolean;
  showCurrentRoom(): boolean;
  showRoomFailure(reason: string, mode?: PlayMode): void;
  syncGarageSelection(): boolean;
  setReady(ready: boolean): boolean;
  /** The admin starts the waiting room's round (the lobby's Start, the end screen's Start next). */
  startRound(): boolean;
}

interface MenuSelectElement extends HTMLDivElement {
  value: string;
  disabled: boolean;
}

/**
 * Entry refusals the lobby words in the player's locale (2026-10-13): the match ending during the entry, and a host on
 * another build (src/mp/wire/matchBuild.ts MatchRefusalCode — the same-wire check and the other-wire gate).
 */
const ENTRY_REFUSAL_KEYS: Readonly<Record<string, string>> = Object.freeze({
  match_ended: 'playMenu.entryRefusal.matchEnded',
  build_mismatch: 'playMenu.entryRefusal.buildMismatch',
  build_host_older: 'playMenu.entryRefusal.buildHostOlder',
  build_host_newer: 'playMenu.entryRefusal.buildHostNewer',
});

/**
 * Refusals only a page refresh resolves (2026-10-14, deploy 223's MP window: an old tab's "Refresh the page to join"
 * sat in the lobby status line, out of view at 1024x640, under a Rejoin battle that could only be refused again).
 */
const VERSION_REFUSAL_CODES: ReadonlySet<string> = new Set(['build_mismatch', 'build_host_older', 'build_host_newer']);

/** Warm only code implied by an explicit garage mode selection. */
export function preloadPlayMode(_mode: PlayMode): Promise<null> {
  return Promise.resolve(null);
}

const CSS = `
/* the panel hangs under the Garage's bar (y 16 to 60 at every size), never across it, and grows downward; the game
   document declares the weight-voiced 'Cot UI' family, so the reading voice is that family too */
.cot-play{position:fixed;inset:0;z-index:92;display:none;align-items:flex-start;justify-content:center;
  padding:max(72px,8vh) var(--s5) var(--s5);background:linear-gradient(var(--scrim),var(--scrim)),var(--scrim);--font-body:var(--font-ui);font-family:var(--font-body);color:var(--ink-1);}
.cot-play.show{display:flex;animation:cotPlayVeil var(--dur-base) var(--ease-enter)}
.cot-play.show .panel{animation:cotPlayPanel var(--dur-screen) var(--ease-enter) backwards}
@keyframes cotPlayVeil{from{opacity:0}}
@keyframes cotPlayPanel{from{opacity:0;transform:translateY(12px)}}
.cot-play,.cot-play *{box-sizing:border-box}
/* one plate, no glass (the Premiere direction): the plate laid on the opaque scene colour, so neither the Garage behind the
   panel nor the roster scrolling under its sticky head and foot shows through */
.cot-play{--play-plate:linear-gradient(var(--surface-plate),var(--surface-plate)) var(--surface-scene)}
.cot-play .panel{position:relative;display:flex;flex-direction:column;width:min(calc(860px * max(1, var(--cot-ui-scale, 1))),100%);max-height:100%;overflow:auto;
  padding:var(--s5);border-radius:var(--r2);background:var(--play-plate);box-shadow:var(--e4);
  scrollbar-width:thin;scrollbar-color:var(--line-3) transparent;color-scheme:dark;overscroll-behavior:contain;
  scroll-padding-top:calc(var(--s5) + var(--play-close) + var(--s4))}
.cot-play .panel:focus-visible{outline:none}
.cot-play .panel::-webkit-scrollbar{width:6px}
.cot-play .panel::-webkit-scrollbar-thumb{background:var(--line-3);border-radius:var(--r1)}
/* the cue that the panel runs on past an edge: the edge fades while more lies beyond it (scroll-driven; a panel that does not
   scroll has no timeline and shows no fade; a browser without scroll timelines shows none). Like the sticky head, each sits on the panel's padding edge; the sticky head
   and foot cover their own edge. */
@supports (animation-timeline:scroll()){
.cot-play .panel::before,.cot-play .panel::after{content:'';position:sticky;z-index:var(--z-lift);flex:0 0 var(--s6);background:var(--play-plate);
  pointer-events:none;opacity:0;animation-timeline:scroll(nearest)}
.cot-play .panel::before{order:-1;top:calc(-1 * var(--s5));margin-bottom:calc(-1 * var(--s6));mask-image:linear-gradient(var(--surface-scene),transparent);
  animation-name:cotPlayEdge;animation-direction:reverse;animation-fill-mode:both;animation-timing-function:linear;
  animation-range:var(--s5) calc(var(--s5) + var(--s6))}
.cot-play .panel::after{order:99;bottom:calc(-1 * var(--s5));margin-top:calc(-1 * var(--s6));mask-image:linear-gradient(transparent,var(--surface-scene));
  animation-name:cotPlayEdge;animation-fill-mode:both;animation-timing-function:linear;
  animation-range:calc(100% - var(--s5) - var(--s6)) calc(100% - var(--s5))}
}
@keyframes cotPlayEdge{from{opacity:1}to{opacity:0}}
/* the sticky head and foot: what scrolls under them fades into their plate while they stand stuck (scroll-state queries;
   a browser without them shows the plain edge) */
.cot-play :is(.play-head,.lobby.show .controls){container-type:scroll-state}
.cot-play .play-head h2::after,.cot-play .lobby.show .control-options::before{content:'';position:absolute;left:0;right:0;height:var(--s6);
  background:var(--play-plate);pointer-events:none;opacity:0}
.cot-play .play-head h2::after{top:100%;mask-image:linear-gradient(var(--surface-scene),transparent)}
.cot-play .lobby.show .control-options::before{bottom:100%;mask-image:linear-gradient(transparent,var(--surface-scene))}
@container scroll-state(stuck: top){.cot-play .play-head h2::after{opacity:1}}
@container scroll-state(stuck: bottom){.cot-play .lobby.show .control-options::before{opacity:1}}
.cot-play .play-head{position:sticky;top:calc(-1 * var(--s5));z-index:5;flex-shrink:0;margin:calc(-1 * var(--s5)) calc(-1 * var(--s5)) 0;
  padding:var(--s5) var(--play-head-end) var(--s4) var(--s5);background:var(--play-plate);border-bottom:1px solid var(--line-1)}
/* the close and the title share one row: the close's size (44 px under a coarse pointer) is the title's height */
.cot-play{--play-close:36px;--play-gutter:var(--s5);--play-head-end:calc(var(--play-close) + var(--play-gutter) + var(--s3));--icon-ink-y:.646;
  --rules-col:max(344px, calc(320px * var(--cot-type-scale, 1)))}body[data-cot-input='coarse'] .cot-play{--play-close:44px}
.cot-play .close{--h:var(--play-close);position:absolute;right:var(--play-gutter);top:var(--s5);box-shadow:var(--btn-secondary-ring)}
/* no kicker above the title (owner UI rules 2026-10-17); kept for assistive technology */
.cot-play .eyebrow{position:absolute;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cot-play h2{display:flex;align-items:center;min-height:var(--play-close);margin:0;font:700 var(--fs-28)/1 var(--font-display);
  letter-spacing:var(--track-title);text-transform:uppercase;text-wrap:balance}
:lang(zh-CN) .cot-play h2{line-height:1.25}
.cot-play .lead{margin:var(--s3) 0 var(--s5);color:var(--ink-3);font-size:max(var(--fs-floor-12),var(--fs-13));line-height:1.5}
.cot-play .lead:empty{display:none}
.cot-play.lobby-active .modes{display:none}.cot-play.lobby-active .lead{margin-bottom:var(--s2)}

/* the two ways in, a private room and the local network, on the kit's segmented control (.modes, styled with the room's
   other settings below); the solo link under the room */
.cot-play .modes{margin-top:var(--s4)}
.cot-play .mode{display:flex;align-items:center;gap:var(--s2);order:3;align-self:flex-start;min-height:44px;padding:var(--s2) 0;
  border:0;background:none;color:var(--ink-2);font:600 max(var(--fs-floor-12),var(--fs-13))/1 var(--font-body);cursor:pointer;
  transition:color var(--dur-fast) var(--ease-enter)}
.cot-play .mode:hover{color:var(--ink-1)}
.cot-play.lobby-active .mode,.cot-play:not(.multiplayer-entry) .mode{display:none}

/* labels: 12 px at the label tracking */
.cot-play :is(.rule-heading b,.arrange-head b,.campaign-heading b,.field-label,.roommeta,.arrange-sides-label){
  font:600 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-body);letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-3)}
.cot-play label{display:grid;gap:var(--s2);font:600 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-body);
  letter-spacing:var(--track-label);text-transform:uppercase;color:var(--ink-3)}
.cot-play :is(.arrange-head span,.arrange-cap,.brain-note,.note,.op-hint){
  color:var(--ink-3);font-size:max(var(--fs-floor-11),var(--fs-11));line-height:1.4}

/* the game modes behind Room rules */
.cot-play .rule-heading{display:flex;align-items:end;justify-content:space-between;gap:var(--s3);margin:var(--s4) 0 var(--s2)}
.cot-play .rule-note{display:block;margin:var(--s2) 0 0;color:var(--accent);font:600 max(var(--fs-floor-11),var(--fs-11))/1.3 var(--font-body)}
.cot-play .rule-note[hidden]{display:none}
.cot-play.lobby-active .rule-heading{margin-top:var(--s3)}

/* host arrangement and the opponent brain: plates */
.cot-play :is(.arrange,.brain){margin:var(--s3) 0 0;padding:var(--s4);border-radius:var(--r1);background:var(--fill-quiet);box-shadow:var(--ring-1)}
.cot-play .brain[hidden]{display:none}
.cot-play .arrange-head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s3);margin-bottom:var(--s3)}
.cot-play .arrange-head b{color:var(--ink-1);font:600 max(var(--fs-floor-12),var(--fs-13))/1.2 var(--font-body);letter-spacing:normal;text-transform:none}
.cot-play .arrange-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:var(--s3);align-items:end}
/* Defaults ends the fields' row in its own column; the nation takes two columns only when the first wave leaves it room,
   so a co-op room's four fields stand equal */
.cot-play .arrange-fields>[data-arrange-reset]{grid-column:-2/-1}
.cot-play .arrange-fields:has(>[data-arrange-wave]:not([hidden])) .cot-nation-field{grid-column:auto}
.cot-play .arrange-fields label[hidden],.cot-play .arrange-cap[hidden],.cot-play .brain-note[hidden],.cot-play .arrange-sides[hidden],
.cot-play .operation-picker[hidden]{display:none}
body[data-cot-width='compact'] .cot-play .arrange-fields{grid-template-columns:repeat(2,minmax(0,1fr))}
body[data-cot-width='phone'] .cot-play .arrange-fields{grid-template-columns:minmax(0,1fr)}
.cot-play :is(.arrange-sides,.brain-row){display:flex;align-items:center;gap:var(--s2);flex-wrap:wrap}
.cot-play .arrange-sides{margin-bottom:var(--s3)}
.cot-play .arrange-sides-label{flex-basis:100%}
.cot-play .arrange-readout{margin-left:auto;color:var(--ink-1);font:600 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-data);letter-spacing:var(--track-label-s)}
.cot-play .arrange-cap,.cot-play .brain-note{display:block;margin-top:var(--s2)}
.cot-play .brain-allies{display:flex;align-items:center;gap:var(--s3);margin-left:auto;color:var(--ink-2);font:500 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-body)}
.cot-play .brain-allies__label{cursor:pointer}
.cot-play .brain-allies.is-disabled .brain-allies__label{color:var(--ink-4);cursor:default}
.cot-play .operation-picker{display:grid;gap:var(--s1);margin-top:var(--s2)}

/* the campaign's operations */
.cot-play .campaign{margin-top:var(--s4);padding-top:var(--s3);border-top:1px solid var(--line-1)}
.cot-play .campaign-heading{display:flex;align-items:end;justify-content:space-between;gap:var(--s3);margin:0 0 var(--s1)}
.cot-play .campaign-heading span{color:var(--accent);font:600 max(var(--fs-floor-11),var(--fs-11))/1 var(--font-data)}
.cot-play .ops{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:var(--s2)}
.cot-play .op{display:grid;grid-template-columns:26px minmax(0,1fr) auto;align-items:center;gap:var(--s2);min-height:50px;padding:var(--s2) var(--s3);
  border-radius:var(--control-radius);background:var(--fill-quiet);box-shadow:var(--ring-1);color:var(--ink-2)}
.cot-play .op.ready{box-shadow:var(--ring-accent)}.cot-play .op.cleared{box-shadow:var(--ring-ok)}.cot-play .op.locked{opacity:.55}
.cot-play .op-index{color:var(--accent);font:700 max(var(--fs-floor-12),var(--fs-15))/1 var(--font-data)}.cot-play .op.cleared .op-index{color:var(--text-ok)}
.cot-play .op-copy{display:grid;min-width:0;gap:2px}
.cot-play .op-copy b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--ink-1);font:700 max(var(--fs-floor-12),var(--fs-12))/1.2 var(--font-display);text-transform:uppercase}
.cot-play .op-copy small{color:var(--ink-3);font:500 max(var(--fs-floor-11),var(--fs-11))/1.2 var(--font-data)}
.cot-play .op-copy .op-best{color:var(--ink-2)}
.cot-play .op-stars{display:inline-flex;gap:2px;margin-left:var(--s2);font-size:max(var(--fs-floor-11),var(--fs-11));line-height:1;vertical-align:middle}
.cot-play .op-stars i{font-style:normal;color:var(--ink-4)}.cot-play .op-stars i.on{color:var(--accent)}
.cot-play .op-launch{height:32px;padding:0 var(--s3);border:0;border-radius:var(--control-radius);background:var(--btn-primary-fill);
  box-shadow:var(--btn-primary-shadow);color:var(--btn-primary-ink);font:700 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-display);
  letter-spacing:var(--track-label-s);text-transform:uppercase;cursor:pointer}
.cot-play .op-launch:hover{background:var(--btn-primary-hover)}
.cot-play .op.cleared .op-launch{background:transparent;box-shadow:var(--ring-accent);color:var(--accent)}
.cot-play .op-hint{max-width:74px;text-align:right}

/* create or join */
.cot-play .room{order:1;display:none;margin-top:var(--s4);padding-top:var(--s4);border-top:1px solid var(--line-1)}
.cot-play .room.show{display:block}
/* a lobby opens straight under the title: no mode cards above it, so no rule between them */
.cot-play.lobby-active .room{margin-top:0;padding-top:0;border-top:0}
.cot-play .setup{display:grid;gap:var(--s3)}.cot-play .room.connected .setup{display:none}
.cot-play .identity{display:grid;grid-template-columns:1fr 1fr;gap:var(--s3)}.cot-play .identity label{width:auto}
.cot-play .room-actions{display:grid;grid-template-columns:1fr 1fr;gap:var(--s3)}
.cot-play .room-action{display:grid;align-content:start;gap:var(--s4);min-height:142px;padding:var(--s4);border-radius:var(--r1);
  background:var(--fill-quiet);box-shadow:var(--ring-1)}
.cot-play .room-action-head{display:grid;gap:var(--s1)}
.cot-play .room-action-head b{font:700 var(--fs-20)/1 var(--font-display);text-transform:uppercase}
.cot-play .room-action-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s3);align-items:end}
.cot-play .field{display:grid;gap:var(--s2)}

/* fields and the menu select */
.cot-play :is(input:not(.cot-c-picker__search),select),.cot-play .arrange-fields :is(input,select),.cot-play .operation-picker select{width:100%;min-height:44px;
  padding:0 var(--s3);border:0;border-radius:var(--control-radius);background:var(--fill-quiet);box-shadow:var(--ring-2);
  color:var(--ink-1);font:500 max(var(--fs-floor-12),var(--fs-13))/1 var(--font-body);letter-spacing:normal;text-transform:none;outline:none}
.cot-play :is(input,select):focus-visible{box-shadow:var(--focus-ring)}
/* the enemy nation's picker menu stands as tall as the fields beside it, so its label shares their line (Rooms r36) */
.cot-play .arrange-fields .cot-c-menu__trigger{min-height:44px}
/* numbers wear the data face, as the seats and the code do: the battle format and the arrangement's counts */
.cot-play :is(.create-size,.room-size) .cot-c-seg__opt,.cot-play .sides-seg .cot-c-seg__opt:not([data-value='custom']),
.cot-play .arrange-fields :is([data-arrange-field='allies'],[data-arrange-field='enemies'],[data-arrange-wave]) .cot-c-menu__name,
.cot-play .arrange-fields input[type='number']{font-family:var(--font-data)}
.cot-play :is(input,select):disabled{opacity:.55}
.cot-play .code-input{font:700 var(--fs-18)/1 var(--font-data);letter-spacing:.16em;text-transform:uppercase}
.cot-play .menu-select{position:relative;min-width:0}
.cot-play .menu-select-trigger{position:relative;display:flex;align-items:center;gap:var(--s2);width:100%;min-height:44px;
  padding:0 38px 0 var(--s3);border:0;border-radius:var(--control-radius);background:var(--fill-quiet);box-shadow:var(--ring-2);
  color:var(--ink-1);font:500 max(var(--fs-floor-12),var(--fs-13))/1 var(--font-body);text-align:left;cursor:pointer;
  transition:background-color var(--dur-fast) var(--ease-enter),box-shadow var(--dur-fast) var(--ease-enter)}
.cot-play .menu-select-trigger:hover{background:var(--surface-hover)}
.cot-play .menu-select-trigger[aria-expanded=true]{box-shadow:var(--ring-accent)}
.cot-play .menu-select-trigger::after{content:"";position:absolute;right:var(--s4);top:50%;width:7px;height:7px;
  border-right:1.5px solid var(--ink-2);border-bottom:1.5px solid var(--ink-2);transform:translateY(-68%) rotate(45deg);
  transition:transform var(--dur-fast) var(--ease-move)}
.cot-play .menu-select-trigger[aria-expanded=true]::after{transform:translateY(-30%) rotate(225deg)}
.cot-play .menu-select.disabled .menu-select-trigger{cursor:not-allowed;background:transparent;box-shadow:var(--ring-1);color:var(--ink-3)}
.cot-play .menu-select.disabled .menu-select-trigger::after{opacity:.45}
.cot-play .menu-select-trigger-copy{display:grid;min-width:0;gap:2px}
.cot-play .menu-select-trigger-copy>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.3}
.cot-play .menu-select-trigger-copy small{color:var(--ink-3);
  font:500 max(var(--fs-floor-11),var(--fs-11))/1.2 var(--font-ui)}
/* a seat's team: alpha in the own-team blue and bravo in the enemy red, as the roster draws them */
.cot-play .team-mark{display:inline-block;width:8px;height:8px;flex:0 0 8px;border:1.5px solid var(--team-neutral);border-radius:50%;background:none}
.cot-play .team-mark.alpha{border:0;background:var(--team-own)}
.cot-play .team-mark.bravo{border:0;border-radius:1px;background:var(--team-enemy);transform:rotate(45deg) scale(.85)}
.cot-play .player .team{display:inline-flex;align-items:center;gap:var(--s2)}
.cot-play .menu-select--map .menu-select-trigger,.cot-play .menu-select--vehicle .menu-select-trigger{min-height:44px;padding-left:var(--s1)}
.cot-play .menu-select-thumb{position:relative;display:block;width:60px;height:34px;flex:0 0 60px;overflow:hidden;border-radius:2px;
  background:var(--surface-hover) center/cover no-repeat;box-shadow:var(--ring-1)}
.cot-play .menu-select-thumb.is-random{background:var(--surface-page)}
.cot-play .menu-select--vehicle .menu-select-thumb{--w:56px;--h:36px;width:var(--w);height:var(--h);flex-basis:var(--w);background-color:var(--surface-page);
  background-size:cover;background-position:50% calc(var(--h) / 2 - var(--w) * var(--icon-ink-y));box-shadow:none}
.cot-play :is(.menu-select-trigger,.mode,.op-launch):focus-visible{
  outline:none;box-shadow:var(--focus-ring)}
/* the vehicle picker opens in the foot above its trigger: the fleet's cards, each tank's own angle render centred on its
   ink (the render's ink sits --icon-ink-y of its width down a square), two to a phone's row, a short screen's sized to
   the view */
.cot-play .vehicle-pick{box-sizing:border-box;height:min(clamp(300px,46vh,480px),calc(var(--cot-viewport-height,100dvh) - 112px));
  padding:var(--s4);border-radius:var(--plate-radius);background:var(--fill-quiet);box-shadow:var(--ring-1)}
.cot-play .vehicle-pick[hidden]{display:none}
/* the open vehicle picker would fill a stuck foot and leave the room a strip: the foot scrolls with the room instead,
   the picker brought under the head (Rooms r30) */
.cot-play .lobby.show .controls:has(>.vehicle-pick:not([hidden])){position:static}
.cot-play .vehicle-pick{container-type:inline-size}
.cot-play .vehicle-pick .cot-c-picker__grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
@container (width < 420px){.cot-play .vehicle-pick .cot-c-picker__grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}}
.cot-play .vehicle-pick .cot-c-picker__media{container-type:inline-size;background:var(--surface-page)}
.cot-play .vehicle-pick .cot-c-picker__media>img{object-position:50% calc(100cqw * (9 / 32 - var(--icon-ink-y)))}

/* buttons are the kit's (.cot-c-btn); these only place them */
/* the room's buttons and fields share one 44 px row */
.cot-play .action{--h:44px;min-height:44px}
/* the kit draws its buttons inline-flex, which outranks the hidden attribute (Rejoin, Retry) */
.cot-play .action[hidden]{display:none}
.cot-play button[data-action="ready"]{min-height:44px}
.cot-play .status{margin-top:var(--s3);scroll-margin-block:var(--s6)}
.cot-play .status.is-empty{height:0;min-height:0;margin:0;padding:0;overflow:hidden;background:none;box-shadow:none}
.cot-play .status.err{color:var(--text-danger)}.cot-play .status[hidden]{display:none}

/* the lobby */
.cot-play .lobby{display:none;margin-top:var(--s4)}.cot-play .lobby.show{display:block}
.cot-play .roomhead{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s3) var(--s5);padding:var(--s3) var(--s4);
  border-radius:var(--r1);background:var(--fill-quiet);box-shadow:var(--ring-1)}
.cot-play .roommeta{margin-bottom:var(--s2)}
.cot-play .roomhead .seats{margin-left:auto;text-align:right}
.cot-play .roomhead>.action{align-self:center}
.cot-play .seats-count{color:var(--ink-1);font:700 var(--fs-28)/1 var(--font-data)}
.cot-play .code{color:var(--ink-1);font:700 var(--fs-28)/1 var(--font-data);letter-spacing:.18em}
.cot-play .battlefield-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) var(--rules-col);column-gap:var(--s3);min-height:108px;
  margin-top:var(--s3);overflow:hidden;border-radius:var(--r1);background:var(--fill-quiet);box-shadow:var(--ring-1)}
.cot-play .battlefield-art{position:relative;min-height:108px;overflow:hidden;background:var(--surface-page) center/cover no-repeat padding-box;
  border-right:1px solid var(--line-1)}
.cot-play .battlefield-art::after{content:"";position:absolute;inset:0;z-index:1;background:var(--media-fade-soft)}
.cot-play .battlefield-art .random-map-mosaic{position:absolute;inset:0;display:none;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--surface-page)}
.cot-play .battlefield-art.is-random .random-map-mosaic{display:grid}
.cot-play .battlefield-art .random-map-tile{display:block;min-width:0;background:center/cover no-repeat}
/* the battlefield picker opens under the card's words, in the picture's place: its preview is the picture. A short
   screen keeps it under the sticky head (112 px: the sheet's edge, the head and the panel's foot) */
.cot-play .battlefield-card.picking{grid-template-columns:minmax(0,1fr)}
.cot-play .battlefield-card.picking .battlefield-art{display:none}
.cot-play .battlefield-card.picking .battlefield-copy{grid-column:1 / -1;padding-left:var(--s4)}
.cot-play .battlefield-card.picking .format-field{display:none}
.cot-play .battlefield-pick{box-sizing:border-box;height:min(clamp(340px,52vh,520px),calc(var(--cot-viewport-height,100dvh) - 112px));margin-top:var(--s3);padding:var(--s4);border-radius:var(--plate-radius);
  background:var(--fill-quiet);box-shadow:var(--ring-1)}
.cot-play .battlefield-pick[hidden]{display:none}
/* the mode picker opens under the plate as the battlefield's does; the trigger names the mode in its hue */
.cot-play .mode-pick{box-sizing:border-box;height:min(clamp(340px,52vh,520px),calc(var(--cot-viewport-height,100dvh) - 112px));
  margin-top:var(--s3);padding:var(--s4);border-radius:var(--plate-radius);background:var(--fill-quiet);box-shadow:var(--ring-1)}
.cot-play .mode-pick[hidden]{display:none}
.cot-play .menu-select-glyph{display:flex;flex:none;color:var(--mode-ink,var(--ink-2))}
.cot-play .menu-select--mode .menu-select-trigger{gap:var(--s3)}
.cot-play .battlefield-copy{grid-column:2 / -1;min-width:0;display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:var(--s3);padding:var(--s4) var(--s4) var(--s4) 0}
.cot-play .battlefield-picker{min-width:0}
.cot-play .players{display:grid;gap:var(--s2);margin-top:var(--s2)}
.cot-play .player{--foot-track:var(--rules-col);display:grid;
  grid-template-columns:minmax(120px,1fr) minmax(190px,1.35fr) calc(var(--foot-track) - 7em - var(--s3)) 7em;align-items:center;
  gap:var(--s3);min-height:58px;padding:var(--s2) var(--s4);border-radius:var(--control-radius);background:var(--row-plate);
  box-shadow:var(--ring-1);font-size:max(var(--fs-floor-12),var(--fs-12));
  transition:background-color var(--dur-fast) var(--ease-enter),box-shadow var(--dur-fast) var(--ease-enter)}
/* a co-op room has every player on one side: their team words would repeat down the roster, so only a spectator's show */
.cot-play.coop .player:not(.spectator) .team{visibility:hidden}
.cot-play .player.self.awaiting-ready{background:var(--accent-wash);box-shadow:var(--ring-accent)}
/* the room's admin wears the kit tag; a seat's team is its word in the team's colour */

/* the name keeps the vehicle name's line pitch, the tag's line included, so a wrapped name and a wrapped vehicle centre
   onto the same lines (Rooms r35: 3 px apart when the tag took a 24 px line under a 16 px one) */
.cot-play .player .host.cot-c-tag{font-size:max(var(--fs-floor-12),var(--fs-12));margin-block:calc((var(--name-line) - 20px) / 2)}
.cot-play .player .name{--name-line:calc(max(var(--fs-floor-12),var(--fs-13)) * 1.3);display:flex;flex-wrap:wrap;align-items:baseline;gap:0 var(--s2);min-width:0;overflow-wrap:anywhere;font:600 max(var(--fs-floor-12),var(--fs-13))/var(--name-line) var(--font-body)}
.cot-play .player .vehicle{display:flex;align-items:center;gap:var(--s3);min-width:0;color:var(--ink-2)}
/* a seat without a picture keeps the picture's room, so every vehicle name starts on one line */
.cot-play .vehicle-icon{--w:58px;--h:42px;width:var(--w);height:var(--h);flex:0 0 var(--w);object-fit:cover;
  object-position:50% calc(var(--h) / 2 - var(--w) * var(--icon-ink-y))}.cot-play .vehicle-icon:is(.missing,.placeholder){visibility:hidden}
.cot-play .vehicle-name{min-width:0;overflow-wrap:anywhere;font-size:max(var(--fs-floor-12),var(--fs-13));line-height:1.3;text-wrap:pretty}
.cot-play .vehicle-copy{display:grid;min-width:0;gap:var(--s1)}
.cot-play .player :is(.team,.ready,.wait){font:600 max(var(--fs-floor-12),var(--fs-12))/1 var(--font-body);letter-spacing:var(--track-label);text-transform:uppercase}
.cot-play .player .team{color:var(--ink-3)}.cot-play .player.alpha .team{color:var(--team-own)}.cot-play .player.bravo .team{color:var(--team-enemy)}
.cot-play .player.offline .name{color:var(--ink-3)}
.cot-play .player :is(.ready,.wait){white-space:nowrap}.cot-play .player .ready{color:var(--ink-1);text-align:right}.cot-play .player .wait{color:var(--ink-3);text-align:right}

/* the lobby's controls stay in view at the panel's foot while a long roster scrolls under them */
.cot-play .controls{display:grid;gap:var(--s3);margin-top:var(--s3)}
.cot-play .lobby.show .controls{position:sticky;bottom:calc(-1 * var(--s5));z-index:4;margin:var(--s3) calc(-1 * var(--s5)) 0;
  padding:var(--s4) var(--s5);background:var(--play-plate);border-top:1px solid var(--line-2)}
.cot-play .control-options{display:grid;grid-template-columns:minmax(0,1fr) var(--rules-col);gap:var(--s3);align-items:end}
.cot-play .control-options .field{width:auto;min-width:0}
.cot-play .format-field[hidden]{display:none}
/* a room's small settings (battle format, deployment) are the kit's segmented control, as wide as their field and as
   tall as its other controls; a guest still reads the format the host chose */
.cot-play :is(.modes,.create-size,.room-size,.room-team){display:flex;width:100%}
.cot-play :is(.modes,.create-size,.room-size,.room-team) .cot-c-seg__opt{flex:1 1 0;min-width:0;height:38px;padding-inline:var(--s2)}
.cot-play :is(.room-size,.room-team) .cot-c-seg__opt[aria-checked=true]:disabled{color:var(--ink-2)}
/* the five formats are mono numbers: they need little air to fit the rules column */
.cot-play :is(.create-size,.room-size) .cot-c-seg__opt{padding-inline:var(--s1)}
.cot-play .room-team .cot-c-seg__opt[hidden]{display:none}
/* the arrangement's sides and the opponent brain fill their row as the room's other settings do */
.cot-play :is(.sides-seg,.brain-seg){display:flex;flex:1 1 auto}
.cot-play :is(.sides-seg,.brain-seg) .cot-c-seg__opt{flex:1 1 0;min-width:0}
.cot-play .arrange-readout[hidden]{display:none}
.cot-play .start-count{margin-left:var(--s2);font-family:var(--font-data);letter-spacing:normal}
.cot-play .control-actions{display:flex;flex-wrap:wrap;align-items:end;justify-content:flex-end;gap:var(--s2)}
.cot-play .control-actions .action{min-width:128px}
.cot-play .control-actions .leave-room{margin-right:auto}
.cot-play .action.needs-ready{background:var(--btn-primary-fill);box-shadow:var(--btn-primary-shadow);color:var(--btn-primary-ink)}
/* Ready is a toggle: pressed, it wears the selection */
.cot-play .action.is-ready{background:var(--accent-wash);box-shadow:var(--ring-accent);color:var(--ink-1)}
/* the room's fill rule and the arrangement's owner are hover tips (renderLobbyNote); their words stay for assistive tech */
.cot-play :is(.note,[data-arrange-note],.arrange-cap,.brain-note){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

/* refusals and failures: the kit's notice (components/notice.ts), its actions under its words; the refusal runs under the
   close as wide as the room (the head keeps 64 px beside its title for the close) */
.cot-play :is(.room-failure,.version-refusal,.status){flex-wrap:wrap;padding:var(--s3) var(--s4);outline-offset:4px}
.cot-play .room-failure{margin-top:var(--s3);scroll-margin-block:var(--s6)}
.cot-play .version-refusal{width:auto;margin:var(--s3) calc(var(--play-gutter) - var(--play-head-end)) 0 0}
.cot-play :is(.room-failure,.version-refusal)[hidden],.cot-play .room-failure [hidden]{display:none}
.cot-play :is(.room-failure,.version-refusal) .cot-c-notice__text{font:600 max(var(--fs-floor-12),var(--fs-15))/calc(var(--s4) + var(--s1)) var(--font-ui)}
.cot-play :is(.room-failure,.version-refusal,.status) .cot-c-notice__detail{font-size:max(var(--fs-floor-11),var(--fs-12));line-height:18px;text-wrap:pretty}
.cot-play :is(.room-failure,.version-refusal) .cot-c-notice__acts{flex-basis:100%;padding-left:calc(20px + var(--s3))}
.cot-play .room-failure button.action{min-height:44px;height:auto;white-space:normal;line-height:1.35}
.cot-play :is(.version-refusal,.room-failure):focus-visible{outline:none;box-shadow:var(--focus-ring)}

/* Room rules: a disclosure under the room */
.cot-play .room-rules{order:2;margin-top:var(--s4);padding-top:var(--s3);border-top:1px solid var(--line-1)}
.cot-play.lobby-active .room-rules{margin-top:0}
.cot-play:not(.multiplayer-entry) .room-rules>summary{display:none}
.cot-play .room-rules>summary{display:flex;align-items:center;gap:var(--s2);min-height:44px;color:var(--ink-2);
  font:600 max(var(--fs-floor-12),var(--fs-13))/1 var(--font-body);list-style:none;cursor:pointer}
.cot-play .room-rules>summary::-webkit-details-marker{display:none}
.cot-play .room-rules>summary>.cot-i{transition:transform var(--dur-fast) var(--ease-move)}
.cot-play .room-rules[open]>summary>.cot-i{transform:rotate(90deg)}
.cot-play [data-selected-rule]{order:2;margin-left:auto;color:var(--ink-2)}
.cot-play.multiplayer-entry :is(.brain,.campaign){display:none}
.cot-play.multiplayer-entry .arrange>.arrange-head,.cot-play .room-rules .rule-heading{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
/* open, the rules show their own selection: the summary's echo of it steps aside */
.cot-play .room-rules[open] [data-selected-rule]{visibility:hidden}
.cot-play .teams-host:not(:empty){margin-top:var(--s5)}
.cot-play .cot-teams{flex-direction:column;align-items:stretch;gap:var(--s2)}
.cot-play .cot-teams .cot-c-seg{display:flex}
.cot-play .cot-teams .cot-c-seg__opt{flex:1 1 0;min-width:0;height:38px}
.cot-play input::placeholder{color:var(--ink-3);opacity:1}
/* the operation's and the arrangement's menus stand on the room's 44 px row */
.cot-play .cot-select-menu .cot-c-menu__trigger{min-height:44px}
.cot-play .rules-mode{height:clamp(340px,52vh,520px)}
/* in a room the mode is the battlefield plate's first rule: Room Rules keeps the nations and the arrangement */
.cot-play.lobby-active :is(.rules-mode,[data-selected-rule]){display:none}

/* phone and compact */
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-play{--play-gutter:var(--s4)}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-play .panel{padding:var(--s5) var(--s4)}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-play .play-head{top:calc(-1 * var(--s5));
  margin:calc(-1 * var(--s5)) calc(-1 * var(--s4)) 0;padding:var(--s4) var(--play-head-end) var(--s3) var(--s4)}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-play .close{top:var(--s4)}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-play .lobby.show .controls{
  margin:var(--s3) calc(-1 * var(--s4)) 0;padding:var(--s3) var(--s4) var(--s4)}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-play .control-options{grid-template-columns:minmax(0,1fr)}
body:is([data-cot-width='compact'],[data-cot-width='phone']) .cot-play .room-action{gap:var(--s3);padding:var(--s4)}
@media(prefers-reduced-motion:reduce){.cot-play,.cot-play .panel{animation:none}
  .cot-play .menu-select-trigger,.cot-play .menu-select-trigger::after,.cot-play .menu-select-option{transition:none}}
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
    const invite = createRoomInviteUrl({ roomCode, mode, hostName, baseUrl: location.href, version: 2 });
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
    url.searchParams.delete('v');
    history.replaceState(history.state, '', url.href);
  } catch { /* cosmetic */ }
}

function lobbyTeamLabel(team: LobbyTeam): string {
  if (team === 'alpha') return t('playMenu.team.alpha');
  if (team === 'bravo') return t('playMenu.team.bravo');
  return t('playMenu.team.spectator');
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

/** The battle formats a room offers (players a side), as the kit's segmented options. */
function roomSizeOptions(): { value: string; label: string }[] {
  return ['1', '2', '3', '5', '7'].map((size) => ({ value: size, label: t('playMenu.sizeFormat', { size }) }));
}

/**
 * A room setting of two to five values on the kit's segmented control (components.ts segmented, wireRoving, setRoving;
 * INTERACTION-REDESIGN.md line 1): the group answers `value` and `disabled` as the room's dropdowns did, and a press
 * or an arrow dispatches `change`.
 */
function bindSegmentedSetting(group: MenuSelectElement): void {
  const options = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  let disabled = false;
  Object.defineProperty(group, 'value', {
    configurable: true,
    get: () => group.dataset.value ?? '',
    set: (next: RuntimeValue) => {
      if (!options.some((option) => option.dataset.value === String(next))) return;
      group.dataset.value = String(next);
      setRoving(group, group.dataset.value);
    },
  });
  Object.defineProperty(group, 'disabled', {
    configurable: true,
    get: () => disabled,
    set: (next: RuntimeValue) => {
      disabled = !!next;
      group.setAttribute('aria-disabled', String(disabled));
      for (const option of options) option.disabled = disabled;
    },
  });
  wireRoving(group, (value) => {
    if (value === group.dataset.value) return;
    group.dataset.value = value;
    group.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * The room host of this deployment (src/mp/session/endpoint.ts): the rooms Worker named by the build or the
 * official site, the LAN helper on a local host, null when this origin names none (a misconfigured value counts
 * as none: the failure panel says the room service is unavailable rather than presenting a URL error).
 */
function menuRoomsUrl(): string | null {
  try {
    return resolveRoomsUrl({
      configured: import.meta.env.VITE_ROOMS_URL,
      protocol: location.protocol,
      hostname: location.hostname,
    });
  } catch { return null; }
}

export function createPlayMenu({
  maps = [],
  vehicles = [],
  getSelection,
  getVehicleLoadout = (specId) => {
    const selection = getSelection();
    return specId === selection.specId
      ? { equipment: selection.equipment, consumables: selection.consumables, camo: selection.camo }
      : { equipment: [], camo: 'factory' };
  },
  onSolo,
  onReadyIntent,
  onNetworkStart,
  onLobbyChange,
  isVehicleAllowed = () => true,
  getVehicleName = (specId) => specId,
  reloadPage = () => { location.reload(); },
}: PlayMenuOptions): PlayMenuRuntime {
  ensureFonts();
  ensureStyle(STYLE_ID, CSS, 'surfaces');
  const root = document.createElement('div');
  root.className = 'cot-play multiplayer-entry';
  // campaign slice 4 (2026-09-12): the Frontline Assault card shows the campaign push
  const frontlineProgressLabel = (): string => {
    const summary = frontlineSummary();
    return summary.attempts
      ? t('playMenu.matchMode.frontline_assault.progress', { best: summary.bestLine, total: summary.total, held: summary.held })
      : t('playMenu.matchMode.frontline_assault.progressNone');
  };
  // campaign slice 5 (2026-09-14): the six-operation ladder under the rules — status per
  // operation from the Frontline record, a Launch/Replay button on every open one.
  const campaignMarkup = (): string => {
    const ladder = campaignLadder();
    const summary = campaignSummary();
    const cards = ladder.map(({ operation, status, progress, stars }) => {
      const best = progress
        ? t('campaign.best', { best: progress.bestLine, total: progress.total })
        : t('campaign.noSortie');
      // batch 19: stars per operation (held / under par / no ally lost) and the operation's own clock
      const starMarks = `<span class="op-stars" role="img" aria-label="${t('campaign.starsAria', { stars, max: 3 })}">${
        [0, 1, 2].map((slot) => `<i class="${slot < stars ? 'on' : ''}">★</i>`).join('')}</span>`;
      const clock = t('campaign.clock', { minutes: Math.round(operation.timeLimitS / 60), difficulty: operation.difficulty });
      const action = status === 'locked'
        ? `<small class="op-hint">${t('campaign.lockedHint', { index: operation.index - 1 })}</small>`
        : `<button class="op-launch" type="button" data-campaign-launch="${operation.id}" data-map-id="${operation.mapId}">${
          t(status === 'cleared' ? 'campaign.replay' : 'campaign.launch')}</button>`;
      return `<article class="op ${status}" data-campaign-op="${operation.id}" aria-label="${t(`campaign.op.${operation.id}.title`)}">
        <span class="op-index">${String(operation.index).padStart(2, '0')}</span>
        <span class="op-copy"><b>${t(`campaign.op.${operation.id}.title`)}${starMarks}</b><small>${t(`map.${operation.mapId}`)} · ${t(`campaign.status.${status}`)} · ${clock}</small><small class="op-best">${best}</small></span>
        ${action}</article>`;
    }).join('');
    return `<div class="campaign-heading"><b>${t('campaign.heading')}</b><span>${t('campaign.progress', { cleared: summary.cleared, total: summary.total })} · ${t('campaign.stars', { stars: summary.stars, max: summary.maxStars })}</span></div>
      <div class="ops" role="list">${cards}</div>`;
  };
  // batch 19 (2026-09-14): every card lists the rules the code applies (sim/matchRuleset.ts), generated from the same
  // table the sim reads; the lines are modePicker.ts's modeRuleLines, one source with Deploy (team arrangement
  // 2026-09-15: the card follows the player's arrangement, the nation reads as copy)
  const ruleLines = (id: GameModeId, arrangement: TeamArrangement | null = readTeamArrangement(id)): string[] =>
    modeRuleLines(id, arrangement);
  // the one presentation order (sim/gameModeCatalog.ts), as Deploy shows the modes
  const modeRank = (id: GameModeId): number => { const rank = (MODE_PRESENTATION_ORDER as readonly string[]).indexOf(id); return rank < 0 ? MODE_PRESENTATION_ORDER.length : rank; };
  /** The battle modes as the mode picker's cards (the practice modes launch from the Garage dossier and the Gallery, never
   *  a room): each mode's glyph in its hue, its first two rules, and its sentence and every rule for the preview's card.
   *  Frontline Assault's first fact is the campaign push. */
  const modeCards = (arrangementOf: (id: GameModeId) => TeamArrangement | null = (id) => readTeamArrangement(id)): ModeCard[] =>
    BATTLE_MODE_IDS.map((id) => GAME_MODE_DEFINITIONS[id]).sort((a, b) => modeRank(a.id) - modeRank(b.id)).map((rule) => {
      // every rule line starts with a capital, wherever it stands ("Unlimited rounds · Respawn in 6 s"); zh has no case
      const rules = ruleLines(rule.id, arrangementOf(rule.id)).map((line) => line.charAt(0).toLocaleUpperCase(getLocale()) + line.slice(1));
      return { id: rule.id, name: t(`playMenu.matchMode.${rule.id}.label`), glyph: rule.icon as IconId, tone: rule.id,
        facts: rule.id === 'frontline_assault' ? [frontlineProgressLabel(), ...rules.slice(0, 1)] : rules.slice(0, 2),
        description: t(`playMenu.matchMode.${rule.id}.desc`, modeCopyValues(rule.id)), rules };
    });
  root.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="cot-play-title"><header class="play-head"><button class="close cot-c-btn cot-c-btn--36 cot-c-btn--icon cot-c-btn--ghost" type="button" aria-label="${t('playMenu.close')}">${uiIconSVG('close', 18)}</button>
    <div class="eyebrow">${t('playMenu.eyebrow')}</div><h2 id="cot-play-title">${t('playMenu.title')}</h2>
    <section class="version-refusal cot-c-notice" data-severity="info" hidden role="alert" aria-atomic="true" tabindex="-1" aria-labelledby="cot-version-refusal-title">
      <span class="cot-c-notice__glyph">${uiIconSVG('info', 20)}</span><span class="cot-c-notice__body"><span class="cot-c-notice__text" id="cot-version-refusal-title">${t('playMenu.versionRefusal.title')}</span><span class="cot-c-notice__detail" data-version-text></span></span>
      <span class="cot-c-notice__acts"><button class="action cot-c-btn cot-c-btn--primary" data-action="refresh-page" type="button">${t('playMenu.versionRefusal.refresh')}</button></span>
    </section></header>
    <p class="lead"></p>
    ${segmented({ label: t('playMenu.kind'), value: 'private', className: 'modes', options: [
      { value: 'private', label: t('playMenu.kind.private'), icon: 'battlePrivate' },
      { value: 'lan', label: t('playMenu.kind.lan'), icon: 'battleLan' }] })}
    <section class="room"><div class="setup">
      <div class="identity"><label>${t('playMenu.identity.callsign')}<input data-field="name" maxlength="24" autocomplete="nickname"></label></div>
      <div class="room-actions">
        <div class="room-action"><div class="room-action-head"><b>${t('playMenu.create.title')}</b></div>
          <div class="room-action-fields"><div class="field"><span class="field-label">${t('playMenu.advanced.size')}</span>
            ${segmented({ label: t('playMenu.advanced.size'), options: roomSizeOptions(), value: '2', className: 'create-size', attrs: { 'data-field': 'create-size', 'data-value': '2' } })}</div>
            <button class="action cot-c-btn cot-c-btn--primary" data-action="create" type="button">${t('playMenu.create.action')}</button></div></div>
        <div class="room-action"><div class="room-action-head"><b>${t('playMenu.join.title')}</b></div>
          <div class="room-action-fields"><label>${t('playMenu.join.code')}<input class="code-input" lang="en" data-field="code" maxlength="6"
            autocomplete="off" spellcheck="false" placeholder="ABC123"></label>
            <button class="action alt cot-c-btn" data-action="join" type="button">${t('playMenu.join.action')}</button></div></div>
      </div>
    </div><div class="status cot-c-notice is-empty"${datumAttr('notices')} data-severity="info" role="status" aria-live="polite" aria-atomic="true"><span class="cot-c-notice__glyph" data-status-glyph></span><span class="cot-c-notice__body"><span class="cot-c-notice__text" data-status-text></span></span></div>
    <section class="room-failure cot-c-notice" data-severity="error" hidden role="alert" aria-atomic="true" tabindex="-1"
      aria-labelledby="cot-room-failure-title" aria-describedby="cot-room-failure-detail">
      <span class="cot-c-notice__glyph">${uiIconSVG('alert', 20)}</span><span class="cot-c-notice__body"><span class="cot-c-notice__text" id="cot-room-failure-title"></span><span class="cot-c-notice__detail" id="cot-room-failure-detail"></span></span>
      <div class="room-failure-actions cot-c-notice__acts">
        <button class="action cot-c-btn cot-c-btn--primary" data-room-failure="retry" type="button">${t('playMenu.failure.retry')}</button>
        <button class="action alt cot-c-btn" data-room-failure="code" type="button">${t('playMenu.failure.editCode')}</button>
        <button class="action alt cot-c-btn" data-room-failure="garage" data-ui-sound="back" type="button">${t('playMenu.failure.returnGarage')}</button>
      </div>
    </section><div class="lobby">
      <div class="roomhead"><div><div class="roommeta">${t('playMenu.advanced.roomCode')}</div><div class="code" lang="en"${datumAttr('room-code')}></div></div>
        <div class="seats"><div class="roommeta">${t('playMenu.lobby.seats')}</div><div class="seats-count num" data-seats${datumAttr('roster')}></div></div>
        <button class="action alt cot-c-btn" data-action="copy" type="button">${t('playMenu.advanced.copyLink')}</button></div>
      <div class="battlefield-card"><div class="battlefield-art"></div>
        <div class="battlefield-copy"><div class="field mode-field"><span class="field-label" id="cot-room-mode-label">${t('playMenu.advanced.mode')}</span>
            <div class="menu-select menu-select--mode" data-control="mode">
              <button class="menu-select-trigger" data-select-trigger type="button" aria-expanded="false"
                aria-controls="cot-room-mode-pick" aria-labelledby="cot-room-mode-label cot-room-mode-value">
                <span class="menu-select-glyph" data-select-glyph aria-hidden="true"></span>
                <span class="menu-select-trigger-copy"><span id="cot-room-mode-value" data-select-value${datumAttr('mode-name')}></span></span></button>
            </div></div>
          <div class="field battlefield-picker"><span class="field-label" id="cot-room-map-label">${t('playMenu.advanced.battlefield')}</span>
            <div class="menu-select menu-select--map" data-control="map" data-value="random">
              <button class="menu-select-trigger" data-select-trigger type="button" aria-expanded="false"
                aria-controls="cot-room-bf" aria-labelledby="cot-room-map-label cot-room-map-value">
                <span class="menu-select-thumb is-random" data-select-thumb aria-hidden="true"></span>
                <span class="menu-select-trigger-copy"><span id="cot-room-map-value" data-select-value${datumAttr('map-name')}>${t('playMenu.advanced.battlefieldRandom')}</span>
                  <small data-select-meta>${t('playMenu.advanced.battlefieldAny')}</small></span></button>
            </div>
            <label class="operation-picker" data-operation-field hidden><span class="field-label">${t('playMenu.operation.label')}</span>
              <select data-control="operation"><option value="">${t('playMenu.operation.free')}</option>${CAMPAIGN_OPERATIONS.map((operation) =>
                `<option value="${operation.id}">${String(operation.index).padStart(2, '0')} · ${t(`campaign.op.${operation.id}.title`)} · ${t(`map.${operation.mapId}`)}</option>`).join('')}</select></label></div>
          <div class="field format-field"><span class="field-label">${t('playMenu.advanced.size')}</span>
            ${segmented({ label: t('playMenu.advanced.size'), options: roomSizeOptions(), value: '1', className: 'room-size', attrs: { 'data-control': 'size', 'data-value': '1' } })}</div></div></div>
      <div class="mode-pick" id="cot-room-mode-pick" role="group" aria-labelledby="cot-room-mode-label" hidden></div>
      <div class="battlefield-pick" id="cot-room-bf" role="group" aria-labelledby="cot-room-map-label" hidden></div>
      <div class="players"></div><div class="controls">
        <div class="vehicle-pick" id="cot-room-vehicle-pick" role="group" aria-labelledby="cot-room-vehicle-label" hidden></div>
        <div class="control-options"><div class="field vehicle-field"><span class="field-label" id="cot-room-vehicle-label">${t('playMenu.advanced.vehicle')}</span>
          <div class="menu-select menu-select--vehicle" data-control="vehicle" data-value="">
            <button class="menu-select-trigger" data-select-trigger type="button" aria-expanded="false"
              aria-controls="cot-room-vehicle-pick" aria-labelledby="cot-room-vehicle-label cot-room-vehicle-value">
              <span class="menu-select-thumb" data-select-thumb aria-hidden="true"></span>
              <span class="menu-select-trigger-copy"><span id="cot-room-vehicle-value" data-select-value>${t('playMenu.advanced.vehicleSelect')}</span>
                <small data-select-meta>${t('playMenu.advanced.vehicleDesc')}</small></span></button>
          </div></div>
        <div class="field"><span class="field-label">${t('playMenu.deployment')}</span>
          ${segmented({ label: t('playMenu.deployment'), options: (['alpha', 'bravo', 'spectator'] as const).map((team) => ({ value: team, label: lobbyTeamLabel(team) })), value: 'alpha', className: 'room-team', attrs: { 'data-control': 'team', 'data-value': 'alpha' } })}</div></div>
        <div class="control-actions"><button class="action alt leave-room cot-c-btn" data-action="leave" type="button">${t('playMenu.leave')}</button>
          <button class="action alt cot-c-btn" data-action="ready" type="button">${t('playMenu.ready.iAmReady')}</button>
          <button class="action cot-c-btn cot-c-btn--primary" data-action="rejoin" type="button" hidden>${t('playMenu.rejoin')}</button>
          <button class="action cot-c-btn cot-c-btn--primary" data-action="start" type="button">${t("playMenu.start")}<span class="start-count" data-start-count></span></button></div>
      </div><div class="note"></div>
    </div></section>
    <details class="room-rules"><summary>${t('playMenu.roomRules')}${uiIconSVG('chevronRight', 16)}<span data-selected-rule${datumAttr('mode-name')}></span></summary>
    <div class="rule-heading"><b>${t('playMenu.rules.heading')}</b></div>
    <div class="rules-mode" data-rules-mode></div>
    <small class="rule-note" data-rule-note hidden>${t('playMenu.rules.campaignSoloNote')}</small>
    <div class="teams-host" data-teams-host></div>
    <section class="arrange" data-arrange hidden aria-label="${t('playMenu.arrange.heading')}">
      <div class="arrange-head"><b>${t('playMenu.arrange.heading')}</b><span data-arrange-note></span></div>
      <div class="arrange-sides" data-arrange-sides hidden>
        <span class="arrange-sides-label">${t('playMenu.arrange.sides')}</span>
        ${segmented({ label: t('playMenu.arrange.sides'), value: '7v7', className: 'sides-seg', options: [
          { value: '7v7', label: t('playMenu.arrange.sides7') }, { value: '14v14', label: t('playMenu.arrange.sides14') },
          { value: 'custom', label: t('playMenu.arrange.sidesCustom') }] })}
        <b class="arrange-readout" data-sides-readout></b>
      </div>
      <div class="arrange-fields">
        <label data-arrange-field="allies"><span>${t('playMenu.arrange.allies')}</span><select data-arrange="allies"></select></label>
        <label data-arrange-field="enemies"><span>${t('playMenu.arrange.enemies')}</span><select data-arrange="enemies"></select></label>
        <label data-arrange-field="alliesCount" hidden><span>${t('playMenu.arrange.allies')}</span><input type="number" inputmode="numeric" step="1" data-arrange="alliesCount"></label>
        <label data-arrange-field="enemiesCount" hidden><span>${t('playMenu.arrange.enemiesField')}</span><input type="number" inputmode="numeric" step="1" data-arrange="enemiesCount"></label>
        <label data-arrange-wave><span>${t('playMenu.arrange.waveSize')}</span><select data-arrange="waveSize"></select></label>
        <label data-arrange-field="enemyNation"><span>${t('playMenu.arrange.nation')}</span><select data-arrange="enemyNation"></select></label>
        <label data-arrange-field="marsGravity" hidden><span>${t('playMenu.arrange.marsGravity')}</span><select data-arrange="marsGravity"></select></label>
        <label data-arrange-field="juggernautRole" hidden><span>${t('playMenu.arrange.juggernautRole')}</span><select data-arrange="juggernautRole"></select></label>
        <label data-arrange-field="marsCaches" hidden><span>${t('playMenu.arrange.marsCaches')}</span><select data-arrange="marsCaches"></select></label>
        <button class="action alt cot-c-btn" type="button" data-arrange-reset>${t('playMenu.arrange.reset')}</button>
      </div>
      <small class="arrange-cap" data-arrange-cap hidden>${t('playMenu.arrange.fieldCap', { max: String(BATTLE_FIELD_LIMIT) })}</small>
    </section>
    <section class="brain" data-brain aria-label="${t('playMenu.brain.heading')}">
      <div class="arrange-head"><b>${t('playMenu.brain.heading')}</b></div>
      <div class="brain-row">
        ${segmented({ label: t('playMenu.brain.heading'), value: 'classic', className: 'brain-seg', options: [
          { value: 'classic', label: t('playMenu.brain.classic') }, { value: 'jev', label: t('playMenu.brain.jev') }] })}
        <div class="brain-allies"><span class="brain-allies__label" aria-hidden="true">${t('playMenu.brain.allies')}</span>${toggle({
          label: t('playMenu.brain.allies'), checked: false, onWord: t('settings.on'), offWord: t('settings.off'), attrs: { 'data-brain-allies': '' } })}</div>
      </div>
      <small class="brain-note" data-brain-note hidden>${t('playMenu.brain.note')}</small>
    </section>
    <section class="campaign" data-campaign>${campaignMarkup()}</section>
    </details>
    <button class="mode" data-mode="solo" type="button">${t('playMenu.solo.settings')}${uiIconSVG('chevronRight', 16)}</button>
    </div>`;
  document.body.appendChild(root);

  const panel = requiredElement<HTMLElement>(root, '.panel');
  const closeBtn = requiredElement<HTMLButtonElement>(root, '.close');
  const room = requiredElement<HTMLElement>(root, '.room');
  const lobbyEl = requiredElement<HTMLElement>(root, '.lobby');
  const eyebrow = requiredElement<HTMLElement>(root, '.eyebrow');
  const menuTitle = requiredElement<HTMLHeadingElement>(root, 'h2');
  const menuLead = requiredElement<HTMLParagraphElement>(root, '.lead');
  const status = requiredElement<HTMLElement>(root, '.status');
  const failurePanel = requiredElement<HTMLElement>(root, '.room-failure');
  const failureTitle = requiredElement<HTMLElement>(root, '#cot-room-failure-title');
  const failureDetail = requiredElement<HTMLElement>(root, '#cot-room-failure-detail');
  const retryBtn = requiredElement<HTMLButtonElement>(root, '[data-room-failure="retry"]');
  const editCodeBtn = requiredElement<HTMLButtonElement>(root, '[data-room-failure="code"]');
  const garageBtn = requiredElement<HTMLButtonElement>(root, '[data-room-failure="garage"]');
  const nameInput = requiredElement<HTMLInputElement>(root, '[data-field="name"]');
  const codeInput = requiredElement<HTMLInputElement>(root, '[data-field="code"]');
  /** The room's kind, private or the local network (the kit's segmented control). */
  const kindSeg = requiredElement<HTMLElement>(root, '.modes');
  const createSizeSelect = requiredElement<MenuSelectElement>(root, '[data-field="create-size"]');
  const vehicleSelect = requiredElement<MenuSelectElement>(root, '[data-control="vehicle"]');
  const teamSelect = requiredElement<MenuSelectElement>(root, '[data-control="team"]');
  const sizeSelect = requiredElement<MenuSelectElement>(root, '[data-control="size"]');
  const mapSelect = requiredElement<MenuSelectElement>(root, '[data-control="map"]');
  const mapById = new Map<string, PlayMenuMap>(maps.map((map) => [map.id, map]));
  const battlefieldCount = maps.filter((map) => map.id !== 'random').length;
  const initialSelection = getSelection();
  const selectableVehicles = vehicles.length > 0 ? vehicles : [{
    id: initialSelection.specId,
    name: getVehicleName(initialSelection.specId),
  }];
  // the lobby names each player's tank from the menu's own roster before the host's lookup
  const selectableVehicleNames = new Map(selectableVehicles.map((vehicle) => [vehicle.id, vehicle.name]));
  vehicleSelect.dataset.value = selectableVehicles.some((vehicle) => vehicle.id === initialSelection.specId)
    ? initialSelection.specId
    : selectableVehicles[0]?.id || '';
  // the vehicle picker (INTERACTION-REDESIGN.md line 1): the fleet as cards, with search and the nations' chips, opened from
  // the foot's vehicle trigger in the foot itself. Pointing at a card shows it on the trigger, one press chooses through
  // the room's own change, and Esc restores, then closes it with nothing changed.
  const vehiclePick = requiredElement<HTMLElement>(root, '.vehicle-pick');
  const vehicleTrigger = requiredElement<HTMLButtonElement>(vehicleSelect, '[data-select-trigger]');
  const vehicleById = new Map(selectableVehicles.map((vehicle): [string, PlayMenuVehicle] => [vehicle.id, vehicle]));
  const vehicleMeta = (id: string): string => {
    const numeral = tierNumeral(id);
    return numeral ? t('garage.card.tier', { tier: numeral }) : t('studioPanel.picker.combatVehicle');
  };
  const vehicleCountry = (vehicle: PlayMenuVehicle): CountryId | null => countryOfVehicle(vehicle.id, vehicle.nation);
  const nationName = (country: CountryId): string => t(`nation.${countryNation(country)}`);
  const vehicleCards = (): PickerItem[] => selectableVehicles.map((vehicle) => {
    const country = vehicleCountry(vehicle);
    return { id: vehicle.id, name: vehicle.name, facts: [vehicleMeta(vehicle.id), ...(country ? [nationName(country)] : [])],
      media: { poster: iconUrl(vehicle.id, 'angle') }, tags: country ? [country] : [] };
  });
  let vehiclePicker: ReturnType<typeof createPicker> | null = null;
  /** The vehicle control holds the player's vehicle (its trigger names it) and opens the picker: it has no list. */
  function bindVehicleControl(): void {
    const label = requiredElement<HTMLElement>(vehicleTrigger, '[data-select-value]');
    const meta = requiredElement<HTMLElement>(vehicleTrigger, '[data-select-meta]');
    const thumb = requiredElement<HTMLElement>(vehicleTrigger, '[data-select-thumb]');
    let disabled = false;
    Object.defineProperty(vehicleSelect, 'value', {
      configurable: true,
      get: () => vehicleSelect.dataset.value,
      set: (next: RuntimeValue) => {
        if (!vehicleById.has(String(next))) return;
        vehicleSelect.dataset.value = String(next);
        showVehicle(String(next));
      },
    });
    Object.defineProperty(vehicleSelect, 'disabled', {
      configurable: true,
      get: () => disabled,
      set: (next: RuntimeValue) => {
        disabled = !!next;
        vehicleSelect.classList.toggle('disabled', disabled);
        vehicleSelect.setAttribute('aria-disabled', String(disabled));
        vehicleTrigger.disabled = disabled;
        if (disabled) closeVehiclePick();
      },
    });
    /** Name a vehicle on the trigger: the chosen one, or the card a pointer or the focus is on. */
    function showVehicle(id: string): void {
      const vehicle = vehicleById.get(id);
      if (!vehicle) return;
      label.textContent = vehicle.name;
      meta.textContent = vehicleMeta(id);
      thumb.style.backgroundImage = `url("${iconUrl(id, 'angle').replace(/"/g, '%22')}")`;
    }
    previewVehicle = (id) => showVehicle(id ?? vehicleSelect.dataset.value ?? '');
    showVehicle(vehicleSelect.dataset.value ?? '');
    vehicleTrigger.addEventListener('click', () => toggleVehiclePick());
    vehicleTrigger.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (vehiclePick.hidden) toggleVehiclePick();
    });
  }
  let previewVehicle: (id: string | null) => void = () => {};
  // the room's pickers are transient surfaces (components/surfaceStack.ts) standing on the room's panel: one opens as the
  // other closes, in the same press, and Escape and a press outside close the open one
  const pickSurface = (id: string, pick: HTMLElement, trigger: HTMLElement, close: (restoreFocus: boolean) => void): TransientSurface =>
    ({ id, element: () => pick, owns: (node) => trigger.contains(node), close: (reason) => close(reason === 'escape') });
  const vehicleSurface = pickSurface('rooms-tank', vehiclePick, vehicleTrigger, (restoreFocus) => closeVehiclePick(restoreFocus));
  function closeVehiclePick(restoreFocus = false): void {
    if (vehiclePick.hidden) return;
    closeSurface(vehicleSurface);
    vehiclePick.hidden = true;
    vehicleTrigger.setAttribute('aria-expanded', 'false');
    previewVehicle(null);
    if (restoreFocus) vehicleTrigger.focus();
  }
  function toggleVehiclePick(): void {
    if (!vehiclePick.hidden) { closeVehiclePick(true); return; }
    if (vehicleSelect.disabled) return;
    openSurface(vehicleSurface, vehicleTrigger);
    vehiclePick.hidden = false;
    vehicleTrigger.setAttribute('aria-expanded', 'true');
    if (vehiclePicker) vehiclePicker.setValue(vehicleSelect.value);
    else {
      vehiclePicker = createPicker(vehiclePick, {
        id: 'rooms-tank', label: t('playMenu.advanced.vehicle'), items: vehicleCards(), value: vehicleSelect.value,
        layout: 'cards', text: pickerText(), memory: 'vehicle',
        filters: COUNTRIES.map((country) => country.id).filter((id) => selectableVehicles.some((vehicle) => vehicleCountry(vehicle) === id))
          .map((id) => ({ id, label: nationName(id) })),
        onPreview: (item) => previewVehicle(item?.id ?? null),
        onChoose: (item) => {
          vehicleSelect.value = item.id;
          vehicleSelect.dispatchEvent(new Event('change', { bubbles: true }));
          closeVehiclePick(true);
        },
      });
    }
    // a foot that scrolls with the room (a short screen) brings the picker under the head; a stuck foot already shows it
    const panel = vehiclePick.closest<HTMLElement>('.panel');
    const head = panel?.querySelector<HTMLElement>('.play-head');
    if (panel && head) {
      const sticky = getComputedStyle(head).position === 'sticky' ? head.offsetHeight : 0;
      const top = vehiclePick.getBoundingClientRect().top - panel.getBoundingClientRect().top - sticky - 12;
      if (top < 0 || vehiclePick.getBoundingClientRect().bottom > panel.getBoundingClientRect().bottom) panel.scrollTop += top;
    }
    vehiclePicker.focus();
  }
  bindVehicleControl();
  for (const setting of [createSizeSelect, teamSelect, sizeSelect]) bindSegmentedSetting(setting);
  // a deployment wears its team's mark, as the roster draws it
  for (const option of teamSelect.querySelectorAll<HTMLElement>('[data-value]')) {
    const mark = document.createElement('i');
    mark.className = `team-mark ${option.dataset.value}`;
    option.prepend(mark);
  }
  const battlefieldCard = requiredElement<HTMLElement>(root, '.battlefield-card');
  // the battlefield picker (INTERACTION-REDESIGN.md part A; owner 2026-10-26: "make map selection much more intituitve"):
  // the host's battlefield trigger opens it in the card's place, its preview standing for the card's picture. One press
  // chooses through the room's own change; Esc restores a preview, then closes it with nothing changed.
  const battlefieldPick = requiredElement<HTMLElement>(root, '.battlefield-pick');
  const mapTrigger = requiredElement<HTMLButtonElement>(mapSelect, '[data-select-trigger]');
  /** The battlefield control holds the room's battlefield (its trigger names it) and opens the picker: it has no list. */
  function bindBattlefieldControl(): void {
    const label = requiredElement<HTMLElement>(mapTrigger, '[data-select-value]');
    const meta = mapTrigger.querySelector<HTMLElement>('[data-select-meta]');
    const thumb = mapTrigger.querySelector<HTMLElement>('[data-select-thumb]');
    let disabled = false;
    const show = (id: string): void => {
      const map = mapById.get(id);
      if (!map) return;
      mapSelect.dataset.value = map.id;
      label.textContent = map.name;
      if (meta) meta.textContent = map.id === 'random' ? t('playMenu.map.battlefieldsCount', { count: battlefieldCount }) : '';
      if (thumb) {
        thumb.style.backgroundImage = map.thumb ? `url("${map.thumb.replace(/"/g, '%22')}")` : '';
        thumb.classList.toggle('is-random', !map.thumb);
      }
    };
    Object.defineProperty(mapSelect, 'value', { configurable: true, get: () => mapSelect.dataset.value, set: (next: RuntimeValue) => show(String(next)) });
    Object.defineProperty(mapSelect, 'disabled', {
      configurable: true,
      get: () => disabled,
      set: (next: RuntimeValue) => {
        disabled = !!next;
        mapSelect.classList.toggle('disabled', disabled);
        mapSelect.setAttribute('aria-disabled', String(disabled));
        mapTrigger.disabled = disabled;
        if (disabled) closeBattlefieldPick();
      },
    });
    show(mapSelect.dataset.value || 'random');
    mapTrigger.addEventListener('click', () => toggleBattlefieldPick());
    mapTrigger.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (battlefieldPick.hidden) toggleBattlefieldPick();
    });
  }
  let battlefieldPicker: BattlefieldPicker | null = null;
  let roomMode = 'standard';
  const battlefieldRegions = [...new Set(maps.flatMap((map) => mapRegionTags(map.id)))];
  const battlefieldCards = (): BattlefieldCard[] => maps.map((map): BattlefieldCard => (map.id === 'random'
    ? { id: map.id, name: map.name, facts: [t('playMenu.map.battlefieldsCount', { count: maps.length - 1 })],
      media: { mosaic: maps.filter((other) => other.thumb).slice(0, 4).map((other) => other.thumb as string) } }
    : mapCard(map)));
  /** A battlefield's card: its pictures from battlefieldFacts.ts (the media lane's stills, one source with Deploy), its
   *  two landscapes as facts. */
  function mapCard(map: PlayMenuMap): BattlefieldCard {
    const poster = battlefieldFacts(map.id).poster;
    return { id: map.id, name: map.name, facts: mapRegionTags(map.id).slice(0, 2).map((tag) => t(`camoTag.${tag}`)),
      media: { poster: poster.src, srcset: poster.srcset }, hero: poster.hero, loop: poster.loop, tags: [...mapRegionTags(map.id)] };
  }
  const battlefieldSurface = pickSurface('rooms-battlefield', battlefieldPick, mapTrigger, (restoreFocus) => closeBattlefieldPick(restoreFocus));
  function closeBattlefieldPick(restoreFocus = false): void {
    if (battlefieldPick.hidden) return;
    closeSurface(battlefieldSurface);
    battlefieldPick.hidden = true;
    battlefieldCard.classList.remove('picking');
    mapTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) mapTrigger.focus();
  }
  function toggleBattlefieldPick(): void {
    if (!battlefieldPick.hidden) { closeBattlefieldPick(true); return; }
    if (mapSelect.disabled) return;
    openSurface(battlefieldSurface, mapTrigger);
    battlefieldPick.hidden = false;
    battlefieldCard.classList.add('picking');
    mapTrigger.setAttribute('aria-expanded', 'true');
    if (battlefieldPicker) battlefieldPicker.setCards(battlefieldCards(), roomMode, mapSelect.value);
    else {
      battlefieldPicker = createBattlefieldPicker(battlefieldPick, {
        id: 'rooms-battlefield', label: t('playMenu.advanced.battlefield'), cards: battlefieldCards(), value: mapSelect.value,
        mode: roomMode, randomId: 'random', text: pickerText(),
        filters: battlefieldRegions.map((tag) => ({ id: tag, label: t(`camoTag.${tag}`) })),
        onChoose: (id) => {
          mapSelect.value = id;
          mapSelect.dispatchEvent(new Event('change', { bubbles: true }));
          closeBattlefieldPick(true);
        },
      });
    }
    revealUnderCard(battlefieldPick);
    battlefieldPicker.focus();
  }
  /** One picker is open at a time; a change of the room's kind or the dialog's closing folds both. */
  function closePicks(): void {
    closeBattlefieldPick();
    closeVehiclePick();
    closeModePick();
  }
  /** An opened picker under the battlefield plate (the mode's or the battlefield's) in the panel's view: the plate at the
   *  top under the sticky head, the picker under it clear of the sticky foot (the grid shows the chosen card itself). A
   *  short screen holds the picker alone: it takes the view, its preview standing for the plate (Rooms r25). */
  function revealUnderCard(region: HTMLElement): void {
    const panel = battlefieldCard.closest<HTMLElement>('.panel');
    if (!panel) return;
    const head = panel.querySelector<HTMLElement>('.play-head');
    const sticky = head && getComputedStyle(head).position === 'sticky' ? head.offsetHeight : 0;
    const origin = panel.getBoundingClientRect().top - panel.scrollTop + sticky + 12;
    const card = battlefieldCard.getBoundingClientRect().top - origin;
    const pick = region.getBoundingClientRect();
    const both = pick.bottom - origin - card <= panel.clientHeight - sticky - 12;
    panel.scrollTop = Math.max(0, both ? card : pick.top - origin);
    // the stuck foot and the fade it lays over what scrolls under it (measured where it now stands): the picker rises
    // clear of them, never past its own top (Rooms r33: the chosen card's name and facts sat in the fade)
    const foot = panel.querySelector<HTMLElement>('.lobby.show .controls');
    if (!foot || getComputedStyle(foot).position !== 'sticky') return;
    const options = foot.querySelector<HTMLElement>('.control-options');
    const fade = options ? parseFloat(getComputedStyle(options, '::before').height) || 0 : 0;
    const cover = Math.min(foot.getBoundingClientRect().top, (options?.getBoundingClientRect().top ?? Infinity) - fade);
    const placed = region.getBoundingClientRect();
    const under = placed.bottom + 12 - cover;
    const room = placed.top - (panel.getBoundingClientRect().top + sticky + 12);
    if (under > 0 && room > 0) panel.scrollTop += Math.min(under, room);
  }
  // after the trigger, the picker's place and the map table above it exist
  bindBattlefieldControl();
  const operationField = requiredElement<HTMLElement>(root, '[data-operation-field]');
  const operationSelect = requiredElement<HTMLSelectElement>(root, 'select[data-control="operation"]');
  // the room's operation and its arrangement's fields are the kit's picker menu over their selects (selectPickerMenu.ts)
  const operationDropdown = createSelectPickerMenu(operationSelect, { id: 'rooms-operation' });
  const battlefieldArt = requiredElement<HTMLElement>(root, '.battlefield-art');
  battlefieldArt.appendChild(createRandomMapMosaic(maps));
  const playersEl = requiredElement<HTMLElement>(root, '.players');
  const codeEl = requiredElement<HTMLElement>(root, '.code');
  const seatsEl = requiredElement<HTMLElement>(root, '[data-seats]');
  const readyBtn = requiredElement<HTMLButtonElement>(root, '[data-action="ready"]');
  const startBtn = requiredElement<HTMLButtonElement>(root, '[data-action="start"]');
  const startCount = requiredElement<HTMLElement>(startBtn, '[data-start-count]');
  const rejoinBtn = requiredElement<HTMLButtonElement>(root, '[data-action="rejoin"]');
  const versionBanner = requiredElement<HTMLElement>(root, '.version-refusal');
  const versionText = requiredElement<HTMLElement>(versionBanner, '[data-version-text]');
  const refreshBtn = requiredElement<HTMLButtonElement>(versionBanner, '[data-action="refresh-page"]');
  /** A refusal only a refresh resolves (VERSION_REFUSAL_CODES): its banner stands, and Rejoin battle stays hidden. */
  let versionRefusal: string | null = null;
  function setVersionRefusal(text: string | null): void {
    versionRefusal = text;
    versionText.textContent = text ?? '';
    versionBanner.hidden = !text;
    if (text) rejoinBtn.hidden = true;
    if (text && root.classList.contains('show')) versionBanner.focus({ preventScroll: false });
  }
  refreshBtn.addEventListener('click', () => reloadPage());
  const leaveBtn = requiredElement<HTMLButtonElement>(root, '[data-action="leave"]');
  const createBtn = requiredElement<HTMLButtonElement>(root, '[data-action="create"]');
  const joinBtn = requiredElement<HTMLButtonElement>(root, '[data-action="join"]');
  const copyBtn = requiredElement<HTMLButtonElement>(root, '[data-action="copy"]');
  const note = requiredElement<HTMLElement>(root, '.note');
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

  let mode: PlayMode | null = null;
  let session: RoomSession | null = null;
  let state: SerializedLobby | null = null;
  let role: RoomRole | null = null;
  let unsubscribeState: (() => void) | null = null;
  let handedOff = false;
  let activeRoom: ActiveRoomAdapter | null = null;
  let connecting = false;
  let lastConnectionKind: 'create' | 'join' | null = null;
  let requestGeneration = 0;
  let returnFocus: HTMLElement | null = null;
  let invitedHostName: string | null = null;
  let selectedGameMode = normalizeGameMode(stored(GAME_MODE_KEY, 'standard'));
  /** The mode pickers: Room Rules' (the entry and solo) and the lobby's, made on its first opening. */
  let rulesModePicker: ModePicker | null = null;
  let lobbyModePicker: ModePicker | null = null;

  // ---- TEAM NATIONS (gameplay-modes-228): MONO-NATION or RANDOM, one switch solo and in a lobby -------------------
  // solo it is the player's preference; in a lobby the room's arrangement holds it, the host changes it (and keeps it
  // as its own preference), the guests see it locked
  const playerCountry = (): CountryId | null => {
    const specId = getSelection().specId;
    return countryOfVehicle(specId, vehicles.find((vehicle) => vehicle.id === specId)?.nation);
  };
  /**
   * The arrangement the panel shows: the room's (in a lobby) or the player's stored one, over the mode defaults.
   * (2026-10-21, the 231 Play menu) declared before the team-nations control: the control renders in its constructor and
   * its enemyCountry reads this, so a later declaration threw "Cannot access before initialization" and no menu opened.
   */
  const currentArrangement = (mode: GameModeId): TeamArrangement | null =>
    state && acceptsTeamArrangement(mode) ? (state.arrangement ?? null) : readTeamArrangement(mode);
  let teamsFromLobby = false;
  const teamsControl = createTeamNationsControl({
    read: () => (teamsFromLobby && state ? (state.arrangement?.teamNations === 'random' ? 'random' : 'mono') : readTeamNations()),
    write: (value) => {
      writeTeamNations(value);
      if (teamsFromLobby && state && role === 'host' && state.phase === 'waiting') {
        command({ type: 'set_arrangement', arrangement: normalizeTeamArrangement(selectedGameMode, { ...(state.arrangement ?? {}), teamNations: value }) });
      }
      renderArrangement(selectedGameMode, teamsFromLobby);
      refreshRuleLines();
    },
    playerCountry,
    enemyCountry: () => currentArrangement(selectedGameMode)?.enemyNation ?? null,
    locked: () => teamsFromLobby && (role !== 'host' || state?.phase !== 'waiting'),
  });
  root.querySelector<HTMLElement>('[data-teams-host]')!.append(teamsControl.root);
  function renderTeams(fromLobby: boolean): void {
    teamsFromLobby = fromLobby;
    teamsControl.render();
  }

  // ---- team arrangement (owner 2026-09-15) --------------------------------------------------
  const arrangeSection = root.querySelector<HTMLElement>('[data-arrange]')!;
  const arrangeSelect = (name: string): HTMLSelectElement => arrangeSection.querySelector<HTMLSelectElement>(`select[data-arrange="${name}"]`)!;
  const arrangementDropdowns = [...arrangeSection.querySelectorAll<HTMLSelectElement>('select')].map(select =>
    select.dataset.arrange === 'enemyNation' ? createEnemyNationSelect(select) : createSelectPickerMenu(select, { id: 'rooms-arrangement' }));
  const fillOptions = (select: HTMLSelectElement, entries: Array<[string, string]>, value: string): void => {
    select.innerHTML = entries.map(([id, label]) => `<option value="${id}"${id === value ? ' selected' : ''}>${label}</option>`).join('');
    select.value = value;
  };
  const range = (from: number, to: number): Array<[string, string]> =>
    Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), String(from + i)]);
  /** The mode cards follow the arrangement (their rules) and the campaign (Frontline Assault's push). */
  function refreshRuleLines(): void {
    rulesModePicker?.setCards(modeCards(currentArrangement));
    lobbyModePicker?.setCards(modeCards(currentArrangement));
  }
  // ---- sides (owner 2026-09-18): 7v7 / 14v14 / custom for the symmetric modes ---------------------------
  const sidesGroup = arrangeSection.querySelector<HTMLElement>('[data-arrange-sides]')!;
  const sidesSeg = requiredElement<HTMLElement>(sidesGroup, '.sides-seg');
  const sidesButtons = [...sidesSeg.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const sidesReadout = sidesGroup.querySelector<HTMLElement>('[data-sides-readout]')!;
  const capNote = arrangeSection.querySelector<HTMLElement>('[data-arrange-cap]')!;
  const arrangeField = (name: string): HTMLElement => arrangeSection.querySelector<HTMLElement>(`[data-arrange-field="${name}"]`)!;
  const arrangeInput = (name: string): HTMLInputElement => arrangeSection.querySelector<HTMLInputElement>(`input[data-arrange="${name}"]`)!;
  let sidesCustomOpen = false;
  function renderArrangement(mode: GameModeId, fromLobby: boolean): void {
    // a room keeps its own team size for the symmetric modes (the room's teamSize); the wave modes arrange here
    if (!acceptsTeamArrangement(mode) || (fromLobby && !isWaveMode(mode) && mode !== 'juggernaut')) {
      arrangeSection.hidden = true; arrangementDropdowns.forEach(dropdown => dropdown.close()); renderTeams(fromLobby); return;
    }
    arrangeSection.hidden = false;
    const wave = isWaveMode(mode);
    const arranged = currentArrangement(mode);
    const defaults = matchRulesetFor(mode, null, arranged);
    const asymmetric = mode === 'juggernaut' || mode === 'infected' || mode === 'ac130';
    const roleField = arrangeField('juggernautRole'); roleField.hidden = mode !== 'juggernaut';
    if (mode === 'juggernaut') {
      arrangeSelect('juggernautRole').replaceChildren(new Option(t('playMenu.arrange.boss'), 'boss'), new Option(t('playMenu.arrange.hunter'), 'hunter'));
      arrangeSelect('juggernautRole').value = arranged?.juggernautRole || 'boss';
    }
    sidesGroup.hidden = wave || asymmetric;
    capNote.hidden = wave || asymmetric;
    arrangeField('allies').hidden = !wave;
    arrangeField('enemies').hidden = !wave;
    if (wave) {
      fillOptions(arrangeSelect('allies'), range(TEAM_ARRANGEMENT_LIMITS.allies[mode][0], TEAM_ARRANGEMENT_LIMITS.allies[mode][1]),
        String(arranged?.allies ?? defaults.allies ?? 0));
      fillOptions(arrangeSelect('enemies'), range(TEAM_ARRANGEMENT_LIMITS.enemies[mode][0], TEAM_ARRANGEMENT_LIMITS.enemies[mode][1]),
        String(arranged?.enemies ?? defaults.enemies ?? TEAM_ARRANGEMENT_LIMITS.enemies[mode][0]));
      arrangeField('alliesCount').hidden = true;
      arrangeField('enemiesCount').hidden = true;
    } else {
      const sides = rulesetSides({ allies: arranged?.allies ?? null, enemies: arranged?.enemies ?? null });
      const preset = sidesPresetOf(sides);
      const custom = sidesCustomOpen || preset === 'custom';
      setRoving(sidesSeg, custom ? 'custom' : preset);
      arrangeField('alliesCount').hidden = asymmetric ? defaults.allies === 0 : !custom;
      arrangeField('enemiesCount').hidden = asymmetric ? defaults.enemies === 1 : !custom;
      const allies = arrangeInput('alliesCount'), enemies = arrangeInput('enemiesCount');
      allies.min = String(TEAM_ARRANGEMENT_LIMITS.allies[mode][0]); allies.max = String(TEAM_ARRANGEMENT_LIMITS.allies[mode][1]);
      enemies.min = String(TEAM_ARRANGEMENT_LIMITS.enemies[mode][0]); enemies.max = String(TEAM_ARRANGEMENT_LIMITS.enemies[mode][1]);
      allies.value = String(asymmetric ? defaults.allies ?? sides.allies : sides.allies);
      enemies.value = String(asymmetric ? defaults.enemies ?? sides.enemies : sides.enemies);
      // the readout adds what the counts do not show, the sides with the player counted: a preset already names them
      sidesReadout.hidden = !custom;
      sidesReadout.textContent = t('playMenu.arrange.readout', { allies: String(sides.allies + 1), enemies: String(sides.enemies) });
    }
    const waveLabel = arrangeSection.querySelector<HTMLElement>('[data-arrange-wave]')!;
    waveLabel.hidden = mode !== 'endless_horde';
    if (mode === 'endless_horde') {
      fillOptions(arrangeSelect('waveSize'), range(TEAM_ARRANGEMENT_LIMITS.waveSize[0], TEAM_ARRANGEMENT_LIMITS.waveSize[1]),
        String(arranged?.waveSize ?? defaults.horde?.waveSize ?? TEAM_ARRANGEMENT_LIMITS.waveSize[0]));
    }
    // TEAM NATIONS: MONO's enemy country (AUTO first, never the player's own); RANDOM hides and ignores it
    const ownCountry = playerCountry();
    arrangeField('enemyNation').hidden = defaults.teamNations === 'random';
    fillOptions(arrangeSelect('enemyNation'),
      [['', t('teams.auto')], ...ENEMY_NATION_OPTIONS.map((option): [string, string] => [option.id, t(`campaign.enemy.${option.id}`)])],
      arranged?.enemyNation && arranged.enemyNation !== ownCountry ? arranged.enemyNation : '');
    for (const option of arrangeSelect('enemyNation').options) option.disabled = !!option.value && option.value === ownCountry;
    renderTeams(fromLobby);
    // Mars settings (owner 2026-09-18): the gravity world and boost-cache cadence, mars only
    const mars = mode === 'mars';
    arrangeField('marsGravity').hidden = !mars;
    arrangeField('marsCaches').hidden = !mars;
    if (mars) {
      fillOptions(arrangeSelect('marsGravity'), MARS_GRAVITY_IDS.map((id): [string, string] => [id, t(`mars.gravity.${id}`)]),
        arranged?.marsGravity ?? defaults.mars?.gravity ?? 'mars');
      fillOptions(arrangeSelect('marsCaches'), MARS_CACHE_IDS.map((id): [string, string] => [id, t(`mars.caches.${id}`)]),
        arranged?.marsCaches ?? defaults.mars?.caches ?? 'standard');
    }
    const locked = fromLobby && (role !== 'host' || state?.phase !== 'waiting');
    for (const control of arrangeSection.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input')) control.disabled = locked;
    arrangementDropdowns.forEach(dropdown => dropdown.refresh());
    for (const button of sidesButtons) button.disabled = locked;
    arrangeSection.querySelector<HTMLButtonElement>('[data-arrange-reset]')!.disabled = locked;
    const note = arrangeSection.querySelector<HTMLElement>('[data-arrange-note]');
    if (note) note.textContent = fromLobby ? t(role === 'host' ? 'playMenu.arrange.subHost' : 'playMenu.arrange.subGuest') : '';
    refreshRuleLines();
  }
  function readArrangementPanel(mode: GameModeId): TeamArrangement | null {
    const wave = isWaveMode(mode);
    const number = (name: string): number | null => {
      const v = Number((wave ? arrangeSelect(name) : arrangeInput(`${name}Count`)).value);
      return Number.isFinite(v) ? v : null;
    };
    const waveSize = mode === 'endless_horde' ? Number(arrangeSelect('waveSize').value) : NaN;
    return normalizeTeamArrangement(mode, {
      ...currentArrangement(mode),
      allies: number('allies'), enemies: number('enemies'),
      waveSize: Number.isFinite(waveSize) ? waveSize : null,
      enemyNation: arrangeSelect('enemyNation').value || null,
      juggernautRole: mode === 'juggernaut' ? arrangeSelect('juggernautRole').value as TeamArrangement['juggernautRole'] : null,
      marsGravity: mode === 'mars' ? arrangeSelect('marsGravity').value as TeamArrangement['marsGravity'] : null,
      marsCaches: mode === 'mars' ? arrangeSelect('marsCaches').value as TeamArrangement['marsCaches'] : null,
    });
  }
  function applyArrangement(arrangement: TeamArrangement | null): void {
    const mode = selectedGameMode;
    if (!acceptsTeamArrangement(mode)) return;
    writeTeamArrangement(mode, arrangement);
    if (state && role === 'host' && state.phase === 'waiting') command({ type: 'set_arrangement', arrangement });
    renderArrangement(mode, !!state);
  }
  arrangeSection.addEventListener('change', () => applyArrangement(readArrangementPanel(selectedGameMode)));
  arrangeSection.querySelector<HTMLButtonElement>('[data-arrange-reset]')!.addEventListener('click', () => {
    sidesCustomOpen = false;
    // the reset clears the sides and the objective settings, never the TEAMS choice (round 2: a lobby's reset sent a null
    // arrangement and put a RANDOM room back to MONO without a word)
    const teams = currentArrangement(selectedGameMode)?.teamNations === 'random'
      ? normalizeTeamArrangement(selectedGameMode, { teamNations: 'random' }) : null;
    applyArrangement(teams);
  });
  wireRoving(sidesSeg, (id) => {
    if (id === 'custom') { sidesCustomOpen = true; renderArrangement(selectedGameMode, !!state); return; }
    if (id !== '7v7' && id !== '14v14') return;
    sidesCustomOpen = false;
    const current = currentArrangement(selectedGameMode);
    applyArrangement(normalizeTeamArrangement(selectedGameMode, { ...current, ...SIDES_PRESETS[id], enemyNation: current?.enemyNation ?? null }));
  });

  // ---- opponent brain (owner 2026-09-25): Classic or Jev (System One) for the solo bots ---------------
  const brainSection = root.querySelector<HTMLElement>('[data-brain]')!;
  const brainSeg = requiredElement<HTMLElement>(brainSection, '.brain-seg');
  // what Jev is, for a pointer, is the option's hover tip; screen readers keep the note
  requiredElement<HTMLElement>(brainSeg, '[data-value="jev"]').dataset.tip = t('playMenu.brain.note');
  const brainAllies = requiredElement<HTMLButtonElement>(brainSection, '[data-brain-allies]');
  const alliesRow = requiredElement<HTMLElement>(brainSection, '.brain-allies');
  const brainNote = brainSection.querySelector<HTMLElement>('[data-brain-note]')!;
  function renderBrain(fromLobby: boolean): void {
    // rooms keep the classic brain on the host for now (docs/JEV-COMMANDER.md): the setting is solo-only
    brainSection.hidden = fromLobby;
    const settings = readBrainSettings();
    setRoving(brainSeg, settings.opponent);
    setToggle(brainAllies, settings.opponent === 'jev' && settings.allies);
    brainAllies.disabled = settings.opponent !== 'jev';
    alliesRow.classList.toggle('is-disabled', brainAllies.disabled);
    brainNote.hidden = settings.opponent !== 'jev';
  }
  wireRoving(brainSeg, (opponent) => {
    writeBrainSettings({ opponent });
    renderBrain(!!state);
  });
  brainAllies.addEventListener('click', () => {
    writeBrainSettings({ allies: brainAllies.getAttribute('aria-checked') !== 'true' });
    renderBrain(!!state);
  });
  // the switch's words are its own name: a press on them presses it, as a label's would
  requiredElement<HTMLElement>(alliesRow, '.brain-allies__label').addEventListener('click', () => brainAllies.click());

  /** Choose a battle mode: the room's own change for its host while it waits; the next room's or solo battle's before. */
  function chooseMode(next: string): void {
    if (state && (role !== 'host' || state.phase !== 'waiting')) return;
    const mode = normalizeGameMode(next);
    showSelectedGameMode(mode, { fromLobby: !!state });
    if (state) command({ type: 'set_game_mode', gameMode: mode });
  }
  // the mode picker (INTERACTION-REDESIGN.md line 1): inline in Room Rules before a room exists (the entry, solo), and in a
  // room under the battlefield plate's Mode trigger, where the host's rules stand together
  rulesModePicker = createModePicker(requiredElement<HTMLElement>(root, '[data-rules-mode]'), {
    id: 'rooms-rules-mode', label: t('playMenu.battleRulesAria'), cards: modeCards(), value: selectedGameMode, text: pickerText(),
    onChoose: (id) => chooseMode(id),
  });
  const modeSelect = requiredElement<HTMLElement>(root, '[data-control="mode"]');
  const modeTrigger = requiredElement<HTMLButtonElement>(modeSelect, '[data-select-trigger]');
  const modeGlyph = requiredElement<HTMLElement>(modeTrigger, '[data-select-glyph]');
  const modeValue = requiredElement<HTMLElement>(modeTrigger, '[data-select-value]');
  const modePick = requiredElement<HTMLElement>(root, '.mode-pick');
  const modeSurface = pickSurface('rooms-mode', modePick, modeTrigger, (restoreFocus) => closeModePick(restoreFocus));
  function closeModePick(restoreFocus = false): void {
    if (modePick.hidden) return;
    closeSurface(modeSurface);
    modePick.hidden = true;
    modeTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) modeTrigger.focus();
  }
  function toggleModePick(): void {
    if (!modePick.hidden) { closeModePick(true); return; }
    if (modeTrigger.disabled) return;
    openSurface(modeSurface, modeTrigger);
    modePick.hidden = false;
    modeTrigger.setAttribute('aria-expanded', 'true');
    if (lobbyModePicker) lobbyModePicker.setCards(modeCards(currentArrangement), selectedGameMode);
    else {
      lobbyModePicker = createModePicker(modePick, {
        id: 'rooms-mode', label: t('playMenu.advanced.mode'), cards: modeCards(currentArrangement), value: selectedGameMode,
        text: pickerText(), onChoose: (id) => { chooseMode(id); closeModePick(true); },
      });
    }
    revealUnderCard(modePick);
    lobbyModePicker.focus();
  }
  modeTrigger.addEventListener('click', () => toggleModePick());
  modeTrigger.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (modePick.hidden) toggleModePick();
  });
  /** The Mode trigger names the room's mode in its hue; a guest, or a room past waiting, reads it disabled. */
  function showModeTrigger(fromLobby: boolean): void {
    modeGlyph.innerHTML = uiIconSVG(GAME_MODE_DEFINITIONS[selectedGameMode].icon, 20);
    modeGlyph.dataset.modeTone = selectedGameMode;
    modeValue.textContent = t(`playMenu.matchMode.${selectedGameMode}.label`);
    const locked = fromLobby && (role !== 'host' || state?.phase !== 'waiting');
    modeTrigger.disabled = locked;
    modeSelect.classList.toggle('disabled', locked);
    if (locked) closeModePick();
  }

  function showSelectedGameMode(
    next: RuntimeValue = selectedGameMode,
    { fromLobby = false }: { fromLobby?: boolean } = {},
  ): void {
    selectedGameMode = normalizeGameMode(next);
    remember(GAME_MODE_KEY, selectedGameMode);
    // Frontline Assault rooms are co-op: the note says every player attacks together (batch 27)
    const note = root.querySelector<HTMLElement>('[data-rule-note]');
    if (note) note.hidden = selectedGameMode !== 'frontline_assault';
    rulesModePicker?.setValue(selectedGameMode);
    lobbyModePicker?.setValue(selectedGameMode);
    showModeTrigger(fromLobby);
    renderArrangement(selectedGameMode, fromLobby);
    renderBrain(fromLobby);
    requiredElement<HTMLElement>(root, '[data-selected-rule]').textContent = t(`playMenu.matchMode.${selectedGameMode}.label`);
  }
  showSelectedGameMode();

  function adoptRoomConnection(connection: RoomConnection): void {
    session = connection.session;
    role = connection.role;
    clearFailure();
  }

  // The room host applies the vehicle / camo / map policy; the menu carries the seat's lifecycle only.
  const connectionOptions: RoomConnectionOptions = {
    storage: localStorage,
    clientBuild: import.meta.env.MODE,
    // the rooms Worker's daily limit (Workers Free): one status ask after a failure, no socket into the refusal
    serviceLimit: createRoomServiceLimit({ storage: localStorage }),
    onHostStart: (lobbyState, connection) => {
      adoptRoomConnection(connection);
      beginNetworkHandoff(lobbyState, 'host');
    },
    onClose: (reason) => {
      const wasHandedOff = handedOff || !!activeRoom;
      closeCurrentSession(reason, { skipTransportClose: true });
      if (isIntentionalRoomCloseReason(reason)) return;
      if (!wasHandedOff) showRoomFailure(reason);
    },
    onStatus: ({ state: connectionState }) => {
      if (handedOff) return;
      if (connectionState === 'reconnecting') {
        room.setAttribute('aria-busy', 'true');
        setStatus(t('playMenu.connection.interrupted'));
      } else if (connectionState === 'connected' && session) {
        room.setAttribute('aria-busy', 'false');
        clearFailure();
        setStatus(t('playMenu.connection.restored'));
      }
    },
    onError: (error) => {
      if (!session && !connecting && !handedOff) showFailure(error);
      else setStatus(roomFailurePresentation(error).title, true);
    },
  };
  const roomConnection: RoomConnectionRuntime = createRoomConnectionAdapter(connectionOptions);

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
    eyebrow.textContent = t(mode === 'lan' ? 'playMenu.eyebrow.lan' : 'playMenu.eyebrow.private');
    menuTitle.textContent = connected ? lobbyTitle() : invitedHostName
      ? t('playMenu.invite.titleHost', { host: invitedHostName })
      : t('playMenu.invite.titlePrivate');
    menuLead.textContent = '';
    const metadataUrl = new URL(window.location.href);
    metadataUrl.searchParams.set('room', code);
    metadataUrl.searchParams.set('mode', mode === 'lan' ? 'lan' : 'private');
    if (invitedHostName) metadataUrl.searchParams.set('host', invitedHostName);
    else metadataUrl.searchParams.delete('host');
    metadataUrl.searchParams.set('v', '2');
    const metadata = privateRoomMetadata(metadataUrl, getLocale());
    if (metadata) applySiteMetadataToDocument(document, metadata);
  }

  const lobbyTitle = (): string => t(mode === 'lan' ? 'playMenu.lan.title' : 'playMenu.private.title');

  function resetInvitation(): void {
    invitedHostName = null;
    root.classList.remove('invite-entry');
    eyebrow.textContent = defaultEyebrow;
    menuTitle.textContent = defaultMenuTitle;
    menuLead.textContent = defaultMenuLead;
    if (document.title.startsWith('Join ') || document.title.startsWith('加入')) {
      applySiteMetadataToDocument(document, localizedGameMetadata(getLocale()));
    }
  }

  // the status line is the kit's notice: an error, a progress (a room being made or joined) or an info line
  const statusText = requiredElement<HTMLElement>(status, '[data-status-text]');
  const statusGlyph = requiredElement<HTMLElement>(status, '[data-status-glyph]');
  const STATUS_GLYPH = { error: 'alert', progress: 'clock', info: 'info' } as const;
  function setStatus(message: RuntimeValue, error = false, severity: 'progress' | 'info' = 'info'): void {
    statusText.textContent = message == null ? '' : String(message);
    const kind = error ? 'error' : severity;
    if (status.dataset.severity !== kind || !statusGlyph.firstChild) statusGlyph.innerHTML = uiIconSVG(STATUS_GLYPH[kind], 20);
    status.dataset.severity = kind;
    status.classList.toggle('err', !!error);
    status.classList.toggle('is-empty', !statusText.textContent);
    if (kind !== 'info' && statusText.textContent && root.classList.contains('show')) status.scrollIntoView({ block: 'nearest' });
  }

  function clearFailure(): void {
    failurePanel.hidden = true;
    codeInput.removeAttribute('aria-invalid');
    codeInput.removeAttribute('aria-describedby');
  }

  function showFailure(error: RuntimeValue): void {
    const failure = roomFailurePresentation(error);
    getEntryTelemetry().send({ kind: 'room_failure', code: failure.code, mode: mode === 'lan' ? 'lan' : 'private' });
    failurePanel.dataset.reason = failure.code;
    failureTitle.textContent = failure.title;
    failureDetail.textContent = failure.detail;
    retryBtn.hidden = !failure.canRetry || !lastConnectionKind || !!session || !!activeRoom;
    editCodeBtn.hidden = !failure.editCode;
    editCodeBtn.textContent = failure.roomEnded
      ? t('playMenu.failure.joinAnotherRoom')
      : t('playMenu.failure.editCode');
    clearFailure();
    const invalidInput = failure.code === 'invalid_room_code' ? codeInput : null;
    invalidInput?.setAttribute('aria-invalid', 'true');
    invalidInput?.setAttribute('aria-describedby', 'cot-room-failure-detail');
    failurePanel.hidden = false;
    setStatus('');
    if (root.classList.contains('show')) failurePanel.focus({ preventScroll: false });
  }

  function showRoomFailure(reason: string, requestedMode: PlayMode = mode || 'private'): void {
    if (isIntentionalRoomCloseReason(reason)) return;
    // Garage restoration is asynchronous: an older room's failure must not
    // overwrite a newer lobby or an acquisition that has not handed off yet.
    if (session || activeRoom || connecting || roomConnection.current
        || roomConnection.connecting) return;
    mode = normalizePlayMode(requestedMode) === 'lan' ? 'lan' : 'private';
    revealMenu();
    room.classList.add('show');
    setRoving(kindSeg, mode);
    setConnecting(false);
    showFailure(reason);
  }

  function roomConnectionStatus(action: 'created' | 'joined'): string {
    return action === 'created'
      ? t('playMenu.room.readyCopy')
      : t('playMenu.room.connectedChooseTeam');
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
    const label = t(inRoom ? 'playMenu.close.backToGarage' : 'playMenu.close');
    closeBtn.setAttribute('aria-label', label);
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
    room.setAttribute('aria-busy', String(next));
    createBtn.disabled = next;
    joinBtn.disabled = next || codeInput.value.length !== 6;
  }

  function closeCurrentSession(
    reason = 'menu_closed',
    { skipTransportClose = false, keepRequest = false }: {
      skipTransportClose?: boolean; keepRequest?: boolean;
    } = {},
  ): void {
    if (!keepRequest) requestGeneration++;
    setVersionRefusal(null); // leaving the room ends its refusal
    if (unsubscribeState) unsubscribeState();
    unsubscribeState = null;
    if (activeRoom && !skipTransportClose) activeRoom.leave(reason);
    else roomConnection.close(reason, {
      transportAlreadyClosed: skipTransportClose,
    });
    session = null;
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
    setConnecting(false);
  }


  function beginNetworkHandoff(
    next: SerializedLobby,
    nextRole: RoomRole | null = role,
  ): boolean {
    if (handedOff) return false;
    // A composition-held v2 room (the seat kept across a Garage return) hands its own session back for a rejoin.
    const activeSession = session ?? (activeRoom?.session as RoomSession | undefined) ?? null;
    if (!activeSession || !nextRole) {
      setStatus(t('playMenu.status.sessionUnavailable'), true);
      return false;
    }
    // The battle owner already owns an attached room's session: the handoff flag guards the menu's own only.
    if (activeSession === session) handedOff = true;
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
    start.then((entered) => {
      // A rejoin that could not present (the match ended meanwhile) shows the room again with its status.
      if (entered === false && activeRoom && activeSession !== session) show();
    }, (error: RuntimeValue) => {
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

  /** A seat may enter a running match only with the `match_start` the room sent it (a fresh joiner waits for the next round). */
  function hasMatchStart(candidate: RuntimeValue): boolean {
    return !!candidate && typeof candidate === 'object' && 'lastMatchStart' in candidate && !!(candidate as { lastMatchStart?: RuntimeValue }).lastMatchStart;
  }

  function shouldBeginClientHandoff(next: SerializedLobby): boolean {
    return (next.phase === 'starting' || next.phase === 'playing') &&
      role === 'client' && !handedOff && !activeRoom && hasMatchStart(session);
  }

  /** Charter §5: a seat back in the Garage with the room kept may rejoin the match the room still runs. */
  function canRejoinBattle(next: SerializedLobby): boolean {
    return !handedOff && (next.phase === 'starting' || next.phase === 'playing') && hasMatchStart(activeRoom?.session ?? session);
  }

  function renderLobbyBattlefield(next: SerializedLobby): void {
    codeEl.textContent = next.roomCode;
    seatsEl.textContent = `${next.players.filter((candidate) => candidate.team !== 'spectator').length}/${next.maxPlayers}`;
    // batch 30 (2026-09-15): a Frontline room may play a campaign operation — it names the battlefield
    const operation = next.gameMode === 'frontline_assault' ? campaignOperationById(next.campaignOperationId) : null;
    operationField.hidden = next.gameMode !== 'frontline_assault';
    operationSelect.value = operation?.id ?? '';
    operationSelect.disabled = role !== 'host' || next.phase !== 'waiting';
    if (operationField.hidden) operationDropdown.close();
    operationDropdown.refresh();
    mapSelect.value = operation?.mapId ?? next.mapId;
    roomMode = next.gameMode || 'standard';
    if (battlefieldPicker && !battlefieldPick.hidden) battlefieldPicker.setCards(battlefieldCards(), roomMode, mapSelect.value);
    const selectedMap = mapById.get(operation?.mapId ?? next.mapId) || mapById.get('random') || maps[0];
    const randomBattlefield = selectedMap?.id === 'random' || !selectedMap?.thumb;
    battlefieldArt.classList.toggle('is-random', randomBattlefield);
    battlefieldArt.style.backgroundImage = randomBattlefield
      ? 'none'
      : `url("${String(battlefieldFacts(selectedMap.id).poster.hero).replace(/"/g, '%22')}")`;
    battlefieldCard.classList.toggle('guest', role !== 'host');
    sizeSelect.value = String(next.teamSize || 1);
    createSizeSelect.value = sizeSelect.value;
    showSelectedGameMode(next.gameMode || 'standard', { fromLobby: true });
  }

  function renderLobbySelf(player: LobbyPlayer | undefined, next: SerializedLobby): void {
    if (!player) {
      readyBtn.disabled = true;
      readyBtn.textContent = t('playMenu.ready.iAmReady');
      readyBtn.classList.remove('needs-ready', 'is-ready');
      readyBtn.removeAttribute('aria-pressed');
      return;
    }
    if (player.specId) vehicleSelect.value = player.specId;
    teamSelect.value = player.team;
    if (nameInput.value !== player.name) {
      nameInput.value = player.name;
      remember(PLAYER_NAME_KEY, player.name);
    }
    const spectator = player.team === 'spectator';
    readyBtn.textContent = spectator ? t('playMenu.ready.watching') : t('playMenu.ready.iAmReady');
    readyBtn.disabled = spectator || !player.connected || !player.specId || next.phase !== 'waiting';
    readyBtn.classList.toggle('needs-ready', !spectator && !player.ready && next.phase === 'waiting');
    readyBtn.classList.toggle('is-ready', !spectator && player.ready);
    readyBtn.setAttribute('aria-pressed', String(!spectator && player.ready));
  }

  function updateLobbyControls(
    next: SerializedLobby,
    player: LobbyPlayer | undefined,
  ): void {
    vehicleSelect.disabled = !player || next.phase !== 'waiting' || !!player.ready ||
      player?.team === 'spectator';
    teamSelect.disabled = next.phase !== 'waiting' || !!player?.ready ||
      isCoopGameMode(next.gameMode);
    mapSelect.disabled = role !== 'host' || next.phase !== 'waiting'
      || (next.gameMode === 'frontline_assault' && !!campaignOperationById(next.campaignOperationId));
    sizeSelect.disabled = role !== 'host' || next.phase !== 'waiting';
    // a co-op room has one side: no format to choose, and the roster's team words would only repeat
    const coop = isCoopGameMode(next.gameMode);
    sizeSelect.closest<HTMLElement>('.field')!.hidden = coop;
    root.classList.toggle('coop', coop);
    teamSelect.querySelector<HTMLElement>('[data-value="bravo"]')!.hidden = coop;
    startBtn.style.display = role === 'host' ? '' : 'none';
    rejoinBtn.hidden = !canRejoinBattle(next) || !!versionRefusal;
    const activePlayers = next.players.filter((candidate) => candidate.team !== 'spectator');
    const readyCount = activePlayers.filter((candidate) => candidate.ready && candidate.specId).length;
    const canStart = role === 'host' && next.phase === 'waiting' && activePlayers.length > 0 && readyCount === activePlayers.length;
    startBtn.disabled = !canStart;
    startBtn.classList.toggle('can-start', canStart);
    // Start counts the ready seats, so a Start that waits shows what it waits on
    startCount.textContent = `${readyCount}/${activePlayers.length}`;
    startBtn.setAttribute('aria-label', t('playMenu.startReady', { ready: readyCount, total: activePlayers.length }));
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
      const placeholder = document.createElement('span');
      placeholder.className = 'vehicle-icon placeholder';
      vehicleName.textContent = player.team === 'spectator' ? '' : t('playMenu.lobby.selectingVehicle');
      vehicle.append(placeholder, vehicleName);
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
    const listed = selectableVehicleNames.get(player.specId);
    try { vehicleName.textContent = listed || getVehicleName(player.specId) || player.specId; }
    catch (_) { vehicleName.textContent = listed || player.specId; }
    vehicleCopy.append(vehicleName);
    vehicle.append(icon, vehicleCopy);
    return vehicle;
  }

  function createLobbyPlayerRow(player: LobbyPlayer, playerId: string | undefined): HTMLDivElement {
    const row = document.createElement('div');
    const isMe = player.id === playerId;
    row.className = `player ${player.team}${isMe ? ' self' : ''}${player.connected ? '' : ' offline'}${
      isMe && player.team !== 'spectator' && !player.ready ? ' awaiting-ready' : ''}`;
    const playerName = document.createElement('b');
    playerName.className = 'name';
    playerName.textContent = player.name;
    if (player.isHost) {
      const host = document.createElement('span');
      host.className = 'host cot-c-tag';
      host.textContent = t('playMenu.lobby.host');
      playerName.append(host);
    }
    const team = document.createElement('span');
    team.className = 'team';
    const mark = document.createElement('i');
    mark.className = `team-mark ${player.team}`;
    team.append(mark);
    team.append(lobbyTeamLabel(player.team));
    const ready = document.createElement('span');
    ready.className = player.connected && (player.ready || player.team === 'spectator') ? 'ready' : 'wait';
    ready.textContent = !player.connected
      ? t('playMenu.lobby.offline')
      : player.team === 'spectator'
        ? ''
        : t(player.ready ? 'playMenu.lobby.ready' : 'playMenu.lobby.notReady');
    row.append(playerName, createLobbyVehicle(player), team, ready);
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
      ? t('playMenu.note.hordeFill')
      : next.gameMode === 'frontline_assault'
        ? t('playMenu.note.frontlineFill')
        : t('playMenu.note.botFill', { size: next.teamSize || 1 });
    note.textContent = fillNote;
    // the room's fill rule is the Battle format picker's hover tip
    sizeSelect.dataset.tip = fillNote;
  }

  function renderLobby(next: SerializedLobby): void {
    state = next;
    // The room's admin migrates (charter §5): the role that gates the host controls follows the room's hostId.
    if (session || activeRoom) role = next.hostId === ownId() ? 'host' : 'client';
    // Every browser carries the live room in its canonical URL. A guest can
    // reattach to the current authority, while a reloaded browser host
    // reconstructs the waiting room and lets guests resubmit their retained
    // selections over replacement WebRTC channels.
    rememberLiveRoom(next);
    if (role === 'host') menuTitle.textContent = lobbyTitle();
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

  function observeConnectedRoom(connection: RoomConnection, kind: 'create' | 'join'): void {
    if (kind === 'join' && role === 'host') resetInvitation();
    else if (role === 'client') {
      presentInvitation(
        hostNameFromRoom(connection.roomInfo),
        connection.roomInfo.roomCode,
        false,
      );
    }
    unsubscribeState = roomConnection.observe(renderLobby);
  }

  async function connectRoom(kind: 'create' | 'join', generation: number): Promise<boolean> {
    if (connecting || session || roomConnection.connecting || roomConnection.current) return false;
    const selection = { ...getSelection(), gameMode: selectedGameMode,
      arrangement: kind === 'create' ? currentArrangement(selectedGameMode) : null };
    const name = normalizePlayerName(nameInput.value) || automaticPlayerName(ownPlayerId);
    if (!name) throw new Error('Enter a player name');
    nameInput.value = name;
    remember(PLAYER_NAME_KEY, name);
    const roomsUrl = menuRoomsUrl();
    if (!roomsUrl) {
      throw Object.assign(new Error('No room service is reachable from this deployment.'), { code: 'room_unconfigured' });
    }
    if (kind === 'join' && normalizeRoomCode(codeInput.value).length !== 6) {
      throw Object.assign(new Error('Enter a six-character room code'), { code: 'invalid_room_code' });
    }
    const player = { id: ownPlayerId, name };
    setConnecting(true);
    try {
      const teamSize = Number(createSizeSelect.value);
      if (kind === 'create') {
        remember(ROOM_SIZE_KEY, String(teamSize));
      }
      const connection = await roomConnection.connect({
        kind,
        mode: mode === 'lan' ? 'lan' : 'private',
        roomsUrl,
        roomCode: kind === 'join' ? codeInput.value : undefined,
        player,
        selection,
        teamSize,
      });
      if (!connection || generation !== requestGeneration) return false;
      adoptRoomConnection(connection);
      if (handedOff) return true;
      observeConnectedRoom(connection, kind);
      return true;
    } catch (error) {
      if (generation === requestGeneration) closeCurrentSession('connection_failed', { keepRequest: true });
      throw error;
    } finally {
      if (generation === requestGeneration) setConnecting(false);
    }
  }

  async function requestRoom(kind: 'create' | 'join'): Promise<void> {
    if (connecting || session || activeRoom) return;
    const generation = ++requestGeneration;
    lastConnectionKind = kind;
    clearFailure();
    setStatus(t(kind === 'create' ? 'playMenu.status.creatingRoom' : 'playMenu.status.joiningRoom'), false, 'progress');
    try {
      const connected = await connectRoom(kind, generation);
      if (connected && generation === requestGeneration) {
        setStatus(roomConnectionStatus(kind === 'create' ? 'created' : 'joined'));
      }
    } catch (error) {
      if (generation === requestGeneration) showFailure(error);
    }
  }

  // campaign ladder: launching an operation is a solo Frontline Assault sortie on its map
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const launch = target?.closest<HTMLButtonElement>('[data-campaign-launch]');
    if (!launch) return;
    event.preventDefault();
    hide();
    showSelectedGameMode('frontline_assault');
    if (onSolo) onSolo({ gameMode: 'frontline_assault', mapId: launch.dataset.mapId, campaignOperationId: launch.dataset.campaignLaunch });
  });

  function selectMode(nextMode: PlayMode): void {
    closePicks();
    if (nextMode === 'solo') {
      closeCurrentSession('mode_changed');
      clearFailure();
      mode = 'solo';
      root.classList.remove('multiplayer-entry');
      room.classList.remove('show');
      requiredElement<HTMLDetailsElement>(root, '.room-rules').open = true;
      eyebrow.textContent = t('playMenu.rules.heading');
      menuTitle.textContent = t('playMenu.solo.settings');
      menuLead.textContent = defaultMenuLead;
      showSelectedGameMode();
      panel.scrollTop = 0;
      return;
    }
    if (mode === 'solo') requiredElement<HTMLDetailsElement>(root, '.room-rules').open = false;
    root.classList.add('multiplayer-entry');
    eyebrow.textContent = defaultEyebrow;
    menuTitle.textContent = defaultMenuTitle;
    menuLead.textContent = defaultMenuLead;
    closeCurrentSession('mode_changed');
    clearFailure();
    mode = nextMode;
    setRoving(kindSeg, mode);
    room.classList.add('show');
    setConnecting(false);
    if (!menuRoomsUrl()) showFailure('room_unconfigured');
    else setStatus('');
  }
  wireRoving(kindSeg, (requested) => selectMode(normalizePlayMode(requested)));
  requiredElement<HTMLButtonElement>(root, '.mode[data-mode="solo"]').addEventListener('click', () => selectMode('solo'));
  createBtn.addEventListener('click', () => { void requestRoom('create'); });
  joinBtn.addEventListener('click', () => { void requestRoom('join'); });
  retryBtn.addEventListener('click', () => {
    if (!lastConnectionKind || connecting || session || activeRoom || retryBtn.hidden) return;
    closeCurrentSession('room_retry');
    void requestRoom(lastConnectionKind);
  });
  editCodeBtn.addEventListener('click', () => {
    if (session || activeRoom) return;
    clearFailure();
    setStatus(t('playMenu.status.enterAnotherCode'));
    codeInput.focus();
    codeInput.select();
  });
  garageBtn.addEventListener('click', () => {
    closeCurrentSession('back_to_menu');
    clearFailure();
    hide(false);
  });
  copyBtn.addEventListener('click', async () => {
    if (!state) return;
    const inviteUrl = createRoomInviteUrl({
      roomCode: state.roomCode,
      mode,
      hostName: hostNameFromRoom(state),
      baseUrl: location.href,
      version: 2,
    });
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setStatus(t('playMenu.invite.copied'));
    } catch {
      setStatus(t('playMenu.invite.link', { url: inviteUrl }));
    }
  });
  teamSelect.addEventListener('change', () => command({ type: 'set_team', team: teamSelect.value }));
  vehicleSelect.addEventListener('change', () => {
    const specId = vehicleSelect.value;
    if (!specId || !isVehicleAllowed(specId)) return;
    const loadout = getVehicleLoadout(specId);
    command({ type: 'select_vehicle', specId });
    command({ type: 'select_equipment', equipment: loadout.equipment, consumables: loadout.consumables ?? [] });
    command({ type: 'select_camo', camo: loadout.camo });
  });
  sizeSelect.addEventListener('change', () => {
    createSizeSelect.value = sizeSelect.value;
    remember(ROOM_SIZE_KEY, sizeSelect.value);
    command({ type: 'set_team_size', teamSize: Number(sizeSelect.value) });
  });
  mapSelect.addEventListener('change', () => command({ type: 'set_map', mapId: mapSelect.value }));
  operationSelect.addEventListener('change', () => command({ type: 'set_campaign_operation', campaignOperationId: operationSelect.value || null }));
  readyBtn.addEventListener('click', () => {
    const me = state && state.players.find((player) => player.id === ownId());
    const ready = !me?.ready;
    if (me && setReady(ready) && ready) onReadyIntent?.();
  });
  leaveBtn.addEventListener('click', () => {
    closeCurrentSession('left_room');
    hide(false);
  });
  rejoinBtn.addEventListener('click', () => {
    if (state && canRejoinBattle(state) && !versionRefusal) beginNetworkHandoff(state, role);
  });
  function startRound(): boolean {
    if (!state || role !== 'host' || state.phase !== 'waiting') return false;
    const words = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(words);
    else words[0] = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
    command({ type: 'start', matchSeed: words[0] });
    return true;
  }
  startBtn.addEventListener('click', () => { startRound(); });
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
  });
  closeBtn.addEventListener('click', () => hide());
  root.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) { event.stopPropagation(); return; }
    containModalTab(event, panel, closeBtn);
    event.stopPropagation();
  });
  // the room's panel is a modal transient surface (components/surfaceStack.ts): opening it closes what the Garage has open,
  // its pickers stand on it, and Escape (the stack's) closes the top one
  const roomsSurface: TransientSurface = { id: 'rooms', element: () => panel, close: () => hide(), modal: true };
  root.addEventListener('click', (event) => { if (event.target === root) hide(); });

  function show(
    initialMode: PlayMode | null = null,
    invite: PlayMenuInvite | null = null,
  ): void {
    refreshRuleLines();
    { const campaign = root.querySelector<HTMLElement>('[data-campaign]'); if (campaign) campaign.innerHTML = campaignMarkup(); }
    if (showCurrentRoom()) return;
    revealMenu();
    selectMode(normalizePlayMode(initialMode || 'private'));
    panel.scrollTop = 0;
    // a keyboard opens on the room code (type it, Enter joins); a touch screen keeps its keyboard down until asked
    if (failurePanel.hidden) (matchMedia('(pointer: fine)').matches ? codeInput : closeBtn).focus({ preventScroll: true });
    const inviteCode = normalizeRoomCode(invite?.roomCode);
    if (!invite?.autoJoin || session || connecting) return;
    if (inviteCode.length !== 6) {
      showFailure('invalid_room_code');
      return;
    }
    codeInput.value = inviteCode;
    presentInvitation(invite.hostName, inviteCode, false);
    setConnecting(false);
    void requestRoom('join');
  }
  function hide(closeSession = true): void {
    arrangementDropdowns.forEach(dropdown => dropdown.close());
    operationDropdown.close();
    closePicks();
    const restoreFocus = !handedOff && root.contains(document.activeElement);
    closeSurface(roomsSurface);
    root.classList.remove('show');
    // Closing the presentation must never mean leaving an established room.
    // The live lobby state remains authoritative while the player browses the
    // Garage and is rendered unchanged when this modal is opened again.
    if (closeSession && !handedOff && !activeRoom && !session) {
      closeCurrentSession('menu_closed');
    }
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  function revealMenu(): void {
    if (!root.classList.contains('show') && document.activeElement instanceof HTMLElement
        && !root.contains(document.activeElement)) returnFocus = document.activeElement;
    if (!root.classList.contains('show')) openSurface(roomsSurface, returnFocus);
    root.classList.add('show');
  }
  function dispose(): void {
    handedOff = false;
    if (activeRoom || session) closeCurrentSession('menu_disposed');
    else hide(false);
    root.remove();
  }
  function attachActiveRoom(adapter: ActiveRoomAdapter): void {
    if (!adapter || !adapter.state || !adapter.playerId ||
        typeof adapter.command !== 'function' || typeof adapter.leave !== 'function') {
      throw new TypeError('active room adapter is incomplete');
    }
    // The battle composition now owns this transport. Relinquish the
    // menu acquisition generation without closing the handed-off session.
    roomConnection.forget();
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
    // A delayed coordinator cleanup must not retire a replacement lobby or
    // an acquisition which has not handed its session to the battle owner.
    if (connecting || roomConnection.connecting || (!handedOff && !activeRoom)) return;
    const connection = roomConnection.current;
    if (connection && (!handedOff || connection.session !== session)) return;
    // Initial battle entry can defer attachActiveRoom, leaving the exact
    // handed-off acquisition here. Frame-driven teardown closes its transport
    // intentionally (without onClose), so retire the owner without closing it
    // twice before the parent presents the terminal error.
    roomConnection.close('room_connection_closed', { transportAlreadyClosed: true });
    if (unsubscribeState) unsubscribeState();
    unsubscribeState = null;
    activeRoom = null;
    session = null;
    setVersionRefusal(null);
    state = null;
    role = null;
    handedOff = false;
    clearRoomUrl();
    resetInvitation();
    room.classList.remove('connected');
    lobbyEl.classList.remove('show');
    root.classList.remove('lobby-active');
    setClosePurpose(false);
    setConnecting(false);
  }
  function showCurrentRoom(): boolean {
    const next = activeRoom?.state || state;
    if (!next || (!activeRoom && !session)) return false;
    room.classList.add('show');
    revealMenu();
    renderLobby(next);
    return true;
  }
  function syncGarageSelection(): boolean {
    // A pending lobby (the menu's seat) and an owned room (the composition's, attached here) both take the Garage pick.
    if ((!session && !activeRoom) || handedOff || state?.phase !== 'waiting') return false;
    const me = state.players?.find((player) => player.id === ownId());
    if (!me || me.ready) return false;
    const selection = getSelection();
    if (me.specId !== selection.specId) {
      command({ type: 'select_vehicle', specId: selection.specId });
    }
    command({ type: 'select_equipment', equipment: selection.equipment, consumables: selection.consumables ?? [] });
    if (me.camo !== selection.camo) command({ type: 'select_camo', camo: selection.camo });
    if (role === 'host' && selection.mapId && state.mapId !== selection.mapId) {
      command({ type: 'set_map', mapId: selection.mapId });
    }
    return true;
  }
  function setReady(ready: boolean): boolean {
    const me = state?.players.find((player) => player.id === ownId());
    if ((!activeRoom && !session) || handedOff || state?.phase !== 'waiting' ||
        !me || me.team === 'spectator' || !me.connected || !me.specId) return false;
    command({ type: 'set_ready', ready: !!ready });
    return true;
  }
  // 2026-10-10 (the MP shader-prep lane): the composition opens the held room after a refused entry, with the reason;
  // the lobby's Rejoin battle shows while the match still runs (canRejoinBattle).
  function showActiveRoom(notice?: string | null, code?: string | null): boolean {
    if (!showCurrentRoom()) return false;
    const key = code ? ENTRY_REFUSAL_KEYS[code] : undefined;
    const text = key ? t(key) : notice;
    // a version refusal is a banner at the top of the menu with Refresh, and Rejoin battle goes (it can only be refused again)
    if (code && VERSION_REFUSAL_CODES.has(code) && text) { setStatus(''); setVersionRefusal(text); return true; }
    if (text) setStatus(text, true);
    return true;
  }
  return {
    root, show, hide, dispose,
    attachActiveRoom, updateActiveRoom, detachActiveRoom, showRoomFailure,
    showActiveRoom, showCurrentRoom, syncGarageSelection, setReady, startRound,
  };
}
