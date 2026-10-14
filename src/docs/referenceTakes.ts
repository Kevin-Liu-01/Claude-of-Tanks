/**
 * referenceTakes.ts — each vehicle's own take in the field manual's fleet reference (owner 2026-10-12: "make a special
 * video for all tanks ... and use that everywhere"; src/ui/fleetTakes.ts).
 *
 * The manual has no page per vehicle: /docs/vehicles presents each one as a record of its reference (reference.ts),
 * which marks the record with the vehicle's spec id. The first time a record opens, the fleet-takes module and its
 * index load; a vehicle the index has gains an "In action" figure under its values (poster first, the silent loop
 * while the figure is on screen, the take's title and a link that opens its scene in the Studio). A vehicle the index
 * lacks shows nothing, and a closed record's loop stops with its figure off screen.
 */
import { t } from '../ui/i18n.ts';

let fleetTakes: Promise<typeof import('../ui/fleetTakes.ts')> | null = null;

async function showVehicleTake(record: HTMLElement): Promise<void> {
  const vehicle = record.dataset.vehicle;
  if (!vehicle || record.dataset.take) return;
  record.dataset.take = 'loading';
  try {
    const module = await (fleetTakes ??= import('../ui/fleetTakes.ts'));
    const take = (await module.loadFleetTakes()).get(vehicle);
    if (!take) {
      record.dataset.take = 'none';
      return;
    }
    const figure = module.createFleetTakeFigure(t('docs.reference.openStudio'));
    const label = document.createElement('span');
    label.className = 'manual-take-label';
    label.textContent = t('docs.reference.inAction');
    figure.root.classList.add('manual-take');
    figure.root.prepend(label);
    figure.show(take);
    record.append(figure.root);
    record.dataset.take = take.take;
  } catch {
    fleetTakes = null;
    delete record.dataset.take; // the next opening tries again
  }
}

/** Show each vehicle record's own take the first time it opens. */
export function watchVehicleTakes(records: HTMLElement): void {
  // `toggle` does not bubble: the capture phase sees every record open.
  records.addEventListener('toggle', (event) => {
    const record = event.target;
    if (record instanceof HTMLDetailsElement && record.open) void showVehicleTake(record);
  }, true);
}
