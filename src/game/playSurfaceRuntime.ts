import type { RuntimeValue } from '../runtimeTypes.ts';
import type { GameModeId } from '../sim/matchModes.ts';
import { normalizePlayMode } from '../net/playMode.ts';
import type {
  PlayMenuInvite,
  PlayMenuOptions,
  PlayMenuRuntime,
  PlayMode,
} from '../ui/playMenu.ts';

type MaybePromise<T> = T | PromiseLike<T>;
type MenuCreationOptions = Omit<PlayMenuOptions, 'onSolo'>;

export interface PlaySurfaceRequest {
  mode?: PlayMode;
  invite?: PlayMenuInvite;
  specId?: string;
  mapId?: string;
  gameMode?: GameModeId;
  startSolo?: () => MaybePromise<RuntimeValue>;
}

interface PlayMenuModule {
  createPlayMenu(options: PlayMenuOptions): PlayMenuRuntime;
  preloadPlayMode(mode: PlayMode): MaybePromise<RuntimeValue>;
}

interface PlaySurfaceRuntimeOptions {
  loadMenuModule(): Promise<PlayMenuModule>;
  createMenuOptions(): MenuCreationOptions;
  getSelectedSpecId(): string;
  getSelectedMapId(): string;
  startSolo(request: {
    specId: string;
    mapId: string;
    gameMode?: GameModeId;
  }): MaybePromise<RuntimeValue>;
  showActiveRoom(): MaybePromise<boolean>;
  preloadCommon: Array<() => MaybePromise<RuntimeValue>>;
  preloadNetworkPresentation(): MaybePromise<RuntimeValue>;
  preloadPrivateMatch(): MaybePromise<RuntimeValue>;
  reportError?(scope: string, error: RuntimeValue): void;
}

export interface PlaySurfaceRuntime {
  preload(mode?: PlayMode): void;
  open(request?: PlaySurfaceRequest): Promise<void>;
  hideForBattle(): void;
  showCurrentRoom(): Promise<boolean>;
  getMenuPromise(): Promise<PlayMenuRuntime> | null;
}

function observe(
  task: () => MaybePromise<RuntimeValue>,
  scope: string,
  reportError: (scope: string, error: RuntimeValue) => void,
): void {
  try {
    void Promise.resolve(task()).catch((error) => reportError(scope, error));
  } catch (error) {
    reportError(scope, error);
  }
}

/**
 * Own the Garage play surface from explicit mode intent through one reusable
 * menu instance. The module keeps cold imports retryable, centralizes which
 * battle-only graphs each mode may warm, and prevents room/solo callers from
 * growing their own promise and dismissal policy in the composition root.
 */
export function createPlaySurfaceRuntime({
  loadMenuModule,
  createMenuOptions,
  getSelectedSpecId,
  getSelectedMapId,
  startSolo,
  showActiveRoom,
  preloadCommon,
  preloadNetworkPresentation,
  preloadPrivateMatch,
  reportError = (scope, error) => console.error(`[${scope}]`, error),
}: PlaySurfaceRuntimeOptions): PlaySurfaceRuntime {
  const required = [loadMenuModule, createMenuOptions, getSelectedSpecId,
    getSelectedMapId, startSolo, showActiveRoom, preloadNetworkPresentation,
    preloadPrivateMatch, reportError];
  if (required.some((entry) => typeof entry !== 'function')
      || !Array.isArray(preloadCommon)
      || preloadCommon.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('play surface runtime requires every lifecycle port');
  }

  let menuPromise: Promise<PlayMenuRuntime> | null = null;
  let pendingSoloStart: (() => MaybePromise<RuntimeValue>) | null = null;

  const runSolo = (start: () => MaybePromise<RuntimeValue>): void => {
    observe(start, 'solo entry failed', reportError);
  };

  const ensureMenu = (): Promise<PlayMenuRuntime> => {
    if (menuPromise) return menuPromise;
    const request = loadMenuModule().then((module) => {
      if (typeof module?.createPlayMenu !== 'function') {
        throw new TypeError('play menu module is incomplete');
      }
      const menu = module.createPlayMenu({
        ...createMenuOptions(),
        onSolo: (request: { gameMode?: GameModeId } = {}) => {
          const requested = pendingSoloStart;
          pendingSoloStart = null;
          if (requested) runSolo(requested);
          else runSolo(() => startSolo({
            specId: getSelectedSpecId(),
            mapId: getSelectedMapId(),
            ...(request.gameMode == null ? {} : { gameMode: request.gameMode }),
          }));
        },
      });
      if (!menu || typeof menu.show !== 'function'
          || typeof menu.showCurrentRoom !== 'function'
          || typeof menu.hide !== 'function') {
        throw new TypeError('play menu runtime is incomplete');
      }
      return menu;
    });
    menuPromise = request;
    request.catch(() => {
      if (menuPromise === request) menuPromise = null;
    });
    return request;
  };

  const preload = (requestedMode: PlayMode = 'solo'): void => {
    const mode = normalizePlayMode(requestedMode);
    for (const task of preloadCommon) observe(task, 'play preload failed', reportError);
    if (mode !== 'solo') {
      observe(preloadNetworkPresentation, 'network presentation preload failed', reportError);
    }
    if (mode === 'private' || mode === 'lan') {
      observe(preloadPrivateMatch, 'private match preload failed', reportError);
    }
    observe(async () => {
      const module = await loadMenuModule();
      if (typeof module.preloadPlayMode === 'function') {
        await module.preloadPlayMode(mode);
      }
    }, 'play mode preload failed', reportError);
  };

  return {
    preload,

    async open(request = {}) {
      if (await showActiveRoom()) return;
      if (menuPromise && (await menuPromise).showCurrentRoom()) return;

      const mode = normalizePlayMode(request.mode);
      if (mode === 'solo') {
        pendingSoloStart = null;
        if (typeof request.startSolo === 'function') runSolo(request.startSolo);
        else await startSolo({
          specId: request.specId || getSelectedSpecId(),
          mapId: request.mapId || getSelectedMapId(),
          ...(request.gameMode == null ? {} : { gameMode: request.gameMode }),
        });
        return;
      }

      pendingSoloStart = typeof request.startSolo === 'function'
        ? request.startSolo : null;
      const menu = await ensureMenu();
      menu.show(mode, request.invite);
    },

    hideForBattle() {
      menuPromise?.then((menu) => menu.hide(false)).catch(() => null);
    },

    async showCurrentRoom() {
      if (!menuPromise) return false;
      return !!(await menuPromise).showCurrentRoom();
    },

    getMenuPromise() { return menuPromise; },
  };
}
