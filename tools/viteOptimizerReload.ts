/**
 * viteOptimizerReload.ts — a dependency re-bundle mid-session, said out loud (roster-errors-279, 2026-11-26).
 *
 * When the dev server re-bundles its dependencies mid-session it sends the page a full reload. A page served with hmr off
 * (every probe and browser receipt) never takes it: the modules it loads afterwards import three under the new `?v=`
 * hash, a second copy beside the one the core already holds, and every `instanceof THREE.*` check between the two fails.
 * That is how lane dev consoles came to log "missing authored gun cradle" (griffin50mm, bmp3m_dragun125, kurganets25,
 * sabra_mk2), "Native return-roller geometry requires a buffer" (t14_armata, leo2a5, merkava) and "TOS permanent stock
 * hullDetail requires its expected detail wrapper" (tos1a_tagil) from builders that build clean with one three
 * (src/vehicles/fleetBattleBuilds.selftest.mjs); the map probe met the same event as a stock ShaderChunk (modes-228 r2d).
 * The report names the event when it happens, as a console.error the run's log and its gates see.
 */
import type { Plugin } from 'vite';

interface HotChannelServer {
  environments?: { client?: { hot?: { send?: (payload: { type?: string }, ...rest: unknown[]) => unknown } } };
}

/** Wrap the client hot channel so a full reload logs one console.error naming the second three; false where none. */
export function reportOptimizerReloads(server: HotChannelServer, label = 'vite',
  remedy = 'add the late dependency to optimizeDeps.include, or reopen the page'): boolean {
  const hot = server.environments?.client?.hot;
  if (typeof hot?.send !== 'function') return false;
  const send = hot.send.bind(hot);
  hot.send = (payload, ...rest) => {
    if (payload?.type === 'full-reload') {
      console.error(`[${label}] vite re-bundled its dependencies mid-session: a page opened before now holds a second copy `
        + `of three (${remedy})`);
    }
    return send(payload, ...rest);
  };
  return true;
}

/** The dev server's report (vite.config.ts): only where hmr is off, since a page with hmr on takes the reload. */
export function optimizerReloadReport(): Plugin {
  return {
    name: 'cot-optimizer-reload-report',
    apply: 'serve',
    configureServer(server) {
      if (server.config.server.hmr === false) reportOptimizerReloads(server as HotChannelServer);
    },
  };
}
