// The Field Manual's multiplayer chapter: how to start or join a room, who sits where, which modes a room plays, and
// what happens when someone leaves. Copyright © 2026 Kevin B. Liu.
// Every number is the room service's own (src/mp/room/protocol.ts, src/mp/room/roomPolicy.ts): the seat caps, the
// default team size, the co-op modes, the seat and host grace periods, the chat limits; the LAN helper's port is
// server/rooms/main.ts's default. The room lobby's picture shows once the media lane's still is in public/ (re-run the
// prerender). Node only (tools/docs-prerender.mjs).
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_CHAT_HISTORY, ROOM_CHAT_MAX_CHARS, ROOM_HOST_DISCONNECT_GRACE_MS, ROOM_IDLE_TTL_MS,
  ROOM_MAX_COOP_PLAYERS, ROOM_MAX_EQUIPMENT, ROOM_MAX_NAME_CHARS, ROOM_MAX_PLAYERS, ROOM_MAX_SPECTATORS, ROOM_MAX_TEAM_SIZE,
  ROOM_SEAT_DISCONNECT_TTL_MS,
} from '../../mp/room/protocol.ts';
import { defaultRoomSettings, isCoopGameMode } from '../../mp/room/roomPolicy.ts';
import { BATTLE_MODE_IDS } from '../../sim/matchModes.ts';
import { GAME_MODE_DEFINITIONS, type GameModeId } from '../../sim/gameModeCatalog.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { getLocale, t } from '../../ui/i18n.ts';
import { hrefForLocale } from '../../ui/localeRouting.ts';
import { modeAnchor } from './modes.ts';
import type { RichSection } from './types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
/** The LAN helper's default port (server/rooms/main.ts COT_ROOMS_PORT). */
const LAN_PORT = 8792;
const LOBBY_STILL = '/media/docs-r1/mp-lobby-1920.webp';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const p = (key: string, values: Record<string, string> = {}): string => `<p>${esc(t(key, values))}</p>`;
const seconds = (ms: number): string => String(Math.round(ms / 1000));

