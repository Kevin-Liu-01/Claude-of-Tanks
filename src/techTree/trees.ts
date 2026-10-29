// Tech-tree registry: every national tree, lookups by vehicle, and the shape rules each tree holds. Pure data,
// Node-runnable. First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from './model.ts';
import { CHINA_TREE } from './nations/china.ts';
import { DENMARK_TREE } from './nations/denmark.ts';
import { FRANCE_TREE } from './nations/france.ts';
import { GERMANY_TREE } from './nations/germany.ts';
import { ISRAEL_TREE } from './nations/israel.ts';
import { ITALY_TREE } from './nations/italy.ts';
import { JAPAN_TREE } from './nations/japan.ts';
import { POLAND_TREE } from './nations/poland.ts';
import { RUSSIA_TREE } from './nations/russia.ts';
import { SOUTH_KOREA_TREE } from './nations/south_korea.ts';
import { SWEDEN_TREE } from './nations/sweden.ts';
import { UK_TREE } from './nations/uk.ts';
import { UKRAINE_TREE } from './nations/ukraine.ts';
import { USA_TREE } from './nations/usa.ts';

/** Every national tree, in the Garage's nation order. */
export const TECH_TREES: readonly NationTree[] = Object.freeze([
  USA_TREE, GERMANY_TREE, RUSSIA_TREE, UK_TREE, FRANCE_TREE, CHINA_TREE, ITALY_TREE, JAPAN_TREE, POLAND_TREE,
  SOUTH_KOREA_TREE, SWEDEN_TREE, DENMARK_TREE, ISRAEL_TREE, UKRAINE_TREE,
]);

interface TreePlace {
  readonly tree: NationTree;
  readonly node: TreeNode;
}

const NODE_BY_VEHICLE = new Map<string, TreePlace>();
for (const tree of TECH_TREES) {
  for (const node of tree.nodes) {
    for (const id of [node.id, ...(node.builds ?? [])]) NODE_BY_VEHICLE.set(id, { tree, node });
  }
}

/** The tree that holds a vehicle, and its node there (a twin build resolves to the node it shares). */
export function nodeForVehicle(id: string): TreePlace | null {
  return NODE_BY_VEHICLE.get(id) ?? null;
}

/** Every vehicle id a node stands for: the node's own and its twin builds. */
export function vehiclesOf(node: TreeNode): readonly string[] {
  return node.builds?.length ? [node.id, ...node.builds] : [node.id];
}

/** Children of a node in its tree, in tree order. */
export function childrenOf(tree: NationTree, id: string): TreeNode[] {
  return tree.nodes.filter((node) => node.parents.includes(id));
}

/** The node a tree opens on: its one line root. */
export function rootOf(tree: NationTree): TreeNode {
  return tree.nodes.find((node) => node.slot === 'line' && node.parents.length === 0) ?? tree.nodes[0];
}

/**
 * Every shape rule, as messages (empty when the tree holds them all): unique nodes, builds and cells, known lines,
 * parents in the same tree, no child left of a parent, specials with no parents and no children, one root, and every
 * line node reachable from it.
 */
export function validateTree(tree: NationTree): string[] {
  const problems: string[] = [];
  const byId = new Map<string, TreeNode>();
  const vehicles = new Set<string>();
  const cells = new Set<string>();
  const lines = new Set(tree.lines.map((line) => line.id));
  for (const node of tree.nodes) {
    if (byId.has(node.id)) problems.push(`${node.id}: listed twice`);
    byId.set(node.id, node);
    for (const id of vehiclesOf(node)) {
      if (vehicles.has(id)) problems.push(`${id}: drawn twice`);
      vehicles.add(id);
    }
    const cell = `${node.slot}:${node.lane}:${node.tier}`;
    if (cells.has(cell)) problems.push(`${node.id}: shares cell ${cell}`);
    cells.add(cell);
    if (!lines.has(node.line)) problems.push(`${node.id}: unknown line ${node.line}`);
  }
  for (const node of tree.nodes) {
    if (node.slot === 'special') {
      if (node.parents.length) problems.push(`${node.id}: a special has parents`);
      if (childrenOf(tree, node.id).length) problems.push(`${node.id}: a special has children`);
      continue;
    }
    for (const parentId of node.parents) {
      const parent = byId.get(parentId);
      if (!parent) problems.push(`${node.id}: parent ${parentId} is not in the tree`);
      else if (parent.slot === 'special') problems.push(`${node.id}: parent ${parentId} is a special`);
      else if (parent.tier > node.tier) problems.push(`${node.id}: tier ${node.tier} left of its parent ${parentId} (${parent.tier})`);
    }
  }
  const reached = new Set<string>();
  const queue = tree.nodes.filter((node) => node.slot === 'line' && node.parents.length === 0).map((node) => node.id);
  if (queue.length !== 1) problems.push(`${queue.length} roots (a tree opens at one node)`);
  while (queue.length) {
    const id = queue.shift()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const child of childrenOf(tree, id)) queue.push(child.id);
  }
  for (const node of tree.nodes) {
    if (node.slot === 'line' && !reached.has(node.id)) problems.push(`${node.id}: not reachable from a root`);
  }
  return problems;
}
