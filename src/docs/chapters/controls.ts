// The Field Manual's controls chapter. Copyright © 2026 Kevin B. Liu.
// The keys are the game's own (the phone controller's, the replay viewer's and photo mode's from their owners, below): every action, its group and its default key from src/game/input.ts (ACTION_DEFS,
// DEFAULT_BINDINGS, the gamepad map), named as the settings panel names them (labelForCode, the action.* copy). Watch
// mode's keys follow src/game/watchController.ts (docs/chapters/controls.selftest.mjs holds the two in step) and its
// numbers come from src/engine/watchCamera.ts and WATCH_RULES. Node only: tools/docs-prerender.mjs runs it (it reads
// the camera module, which brings three.js; no page imports this file).
import {
  ACTION_DEFS, DEFAULT_BINDINGS, DEFAULT_BINDINGS2, DEFAULT_PAD_BINDINGS, labelForCode, labelForPadButton, type ActionId,
} from '../../game/input.ts';
import { WATCH_DRONE, WATCH_RIDE } from '../../engine/watchCamera.ts';
import { WATCH_RULES } from '../../sim/matchRuleset.ts';
import { REPLAY_SPEEDS, JUMP_S } from '../../game/replay/replayPlayback.ts';
import { REPLAY_KEEP } from '../../game/replay/replayStore.ts';
import { MARK_LEAD_S } from '../../game/replay/replayTimeline.ts';
import { REPLAY_FILM_RATES, REPLAY_FILM_SIZES } from '../../game/replay/replayFilm.ts';
import { PHOTO_LENSES_MM } from '../../engine/photoCamera.ts';
import { PAD_CODE_LENGTH, PAD_CODE_TTL_MS, PAD_PAIR_MAX_MS } from '../../pad/padProtocol.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { getLocale, t } from '../../ui/i18n.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import type { RichSection } from './types.ts';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
/** An arrow key's cap draws the sprite's arrow (named for assistive tech), as the Settings panel does. */
const ARROW_KEYS: Readonly<Record<string, readonly [IconId, string]>> = {
  '↑': ['moveForward', 'settings.bind.arrowUp'], '↓': ['moveBack', 'settings.bind.arrowDown'],
  '←': ['steerLeft', 'settings.bind.arrowLeft'], '→': ['steerRight', 'settings.bind.arrowRight'],
};
const kbd = (label: string): string => {
  const arrow = ARROW_KEYS[label];
  // a Chinese key cap (空格, 左键) is a word, set at the zh floor; a Latin one is a figure (docs.css .cot-c-kbd[data-cjk])
  return arrow ? `<kbd class="cot-c-kbd" aria-label="${esc(t(arrow[1]))}">${icon(arrow[0], { size: 12 })}</kbd>`
    : `<kbd class="cot-c-kbd"${/[\u3400-\u9fff]/.test(label) ? ' data-cjk' : ''}>${esc(label)}</kbd>`;
};

/** The settings panel's groups, in its order, each with its icon. */
const GROUP_ICONS: Readonly<Record<string, IconId>> = {
  'settings.group.movement': 'vehicle',
  'settings.group.combat': 'fireGun',
  'settings.group.consumables': 'repair',
  'settings.group.camera': 'scope',
  'settings.group.interface': 'settings',
};

/** One action's keys: its primary and alternate key, and its gamepad button. */
function keysOf(id: ActionId): { readonly keys: string[]; readonly pad: string | null } {
  const keys = [DEFAULT_BINDINGS[id], DEFAULT_BINDINGS2[id]].filter((code): code is string => !!code).map((code) => labelForCode(code));
  const button = DEFAULT_PAD_BINDINGS[id];
  return { keys, pad: button == null ? null : labelForPadButton(button) };
}

