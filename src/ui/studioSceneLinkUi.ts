/**
 * The Studio's "Copy scene link" and the messages for opening one (game/studioSceneShare.ts owns the format, caps and
 * schema). The clipboard is handed the link as a promise in the same task as the click: Safari only accepts a clipboard
 * write inside the user gesture, and compressing the scene is asynchronous. Where the clipboard refuses, the link goes
 * into the address bar (replaceState: no navigation, no reload) and the message says so.
 */
import {
  encodeSceneLink, sceneLinkKb, sceneLinkUrl, SCENE_LINK_MAX_CHARS, type SceneLinkDecoded, type SceneLinkEncoded,
} from '../game/studioSceneShare.ts';
import { getLocale, t } from './i18n.ts';
import { pathForLocale } from './localeRouting.ts';

export interface SceneLinkCopyEnv {
  readonly origin: string;
  readonly studioPath: string;
  /** Write the link (resolved later) to the clipboard; called synchronously, inside the click. */
  copy?(link: Promise<string>): Promise<void>;
  /** Fallback: show the link in the address bar. */
  showInAddressBar?(url: string): void;
}

export interface SceneLinkNotice {
  readonly ok: boolean;
  readonly message: string;
  readonly url?: string;
}

function encodeFailure(encoded: Exclude<SceneLinkEncoded, { ok: true }>): string {
  return encoded.reason === 'too-large'
    ? t('studio.sceneLink.tooLargeToCopy', { size: sceneLinkKb(encoded.chars), max: sceneLinkKb(SCENE_LINK_MAX_CHARS) })
    : t('studio.sceneLink.cannotShare', { detail: encoded.detail });
}

/** Encode the scene, copy its link and return the message to show. Never throws. */
export function copySceneLink(scene: unknown, env: SceneLinkCopyEnv): Promise<SceneLinkNotice> {
  const encoding = encodeSceneLink(scene);
  const link = encoding.then((encoded) => {
    if (!encoded.ok) throw new Error(encoded.reason);
    return sceneLinkUrl(env.origin, env.studioPath, encoded.value);
  });
  link.catch(() => {}); // reported below from `encoding`
  let copying: Promise<void>;
  try {
    copying = env.copy ? env.copy(link) : Promise.reject(new Error('no clipboard'));
  } catch (error) {
    copying = Promise.reject(error);
  }
  copying.catch(() => {});
  return encoding.then(async (encoded): Promise<SceneLinkNotice> => {
    if (!encoded.ok) return { ok: false, message: encodeFailure(encoded) };
    const url = await link;
    const size = sceneLinkKb(url.length);
    try {
      await copying;
      return { ok: true, url, message: t('studio.sceneLink.copied', { size }) };
    } catch (_) {
      if (!env.showInAddressBar) return { ok: false, url, message: t('studio.sceneLink.copyFailed') };
      env.showInAddressBar(url);
      return { ok: true, url, message: t('studio.sceneLink.copyManual', { size }) };
    }
  }).catch(() => ({ ok: false, message: t('studio.sceneLink.copyFailed') }));
}

/** The message for a link that could not be opened. */
export function sceneLinkOpenFailure(result: Exclude<SceneLinkDecoded, { ok: true }>): string {
  switch (result.reason) {
    case 'too-large': return t('studio.sceneLink.tooLarge', { max: sceneLinkKb(SCENE_LINK_MAX_CHARS) });
    case 'version': return t('studio.sceneLink.newer');
    case 'unsupported': return t('studio.sceneLink.unsupported');
    default: return t('studio.sceneLink.invalid', { detail: result.detail });
  }
}

/** The browser's clipboard and address bar for copySceneLink. */
export function browserSceneLinkEnv(): SceneLinkCopyEnv {
  return {
    origin: window.location.origin,
    studioPath: pathForLocale('/studio', getLocale()),
    copy(link) {
      const clipboard = navigator.clipboard;
      if (!clipboard) return Promise.reject(new Error('no clipboard'));
      if (typeof ClipboardItem === 'function' && typeof clipboard.write === 'function') {
        try {
          const item = new ClipboardItem({ 'text/plain': link.then((url) => new Blob([url], { type: 'text/plain' })) });
          return clipboard.write([item]).catch(() => link.then((url) => clipboard.writeText(url)));
        } catch (_) { /* a ClipboardItem without promise support: write the text once it resolves */ }
      }
      return link.then((url) => clipboard.writeText(url));
    },
    showInAddressBar(url) {
      try {
        window.history.replaceState(window.history.state, '', url);
      } catch (_) { /* a sandboxed frame: the message still names the problem */ }
    },
  };
}
