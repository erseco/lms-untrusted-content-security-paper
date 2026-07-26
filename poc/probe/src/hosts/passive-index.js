import generic from './generic.js';
import moodle from './moodle-passive.js';
import wordpress from './wordpress-passive.js';
import { detectHost } from './detect.js';

// H5P se evalúa aquí únicamente sobre Moodle y WordPress. Mantener esta lista
// pequeña evita incorporar adaptadores con acciones y hace auditable el bundle.
export const PASSIVE_ADAPTERS = [moodle, wordpress, generic];

export function detectPassiveHost(ctx) {
  return detectHost(ctx, PASSIVE_ADAPTERS);
}
