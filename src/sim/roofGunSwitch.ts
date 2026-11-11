/**
 * The roof-gun switch law (round 2 U9, 2026-11-05): one reading for the sim (auxiliarySystems.ts requestAuxiliary,
 * stepRoofGun, stepRoofStation) and the HUD's B tile (ui/hud.ts). The switch is the crew's (and the bots') in every state.
 * A red roofGun module silences every station while the switch stays on, and refuses only the switch on; at the repair a
 * switched-on gun fires again with no second press. Before, the HUD read the switch alone, so its tile showed a red gun
 * as firing ('active', aria-pressed) while the sim kept it silent. No imports: the HUD reads this per frame.
 */
export type RoofGunSwitch = 'off' | 'on' | 'silenced';

/** The roof gun as the crew sees it: off, on (its stations may fire), or switched on but silenced by a red module. */
export function roofGunSwitch(gunOn: boolean | null | undefined, moduleState: string | null | undefined): RoofGunSwitch {
  return !gunOn ? 'off' : moduleState === 'red' ? 'silenced' : 'on';
}

/** Whether a press of the switch can act: any press but switching a red gun on. */
export function roofGunTogglable(gunOn: boolean | null | undefined, moduleState: string | null | undefined): boolean {
  return !!gunOn || moduleState !== 'red';
}
