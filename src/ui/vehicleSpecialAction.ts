import { specialActionDescriptor, type SpecialActionSpec } from '../sim/specialActionPolicy.ts';

/** A mode can replace the gun without changing the vehicle ID. Read the live
 * capability each frame; repaint only when its descriptor or vehicle changes. */
export function createSpecialActionPresentationReader() {
  let previousId: string | null | undefined;
  let previousDescriptor: ReturnType<typeof specialActionDescriptor> | undefined;
  return (spec: (SpecialActionSpec & { id: string }) | null | undefined) => {
    const id = spec?.id ?? null;
    const descriptor = specialActionDescriptor(spec);
    if (id === previousId && descriptor === previousDescriptor) return null;
    previousId = id;
    previousDescriptor = descriptor;
    return descriptor;
  };
}
