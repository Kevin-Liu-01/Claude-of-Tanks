import type { InfoGuideId } from './infoGuideTypes.ts';
export const INFO_GUIDE_DIAGRAMS = {
  "camo": "concealment",
  "maps": "map",
  "dossier": "dossier",
  "performance": "mobility",
  "protection": "armor",
  "ammunition": "ammo",
  "armament": "articulation",
  "modules": "internals",
  "crew": "crew",
  "equipment": "equipment",
  "special": "cycle",
  "layers": "layers",
  "markup": "markup",
  "camera": "camera",
  "environment": "environment",
  "actors": "actors",
  "effects": "effects",
  "timeline": "timeline",
  "output": "output",
  "recipe": "recipe"
} as const satisfies Record<InfoGuideId, string>;
