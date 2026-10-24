// The Field Manual's data-built chapters (src/docs/chapters). Copyright © 2026 Kevin B. Liu.

/** One section of a chapter: its anchor, heading, markup (figures, tables, cards) and plain text (search). */
export interface RichSection {
  readonly id: string;
  readonly title: string;
  readonly html: string;
  readonly text: string;
}
