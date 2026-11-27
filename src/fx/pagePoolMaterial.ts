// (battle-retention-279) A material a page-lifetime pool makes once and keeps across battles (the fx runtime's rubble
// bodies and crater marks) carries one tag, so the Garage-return probe's registry ledger tells a pool's shadow-rig entry
// from one a released world left behind, and still counts the pool's per pool (a pool that grows with the maps seen
// shows).
const PAGE_POOL_TAG = 'cotPagePool';

export function tagPagePoolMaterial<M extends { userData: Record<string, unknown> }>(material: M, pool: string): M {
  material.userData[PAGE_POOL_TAG] = pool;
  return material;
}
