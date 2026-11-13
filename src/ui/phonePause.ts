/**
 * A phone's Pause (round 8 Y4 s3-05): one rule for every phone that pauses a battle, the single pairing's
 * (src/ui/settings.ts) and each couch seat's (src/main.ts). A press opens the settings menu, or closes it with no pointer
 * relock: a phone's resume never asks the desktop for the pointer without a gesture there (a refused request raised the
 * click-to-resume veil over the shared screen, and no phone could clear it). Each port keeps its own guard (`canPause`).
 */
export interface PhonePauseSettings {
  isOpen(): boolean;
  open(): void;
  close(options: { noRelock: true }): void;
}

/** One phone pause press: nothing outside `canPause`; else open the menu, or close it with no relock. */
export function togglePhonePause(settings: PhonePauseSettings, canPause: () => boolean): void {
  if (!canPause()) return;
  if (settings.isOpen()) settings.close({ noRelock: true });
  else settings.open();
}
