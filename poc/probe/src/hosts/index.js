import generic from './generic.js';
import moodle from './moodle.js';
import wordpress from './wordpress.js';
import omeka from './omeka.js';
import nextcloud from './nextcloud.js';

export const ADAPTERS = [moodle, wordpress, omeka, nextcloud, generic];

/*
 * Un adaptador que reviente en detect se aísla: se anota y el resto sigue.
 * El panel no puede quedarse en blanco porque una plataforma cambió su DOM.
 */
export function detectHost(ctx, adapters) {
  const list = adapters || ADAPTERS;
  const failures = [];

  for (const adapter of list) {
    if (adapter.id === 'generic') continue;
    let r;
    try {
      r = adapter.detect(ctx);
    } catch (e) {
      failures.push({ id: adapter.id, error: (e && e.name) || 'Error' });
      continue;
    }
    if (r && r.matched) {
      return {
        adapter,
        matched: true,
        confidence: r.confidence || 'weak',
        signals: r.signals || [],
        failures,
      };
    }
  }

  const g = list.find((a) => a.id === 'generic') || generic;
  const gr = g.detect(ctx);
  return { adapter: g, matched: false, confidence: 'weak', signals: gr.signals, failures };
}
