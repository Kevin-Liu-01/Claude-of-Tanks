// The Field Manual's controls chapter. Copyright © 2026 Kevin B. Liu.
// The keys are the game's own: every action, its group and its default key from src/game/input.ts (ACTION_DEFS,
// DEFAULT_BINDINGS, the gamepad map), named as the settings panel names them (labelForCode, the action.* copy). Watch
// mode's keys follow src/game/watchController.ts (docs/chapters/controls.selftest.mjs holds the two in step) and its
// numbers come from src/engine/watchCamera.ts and WATCH_RULES. Node only: tools/docs-prerender.mjs runs it (it reads
// the camera module, which brings three.js; no page imports this file).
import {
  ACTION_DEFS, DEFAULT_BINDINGS, DEFAULT_BINDINGS2, DEFAULT_PAD_BINDINGS, labelForCode, labelForPadButton, type ActionId,
} from '../../game/input.ts';
import { WATCH_DRONE, WATCH_RIDE } from '../../engine/watchCamera.ts';
import { WATCH_RULES } from '../../sim/matchRuleset.ts';
import { icon, type IconId } from '../../ui/icons/icon.ts';
import { t } from '../../ui/i18n.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import type { RichSection } from './types.ts';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const kbd = (label: string): string => `<kbd class="cot-c-kbd">${esc(label)}</kbd>`;

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
      return `<tr><th scope="row">${esc(t(action.label))}</th><td>${keys.map(kbd).join(' ') || '—'}</td><td>${pad ? kbd(pad) : '—'}</td></tr>`;
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
  { codes: ['Tab', 'KeyQ', 'KeyE'], label: 'docs.controls.watch.cycle', view: 'ride' },
  { codes: ['ShiftLeft'], label: 'docs.controls.watch.sight', view: 'ride' },
  { codes: ['KeyV'], label: 'docs.controls.watch.toDrone', view: 'ride' },
  { codes: ['Enter'], label: 'docs.controls.watch.take', view: 'drive' },
];

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
  return `<p>${esc(t('docs.controls.watch.lede', { modes: String(WATCH_RULES.modes.length) }))}</p><div class="dm-views">${cards}</div>`;
}

/** The battle on a phone (the mechanics still of the touch layout). */
function touchFigure(): string {
  const src = '/media/site50-r14/home/mechanics/mobile.webp';
  return `<figure class="dm-figure">${pictureMarkup({ src, width: 1280, height: 720, alt: t('docs.controls.touchAlt'), sizes: '(width < 1100px) 100vw, 60vw',
    rungs: [{ src: '/media/site50-r14/home/mechanics/mobile-640.webp', width: 640 }, { src, width: 1280 }] }, false)}</figure>`;
}

/** Hold or toggle: the actions the Accessibility settings can switch (the in-game names). */
const SWITCHABLE: readonly ActionId[] = ['fire', 'handbrake', 'freeLook', 'freeCamera'];

export function controlsSections(): RichSection[] {
  const sections: Array<[string, string, string]> = [
    ['keys', t('docs.controls.keys'), `<p>${esc(t('docs.controls.keysLede'))}</p>${bindingTables()}`],
    ['hold', t('docs.controls.hold'), `<p>${esc(t('docs.controls.holdLede'))}</p><ul class="dm-chips">`
      + `${SWITCHABLE.map((id) => `<li>${esc(t(ACTION_DEFS.find((action) => action.id === id)?.label ?? id))}</li>`).join('')}`
      + `<li>${esc(t('docs.controls.holdRoster'))}</li></ul>`],
    ['touch', t('docs.controls.touch'), `<p>${esc(t('docs.controls.touchLede'))}</p>${touchFigure()}<ul class="dm-keylist">`
      + ['move', 'aim', 'fire', 'scope', 'zoom', 'autoAim', 'jump'].map((gesture) => `<li><span>${esc(t(`docs.controls.touch.${gesture}`))}</span></li>`).join('')
      + '</ul>'],
    ['watch', t('docs.controls.watch'), watchSection()],
  ];
  return sections.map(([id, title, html]) => ({ id, title, html, text: plain(html) }));
}
