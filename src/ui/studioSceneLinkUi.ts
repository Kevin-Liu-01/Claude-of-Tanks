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
import { uiIconSVG } from './uiIcons.ts';

interface SceneLinkCopyEnv {
  readonly origin: string;
  readonly studioPath: string;
  /** Write the link (resolved later) to the clipboard; called synchronously, inside the click. */
  copy?(link: Promise<string>): Promise<void>;
  /** Fallback: show the link in the address bar. */
  showInAddressBar?(url: string): void;
}

interface SceneLinkNotice {
  readonly ok: boolean;
  /** The plain-language sentence. */
  readonly message: string;
  /** The technical reason (a schema path), shown apart from the sentence; '' when there is none. */
  readonly detail: string;
  readonly url?: string;
}

/**
 * The Studio's link glyphs (constant first-party markup: the copy button and the notice card). No value from a scene or
 * a link is ever part of this markup; the notice writes every message and detail as text.
 */
export const SCENE_LINK_GLYPHS = Object.freeze({
  link: uiIconSVG('link', 16),
  broken: uiIconSVG('alert', 22),
  done: uiIconSVG('check', 22),
});

function encodeFailure(encoded: Exclude<SceneLinkEncoded, { ok: true }>): { message: string; detail: string } {
  return encoded.reason === 'too-large'
    ? { message: t('studio.sceneLink.tooLargeToCopy', { size: sceneLinkKb(encoded.chars), max: sceneLinkKb(SCENE_LINK_MAX_CHARS) }), detail: '' }
    : { message: t('studio.sceneLink.cannotShare'), detail: encoded.detail };
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
    if (!encoded.ok) return { ok: false, ...encodeFailure(encoded) };
    const url = await link;
    const size = sceneLinkKb(url.length);
    try {
      await copying;
      return { ok: true, url, message: t('studio.sceneLink.copied', { size }), detail: '' };
    } catch (_) {
      if (!env.showInAddressBar) return { ok: false, url, message: t('studio.sceneLink.copyFailed'), detail: '' };
      env.showInAddressBar(url);
      return { ok: true, url, message: t('studio.sceneLink.copyManual', { size }), detail: '' };
    }
  }).catch(() => ({ ok: false, message: t('studio.sceneLink.copyFailed'), detail: '' }));
}

/** A refusal names its cause first (blind critic 2026-10-21: a missing battlefield read as a damaged link). */
const SCHEMA_CAUSES: readonly (readonly [RegExp, string])[] = Object.freeze([
  [/: is not a battlefield of this build$/, 'studio.sceneLink.unknownMap'],
  [/: is not a vehicle of this build$/, 'studio.sceneLink.unknownTank'],
  [/: is not a camo of this build$/, 'studio.sceneLink.unknownCamo'],
]);

/**
 * The notice for a link that could not be opened: a plain sentence with the cause and the next step, and for a refused
 * scene the schema path that refused it, shown behind Details (built from this build's own field names, never from the
 * link's keys or values).
 */
export function sceneLinkOpenFailure(result: Exclude<SceneLinkDecoded, { ok: true }>): { message: string; detail: string } {
  const max = sceneLinkKb(SCENE_LINK_MAX_CHARS);
  switch (result.reason) {
    case 'too-large': return {
      message: result.chars ? t('studio.sceneLink.tooLarge', { size: sceneLinkKb(result.chars), max }) : t('studio.sceneLink.tooLargeScene'),
      detail: '',
    };
    case 'version': return { message: t('studio.sceneLink.newer'), detail: '' };
    case 'unsupported': return { message: t('studio.sceneLink.unsupported'), detail: '' };
    default: {
      const cause = SCHEMA_CAUSES.find(([pattern]) => pattern.test(result.detail));
      return { message: t(cause ? cause[1] : 'studio.sceneLink.invalid'), detail: result.detail };
    }
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
