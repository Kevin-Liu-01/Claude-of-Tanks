/**
 * The public site's one navigation bar (brand-ui BUI-W1, the Premiere direction's nav). Copyright © 2026 Kevin B. Liu.
 *
 * Every public entry (site/home.html, gallery.html, docs.html, docs-topic.html and the thirteen docs-*.html topics)
 * carries the same bar and inline symbol block, written into its HTML between marker comments by
 * `node tools/public-shell.mjs --write` and checked by `node tools/public-shell.mjs` (publicNav.selftest.mjs). The
 * chrome is static markup: it paints with the document, before any script, in both locales (the /cn build localizes its
 * data-i18n hosts like any other body copy), and publicNav.ts only wires the menu sheet, the language links and the
 * scrolled state.
 *
 *   <!--cot:symbols-->…<!--/cot:symbols-->  the sprite glyphs (#i-*) and flags (#f-*) the page references, inline
 *   <!--cot:nav-->…<!--/cot:nav-->          skip link, bar (mark, wordmark, pages, language, source, Play), menu sheet
 *   <!--cot:footer-->…<!--/cot:footer-->    (optional) mark, pages, language, source with its star count, credit line
 *
 * The game's boot screen (index.html) carries the same pages in <!--cot:bootnav-->…<!--/cot:bootnav--> (bootNavHtml).
 *
 * Dependency-free apart from the sprite index and the wordmark master: the tool and the receipts pass the catalog text in.
 */
import { BRAND_WORDMARK_HTML } from '../ui/brandMark.ts';
import { ACTIVE_MASTERS, SMALL_MASTERS } from '../ui/icons/spriteIndex.ts';
import { brandMarkSVG } from '../ui/brandMark.ts';

export type PublicPageKey = 'home' | 'gallery' | 'docs' | 'studio' | 'media';

export interface PublicShellPage {
  /** The page's route without a locale prefix (`/home`, `/docs/ai`). */
  readonly path: string;
  /** The destination this page belongs to (aria-current); none for the missing page. */
  readonly page: PublicPageKey | null;
}

/** English copy for a catalog key (the tool reads src/ui/i18nCatalog.en-US.json). */
export type ShellText = (key: string) => string;

export const SITE_REPOSITORY = 'https://github.com/Kevin-Liu-01/claude-of-tanks';

/** The destinations, in bar order. Play is the bar's one primary button. */
export const PUBLIC_DESTINATIONS: ReadonlyArray<{ readonly page: PublicPageKey; readonly href: string; readonly icon: string; readonly key: string }> = Object.freeze([
  { page: 'gallery', href: '/gallery', icon: 'gallery', key: 'publicNav.tankGallery' },
  { page: 'docs', href: '/docs', icon: 'manual', key: 'publicNav.fieldManual' },
  { page: 'studio', href: '/studio', icon: 'studio', key: 'publicNav.studio' },
  { page: 'media', href: '/docs/filming#library', icon: 'media', key: 'publicNav.media' },
]);

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The static form of src/ui/icons/icon.ts icon(): a host <svg> referencing the inline symbol block. The stroke the
 * glyphs leave out (one weight per optical size, square caps, mitre joins, currentColor) comes from publicNav.css
 * `.cot-si`, so each static icon carries only its size and reference.
 */
export function iconMarkup(id: string, size = 24, className = ''): string {
  const small = size <= 18 && SMALL_MASTERS.includes(` ${id} `);
  const grid = small ? 16 : 24;
  const fillable = ACTIVE_MASTERS.includes(` ${id} `);
  return `<svg class="cot-i cot-si${small ? ' cot-si--s' : ''}${className ? ` ${className}` : ''}" viewBox="0 0 ${grid} ${grid}" width="${size}" height="${size}" aria-hidden="true"`
    + `${fillable ? ' data-af=""' : ''}><use href="#i-${id}${small ? '-s' : ''}"/></svg>`;
}

/** A nation flag from the inline block (flag-icons 4x3 art, docs/ATTRIBUTION.md). Decorative: the name sits beside it. */
export function flagMarkup(code: string, className = 'cot-flag'): string {
  return `<svg class="${className}" viewBox="0 0 640 480" width="22" height="16" aria-hidden="true" focusable="false"><use href="#f-${code}"/></svg>`;
}

