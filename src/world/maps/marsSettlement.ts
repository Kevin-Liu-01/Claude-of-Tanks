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

/**
 * The settlement's outposts (the map-content lane, 2026-10-09; the owner: Olympus Basin "unfinished"): a crew station, a
 * solar farm, a landing field and a greenhouse ring out on the basin floor, each paired with its rotation about the
 * settlement's middle so neither deployment gains cover.
 */
export const MARS_OUTPOSTS: readonly OrbitalPlacement[] = [
  site('mo-east-station-0', 'habdome', 330.0, 20.0, 0),
  site('mo-east-station-1', 'habmodule', 348.0, 20.0, 90),
  site('mo-east-station-2', 'habmodule', 348.0, 8.0, 90),
  site('mo-east-station-3', 'commsmast', 316.0, 30.0, 0),
  site('mo-east-station-4', 'solararray', 314.0, 6.0, 0),
  site('mo-east-station-5', 'solararray', 326.0, 4.0, 0),
  site('mo-east-station-6', 'fueltanks', 338.0, 36.0, 0),
  site('mo-east-station-m-0', 'habdome', -330.0, -20.0, 180),
  site('mo-east-station-m-1', 'habmodule', -348.0, -20.0, 270),
  site('mo-east-station-m-2', 'habmodule', -348.0, -8.0, 270),
  site('mo-east-station-m-3', 'commsmast', -316.0, -30.0, 180),
  site('mo-east-station-m-4', 'solararray', -314.0, -6.0, 180),
  site('mo-east-station-m-5', 'solararray', -326.0, -4.0, 180),
  site('mo-east-station-m-6', 'fueltanks', -338.0, -36.0, 180),
  site('mo-east-solar-0', 'solararray', 190.0, 110.0, 0),
  site('mo-east-solar-1', 'solararray', 202.0, 110.0, 0),
  site('mo-east-solar-2', 'solararray', 214.0, 110.0, 0),
  site('mo-east-solar-3', 'solararray', 190.0, 122.0, 0),
  site('mo-east-solar-4', 'solararray', 202.0, 122.0, 0),
  site('mo-east-solar-5', 'solararray', 214.0, 122.0, 0),
  site('mo-east-solar-6', 'commsmast', 226.0, 116.0, 0),
  site('mo-east-solar-m-0', 'solararray', -190.0, -110.0, 180),
  site('mo-east-solar-m-1', 'solararray', -202.0, -110.0, 180),
  site('mo-east-solar-m-2', 'solararray', -214.0, -110.0, 180),
  site('mo-east-solar-m-3', 'solararray', -190.0, -122.0, 180),
  site('mo-east-solar-m-4', 'solararray', -202.0, -122.0, 180),
  site('mo-east-solar-m-5', 'solararray', -214.0, -122.0, 180),
  site('mo-east-solar-m-6', 'commsmast', -226.0, -116.0, 180),
  site('mo-east-pad-0', 'landingpad', 300.0, -160.0, 0),
  site('mo-east-pad-1', 'ascentlander', 300.0, -134.0, 0),
  site('mo-east-pad-2', 'fueltanks', 316.0, -134.0, 0),
  site('mo-east-pad-3', 'rovergarage', 282.0, -136.0, 180),
  site('mo-east-pad-m-0', 'landingpad', -300.0, 160.0, 180),
  site('mo-east-pad-m-1', 'ascentlander', -300.0, 134.0, 180),
  site('mo-east-pad-m-2', 'fueltanks', -316.0, 134.0, 180),
  site('mo-east-pad-m-3', 'rovergarage', -282.0, 136.0, 0),
  site('mo-crater-greens-0', 'greenhouse', 120.0, -300.0, 0),
  site('mo-crater-greens-1', 'greenhouse', 134.0, -300.0, 0),
  site('mo-crater-greens-2', 'habmodule', 148.0, -300.0, 90),
  site('mo-crater-greens-3', 'solararray', 106.0, -300.0, 0),
  site('mo-crater-greens-m-0', 'greenhouse', -120.0, 300.0, 180),
  site('mo-crater-greens-m-1', 'greenhouse', -134.0, 300.0, 180),
  site('mo-crater-greens-m-2', 'habmodule', -148.0, 300.0, 270),
  site('mo-crater-greens-m-3', 'solararray', -106.0, 300.0, 180),
];
