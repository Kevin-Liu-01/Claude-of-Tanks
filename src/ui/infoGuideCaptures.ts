import type { InfoGuideId } from './infoGuideTypes.ts';

type Point = readonly [number, number];
interface GuideAnnotation {
  /** Image percentages, shared by the photograph, SVG leaders and touch targets. */
  at: Point;
  target: Point;
  paths?: readonly string[];
}
interface GuideCapture {
  file: string;
  annotations: readonly [GuideAnnotation, GuideAnnotation, GuideAnnotation];
  stepFiles?: readonly [string, string, string];
}
const pin = (at: Point, target: Point, ...paths: string[]): GuideAnnotation => ({ at, target, paths });
/** Instructional overlays over unretouched game captures. Paths illustrate concepts,
 * except smoke trajectories, which are projected from the actual launcher receipt. */
export const INFO_GUIDE_CAPTURES: Partial<Record<InfoGuideId, GuideCapture>> = {
  maps: { file:'maps', annotations:[
    pin([10,12],[39,56],'M 23 97 Q 32 78 44 65 Q 57 44 60 36'), // (2026-10-21) the route on the 227 aerial's road
    pin([76,17],[74,43],'M 66 57 Q 65 42 73 32 Q 81 27 83 38'),
    pin([70,83],[44,65],'M 38 58 L 50 73 M 39 73 L 50 57'),
  ]},
  camo: { file:'camo', annotations:[ // (246) the hollow at (-330,-150): its bush, then the grassy ridge right of the tank
    pin([66,72],[53,55]),
    pin([12,47],[36,38],'M 15 18 L 36 38 L 52 54'),
    pin([66,16],[80,21],'M 92 9 L 80 21 M 78 19 L 82 23 M 78 23 L 82 19'),
  ]},
  dossier: { file:'dossier', annotations:[pin([8,18],[51,41]),pin([73,23],[58,51]),pin([68,84],[51,73])] },
  equipment: { file:'equipment', annotations:[pin([73,22],[59,53]),pin([9,61],[39,67]),pin([10,18],[56,38])] },
  performance: { file:'performance', annotations:[
    pin([8,21],[45,65],'M 41 76 L 20 76 M 24 73 L 20 76 L 24 79'),
    pin([73,79],[70,63],'M 64 74 Q 82 76 86 61 M 83 64 L 86 61 L 86 67'),
    pin([65,18],[46,37]),
  ]},
  special: { file:'special', annotations:[pin([72,63],[53,59]),pin([9,20],[47,33]),pin([8,81],[30,94])] },
  armament: { file:'armament', annotations:[
    pin([73,21],[56,53],'M 46 53 Q 55 60 66 51'),
    pin([8,25],[27,50],'M 43 48 L 22 45 M 43 48 L 22 55'),
    pin([70,83],[57,72]),
  ]},
  protection: { file:'protection', annotations:[pin([70,15],[45,46]),pin([8,31],[33,63]),pin([72,80],[58,67])] },
  modules: { file:'modules', annotations:[pin([8,17],[42,42]),pin([72,76],[68,48]),pin([67,13],[58,43])] },
  crew: { file:'crew', annotations:[pin([65,18],[47,50]),pin([8,76],[32,67]),pin([8,20],[42,44])] },
  ammunition: { file:'ammunition', annotations:[pin([8,20],[27,49]),pin([73,75],[56,42]),pin([71,15],[55,37])] },
  smoke: { file:'smoke', stepFiles:['smoke-launch','smoke','smoke'], annotations:[
    pin([69,16],[66,44],"M 65.6 39.35 L 63.78 34.1 L 61.92 29.45 L 60.04 25.45 L 58.17 22.12 L 56.31 19.46 L 54.49 17.47 L 52.71 16.15 L 50.98 15.46 L 49.32 15.38 L 47.74 15.87 L 46.23 16.9 L 44.82 18.4 L 43.49 20.34 L 42.25 22.66 L 41.1 25.32 L 40.05 28.27","M 68.16 45.81 L 67.24 45.34 L 66.18 45.34 L 64.98 45.89 L 63.62 47.06 L 62.1 48.92 L 60.4 51.55 L 58.53 55.03 L 56.47 59.43 L 54.23 64.83 L 51.8 71.26 L 49.21 78.78 L 46.46 87.4 L 43.56 97.12 L 40.56 107.9 L 37.46 119.69 L 34.32 132.38"),pin([8,14],[27,37]),pin([67,79],[67,47]),
  ]},
};

export const VEHICLE_TECHNICAL_GUIDES: ReadonlySet<InfoGuideId> = new Set(['dossier','protection','modules','crew']);
export function guideCaptureUrl(file: string): string { return `/field-guide/${file}.webp`; }