/** The commander mark (src/ui/brandMark.ts; public/brand/mark.svg), `size` px tall: the tank in ink, the commander in the accent. */
export function markMarkup(size = 28): string {
  return brandMarkSVG(size);
}

/** The wordmark, CLAUDE —of— TANKS, as the outlined master (src/ui/brandMark.ts; SPEC 3.1: never live text). Its
 * link names the game, so the drawing is decorative. */
export const WORDMARK = `<span class="cot-wordmark">${BRAND_WORDMARK_HTML}</span>`;

const localeHref = (path: string, chinese: boolean): string => (chinese ? (path === '/' ? '/cn/' : `/cn${path}`) : path);

function languageLinks(path: string, text: ShellText, className: string): string {
  return `<span class="${className}" role="group" aria-label="${escapeHtml(text('publicNav.language.aria'))}" data-i18n-aria-label="publicNav.language.aria">`
    + `<a href="${localeHref(path, false)}" hreflang="en-US" lang="en" aria-label="${escapeHtml(text('publicNav.language.switchToEnglish'))}" data-i18n-aria-label="publicNav.language.switchToEnglish">EN</a>`
    + `<a href="${localeHref(path, true)}" hreflang="zh-CN" lang="zh-CN" aria-label="${escapeHtml(text('publicNav.language.switchToChinese'))}" data-i18n-aria-label="publicNav.language.switchToChinese">中文</a></span>`;
}

function pageLinks(current: PublicPageKey | null, text: ShellText): string {
  return PUBLIC_DESTINATIONS.map((d) => `<a href="${d.href}"${d.page === current ? ' aria-current="page"' : ''}>`
    + `${iconMarkup(d.icon, 18, 'public-nav__icon')}<span data-i18n="${d.key}">${escapeHtml(text(d.key))}</span></a>`).join('');
}

/** The bar and its phone menu sheet. */
export function publicNavHtml(shell: PublicShellPage, text: ShellText): string {
  const play = `${iconMarkup('play', 18)}<span data-i18n="publicNav.playNow">${escapeHtml(text('publicNav.playNow'))}</span>`;
  const github = `<a class="public-nav__icon-link public-nav__github" href="${SITE_REPOSITORY}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(text('publicNav.githubAria'))}" data-i18n-aria-label="publicNav.githubAria">${iconMarkup('github', 16)}</a>`;
  return `<a class="public-skip" href="#main" data-i18n="publicNav.skip">${escapeHtml(text('publicNav.skip'))}</a>`
    + `<nav class="public-nav" aria-label="${escapeHtml(text('publicNav.primaryAria'))}" data-i18n-aria-label="publicNav.primaryAria"><div class="public-nav__inner">`
    + `<a class="public-nav__brand" href="/home"${shell.page === 'home' ? ' aria-current="page"' : ''} aria-label="${escapeHtml(text('publicNav.brandAria'))}" data-i18n-aria-label="publicNav.brandAria">${markMarkup(28)}${WORDMARK}</a>`
    + `<div class="public-nav__links">${pageLinks(shell.page, text)}</div>`
    + `<div class="public-nav__tools">${languageLinks(shell.path, text, 'public-nav__lang')}${github}`
    + `<a class="cot-c-btn cot-c-btn--primary cot-c-btn--36 public-nav__cta" href="/">${play}</a>`
    + `<button class="public-nav__menu-trigger" type="button" aria-expanded="false" aria-controls="public-nav-menu" aria-label="${escapeHtml(text('publicNav.openMenu'))}" data-i18n-aria-label="publicNav.openMenu">${iconMarkup('menu', 24)}</button></div>`
    + `</div><div class="public-nav__menu" id="public-nav-menu" role="group" aria-label="${escapeHtml(text('publicNav.menuAria'))}" data-i18n-aria-label="publicNav.menuAria" hidden>`
    + `<div class="public-nav__menu-links">${pageLinks(shell.page, text)}</div>`
    + `<div class="public-nav__menu-tools">${languageLinks(shell.path, text, 'public-nav__lang')}${github}</div>`
    + `<a class="cot-c-btn cot-c-btn--primary cot-c-btn--56 public-nav__menu-play" href="/">${play}</a></div></nav>`;
}

