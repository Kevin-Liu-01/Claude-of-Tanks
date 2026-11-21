/**
 * armourOverlayTip.ts — the one-time tip that armour colours are on (273). Copyright © 2026 Kevin B. Liu.
 *
 * Shown once per profile, at the first battle's rollout after the colours were turned on for everyone
 * (game/armourOverlayDefault.ts): a toast in the battle's notice region (ui/battleNotices.ts). It is one short line and
 * the colours' meaning, with a picture of them on the right (owner 2026-11-20, mobile-hud-274: "make this notification a
 * lot smaller and have an image or something in the notification part maybe on right that shows what it is"): a hull in
 * the sight, its plates in the overlay's own colours (game/armorShadeColors.ts). Where the colours have a key on the
 * player's hands the line says it hides them and the tip has no close (it goes by its time); where to turn them off in
 * Settings (named as Settings names them) is the picture's label, for a screen reader and as its tooltip under a mouse. main.ts loads this module only when the tip is
 * due, so no other boot and no other battle pays for it.
 */
import { t } from './i18n.ts';
import { battleNotices } from './battleNotices.ts';
import { ARMOR_SHADE_EDGE, ARMOR_SHADE_PASSES, ARMOR_SHADE_STOPS } from '../game/armorShadeColors.ts';

const TIP_ID = 'cot-armour-overlay-tip';
const TIP_MS = 12_000;

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** A tank head-on in the gunner's sight, 64 x 48: its turret and mantlet stop the round (red), its glacis and lower
 *  plate take it (green), its skirts are at the edge (amber), as the overlay paints a hull in the sight. */
function shadedHull(): string {
  const stops = hex(ARMOR_SHADE_STOPS), edge = hex(ARMOR_SHADE_EDGE), passes = hex(ARMOR_SHADE_PASSES);
  const plate = (points: string, fill: string) =>
    `<polygon points="${points}" fill="${fill}" fill-opacity=".9" stroke="#05080b" stroke-opacity=".55" stroke-width=".7"/>`;
  return '<svg viewBox="0 0 64 48" width="64" height="48" aria-hidden="true" focusable="false">'
    + '<rect width="64" height="48" rx="3" fill="#0b1116"/>'
    + '<path d="M32 4V12M32 44V40M4 24H9M60 24H55" stroke="#f6f3ec" stroke-opacity=".35" stroke-width="1"/>'
    + plate('4,41 12,41 12,31 6,31', edge) + plate('60,41 52,41 52,31 58,31', edge)
    + plate('12,41 52,41 50,34 14,34', passes)
    + plate('14,34 50,34 45,26 19,26', passes)
    + plate('20,26 44,26 40,16 24,16', stops)
    + plate('28,25 36,25 35,18 29,18', stops)
    + '<circle cx="32" cy="21" r="1.8" fill="#05080b"/>'
    + '<circle cx="32" cy="24" r="17" fill="none" stroke="#f6f3ec" stroke-opacity=".18" stroke-width="1"/>'
    + '</svg>';
}

export function showArmourOverlayTip(control: { readonly key: string | null }): void {
  const path = `${t('settings.title')} › ${t('settings.tab.gameplay')} › ${t('settings.interface.armorOverlay')}`;
  battleNotices.show({
    id: TIP_ID,
    severity: 'info',
    icon: 'armorFlashlight',
    className: 'cot-armour-tip',
    text: t('hud.tip.armorOverlayOn.text'),
    detail: control.key ? t('hud.tip.armorOverlayOn.detailKey', { key: control.key }) : t('hud.tip.armorOverlayOn.legend'),
    media: { svg: shadedHull(), label: t('hud.tip.armorOverlayOn.detailSettings', { path }) },
    durationMs: TIP_MS,
    // (owner 2026-11-20: "in desktop/laptop views, dont show the x") with the colours' key on the player's hands the tip
    // closes by its time and the key says how to hide them; a phone and a pad, with no key, keep the close
    dismissible: !control.key,
  });
}
