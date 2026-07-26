/*
 * Parte estrictamente pasiva del adaptador WordPress.
 *
 * Se mantiene libre de imports de acciones para que el bundle H5P no pueda
 * contener POST, subidas ni cambios de perfil, ni siquiera detrás de botones.
 */
function signalsOf(ctx) {
  const signals = [];
  const pw = ctx.parentWin();
  const pd = ctx.parentDoc();
  try { if (pw && pw.wpApiSettings) signals.push('wpApiSettings'); } catch (e) { /* ignorado */ }
  if (pd) {
    if (pd.getElementById('wpadminbar')) signals.push('#wpadminbar');
    if (pd.querySelector('link[href*="wp-content"], script[src*="wp-includes"]')) {
      signals.push('assets wp-content/wp-includes');
    }
    if (pd.body && /(^|\s)wp-admin(\s|$)/.test(pd.body.className || '')) signals.push('body.wp-admin');
  }
  return signals;
}

function pluginAdminReachable(pd) {
  return Boolean(pd && pd.querySelector(
    'a[href*="plugins.php"], #menu-plugins, [href*="wp/v2/plugins"]',
  ));
}

function userCreateReachable(pd) {
  return Boolean(pd && pd.querySelector(
    'a[href*="user-new.php"], #menu-users, [href*="wp/v2/users"]',
  ));
}

export default {
  id: 'wordpress',
  label: 'WordPress',

  detect(ctx) {
    const signals = signalsOf(ctx);
    return {
      matched: signals.length > 0,
      confidence: signals.length > 1 ? 'strong' : 'weak',
      signals,
    };
  },

  measure(ctx) {
    const pw = ctx.parentWin();
    const pd = ctx.parentDoc();
    let nonce = false;
    try { nonce = !!(pw && pw.wpApiSettings && pw.wpApiSettings.nonce); } catch (e) { /* ignorado */ }
    return {
      wpRestNonceReachable: nonce,
      wpAdminBarReachable: Boolean(pd && pd.getElementById('wpadminbar')),
      wpProfileFormReachable: Boolean(pd && pd.querySelector('form#your-profile')),
      wpPluginAdminReachable: pluginAdminReachable(pd),
      wpUserCreateReachable: userCreateReachable(pd),
    };
  },

  demos: [],
};