/** The keyboard, mouse and gamepad table: every action the settings panel lists, grouped as it groups them. */
function bindingTables(): string {
  const groups = [...new Set(ACTION_DEFS.map((action) => action.group))];
  return groups.map((group) => {
    const rows = ACTION_DEFS.filter((action) => action.group === group).map((action) => {
      const { keys, pad } = keysOf(action.id);
      return `<tr><th scope="row">${esc(t(action.label))}</th><td>${keys.map(kbd).join(' ') || '–'}</td><td>${pad ? kbd(pad) : '–'}</td></tr>`;
    }).join('');
    return `<div class="dm-keys"><h3>${icon(GROUP_ICONS[group] ?? 'settings', { size: 18 })}<span>${esc(t(group))}</span></h3>`
      + `<div class="dm-table" tabindex="0" role="region" aria-label="${esc(t(group))}"><table><thead><tr>`
      + `<th scope="col">${esc(t('docs.controls.col.action'))}</th><th scope="col">${esc(t('docs.controls.col.keys'))}</th>`
      + `<th scope="col">${esc(t('docs.controls.col.pad'))}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join('');
}

/** Watch mode's keys, as src/game/watchController.ts handles them (the selftest greps each code there). */
export const WATCH_KEYS: ReadonlyArray<{ readonly codes: readonly string[]; readonly label: string; readonly view: 'drone' | 'ride' | 'drive' }> = [
  { codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], label: 'docs.controls.watch.fly', view: 'drone' },
  { codes: ['Space', 'KeyC'], label: 'docs.controls.watch.climb', view: 'drone' },
  { codes: ['ShiftLeft'], label: 'docs.controls.watch.boost', view: 'drone' },
  { codes: ['WheelUp', 'WheelDown'], label: 'docs.controls.watch.speed', view: 'drone' },
  { codes: ['KeyF'], label: 'docs.controls.watch.rideCentre', view: 'ride' },
  { codes: ['KeyQ', 'KeyE'], label: 'docs.controls.watch.cycle', view: 'ride' },
  { codes: ['ShiftLeft'], label: 'docs.controls.watch.sight', view: 'ride' },
  { codes: ['KeyV'], label: 'docs.controls.watch.toDrone', view: 'ride' },
  { codes: ['Enter'], label: 'docs.controls.watch.take', view: 'drive' },
];

// the ride-along on Verdant Fields, desktop and phone (public/media/ui-246, the media lane's interface set)
const WATCH_STILL = '/media/ui-246/watch-1440.webp';
const WATCH_PHONE_STILL = '/media/ui-246/watch-mobile.webp';

function watchSection(): string {
  const values = {
    speeds: WATCH_DRONE.speeds.join(' / '),
    start: String(WATCH_DRONE.speeds[WATCH_DRONE.speedIndex]),
    boost: String(WATCH_DRONE.boostScale),
    zooms: WATCH_RIDE.zooms.map((zoom) => `×${zoom}`).join(' / '),
    altitude: String(WATCH_RULES.openAltitudeM),
    death: String(WATCH_RULES.takenDeathS),
  };
  const views: Array<['drone' | 'ride' | 'drive', IconId]> = [['drone', 'modeDrone'], ['ride', 'vehicle'], ['drive', 'steerLeft']];
  const cards = views.map(([view, glyph]) => {
    const keys = WATCH_KEYS.filter((key) => key.view === view).map((key) => `<li>${key.codes.map((code) => kbd(labelForCode(code))).join(' ')}`
      + `<span>${esc(t(key.label))}</span></li>`).join('');
    return `<article class="dm-view"><h3>${icon(glyph, { size: 20 })}<span>${esc(t(`docs.controls.watch.${view}.title`))}</span></h3>`
      + `<p>${esc(t(`docs.controls.watch.${view}.body`, values))}</p><ul class="dm-keylist">${keys}</ul></article>`;
  }).join('');
  // riding a tank with the Watch bar on top, on a desktop and on a phone, side by side at one height
  const ride = `<div class="dm-watch-shots"><figure class="dm-figure">${pictureMarkup({ src: WATCH_STILL, width: 1440, height: 900,
    alt: t('docs.controls.watch.rideAlt'), sizes: '(width < 768px) 100vw, 580px' }, false)}</figure>`
    + `<figure class="dm-figure dm-figure--phone">${pictureMarkup({ src: WATCH_PHONE_STILL, width: 780, height: 1688,
      alt: t('docs.controls.watch.phoneAlt'), sizes: '(width < 768px) 70vw, 170px' }, false)}</figure></div>`;
  return `<p>${esc(t('docs.controls.watch.lede', { modes: String(WATCH_RULES.modes.length) }))}</p><div class="dm-views">${cards}</div>${ride}`;
}

/** The battle on a phone (the mechanics still of the touch layout). */
function touchFigure(): string {
  // the touch HUD on a phone in portrait (public/media/docs-r1 controls-touch)
  const src = '/media/docs-r1/controls-touch-1920.webp';
  return `<figure class="dm-figure dm-figure--phone">${pictureMarkup({ src, width: 887, height: 1920, alt: t('docs.controls.touchAlt'), sizes: '(width < 768px) 70vw, 320px',
    rungs: [{ src: '/media/docs-r1/controls-touch-640.webp', width: 296 }, { src, width: 887 }] }, false)}</figure>`;
}

/** A catalog line whose {placeholders} take markup (key caps) or text: the line itself is escaped. */
function line(key: string, values: Readonly<Record<string, string>>, markup: Readonly<Record<string, string>> = {}): string {
  const tokens = Object.fromEntries(Object.keys(markup).map((name, i) => [name, `\u0000${i}\u0000`]));
  let text = esc(t(key, { ...values, ...tokens }));
  Object.values(markup).forEach((html, i) => { text = text.split(`\u0000${i}\u0000`).join(html); });
  return text;
}

/** The phone controller: pairing from Settings, and what the phone's screen holds (src/pad/: padProtocol.ts's code and
 *  pairing limits, padLayout.ts's zones; the settings card is src/ui/settings.ts settings.phone.*). */
function phoneSection(): string {
  const steps = [
    esc(t('docs.controls.phone.step.open', { settings: t('settings.title'), tab: t('settings.tab.controls'), card: t('settings.phone.title'),
      connect: t('settings.phone.connect') })),
    esc(t('docs.controls.phone.step.scan', { length: String(PAD_CODE_LENGTH), minutes: String(Math.round(PAD_CODE_TTL_MS / 60000)) })),
    esc(t('docs.controls.phone.step.hold')),
  ];
  const facts = ['docs.controls.phone.link', 'docs.controls.phone.safe'].map((key) => `<li>${esc(t(key))}</li>`).join('')
    + `<li>${esc(t('docs.controls.phone.life', { hours: String(Math.round(PAD_PAIR_MAX_MS / 3600000)) }))}</li>`;
  return `<p>${esc(t('docs.controls.phone.lede'))}</p>`
    + `<ol class="dm-steps">${steps.map((body, i) => `<li><span class="dm-steps__n">${i + 1}</span><p>${body}</p></li>`).join('')}</ol>`
    + `<ul class="dm-facts">${facts}</ul>`;
}

/** The replay viewer's keys, as src/game/replay/replayPlayback.ts replayKeyAction reads them (controls.selftest.mjs holds
 *  the two in step); Escape leaves (src/app/replayViewerRuntime.ts). */
export const REPLAY_KEYS: ReadonlyArray<{ readonly codes: readonly string[]; readonly label: string }> = [
  { codes: ['Space'], label: 'docs.controls.replays.key.play' },
  { codes: ['ArrowLeft', 'ArrowRight'], label: 'docs.controls.replays.key.jump' },
  { codes: ['Comma', 'Period'], label: 'docs.controls.replays.key.frame' },
  { codes: ['BracketLeft', 'BracketRight'], label: 'docs.controls.replays.key.mark' },
  { codes: REPLAY_SPEEDS.map((_, i) => `Digit${i + 1}`), label: 'docs.controls.replays.key.speed' },
  { codes: ['Escape'], label: 'docs.controls.replays.key.leave' },
];

/** Replays: where they are, what is kept, the viewer's keys and the video export (src/game/replay/, src/ui/replayBar.ts,
 *  src/ui/replayFilmDialog.ts; the end screen's and the Garage Record's own button names). */
function replaysSection(): string {
  const speeds = REPLAY_SPEEDS.map((speed) => `×${speed}`).join(' / ');
  const or = (items: string[]): string => new Intl.ListFormat(getLocale(), { type: 'disjunction' }).format(items);
  const keys = REPLAY_KEYS.map((key) => {
    const caps = key.label.endsWith('.speed') ? `${kbd(labelForCode(key.codes[0]))}–${kbd(labelForCode(key.codes[key.codes.length - 1]))}`
      : key.codes.map((code) => kbd(labelForCode(code))).join(' ');
    return `<li>${caps}<span>${esc(t(key.label, { seconds: String(JUMP_S), speeds }))}</span></li>`;
  }).join('');
  const where = esc(t('docs.controls.replays.where', { watch: t('endScreen.watchReplay'), download: t('endScreen.downloadReplay'),
    record: t('garage.nav.record'), replays: t('garage.record.tab.replays'), keep: String(REPLAY_KEEP) }));
  const facts = [
    t('docs.controls.replays.what'),
    t('docs.controls.replays.which'),
    t('docs.controls.replays.open', { open: t('garage.record.replayOpen') }),
  ].map((fact) => `<li>${esc(fact)}</li>`).join('');
  const view = esc(t('docs.controls.replays.view', { seconds: String(MARK_LEAD_S) }));
  const film = esc(t('docs.controls.replays.export', { export: t('replay.export.open'),
    sizes: or(REPLAY_FILM_SIZES.map((size) => size.id)), rates: or(REPLAY_FILM_RATES.map(String)) }));
  return `<p>${where}</p><ul class="dm-facts">${facts}</ul><ul class="dm-keylist">${keys}</ul><p>${view}</p><p>${film}</p>`;
}

/** Photo mode in a solo battle (src/game/battlePhotoMode.ts, src/ui/photoMode.ts, src/engine/photoCamera.ts). */
function photoSection(): string {
  const views = ['hero', 'front', 'side', 'rear', 'top'].map((view) => t(`photo.view.${view}`)).join(', ');
  const open = line('docs.controls.photo.open', { photo: t('photo.open') }, { key: kbd(labelForCode(DEFAULT_BINDINGS.photoMode ?? 'KeyP')) });
  const frame = esc(t('docs.controls.photo.frame', { views, lenses: PHOTO_LENSES_MM.join(' / '), save: t('photo.save') }));
  const keys: Array<[string[], string]> = [
    [['KeyW', 'KeyA', 'KeyS', 'KeyD'], 'docs.controls.photo.key.orbit'],
    [['KeyR', 'KeyF'], 'docs.controls.photo.key.zoom'],
    [['KeyQ', 'KeyE'], 'docs.controls.photo.key.roll'],
    [['Escape'], 'docs.controls.photo.key.exit'],
  ];
  const list = keys.map(([codes, key]) => `<li>${codes.map((code) => kbd(labelForCode(code))).join(' ')}<span>${esc(t(key))}</span></li>`).join('');
  // the way back is the way in (settings-unify-278): opened by its key, Esc returns to the running battle; opened by
  // Settings' Photo button, to the paused Settings (tools/photo-mode-gauntlet.browser.mjs proves both)
  const back = line('docs.controls.photo.back', { photo: t('photo.open') },
    { esc: kbd(labelForCode('Escape')), key: kbd(labelForCode(DEFAULT_BINDINGS.photoMode ?? 'KeyP')) });
  return `<p>${open}</p><p>${frame}</p><ul class="dm-keylist">${list}</ul><p>${back}</p>`
    + `<p>${esc(t('docs.controls.photo.pointer'))}</p><p>${esc(t('docs.controls.photo.where'))}</p>`;
}

/** Hold or toggle: the actions the Accessibility settings can switch (the in-game names). Aim / free look's is its Right
 *  click mode on Controls (item 259: one datum, one place). */
const SWITCHABLE: readonly ActionId[] = ['fire', 'handbrake', 'freeLook'];

/** The key that switches the minimal battle HUD: the input layer's hideBattleUi default (settings-unify-278 made it a
 *  rebindable action; src/ui/battleUiVisibility.ts reads the binding). */
export const MINIMAL_HUD_KEY = DEFAULT_BINDINGS.hideBattleUi ?? 'F10';

/** Your HUD: the layout editor and the minimal HUD, by the settings panel's own names. */
function hudSection(): string {
  const layout = esc(t('docs.controls.hud.layout', {
    settings: t('settings.title'), tab: t('settings.tab.interface'), edit: t('hudEditor.open'),
    desktop: t('hudEditor.desktop'), portrait: t('hudEditor.portrait'), landscape: t('hudEditor.landscape'),
  }));
  // the key cap goes in after escaping: the copy names it as {key}
  const minimal = esc(t('docs.controls.hud.minimal', { key: '\u0000' })).replace('\u0000', kbd(labelForCode(MINIMAL_HUD_KEY)));
  const setting = esc(t('docs.controls.hud.setting', { setting: t('settings.interface.hideBattleUi') }));
  return `<ul class="dm-roles dm-roles--rows"><li>${icon('settings', { size: 20 })}<div><p>${layout}</p></div></li>`
    + `<li>${icon('scope', { size: 20 })}<div><p>${minimal}</p></div></li>`
    + `<li>${icon('phone', { size: 20 })}<div><p>${setting}</p></div></li></ul>`;
}

export function controlsSections(): RichSection[] {
  const sections: Array<[string, string, string]> = [
    ['keys', t('docs.controls.keys'), bindingTables()],
    ['hold', t('docs.controls.hold'), `<p>${esc(t('docs.controls.holdLede'))}</p><ul class="dm-chips">`
      + `${SWITCHABLE.map((id) => `<li>${esc(t(ACTION_DEFS.find((action) => action.id === id)?.label ?? id))}</li>`).join('')}`
      + `<li>${esc(t('docs.controls.holdRoster'))}</li></ul>`],
    ['touch', t('docs.controls.touch'), `<p>${esc(t('docs.controls.touchLede'))}</p><div class="dm-touch">${touchFigure()}<ul class="dm-keylist">`
      + ['move', 'aim', 'fire', 'scope', 'zoom', 'autoAim', 'jump'].map((gesture) => `<li><span>${esc(t(`docs.controls.touch.${gesture}`))}</span></li>`).join('')
      + '</ul></div>'],
    ['phone', t('docs.controls.phone'), phoneSection()],
    ['watch', t('docs.controls.watch'), watchSection()],
    ['replays', t('docs.controls.replays'), replaysSection()],
    ['photo', t('docs.controls.photo'), photoSection()],
    ['hud', t('docs.controls.hud'), hudSection()],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(html) }));
}
