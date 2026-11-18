/**
 * armourOverlayTip.ts — the one-time tip that armour colours are on (273). Copyright © 2026 Kevin B. Liu.
 *
 * Shown once per profile, at the first battle's rollout after the colours were turned on for everyone
 * (game/armourOverlayDefault.ts): a toast in the battle's notice region (ui/battleNotices.ts) that names the feature as
 * Settings does, says what the colours mean, and how to turn them off: the player's own key, or, where the colours have
 * no control on the player's hands yet (a pad, a touch layout), the Settings row. main.ts loads this module only when the
 * tip is due, so no other boot and no other battle pays for it.
 */
import { t } from './i18n.ts';
import { battleNotices } from './battleNotices.ts';

const TIP_ID = 'cot-armour-overlay-tip';
const TIP_MS = 12_000;

export function showArmourOverlayTip(control: { readonly key: string | null }): void {
  const path = `${t('settings.title')} › ${t('settings.tab.gameplay')} › ${t('settings.interface.armorOverlay')}`;
  battleNotices.show({
    id: TIP_ID,
    severity: 'info',
    icon: 'armorFlashlight',
    text: t('hud.tip.armorOverlayOn.text'),
    detail: control.key ? t('hud.tip.armorOverlayOn.detailKey', { key: control.key })
      : t('hud.tip.armorOverlayOn.detailSettings', { path }),
    durationMs: TIP_MS,
    dismissible: true,
  });
}
