/**
 * One match container per room: the `server/match` image (Dockerfile at
 * `server/match/Dockerfile`, built from the repository root) on a
 * `standard-2` instance. The Room object starts it at match start, posts the
 * match config to its control route, proxies each seat's `/match` WebSocket
 * to it, polls its status, and the instance sleeps two minutes after the
 * last request — the verdict linger is five seconds, so a finished match
 * costs nothing beyond its own minutes; a rematch starts it again.
 */
import { Container } from '@cloudflare/containers';

export class MatchContainer extends Container<Env> {
  override defaultPort = 8791;
  override sleepAfter = '2m';

  constructor(ctx: ConstructorParameters<typeof Container<Env>>[0], env: Env) {
    super(ctx, env);
    // Secrets reach the process as environment: the seat secret the Room signs with,
    // the control-route bearer, the site origins the match socket admits.
    this.envVars = {
      COT_MATCH_PORT: '8791',
      COT_MATCH_HOST: '0.0.0.0',
      COT_MATCH_MAX_ACTORS: '1',
      COT_MATCH_LOG_LEVEL: 'info',
      COT_MATCH_SEAT_SECRET: env.MATCH_SEAT_SECRET,
      COT_MATCH_CONTROL_SECRET: env.MATCH_CONTROL_SECRET || env.MATCH_SEAT_SECRET,
      COT_MATCH_ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
      // Local runs only (`wrangler dev --var MATCH_BATTLE_LIMIT_S:20`): a short clock so the e2e reaches a verdict.
      ...(env.MATCH_BATTLE_LIMIT_S ? { COT_MATCH_BATTLE_LIMIT_S: env.MATCH_BATTLE_LIMIT_S } : {}),
    };
  }

  override onStart(): void {
    console.log('match container started', { id: this.ctx.id.name ?? this.ctx.id.toString() });
  }

  override onStop({ exitCode, reason }: { exitCode: number; reason: string }): void {
    console.log('match container stopped', { id: this.ctx.id.name ?? this.ctx.id.toString(), exitCode, reason });
  }

  override onError(error: unknown): void {
    console.error('match container error', { id: this.ctx.id.name ?? this.ctx.id.toString(), error: String(error) });
    throw error;
  }
}
