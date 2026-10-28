// The Field Manual's first chapter: a first battle, step by step. Copyright © 2026 Kevin B. Liu.
// The steps are a real order (the Garage, Deploy, driving, firing, winning), so they are numbered. Every key is the
// game's default (src/game/input.ts), every count and clock the game's own (src/productStats.ts, the ruleset, the map
// list, the consumable rules); the pictures are in-engine stills of the screens they describe. Node only
// (tools/docs-prerender.mjs).
import { DEFAULT_BINDINGS, labelForCode, type ActionId } from '../../game/input.ts';
import { CONSUMABLE_RULES } from '../../game/consumables.ts';
import { WATCH_RIDE } from '../../engine/watchCamera.ts';
import { matchRulesetFor, SIDES_PRESETS } from '../../sim/matchRuleset.ts';
import { PRODUCT_STATS } from '../../productStats.ts';
import { pictureMarkup } from '../../presentation/responsivePicture.ts';
import { hrefForLocale } from '../../ui/localeRouting.ts';
import { getLocale, t } from '../../ui/i18n.ts';
import { icon } from '../../ui/icons/icon.ts';
import type { RichSection } from './types.ts';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
// a Chinese key cap (空格, 左键) is a word, set at the zh floor (docs.css .cot-c-kbd[data-cjk])
const kbd = (id: ActionId): string => {
  const label = labelForCode(DEFAULT_BINDINGS[id] ?? null);
  return `<kbd class="cot-c-kbd"${/[\u3400-\u9fff]/.test(label) ? ' data-cjk' : ''}>${esc(label)}</kbd>`;
};

/** A catalog line whose {placeholders} take markup (keys) or text (numbers, names): the line itself is escaped. */
function line(key: string, values: Readonly<Record<string, string>>, markup: Readonly<Record<string, string>> = {}): string {
  const tokens = Object.fromEntries(Object.keys(markup).map((name, i) => [name, `\u0000${i}\u0000`]));
  let text = esc(t(key, { ...values, ...tokens }));
  Object.values(markup).forEach((html, i) => { text = text.split(`\u0000${i}\u0000`).join(html); });
  return text;
}

/** A step's screen: the media lane's capture of that moment on the current build (public/media/docs-r1, its manifest). */
const shot = (slot: string, alt: string): string => pictureMarkup({
  src: `/media/docs-r1/${slot}-1920.webp`, width: 1920, height: 1080, alt, sizes: '(width < 1100px) 100vw, 45vw',
  rungs: [{ src: `/media/docs-r1/${slot}-640.webp`, width: 640 }, { src: `/media/docs-r1/${slot}-1920.webp`, width: 1920 }],
}, false);

const KIT_NAMES: Readonly<Record<string, string>> = { repair: 'hud.consumable.repair', first_aid: 'hud.consumable.firstAid', extinguisher: 'hud.consumable.extinguisher' };

export function startSections(): RichSection[] {
  const kit = (id: string): { name: string; cooldown: string } => {
    const rule = CONSUMABLE_RULES.find((entry) => entry.id === id);
    return { name: t(KIT_NAMES[id]), cooldown: String(rule?.cooldownS ?? 0) };
  };
  const [repair, firstAid, extinguisher] = ['repair', 'first_aid', 'extinguisher'].map(kit);
  const sides = (preset: keyof typeof SIDES_PRESETS): string => t('docs.modes.sides', {
    allies: String(SIDES_PRESETS[preset].allies + 1), enemies: String(SIDES_PRESETS[preset].enemies),
  });
  const standard = matchRulesetFor('standard');
  const locale = getLocale();
  const steps: Array<[string, string, string]> = [
    ['garage', shot('start-garage', t('docs.start.garage.alt')),
      line('docs.start.garage.body', { tanks: String(PRODUCT_STATS.battlePlayableVehicles) })],
    ['deploy', shot('start-deploy', t('docs.start.deploy.alt')),
      // the battlefields counted as the manual's index counts them ({{COT_BATTLEFIELDS}}: the whole map list)
      line('docs.start.deploy.body', { modes: String(PRODUCT_STATS.battleModes), maps: String(PRODUCT_STATS.battlefields),
        small: sides('7v7'), large: sides('14v14') })],
    ['drive', shot('start-hud', t('docs.start.drive.alt')),
      line('docs.start.drive.body', { zooms: WATCH_RIDE.zooms.map((zoom) => `×${zoom}`).join(' / ') },
        { forward: kbd('forward'), left: kbd('left'), back: kbd('back'), right: kbd('right'), sight: kbd('sniperToggle'), hold: kbd('freeLook') })],
    ['fire', shot('start-sight', t('docs.start.fire.alt')),
      line('docs.start.fire.body', { repair: repair.name, repairS: repair.cooldown, firstAid: firstAid.name, firstAidS: firstAid.cooldown,
        extinguisher: extinguisher.name, extinguisherS: extinguisher.cooldown },
      { fire: kbd('fire'), shell1: kbd('shell1'), shell2: kbd('shell2'), shell3: kbd('shell3'), kit1: kbd('consumable1'), kit2: kbd('consumable2'), kit3: kbd('consumable3') })],
    ['win', shot('start-win', t('docs.start.win.alt')),
      line('docs.start.win.body', { minutes: String(Math.round((standard.timeLimitS ?? 0) / 60)) })],
  ];
  const sections: RichSection[] = steps.map(([id, figure, body], i) => {
    const html = `<div class="dm-step"><figure class="dm-step__figure">${figure}</figure><div class="dm-step__body">`
      + `<span class="dm-step__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><p>${body}</p></div></div>`;
    return { id, title: t(`docs.start.${id}.title`), html, text: plain(html) };
  });
  // where to go next: the chapters a new player reads after a first battle
  const next = ([['controls', 'interface'], ['modes', 'modes']] as const).map(([slug, glyph]) => `<a class="dm-next" href="${hrefForLocale(`/docs/${slug}`, locale)}">`
    + `${icon(glyph === 'interface' ? 'settings' : 'modeStandard', { size: 20 })}<b>${esc(t(`docs.topic.${slug}.label`))}</b>`
    + `<span>${esc(t(`docs.chapter.${slug}Lede`))}</span></a>`).join('');
  const html = `<div class="dm-nexts">${next}</div>`;
  sections.push({ id: 'next', title: t('docs.start.next.title'), html, text: plain(html) });
  return sections;
}
