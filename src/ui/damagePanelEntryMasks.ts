/**
 * damagePanelEntryMasks.ts — covered battle entry and the player's top-down masks (2026-10-09, the black-screen lane).
 *
 * Solo and network covered entries wait for the damage panel's real top-down masks before the reveal (2026-09-30: the
 * panel never shows a generic stand-in). Those masks wait at most 5 s for their programs to link
 * (topMaskProgramWarm.ts), and a loaded machine links a cold tank's programs for longer: production 207 refused that
 * entry outright ("Player top-down view could not be prepared"; a cold Verdant entry at load 84, and the network
 * rejoin of the 207 multiplayer check). The panel is HUD, not the battlefield, so a slow link no longer refuses the
 * battle: the entry still waits for the masks, then goes on, and the panel's own retry ladder
 * (damagePanel.ts DAMAGE_PANEL_MASK_RETRY) paints the schematic once its programs link. An exception from the panel
 * (a wiring fault, not a slow link) still belongs to covered entry recovery.
 */
import type { DamagePanelController } from './damagePanel.ts';

type EntryPanel = Pick<DamagePanelController, 'prepareTankMasks'>;
type EntryPanelSpec = Parameters<DamagePanelController['prepareTankMasks']>[0];
type EntryPanelVisual = Parameters<DamagePanelController['prepareTankMasks']>[1];

/** Wait for the masks; true when they are painted, false when the reveal goes on and the panel finishes them. */
export async function prepareEntryPanelMasks(
  panel: EntryPanel,
  spec: EntryPanelSpec,
  visual: EntryPanelVisual,
  onDeferred: (specId: string) => void,
): Promise<boolean> {
  const ready = await panel.prepareTankMasks(spec, visual ?? null);
  if (ready) return true;
  try { onDeferred(spec.id); } catch { /* a diagnostic sink never changes the entry */ }
  return false;
}
