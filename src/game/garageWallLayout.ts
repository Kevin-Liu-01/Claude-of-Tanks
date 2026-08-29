// A single measured coordinate contract for every wall-mounted garage prop.
// The old dressing placed signs/boards independently, so later chunks could
// silently occupy the same wall pixels. These bays are auditable without DOM
// or WebGL and include clearance between neighboring rectangles.
export type GarageWallSide = 'north' | 'south' | 'east' | 'west';

export interface GarageWallBay {
  readonly id: string;
  readonly side: GarageWallSide;
  readonly along: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth?: number;
}

export const GARAGE_WALL_BAYS = Object.freeze<readonly GarageWallBay[]>([
  { id: 'east_tools', side: 'east', along: -7.0, y: 2.72, width: 3.1, height: 1.8 },
  { id: 'east_bay_02', side: 'east', along: -3.4, y: 5.65, width: 2.8, height: 1.4 },
  { id: 'east_extinguisher', side: 'east', along: 4.8, y: 1.12, width: 0.6, height: 0.8 },
  { id: 'east_flammable', side: 'east', along: 8.1, y: 3.35, width: 1.9, height: 0.95 },
  { id: 'south_fan', side: 'south', along: -0.2, y: 6.10, width: 2.2, height: 2.2 },
  { id: 'south_turret_armor', side: 'south', along: -8.7, y: 3.25, width: 3.0, height: 1.1 },
  { id: 'south_keep_clear', side: 'south', along: -4.2, y: 5.05, width: 2.5, height: 1.2 },
  { id: 'south_location', side: 'south', along: 7.5, y: 7.05, width: 11.2, height: 3.45 },
  { id: 'south_suspension', side: 'south', along: 17.4, y: 3.20, width: 3.2, height: 1.1 },
  { id: 'west_tools', side: 'west', along: 1.5, y: 2.72, width: 3.2, height: 1.8 },
  { id: 'west_extinguisher', side: 'west', along: 4.0, y: 1.10, width: 0.6, height: 0.8 },
  { id: 'north_teardown', side: 'north', along: -16.3, y: 3.20, width: 3.4, height: 1.1 },
  { id: 'north_tools', side: 'north', along: 3.2, y: 2.72, width: 3.2, height: 1.8 },
  { id: 'north_final', side: 'north', along: 17.3, y: 3.30, width: 3.2, height: 1.1 },
]);

const BY_ID = new Map(GARAGE_WALL_BAYS.map((bay) => [bay.id, bay]));

export function getGarageWallBay(id: string): GarageWallBay {
  const bay = BY_ID.get(id);
  if (!bay) throw new Error(`unknown garage wall bay '${id}'`);
  return bay;
}

export function garageWallTransform(id: string, wall = 22.86) {
  const bay = getGarageWallBay(id);
  switch (bay.side) {
    case 'north': return { ...bay, x: bay.along, z: -wall, yaw: 0 };
    case 'south': return { ...bay, x: bay.along, z: wall, yaw: Math.PI };
    case 'east': return { ...bay, x: wall, z: bay.along, yaw: -Math.PI / 2 };
    case 'west': return { ...bay, x: -wall, z: bay.along, yaw: Math.PI / 2 };
  }
}

export function auditGarageWallBays(clearance = 0.12) {
  const overlaps: string[] = [];
  for (let leftIndex = 0; leftIndex < GARAGE_WALL_BAYS.length; leftIndex++) {
    const left = GARAGE_WALL_BAYS[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < GARAGE_WALL_BAYS.length; rightIndex++) {
      const right = GARAGE_WALL_BAYS[rightIndex];
      if (left.side !== right.side) continue;
      const horizontal = Math.abs(left.along - right.along)
        < (left.width + right.width) / 2 + clearance;
      const vertical = Math.abs(left.y - right.y)
        < (left.height + right.height) / 2 + clearance;
      if (horizontal && vertical) overlaps.push(`${left.id}:${right.id}`);
    }
  }
  return Object.freeze({ bays: GARAGE_WALL_BAYS.length, overlaps: Object.freeze(overlaps) });
}
