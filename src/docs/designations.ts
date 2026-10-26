// Vehicle designations in the manual's captions (T-90M, T-80U, 2A7V, TOS-1A, M1A2): a line never breaks inside one.
// Copyright © 2026 Kevin B. Liu.
// A designation is a token with a digit that is joined by hyphens (T-90M, TOS-1A) or mixes letters and digits (2A7V); each
// sits in a nowrap span (docs.css .dm-nobr), so a caption wraps before the designation instead of after its hyphen, while
// a hyphenated word (anti-aliasing) still breaks as words do. Only the text between tags changes: markup and entities pass
// through. DOM-free, so the prerender and the pages share it.

const DESIGNATION = /(?<![\w&#-])(?:(?=[A-Za-z\d-]*\d)[A-Za-z\d]+(?:-[A-Za-z\d]+)+|(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z\d]+)(?![\w-])/g;

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Markup with each designation in its text held on one line. */
export function keepDesignations(html: string): string {
  return html.split(/(<[^>]*>)/).map((part, index) => (index % 2 ? part : part.replace(DESIGNATION, '<span class="dm-nobr">$&</span>'))).join('');
}

/** Plain text as markup, its designations held on one line. */
export function designationHtml(text: string): string {
  return keepDesignations(escapeHtml(text));
}
