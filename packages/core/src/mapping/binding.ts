import type { Binding } from './schema.js';

/** Selects the first Binding whose half-open effective interval contains t. */
export function activeBinding(bindings: readonly Binding[], t: string): Binding | undefined {
  return bindings.find((binding) => binding.effectiveFrom <= t &&
    (binding.effectiveTo === undefined || t < binding.effectiveTo));
}

/** Greatest effectiveFrom, keeping the first on ties; ties are invalid per validateBindings. */
export function latestBinding(bindings: readonly Binding[]): Binding | undefined {
  return bindings.reduce<Binding | undefined>((latest, binding) =>
    latest === undefined || binding.effectiveFrom > latest.effectiveFrom ? binding : latest, undefined);
}
