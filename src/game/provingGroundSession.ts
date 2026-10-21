/**
 * The proving ground / test drive's launch and session controls (v2 progression, owner 2026-10-17: "build out all the
 * options": proving ground / test drive). Boot-light and DOM-free: the ruleset table and the arrangement store are
 * already in the Garage's graph. The Gallery's link into a test drive is game/testDriveLink.ts.
 *
 *  - The Garage dossier (and a Gallery link, once the Garage is ready) launches a test drive through the Garage's battle
 *    entry with sim/matchRuleset.ts TEST_DRIVE: the mode and its battlefield.
 *  - In the battle, reset (every hull on its mark) and the moving-target switch reach game/state.ts through the
 *    controls below; the switch is remembered as the mode's arrangement for the next test drive.
 */
import { TEST_DRIVE } from '../sim/matchRuleset.ts';
import { writeTeamArrangement } from './teamArrangement.ts';

/** The launch a test drive of `specId` makes: the Garage's battle entry with the proving ground's mode and field. */
export function testDriveLaunch(specId: string): { readonly specId: string; readonly mapId: string; readonly gameMode: typeof TEST_DRIVE.gameMode } {
  return Object.freeze({ specId, mapId: TEST_DRIVE.mapId, gameMode: TEST_DRIVE.gameMode });
}

interface ArrangementStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ProvingControlsOptions {
  /** A proving-ground battle is running in this page (solo, in battle, no verdict). */
  active(): boolean;
  /** game/state.ts resetProvingRange: true when the range was reset. */
  reset(): boolean;
  /** game/state.ts setProvingTargetsMoving: true when the switch applied. */
  setMoving(moving: boolean): boolean;
  /** The running range's moving-target switch. */
  moving(): boolean;
  storage?: ArrangementStorage | null;
}

interface ProvingControls {
  reset(): boolean;
  toggleMoving(): boolean;
}

/** The two range controls, inert outside a proving-ground battle (the keys stay free for every other battle). */
export function createProvingControls(options: ProvingControlsOptions): ProvingControls {
  return {
    reset: () => options.active() && options.reset(),
    toggleMoving: () => {
      if (!options.active()) return false;
      const next = !options.moving();
      if (!options.setMoving(next)) return false;
      writeTeamArrangement(TEST_DRIVE.gameMode, next ? { movingTargets: true } : null, options.storage);
      return true;
    },
  };
}
