/**
 * trailCadence.ts — even spacing for the media tier's moving emitters (EF.01, 2026-10-12).
 *
 * The owner: "the dust clouds and smoke from tanks ... used to look more uniform but in our new version, the effects look
 * separated into little clouds separated from each other, instead of being continuous. like how it was before."
 * Deploy 208 moved a moving hull's track dust (07512bb07) and its exhaust (ac8ae8065) onto the volumetric media, raising
 * each body through a per-call coin toss: a Poisson stream of one body every ~2-6 m of a track (one gap in seven over
 * twice that), and exhaust puffs 2-5 m apart at speed — beads on a string, where the sprite trail they replaced had laid
 * a puff every half metre.
 *
 * A trail here is raised by the distance its source travels, never by chance or by the frame: each source (a track's
 * contact, an engine's stack) keeps a slot with its last place and time and the metres and seconds since its last body.
 * A body falls due every `spacingM` of travel (or every `restS` at rest), placed back along the segment the source
 * covered since its last call and born that much earlier, so neighbours sit evenly at any frame rate or call cadence.
 * The caller sizes its bodies against the spacing, so neighbours always overlap (continuity from overlap, not from more
 * bodies).
 *
 * Sources carry no ids (fx.dust and fx.exhaust take a position), so a call finds its slot by place: the slot of the same
 * kind, called within `idleS`, whose last place carried forward by its own velocity lies nearest, within `matchM` (plus a
 * reach that grows with the time since its last call).
 * The two tracks of one hull lie ~2 m or more apart; one track's calls lie ~0.5 m apart, so the match is unambiguous.
 * Fixed arrays, no allocation per call; the oldest slot is reused when all are taken.
 */

interface TrailCadence {
  /**
   * Advance a source of `kind` to (x, z) at fx time `now` (s). Returns how many bodies fall due (at most `maxBirths`);
   * their places and ages are in `births` as [x, z, ageS] triples, oldest first. A source first seen raises one body.
   */
  step(kind: number, x: number, z: number, now: number, spacingM: number, restS: number, maxBirths: number): number;
  /** [x, z, ageS] per due body of the last step */
  readonly births: Float32Array;
  /** the last step's slot, whether that source was first seen there, and the seconds since its previous call */
  readonly last: number;
  readonly fresh: boolean;
  readonly lastDt: number;
  /** two caller-owned values per slot (`last * 2`, `last * 2 + 1`), zeroed when a slot is claimed */
  readonly aux: Float64Array;
  /** sources called within the idle window (diagnostics) */
  active(now: number): number;
  reset(): void;
}

export const TRAIL_MAX_BIRTHS = 6;

export function createTrailCadence(slots = 64, matchM = 1.6, idleS = 0.4): TrailCadence {
  const sx = new Float64Array(slots), sz = new Float64Array(slots), st = new Float64Array(slots);
  const svx = new Float32Array(slots), svz = new Float32Array(slots);
  const dist = new Float32Array(slots), wait = new Float32Array(slots);
  const kinds = new Int16Array(slots).fill(-1);
  const births = new Float32Array(TRAIL_MAX_BIRTHS * 3);
  const aux = new Float64Array(slots * 2);
  let last = 0, fresh = false, lastDt = 0;

  function find(kind: number, x: number, z: number, now: number): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < slots; i++) {
      if (kinds[i] !== kind) continue;
      const dt = now - st[i];
      if (dt < 0 || dt > idleS) continue;
      const px = sx[i] + svx[i] * dt, pz = sz[i] + svz[i] * dt;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      // the reach grows with the time since the slot's last call: a little for a source whose velocity carries its
      // place forward, more for one not yet seen moving (a slow frame's stride); the nearest slot wins
      const known = svx[i] * svx[i] + svz[i] * svz[i] > 0.25;
      const reach = matchM + (known ? 4 : 20) * dt;
      if (d <= reach * reach && d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function claim(now: number): number {
    let oldest = 0, oldestT = Infinity;
    for (let i = 0; i < slots; i++) {
      if (kinds[i] < 0 || now - st[i] > idleS || now < st[i]) return i;
      if (st[i] < oldestT) { oldestT = st[i]; oldest = i; }
    }
    return oldest;
  }

  return {
    births, aux,
    get last() { return last; },
    get fresh() { return fresh; },
    get lastDt() { return lastDt; },
    step(kind, x, z, now, spacingM, restS, maxBirths) {
      const cap = Math.max(0, Math.min(TRAIL_MAX_BIRTHS, maxBirths | 0));
      const spacing = Math.max(0.05, spacingM);
      let i = find(kind, x, z, now);
      if (i < 0) {
        // a source first seen (or back after a pause): its trail starts with a body here
        i = claim(now);
        kinds[i] = kind; sx[i] = x; sz[i] = z; st[i] = now; svx[i] = 0; svz[i] = 0; dist[i] = 0; wait[i] = 0;
        aux[i * 2] = 0; aux[i * 2 + 1] = 0;
        last = i; fresh = true; lastDt = 0;
        if (cap === 0) return 0;
        births[0] = x; births[1] = z; births[2] = 0;
        return 1;
      }
      const dt = now - st[i];
      last = i; fresh = false; lastDt = Math.max(0, dt);
      const ex = x - sx[i], ez = z - sz[i];
      const seg = Math.hypot(ex, ez);
      const speed = dt > 1e-6 ? seg / dt : 0;
      let n = 0;
      if (seg > 1e-6 || dt > 1e-6) {
        dist[i] += seg; wait[i] += dt;
        if (dist[i] >= spacing) {
          // bodies every `spacing` metres along the segment just covered: each one placed `back` metres behind the
          // source's present place and born back/speed seconds ago (oldest first)
          while (dist[i] >= spacing && n < cap) {
            const back = Math.min(seg, dist[i] - spacing);
            const f = seg > 1e-6 ? back / seg : 0;
            births[n * 3] = x - ex * f; births[n * 3 + 1] = z - ez * f;
            births[n * 3 + 2] = speed > 1e-3 ? back / speed : 0;
            dist[i] -= spacing; n++;
          }
          // a stall's catch-up beyond the cap is dropped, never queued (no burst of bodies on the next call)
          if (dist[i] >= spacing) dist[i] = 0;
          wait[i] = n > 0 ? births[(n - 1) * 3 + 2] : wait[i];
        } else if (restS > 0 && wait[i] >= restS && cap > 0) {
          // at rest (or creeping) the source still breathes at its own rate
          births[0] = x; births[1] = z; births[2] = Math.min(dt, wait[i] - restS);
          wait[i] = births[2]; n = 1;
        }
      }
      if (dt > 1e-6) {
        // the source's own velocity, smoothed, carries its place forward for the next call's match
        const k = Math.min(1, dt * 12);
        svx[i] += (ex / dt - svx[i]) * k; svz[i] += (ez / dt - svz[i]) * k;
      }
      sx[i] = x; sz[i] = z; st[i] = now;
      return n;
    },
    active(now) {
      let n = 0;
      for (let i = 0; i < slots; i++) if (kinds[i] >= 0 && now - st[i] <= idleS && now >= st[i]) n++;
      return n;
    },
    reset() {
      kinds.fill(-1); dist.fill(0); wait.fill(0); svx.fill(0); svz.fill(0); aux.fill(0);
    },
  };
}
