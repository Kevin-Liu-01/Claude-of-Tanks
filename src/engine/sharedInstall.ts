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

export function createSharedInstall(
  run: (tick?: InstallTick) => Promise<void>,
  onJob?: (job: Promise<void> | null) => void,
): (tick?: InstallTick) => Promise<void> {
  let job: Promise<void> | null = null;
  let members: Member[] = [];
  const settle = (list: Member[], error: unknown, failed: boolean): void => {
    for (const member of list) {
      if (member.done) continue;
      member.done = true;
      if (failed) member.reject(error); else member.resolve();
    }
  };
  const relay = (list: Member[]): InstallTick => async () => {
    for (;;) {
      let member: Member | null = null;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i].done && list[i].tick) { member = list[i]; break; }
      }
      if (!member) {
        // only callers that asked for no yields remain: finish for them without yielding
        if (list.some((entry) => !entry.done)) return;
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
    if (job) { members.push(member); return; }
    const list: Member[] = [member];
    members = list;
    const started = Promise.resolve().then(() => run(tick ? relay(list) : undefined));
    job = started;
    onJob?.(started);
    started.then(() => settle(list, null, false), (error) => settle(list, error, true)).finally(() => {
      if (job !== started) return;
      job = null;
      members = [];
      onJob?.(null);
    });
  });
}
