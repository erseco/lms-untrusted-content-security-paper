import generic from './generic.js';
import moodle from './moodle.js';
import wordpress from './wordpress.js';
import omeka from './omeka.js';
import nextcloud from './nextcloud.js';
import { detectHost as detectFrom } from './detect.js';

export const ADAPTERS = [moodle, wordpress, omeka, nextcloud, generic];

/*
 * Un adaptador que reviente en detect se aísla: se anota y el resto sigue.
 * El panel no puede quedarse en blanco porque una plataforma cambió su DOM.
 */
export function detectHost(ctx, adapters) {
  return detectFrom(ctx, adapters || ADAPTERS);
}
