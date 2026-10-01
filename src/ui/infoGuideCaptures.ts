import type { InfoGuideId } from './infoGuideTypes.ts';

type Point = readonly [number, number];
export interface GuideAnnotation {
  /** Image percentages, shared by the photograph, SVG leaders and touch targets. */
  at: Point;
  target: Point;
  paths?: readonly string[];
}
export interface GuideCapture {
  file: string;
  annotations: readonly [GuideAnnotation, GuideAnnotation, GuideAnnotation];
  stepFiles?: readonly [string, string, string];
}
const pin = (at: Point, target: Point, ...paths: string[]): GuideAnnotation => ({ at, target, paths });
/** Instructional overlays over unretouched game captures. Paths illustrate concepts,
 * except smoke trajectories, which are projected from the actual launcher receipt. */
export const INFO_GUIDE_CAPTURES: Partial<Record<InfoGuideId, GuideCapture>> = {
  maps: { file:'maps', annotations:[
    pin([10,12],[39,56],'M 23 97 Q 32 78 44 65 Q 52 53 58 35'),
    pin([76,17],[74,43],'M 66 57 Q 65 42 73 32 Q 81 27 83 38'),
    pin([70,83],[44,65],'M 38 58 L 50 73 M 39 73 L 50 57'),
  ]},
  camo: { file:'camo', annotations:[
    pin([66,72],[53,55]),
    pin([12,47],[33,37],'M 15 18 L 33 37 L 52 54'),
    pin([66,16],[49,18],'M 57 6 L 49 18 M 47 16 L 51 20 M 47 20 L 51 16'),
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
    pin([69,16],[66,44],"M 65.37 39.56 L 63.02 35.92 L 60.62 32.72 L 58.17 30.01 L 55.7 27.8 L 53.22 26.12 L 50.74 24.96 L 48.3 24.34 L 45.9 24.24 L 43.56 24.65 L 41.29 25.55 L 39.11 26.91 L 37.03 28.71 L 35.05 30.9 L 33.18 33.46 L 31.44 36.34 L 29.81 39.5","M 68.01 44.29 L 66.49 42.41 L 64.81 40.93 L 62.95 39.89 L 60.91 39.37 L 58.7 39.42 L 56.31 40.11 L 53.76 41.48 L 51.04 43.59 L 48.18 46.48 L 45.19 50.17 L 42.1 54.68 L 38.93 60.02 L 35.72 66.14 L 32.5 73.03 L 29.3 80.61 L 26.16 88.82"),pin([8,14],[27,37]),pin([67,79],[67,47]),
  ]},
};

export const VEHICLE_TECHNICAL_GUIDES: ReadonlySet<InfoGuideId> = new Set(['dossier','protection','modules','crew']);
export function guideCaptureUrl(file: string): string { return `/field-guide/${file}.webp`; }
