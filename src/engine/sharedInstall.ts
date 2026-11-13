/**
 * sharedInstall.ts — (2026-11-02 audit R3) one install in flight, joined by every caller, each caller keeping its own
 * fate.
 *
 * The sky's chunked cloud installs memoized their promise with `??=`: a later caller joined the first caller's promise
 * and inherited that caller's `tick`, so when the first caller's covered load was superseded and its tick rejected, the
 * joiner failed too (postLazyPasses.ts fixed the same class for the post warm). Here the work is still shared (no
 * second bake of the same deck), but it yields through a relay: the newest joined caller whose tick is still live. A
 * caller whose tick rejects fails alone and leaves the relay; the install goes on with the others (without yielding when
 * only callers that passed no tick remain). With no live caller left the relay rejects and the install stops where it
 * is (its flags keep the finished parts), so a later call starts a fresh one. A job started without a tick runs without
 * yielding, as before. No DOM; Node-runnable.
 *
 * A job closes (takes no more members) synchronously at the moment it commits to end: before its members are settled
 * when the install finishes or fails, and before the relay throws when every caller has gone. A call made after that,
 * even in a settled caller's own continuation or rejection handler, starts a fresh install; it never joins a finished
 * job (which would never settle it) or a dead one (whose fate it would inherit).
 */
export type InstallTick = () => Promise<void>;

/** The relay's rejection when every caller that could yield has gone. */
export class InstallCallersGoneError extends Error {
  constructor() { super('every caller of the shared install has gone'); this.name = 'InstallCallersGoneError'; }
}

interface Member {
  readonly tick: InstallTick | undefined;
  done: boolean;
  resolve(): void;
  reject(error: unknown): void;
}

interface Job {
  /** true once the job has committed to end; a closed job takes no more members */
  closed: boolean;
  readonly members: Member[];
  promise: Promise<void> | null;
}

export function createSharedInstall(
  run: (tick?: InstallTick) => Promise<void>,
  onJob?: (job: Promise<void> | null) => void,
): (tick?: InstallTick) => Promise<void> {
  let current: Job | null = null;
  const close = (job: Job): void => {
    if (job.closed) return;
    job.closed = true;
    if (current !== job) return;
    current = null;
    onJob?.(null);
  };
  const settle = (job: Job, error: unknown, failed: boolean): void => {
    close(job);
    for (const member of job.members) {
      if (member.done) continue;
      member.done = true;
      if (failed) member.reject(error); else member.resolve();
    }
  };
  const relay = (job: Job): InstallTick => async () => {
    const list = job.members;
    for (;;) {
      let member: Member | null = null;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i].done && list[i].tick) { member = list[i]; break; }
      }
      if (!member) {
        // only callers that asked for no yields remain: finish for them without yielding
        if (list.some((entry) => !entry.done)) return;
        close(job);
        throw new InstallCallersGoneError();
      }
      try {
        await member.tick!();
        return;
      } catch (error) {
        if (!member.done) { member.done = true; member.reject(error); }
      }
    }
  };
  return (tick) => new Promise<void>((resolve, reject) => {
    const member: Member = { tick, done: false, resolve, reject };
    if (current && !current.closed) { current.members.push(member); return; }
    const job: Job = { closed: false, members: [member], promise: null };
    current = job;
    const started = Promise.resolve().then(() => run(tick ? relay(job) : undefined));
    job.promise = started;
    onJob?.(started);
    started.then(() => settle(job, null, false), (error) => settle(job, error, true));
  });
}
