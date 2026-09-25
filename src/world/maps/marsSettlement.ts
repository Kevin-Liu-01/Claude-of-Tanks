/** Authored Olympus districts. Repeated pieces share their geometry/materials;
 * the clear service roads and the three tactical lane anchors stay independent.
 */
export interface OrbitalPlacement {
  id: string;
  structure: string;
  x: number;
  z: number;
  yawDeg: number;
}
const site = (id: string, structure: string, x: number, z: number, yawDeg = 0): OrbitalPlacement => ({ id, structure, x, z, yawDeg });
export const OLYMPUS_SETTLEMENT: readonly OrbitalPlacement[] = [
  site('command', 'missioncontrol', -63, 10, 180),
  site('command-relay', 'commsmast', -88, 10),
  site('science-lab', 'habmodule', -36, 10, 90),
  site('science-airlock', 'habmodule', -12, 10, 90),
  site('life-support-a', 'greenhouse', -92, 35),
  site('life-support-b', 'greenhouse', -63, 37),
  site('crew-a', 'habdome', -36, 37, 180),
  site('crew-b', 'habmodule', -12, 37),
  site('crew-c', 'habmodule', -92, 85, 90),
  site('crew-d', 'habdome', -63, 87, 180),
  site('crew-e', 'habmodule', -36, 85, 90),
  site('medical', 'habmodule', -12, 88),
  site('lander', 'ascentlander', 65, 20, 180),
  site('pad', 'landingpad', 92, 20),
  site('rover-depot', 'rovergarage', 65, 48, 180),
  site('landing-fuel', 'fueltanks', 92, 48),
  site('power-a', 'solararray', 65, 111),
  site('power-b', 'solararray', 90, 111),
  site('power-c', 'solararray', -88, -48),
  site('power-d', 'solararray', -62, -48),
  site('power-e', 'solararray', -36, -48),
  site('power-f', 'solararray', -10, -48),
  site('supply-a', 'habmodule', -88, -18, 90),
  site('supply-b', 'fueltanks', -10, -18),
];
