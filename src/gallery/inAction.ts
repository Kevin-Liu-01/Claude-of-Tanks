/**
 * inAction.ts — the dossier's take: the selected vehicle's own newest take (src/ui/fleetTakes.ts) as the dossier's hero
 * media (brand-ui SPEC 12.5: the take at the top of the dossier, poster first, one at a time, stops on tank change).
 *
 * gallery.ts loads this module once the first tank is on screen, and the fleet index loads with it. Until then, and
 * for a vehicle the index lacks, the frame keeps the vehicle's hero card. With a take the frame shows its poster, plays
 * its silent loop only while the frame is visible, and stops the moment another vehicle is selected. The take's title
 * is the frame's accessible name; its Studio link opens the take's scene as a preset (/studio?scene=,
 * src/game/studioSceneLink.ts).
 */
import { createFleetTakePlayer, fleetTakeStudioHref, fleetTakeText, loadFleetTakes } from '../ui/fleetTakes.ts';
import { icon } from '../ui/icons/icon.ts';
import { t } from '../ui/i18n.ts';

export interface InActionBlock {
  /** Show this vehicle's take, or none (null: a vehicle is being replaced). */
  show(vehicleId: string | null): void;
  /** The vehicles that have a take, once the fleet index has loaded. */
  readonly ids: Promise<ReadonlySet<string>>;
}

export function mountInAction(frame: HTMLElement, actions: HTMLElement): InActionBlock {
  const player = createFleetTakePlayer(frame);
  const studio = document.createElement('a');
  studio.className = 'take-studio';
  studio.hidden = true;
  const studioLabel = t('gallery.dossier.inAction.studio');
  studio.setAttribute('aria-label', studioLabel);
  studio.innerHTML = icon('studio', { size: 18 });
  actions.append(studio);

  const takes = loadFleetTakes();
  let current: string | null = null;
  return {
    ids: takes.then((index) => new Set(index.keys())),
    show(vehicleId) {
      current = vehicleId;
      if (!vehicleId) {
        player.show(null);
        frame.classList.remove('has-take');
        frame.removeAttribute('aria-label');
        studio.hidden = true;
        return;
      }
      void takes.then((index) => {
        if (current !== vehicleId) return; // another vehicle was selected while the index loaded
        const take = index.get(vehicleId) ?? null;
        player.show(take);
        frame.classList.toggle('has-take', !!take);
        if (take) {
          frame.setAttribute('aria-label', fleetTakeText(take, 'title'));
          studio.href = fleetTakeStudioHref(take);
        } else {
          frame.removeAttribute('aria-label');
          studio.removeAttribute('href');
        }
        studio.hidden = !take;
      });
    },
  };
}
