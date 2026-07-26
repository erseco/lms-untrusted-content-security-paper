/*
 * Parte estrictamente pasiva del adaptador Moodle.
 *
 * Vive en un módulo separado para que la salida H5P pueda medir Moodle sin
 * arrastrar al bundle ningún código de las demostraciones mutadoras.
 */
function signalsOf(ctx) {
  const signals = [];
  const pw = ctx.parentWin();
  const pd = ctx.parentDoc();
  try { if (pw && pw.M && pw.M.cfg) signals.push('window.parent.M.cfg'); } catch (e) { /* ignorado */ }
  if (pd) {
    if (pd.querySelector('input[name="sesskey"]')) signals.push('input[name=sesskey]');
    if (pd.body && /^page-/.test(pd.body.id || '')) signals.push('body#page-…');
    if (pd.querySelector('link[href*="/theme/"], script[src*="/lib/javascript.php"]')) {
      signals.push('assets /theme/ o /lib/');
    }
  }
  return signals;
}

function enrolReachable(pd) {
  return Boolean(pd && pd.querySelector('a[href*="/enrol/"], form[action*="/enrol/"]'));
}

export default {
  id: 'moodle',
  label: 'Moodle',

  detect(ctx) {
    const signals = signalsOf(ctx);
    return {
      matched: signals.length > 0,
      confidence: signals.length > 1 ? 'strong' : 'weak',
      signals,
    };
  },

  measure(ctx) {
    const pd = ctx.parentDoc();
    const pw = ctx.parentWin();
    let cfg = false;
    try { cfg = !!(pw && pw.M && pw.M.cfg && pw.M.cfg.sesskey); } catch (e) { /* ignorado */ }
    return {
      moodleSesskeyReachable: Boolean(cfg || (pd && pd.querySelector('input[name="sesskey"]'))),
      moodleAdminLinksReachable: Boolean(pd && pd.querySelector('a[href*="/admin/"]')),
      moodleEditFormsReachable: Boolean(pd && pd.querySelector('form[action*="modedit"], form[action*="course/edit"]')),
      moodleEnrolReachable: enrolReachable(pd),
    };
  },

  demos: [],
};
