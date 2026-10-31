// A registered spec's combat leaves (steps.mjs BALANCE.combat): split out for the per-id spec rows (rows-child.mjs), and
// moved for the runtime proof that a step's outputs do not follow them (trace-check.mjs --combat, combat-perturb.mjs).
// First-party tooling: Kevin B. Liu.

/** [path, holder, key] for every leaf of `spec` the patterns name ('gun.shells[].dmg': each shell's dmg), in pattern order. */
function combatLeaves(spec, patterns) {
  const out = [];
  const walk = (object, [head, ...rest], path) => {
    if (!object || typeof object !== 'object') return;
    if (head.endsWith('[]')) {
      const name = head.slice(0, -2), list = object[name];
      if (Array.isArray(list)) list.forEach((item, index) => walk(item, rest, `${path}${name}[${index}].`));
      return;
    }
    if (!rest.length) { if (Object.hasOwn(object, head)) out.push([`${path}${head}`, object, head]); return; }
    walk(object[head], rest, `${path}${head}.`);
  };
  for (const pattern of patterns) walk(spec, pattern.split('.'), '');
  return out;
}

/** { combat, rest }: the JSON of the spec's combat leaves (path and value) and of the spec without them. */
export function splitCombat(spec, patterns) {
  const copy = JSON.parse(JSON.stringify(spec));
  const leaves = combatLeaves(copy, patterns);
  const combat = JSON.stringify(leaves.map(([path, holder, key]) => [path, holder[key]]));
  for (const [, holder, key] of leaves) delete holder[key];
  return { combat, rest: JSON.stringify(copy) };
}

/** Moves every combat leaf of the spec to another value of its type; returns how many moved. */
export function moveCombat(spec, patterns) {
  let moved = 0;
  for (const [, holder, key] of combatLeaves(spec, patterns)) {
    const value = holder[key];
    if (typeof value === 'number') holder[key] = Number.isInteger(value) ? Math.round(value * 1.37) + 1 : value * 1.37 + 0.5;
    else if (typeof value === 'string') holder[key] = `${value} ~`;
    else continue;
    moved += 1;
  }
  return moved;
}
