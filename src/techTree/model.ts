// Tech-tree data model: the national trees the Garage's tech-tree screen draws (src/ui/techTree.ts). Read-only and
// presentational: every vehicle is available; a node's tier is its column in the drawing, and the game's own tier table
// (src/vehicles/tier.ts) is separate. Pure types: no DOM, no three, Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

/** Roman tier I..X as a number: a node's column. */
export type TreeTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** A line vehicle, or a special: a vehicle outside the lines (a prototype, an export or a one-off build), drawn apart. */
type SlotKind = 'line' | 'special';

interface TreeLine {
  readonly id: string;
  /** English name for tools and receipts; the screen draws the line, it does not label it. */
  readonly name: string;
}

export interface TreeNode {
  /** The playable vehicle id (src/vehicles specs). One node per vehicle across every tree. */
  readonly id: string;
  readonly tier: TreeTier;
  readonly line: string;
  /** Row in the drawn tree; the special lane is drawn under the last line lane. */
  readonly lane: number;
  /** The nodes a connector runs from (a merge has several). Empty for a root or a special. */
  readonly parents: readonly string[];
  readonly slot: SlotKind;
  /** Near-identical twins of `id` (a study build and its base build, a prototype and its production run), drawn on one node. */
  readonly builds?: readonly string[];
}

export interface NationTree {
  readonly id: string;
  /** The spec `nation` strings this tree collects (Russia merges USSR and USSR/Russia). */
  readonly nations: readonly string[];
  /** The flag nation passed to flagIconUrl. */
  readonly flagNation: string;
  readonly name: string;
  readonly lines: readonly TreeLine[];
  readonly nodes: readonly TreeNode[];
}
