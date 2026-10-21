// src/world/civic/plans/roadLifeLive.ts — the maps whose road life is live (civic/roadLife.ts). The rollout lands in
// batches (the coordinator's rule): a batch's maps join once its gates pass (shards, pacing, the frame probe, the blind and
// gameplay critics); until then their seats stand in roadLifeSeats.generated.ts for the gates' own builds (`?roadlife=1`,
// `COT_ROAD_LIFE_ALL=1`), and a merged tree draws as before on them.
export const ROAD_LIFE_LIVE: ReadonlySet<string> = new Set([
  // batch 1 (229-230)
  'urban', 'ruinspires', 'cliffbridge', 'blackglass', 'delta', 'badlands', 'autumn',
]);
