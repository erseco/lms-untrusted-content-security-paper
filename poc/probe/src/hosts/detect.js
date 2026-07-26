import generic from './generic.js';

/*
 * Un adaptador que reviente en detect se aísla: se anota y el resto sigue.
 * Separado del registro completo para que las salidas pasivas no importen
 * accidentalmente módulos de demostración.
 */
export function detectHost(ctx, adapters) {
  const list = adapters;
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
