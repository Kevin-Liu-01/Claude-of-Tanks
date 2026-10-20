// src/ui/killSourceIdentity.ts — (ac130-fx-228, 2026-10-19; the owner: "in kills it still says the tank u chose instead
// of ac 130 having done the kill. fix that") A kill's source and a combatant's vehicle, as every surface shows them in the
// silhouette's place: the kill feed, the killcam's header, lines and killer card, the battle report, the final blow, the
// end rosters, the HUD and loading rosters, the service record. The authorities decide the source
// (sim/aerialCombat.ts killSourceOf) and stamp it on the hit (`attackerSource`) and the destruction (`source`); this only
// names it. A gunship pilot's vehicle is the AC-130 (its icon, no tier), never the garage tank modeLoadout.ts keeps under
// the gunship's guns.
//
// (r2) Its own module beside icons.ts: vite.config.ts builds the two into one chunk (the game's boot reads it for the
// loading roster, so it costs no boot request of its own). The HUD asks for these every frame: each identity is made
// once per locale and reused (no allocation per call).
import { getLocale, t } from './i18n.ts';

interface SourceIdentity {
  readonly source: 'ac130' | 'drone';
  /** the platform's name as the surfaces show it ("AC-130", "FPV drone") */
  readonly label: string;
  /** its ui icon (uiIcons.ts) in the silhouette's place */
  readonly icon: 'modeAc130' | 'modeDrone';
}

let identityLocale = '';
let ac130: SourceIdentity | null = null;
let drone: SourceIdentity | null = null;

function identities(): void {
  const locale = getLocale();
  if (locale === identityLocale && ac130 && drone) return;
  identityLocale = locale;
  ac130 = Object.freeze({ source: 'ac130', label: t('flight.gunship'), icon: 'modeAc130' });
  drone = Object.freeze({ source: 'drone', label: t('hud.source.drone'), icon: 'modeDrone' });
}

/** The identity a kill or hit source shows, or null for the firing vehicle's own weapons. */
export function killSourceIdentity(source: unknown): SourceIdentity | null {
  // the authority's sources (sim/aerialCombat.ts killSourceOf); any other wire value is the vehicle itself
  if (source !== 'ac130' && source !== 'drone') return null;
  identities();
  return source === 'ac130' ? ac130 : drone;
}

/** The name a hit's or a kill's attacker reads as: its platform when the authority named one, else its vehicle. */
export function attackerLabel(event: { attackerSource?: unknown; attackerName?: string | null }): string | undefined {
  return killSourceIdentity(event.attackerSource)?.label ?? (event.attackerName || undefined);
}

/** A combatant's vehicle name as the rosters show it: the AC-130 for a gunship pilot, else its tank. */
export function vehicleName(entity: { aerial?: { kind?: string } | null; spec?: { name?: string; id?: string } | null;
  specId?: string }): string {
  if (entity.aerial?.kind === 'gunship') return (killSourceIdentity('ac130') as SourceIdentity).label;
  return entity.spec?.name ?? entity.spec?.id ?? entity.specId ?? '';
}
