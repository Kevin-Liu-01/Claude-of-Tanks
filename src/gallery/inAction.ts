/**
 * inAction.ts — the dossier's "In action" block: the selected vehicle's own take (src/ui/fleetTakes.ts), between the
 * technical summary and the articulation controls.
 *
 * gallery.ts loads this module once the first tank is on screen, and the fleet index loads with it. The block stays
 * hidden for a vehicle the index lacks (and while the index is missing), shows the take's poster first, plays its
 * silent loop only while the block is visible, and stops the moment another vehicle is selected. Its caption is the
 * take's title; its link opens the take's scene in the Studio as a preset (/studio?scene=, src/game/studioSceneLink.ts).
 */
import { createFleetTakeFigure, loadFleetTakes } from '../ui/fleetTakes.ts';
import { t } from '../ui/i18n.ts';
import { getLocalizedMapName, isMapId } from '../world/maps/catalog.ts';

export interface InActionBlock {
  /** Show this vehicle's take, or hide the block (null: a vehicle is being replaced). */
  show(vehicleId: string | null): void;
}

export function mountInAction(host: HTMLElement): InActionBlock {
  const section = document.createElement('section');
  section.className = 'dossier-section fleet-take-section';
  section.hidden = true;
  section.setAttribute('aria-labelledby', 'fleetTakeHeading');
  const label = document.createElement('div');
  label.className = 'section-label';
  const heading = document.createElement('span');
  heading.id = 'fleetTakeHeading';
  heading.textContent = t('gallery.dossier.section.inAction');
  const place = document.createElement('small');
  label.append(heading, place);
  const figure = createFleetTakeFigure(t('gallery.dossier.inAction.studio'));
  section.append(label, figure.root);
  host.append(section);

  const takes = loadFleetTakes();
  let current: string | null = null;
  return {
    show(vehicleId) {
      current = vehicleId;
      if (!vehicleId) {
        figure.show(null);
        section.hidden = true;
        return;
      }
      void takes.then((index) => {
        if (current !== vehicleId) return; // another vehicle was selected while the index loaded
        const take = index.get(vehicleId) ?? null;
        figure.show(take);
        place.textContent = take && isMapId(take.map) ? getLocalizedMapName(take.map) : '';
        section.hidden = !take;
      });
    },
  };
}
