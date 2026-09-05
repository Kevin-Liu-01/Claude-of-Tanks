/**
 * i18nCatalog.ts — assembles the runtime dictionary from per-locale files.
 *
 * Each locale lives in its own file under `src/ui/i18nCatalog.<locale>.ts`
 * so that a single translation table never becomes unwieldy. This file
 * re-exports the catalog and self-registers it with the i18n runtime on
 * first import. Add new keys by editing the matching per-locale file.
 */
import type { SupportedLocale } from './i18n.ts';
import { registerCatalog } from './i18n.ts';
import { enUS } from './i18nCatalog.en-US.ts';
import { zhCN } from './i18nCatalog.zh-CN.ts';

export { enUS, zhCN };

export const CATALOG: Readonly<Record<SupportedLocale, Readonly<Record<string, string>>>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const;

// Self-register: the catalog owns the full English/Chinese tables, so it is
// the single source of truth at module-graph top-level. The registration runs
// once when this module is first imported, before any caller invokes `t()`.
registerCatalog({ CATALOG });