/** The footer: mark, pages, language, source with its deferred star count, the credit line. */
export function publicFooterHtml(shell: PublicShellPage, text: ShellText, year = 2026): string {
  const stars = '<span class="public-footer__stars" data-github-stars data-github-stars-state="loading" aria-busy="true"></span>';
  return `<footer class="public-footer"><div class="public-footer__inner">`
    + `<a class="public-footer__brand" href="/home" aria-label="${escapeHtml(text('publicNav.brandAria'))}" data-i18n-aria-label="publicNav.brandAria">${markMarkup(24)}${WORDMARK}</a>`
    + `<nav class="public-footer__links" aria-label="${escapeHtml(text('publicNav.footerAria'))}" data-i18n-aria-label="publicNav.footerAria">`
    + `<a href="/" data-i18n="publicNav.playNow">${escapeHtml(text('publicNav.playNow'))}</a>`
    + PUBLIC_DESTINATIONS.map((d) => `<a href="${d.href}" data-i18n="${d.key}">${escapeHtml(text(d.key))}</a>`).join('')
    + `<a href="${SITE_REPOSITORY}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(text('publicNav.githubAria'))}" data-i18n-aria-label="publicNav.githubAria">${iconMarkup('github', 16)}<span>GitHub</span>${stars}</a></nav>`
    + languageLinks(shell.path, text, 'public-footer__lang')
    + `<p class="public-footer__credit"><span>© ${year} Kevin B. Liu</span>`
    + `<a href="https://generaltranslation.com/" target="_blank" rel="noreferrer"><img src="/brand/partners/general-translation.png" alt="" width="16" height="16" loading="lazy" decoding="async">`
    + `<span data-i18n="publicNav.language.credit">${escapeHtml(text('publicNav.language.credit'))}</span></a></p>`
    + `</div></footer>`;
}

/** The ids of the sprite glyphs and flags a document references. */
export function referencedSymbols(html: string): { icons: string[]; flags: string[] } {
  const icons = new Set<string>();
  const flags = new Set<string>();
  for (const [, id] of html.matchAll(/href="#i-([A-Za-z0-9]+(?:-s)?)"/g)) icons.add(id);
  for (const [, code] of html.matchAll(/href="#f-([a-z]{2})"/g)) flags.add(code);
  return { icons: [...icons].sort(), flags: [...flags].sort() };
}

/**
 * The inline symbol block: each referenced sprite glyph (src/ui/icons/sprite.svg) and flag (flag-icons 4x3) once, so
 * the chrome's pictograms paint with the document instead of after the sprite's lazy chunk.
 */
export function symbolBlock(html: string, sprite: string, flagSvg: (code: string) => string): string {
  const { icons, flags } = referencedSymbols(html);
  const symbols: string[] = [];
  for (const id of icons) {
    const symbol = new RegExp(`<symbol id="i-${id}"[^>]*>[\\s\\S]*?</symbol>`).exec(sprite)?.[0];
    if (!symbol) throw new Error(`publicShell: the page references #i-${id}, which the sprite does not draw`);
    symbols.push(symbol);
  }
  for (const code of flags) {
    const svg = flagSvg(code);
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 640 480';
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/>\s+</g, '><').trim();
    symbols.push(`<symbol id="f-${code}" viewBox="${viewBox}">${inner}</symbol>`);
  }
  return `<svg class="cot-symbols" aria-hidden="true" focusable="false" width="0" height="0">${symbols.join('')}</svg>`;
}

const MARKER = (name: string): RegExp => new RegExp(`<!--cot:${name}-->[\\s\\S]*?<!--/cot:${name}-->`);

/** The boot screen's pages (owner 2026-10-27): home and the site's pages that load at once while the game loads behind
 * them. Studio and Play are the game itself; the tech tree is a Garage view. */
