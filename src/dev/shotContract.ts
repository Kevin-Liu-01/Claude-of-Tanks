export const SHOT_VIEWS = [
  'battlefield', 'player_view', 'spectator_view', 'sniper_view',
  'tank_closeup_modern', 'tank_closeup_ww2', 'tank_closeup_t90m',
  'tank_closeup_leo2a7', 'detrack', 'combat_firing', 'explosion', 'garage',
  'battlefield_desert', 'battlefield_winter', 'battlefield_urban',
  'battlefield_coastal', 'battlefield_autumn', 'battlefield_steppe',
  'battlefield_railyard', 'battlefield_frontier', 'battlefield_fjord',
  'battlefield_delta', 'battlefield_badlands', 'battlefield_monsoon',
  'battlefield_alpine', 'battlefield_caldera', 'battlefield_foundry',
  'battlefield_ruinspires', 'battlefield_blackglass',
  'battlefield_titan_gorge', 'battlefield_skybridge', 'killcam_xray',
] as const;

export type ShotViewName = typeof SHOT_VIEWS[number];
