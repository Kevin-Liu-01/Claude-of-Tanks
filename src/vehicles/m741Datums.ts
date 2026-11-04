// The M163 VADS's carrier, the M741 (an M113A1; release 269: profiles/m113.ts buildM113HullSteps draws the hull, the
// twin-aa lane the Vulcan turret): its turret race and the commander's hatch on the A1's roof. Pure data, Node-runnable;
// kept out of m113Datums.ts, which the specs read. First-party: Kevin B. Liu (NOTICE.md).
import { M113_BASE } from './m113Datums.ts';

/** The M741's turret race, hull frame (the twin-aa lane seats the M163's turret on it): centred on the roof's width over
 * its rear half where the A1's cargo hatch was (the owner's photo of 2026-11-04, a right-front quarter: the turret's drum
 * about 1.4 m across, its centre about 1.95 m ahead of the stern). Its centre's x and z, its diameter, the roof's height
 * and the race's top standing proud of the roof. */
export const M741_RING = Object.freeze({ x: 0, z: -M113_BASE.length / 2 + 1.95, diameter: 1.40, roofY: M113_BASE.roofY,
  raceTopY: M113_BASE.roofY + 0.04 });
/** The commander's round hatch behind the turret at the right rear (moved there from the A1's centre roof; the owner's
 * photo shows it open, its lid forward), hull frame: its centre's x and z and its radius. */
export const M741_COMMANDER_HATCH = Object.freeze({ x: -0.65, z: -M113_BASE.length / 2 + 0.45, r: 0.31 });
