import { prepareAtlas } from './atlas.js';

/** Retain the normal budget, then grow only when chart count/padding cannot fit. */
export function prepareAdaptiveAtlas(scene, density = 16, maximum = 8192, initial = 2048) {
  if (!Number.isFinite(maximum) || maximum < 1 || initial < 1 || !Number.isInteger(Math.log2(initial)))
    throw new RangeError('Atlas capacities must be finite positive values with a power-of-two initial budget');
  const limit = 2 ** Math.floor(Math.log2(maximum));
  for (let size = Math.min(initial, limit); ; size *= 2) {
    try {
      return prepareAtlas(scene, density, size);
    } catch (error) {
      if (
        size >= limit ||
        !/^Light bake atlas (exceeds chart budget|budget cannot preserve precomputed UV padding)/.test(
          String(error.message),
        )
      )
        throw error;
    }
  }
}