const BOOT_DESTINATIONS: ReadonlyArray<{ readonly href: string; readonly icon: string; readonly key: string }> = Object.freeze([
  { href: '/home', icon: 'home', key: 'publicNav.home' },
  ...PUBLIC_DESTINATIONS.filter((d) => d.page === 'gallery' || d.page === 'docs'),
]);

/** A sprite glyph drawn inline: the boot screen paints before the game mounts the sprite (src/ui/icons/icon.ts). */
function inlineIconMarkup(id: string, sprite: string, size: number): string {
  const small = SMALL_MASTERS.includes(` ${id} `);
  const inner = new RegExp(`<symbol id="i-${id}${small ? '-s' : ''}"[^>]*>([\\s\\S]*?)</symbol>`).exec(sprite)?.[1];
  if (!inner) throw new Error(`publicShell: the boot screen links #i-${id}, which the sprite does not draw`);
  const grid = small ? 16 : 24;
  return `<svg class="cot-boot-link-icon cot-boot-glyph${small ? ' cot-boot-glyph--s' : ''}" viewBox="0 0 ${grid} ${grid}" width="${size}" height="${size}" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** The boot screen's links: the site's pages as the splash's quiet buttons, plain anchors (no script, no request). */
export function bootNavHtml(text: ShellText, sprite: string): string {
  return `<nav class="cot-boot-nav" data-cot-boot-control aria-label="${escapeHtml(text('publicNav.menuAria'))}" data-i18n-aria-label="publicNav.menuAria">`
    + BOOT_DESTINATIONS.map((d) => `<a class="cot-boot-link" href="${d.href}">${inlineIconMarkup(d.icon, sprite, 15)}`
      + `<span data-i18n="${d.key}">${escapeHtml(text(d.key))}</span></a>`).join('')
    + `</nav>`;
}

/** Write the boot screen's links into the game document. Idempotent; throws when the marker is missing. */
export function renderBootNav(html: string, text: ShellText, sprite: string): string {
  if (!MARKER('bootnav').test(html)) throw new Error('publicShell: <!--cot:bootnav--> … <!--/cot:bootnav--> is missing');
  return html.replace(MARKER('bootnav'), () => `<!--cot:bootnav-->${bootNavHtml(text, sprite)}<!--/cot:bootnav-->`);
}

/** The shell's route of a document: its canonical path (the docs topic template names /docs). The missing page has no
 * canonical and belongs to no destination: its language links name /404, which publicNav.ts points at the address.
 * Every Field Manual chapter, the Filming one too, is the manual's: Media names a section of that chapter (its
 * #library), not a page of its own, so no document is current under it. */
export function shellPageOf(html: string): PublicShellPage {
  const canonical = /<link rel="canonical" href="https:\/\/[^/"]+(\/[^"]*)"/.exec(html)?.[1];
  if (!canonical) return { path: '/404', page: null };
  const path = canonical.replace(/\/$/, '') || '/';
  const page: PublicPageKey = path.startsWith('/gallery') ? 'gallery'
    : path.startsWith('/docs') ? 'docs'
      : path.startsWith('/studio') ? 'studio' : 'home';
  return { path, page };
}

/**
 * Write the shell into one document: the nav (required) and footer (where the page has its marker), then the symbol
 * block for everything the finished document references. Idempotent; throws when the nav or symbols marker is missing.
 */
export function renderPublicShell(html: string, text: ShellText, sprite: string, flagSvg: (code: string) => string): string {
  const shell = shellPageOf(html);
  const put = (source: string, name: string, body: string): string => {
    if (!MARKER(name).test(source)) throw new Error(`publicShell: <!--cot:${name}--> … <!--/cot:${name}--> is missing`);
    return source.replace(MARKER(name), () => `<!--cot:${name}-->${body}<!--/cot:${name}-->`);
  };
  let out = put(html, 'nav', publicNavHtml(shell, text));
  if (MARKER('footer').test(out)) out = put(out, 'footer', publicFooterHtml(shell, text));
  const withoutSymbols = out.replace(MARKER('symbols'), '');
  return put(out, 'symbols', symbolBlock(withoutSymbols, sprite, flagSvg));
}