/** A card per way into a room: its glyph, the Play menu's own name for it, and one line. */
function waysSection(): string {
  const ways: Array<[IconId, string, string, Record<string, string>]> = [
    ['battlePrivate', 'playMenu.private.title', 'docs.mp.private', {}],
    ['copy', 'playMenu.join.title', 'docs.mp.join', {}],
    ['battleLan', 'playMenu.lan.title', 'docs.mp.lan', { port: String(LAN_PORT) }],
  ];
  const cards = ways.map(([glyph, title, body, values]) => `<li>${icon(glyph, { size: 22 })}<div><b>${esc(t(title))}</b>`
    + `<p>${esc(t(body, values)).replace(/`([^`]+)`/g, '<code>$1</code>')}</p></div></li>`).join('');
  const lobby = existsSync(join(ROOT, 'public', LOBBY_STILL))
    ? `<figure class="dm-figure">${pictureMarkup({ src: LOBBY_STILL, width: 1920, height: 1080, alt: t('docs.mp.lobbyAlt'), sizes: '(width < 1100px) 100vw, 60vw',
      rungs: [{ src: LOBBY_STILL.replace('-1920.', '-640.'), width: 640 }, { src: LOBBY_STILL, width: 1920 }] }, false)}</figure>` : '';
  return p('docs.mp.waysLede') + `<ul class="dm-roles dm-roles--ways">${cards}</ul>${lobby}`;
}

/** The seats drawn to scale: each side's pips up to the cap, the default team size filled, then the spectators'. */
function seatsSection(): string {
  const defaults = defaultRoomSettings(null);
  const pips = (count: number, filled: number): string => Array.from({ length: count }, (_, i) => `<li${i < filled ? ' class="is-on"' : ''}></li>`).join('');
  const side = (team: 'alpha' | 'bravo'): string => `<div class="dm-seats__side is-${team}"><b>${esc(t(`playMenu.team.${team}`))}</b>`
    + `<ol aria-hidden="true">${pips(ROOM_MAX_TEAM_SIZE, defaults.teamSize)}</ol></div>`;
  const figure = `<figure class="dm-seats" aria-label="${esc(t('docs.mp.seatsAria', { side: String(ROOM_MAX_TEAM_SIZE), spectators: String(ROOM_MAX_SPECTATORS) }))}">`
    + `${side('alpha')}<span class="dm-seats__vs" aria-hidden="true">v</span>${side('bravo')}`
    + `<div class="dm-seats__side is-spectator"><b>${esc(t('playMenu.team.spectator'))}</b><ol aria-hidden="true">${pips(ROOM_MAX_SPECTATORS, 0)}</ol></div>`
    + `<figcaption><span><i class="is-on"></i>${esc(t('docs.mp.seatsDefault', { size: String(defaults.teamSize) }))}</span>`
    + `<span><i></i>${esc(t('docs.mp.seatsMax', { size: String(ROOM_MAX_TEAM_SIZE) }))}</span></figcaption></figure>`;
  const facts: Array<[string, Record<string, string>]> = [
    ['docs.mp.fact.capacity', { players: String(ROOM_MAX_PLAYERS), spectators: String(ROOM_MAX_SPECTATORS) }],
    ['docs.mp.fact.balance', {}],
    ['docs.mp.fact.bots', {}],
    ['docs.mp.fact.tanks', { equipment: String(ROOM_MAX_EQUIPMENT) }],
    ['docs.mp.fact.names', { chars: String(ROOM_MAX_NAME_CHARS) }],
  ];
  return p('docs.mp.seatsLede') + figure + `<ul class="dm-facts">${facts.map(([key, values]) => `<li>${esc(t(key, values))}</li>`).join('')}</ul>`;
}

/** The modes a room plays, each a chip that opens its card in the modes chapter. */
function modesSection(): string {
  const modes = hrefForLocale('/docs/modes', getLocale());
  const chip = (mode: GameModeId): string => `<li><a href="${modes}#${modeAnchor(mode)}">${icon(GAME_MODE_DEFINITIONS[mode].icon as IconId, { size: 14 })}`
    + `<span>${esc(t(`playMenu.matchMode.${mode}.label`))}</span></a></li>`;
  const coop = BATTLE_MODE_IDS.filter((mode) => isCoopGameMode(mode)).map((mode) => t(`playMenu.matchMode.${mode}.label`));
  return p('docs.mp.modesLede') + `<ul class="dm-chips dm-chips--icons dm-chips--links">${BATTLE_MODE_IDS.map((mode) => chip(mode as GameModeId)).join('')}</ul>`
    + p('docs.mp.coop', { modes: coop.join(t('docs.mp.listJoin')), players: String(ROOM_MAX_COOP_PLAYERS) });
}

/** Ready to battle, as the three steps the lobby takes. */
function startSection(): string {
  const steps = ['docs.mp.step.pick', 'docs.mp.step.ready', 'docs.mp.step.host'];
  return `<ol class="dm-steps">${steps.map((key, i) => `<li><span class="dm-steps__n">${i + 1}</span><p>${esc(t(key))}</p></li>`).join('')}</ol>`;
}

function leavingSection(): string {
  const rows: Array<[IconId, string, Record<string, string>]> = [
    ['signal', 'docs.mp.fact.seat', { minutes: String(Math.round(ROOM_SEAT_DISCONNECT_TTL_MS / 60000)) }],
    ['rematch', 'docs.mp.fact.migrate', { seconds: seconds(ROOM_HOST_DISCONNECT_GRACE_MS) }],
    ['crewCommander', 'docs.mp.fact.admin', { seconds: seconds(ROOM_ADMIN_DISCONNECT_GRACE_MS) }],
    ['clock', 'docs.mp.fact.idle', { hours: String(Math.round(ROOM_IDLE_TTL_MS / 3600000)) }],
    ['player', 'docs.mp.fact.chat', { history: String(ROOM_CHAT_HISTORY), chars: String(ROOM_CHAT_MAX_CHARS) }],
  ];
  return `<ul class="dm-roles dm-roles--rows">${rows.map(([glyph, key, values]) => `<li>${icon(glyph, { size: 20 })}<div><p>${esc(t(key, values))}</p></div></li>`).join('')}</ul>`;
}

export function multiplayerSections(): RichSection[] {
  const sections: Array<[string, string, string]> = [
    ['rooms', t('docs.mp.rooms'), waysSection()],
    ['seats', t('docs.mp.seats'), seatsSection()],
    ['modes', t('docs.mp.modes'), modesSection()],
    ['start', t('docs.mp.start'), startSection()],
    ['leaving', t('docs.mp.leaving'), leavingSection()],
    ['fair', t('docs.mp.fair'), p('docs.mp.fairHost') + p('docs.mp.fairSpotting')],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(html) }));
}
