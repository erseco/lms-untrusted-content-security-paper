/*
 * probe-ui.js — compact, accessible UI for the sandbox isolation probe.
 *
 * This file only renders measurements already collected by probe.js and invokes
 * the existing opt-in demonstration functions after an explicit user click.
 */
(function () {
  'use strict';

  var RETRY_LIMIT = 20;
  var retryCount = 0;

  var GROUPS = [
    {
      title: 'Aislamiento del recurso',
      description: 'Comprueba si el contenido se ejecuta con un origen opaco y sin permisos de mismo origen.',
      probes: [
        ['canRunJavascript', 'JavaScript activo', 'Confirma que el código de la actividad puede ejecutarse. Es necesario para realizar la prueba y no implica por sí solo una fuga.', 'info'],
        ['isOpaqueOrigin', 'Origen opaco', 'Un origen opaco impide que el recurso comparta el origen del LMS/CMS. El valor seguro es “Sí”.', 'true-safe'],
        ['sandboxAttr', 'Atributo sandbox', 'Muestra el atributo sandbox cuando el navegador permite leerlo. Puede aparecer como “unreadable” precisamente porque existe aislamiento entre orígenes.', 'info'],
        ['sandboxAllowsSameOrigin', 'Permiso de mismo origen', 'Indica si el recurso conserva acceso de mismo origen al documento padre. El valor seguro es “No”.', 'false-safe']
      ]
    },
    {
      title: 'Acceso al LMS/CMS',
      description: 'Mide si el contenido puede leer o controlar la página que lo contiene.',
      probes: [
        ['canAccessParent', 'Acceso a la ventana padre', 'Comprueba si puede leer propiedades protegidas de window.parent. El valor seguro es “Bloqueado”.', 'false-safe'],
        ['canReadParentDocument', 'Lectura del documento padre', 'Comprueba si puede acceder al DOM del LMS/CMS. Si lo consigue, podría modificar la interfaz o extraer datos visibles.', 'false-safe'],
        ['canReadParentCookie', 'Lectura de cookies', 'Comprueba únicamente si document.cookie del padre es accesible. Nunca muestra ni conserva el contenido de las cookies.', 'false-safe'],
        ['parentCookieValue', 'Valor de cookies', 'Siempre se muestra redactado. La sonda no imprime ni transmite cookies reales.', 'info'],
        ['canFindSesskey', 'Detección de sesskey/token', 'Comprueba si existe un token de sesión accesible, sin mostrar ni conservar su valor.', 'false-safe'],
        ['sesskeyValue', 'Valor de sesskey/token', 'Siempre se muestra redactado. La sonda solo comprueba su presencia.', 'info'],
        ['canFindCourseEditForms', 'Formularios de edición', 'Comprueba si el contenido puede localizar formularios administrativos o de edición del curso.', 'false-safe'],
        ['canFindCourseEditLinks', 'Enlaces de administración', 'Comprueba si puede localizar enlaces de edición o administración en la página padre.', 'false-safe'],
        ['canSubmitCourseEditForm', 'Envío de formularios', 'La sonda pasiva nunca envía formularios. Este campo debe permanecer como “no intentado”.', 'info'],
        ['canAccessTop', 'Acceso a la ventana superior', 'Comprueba si puede leer propiedades protegidas de window.top. No intenta navegarla.', 'false-safe'],
        ['canAttemptTopNavigation', 'Navegación superior', 'La sonda pasiva no intenta cambiar la navegación de la ventana superior.', 'info']
      ]
    },
    {
      title: 'APIs y almacenamiento',
      description: 'Revisa otras capacidades que pueden ampliar el alcance del contenido embebido.',
      probes: [
        ['canOpenPopups', 'Apertura de ventanas', 'Abre y cierra inmediatamente una ventana about:blank de 1×1 para comprobar si los popups están permitidos.', 'info'],
        ['canUsePostMessage', 'API postMessage', 'Comprueba si postMessage está disponible. Esta API puede utilizarse de forma segura si el receptor valida origen y datos.', 'info'],
        ['canPostMessageToParent', 'postMessage al padre', 'Comprueba si es posible enviar mensajes al padre. No envía ningún dato durante la sonda.', 'info'],
        ['canCallScormApi', 'Acceso a la API SCORM', 'Comprueba si el objeto de la API SCORM es alcanzable. No llama a ningún método ni modifica progreso o calificaciones.', 'false-safe'],
        ['scormApiFlavor', 'Versión de SCORM', 'Identifica la variante de API detectada, sin invocarla.', 'info'],
        ['canUseLocalStorage', 'localStorage', 'Comprueba si el recurso puede escribir y borrar una clave temporal en localStorage.', 'false-safe'],
        ['canUseSessionStorage', 'sessionStorage', 'Comprueba si el recurso puede escribir y borrar una clave temporal en sessionStorage.', 'false-safe']
      ]
    },
    {
      title: 'Escape del sandbox',
      description: 'Resume si se ha detectado o intentado una salida directa del sandbox.',
      probes: [
        ['sandboxEscape', 'Escape detectado', 'La sonda no ejecuta una técnica de escape. Este indicador solo registra una detección explícita.', 'false-safe'],
        ['sandboxEscapeAttempted', 'Escape intentado', 'Debe permanecer en “No”: la sonda pasiva nunca intenta eliminar ni alterar el atributo sandbox.', 'info']
      ]
    }
  ];

  var DEMOS = [
    ['Moodle', 'profile', '👤', 'Modificar nombre y foto', 'Intenta modificar el perfil del usuario actual usando el acceso de mismo origen. En modo seguro debe quedar bloqueado antes de alcanzar Moodle.', 'exePocOwnUser', true, false],
    ['Moodle', 'flip', '↔', 'Voltear la página', 'Intenta modificar el DOM del LMS aplicando un efecto espejo. Es una demostración visual y reversible de acceso al documento padre.', 'exePocDeface', false, false],
    ['Moodle', 'course', '🏗', 'Crear curso y avisos', 'Intenta usar formularios y credenciales de la sesión para crear un curso, una etiqueta y avisos. Úsalo solo en un entorno desechable autorizado.', 'exePocCreateCourse', true, false],
    ['Moodle', 'restore', '↩', 'Restaurar cambios visuales', 'Revierte los cambios visuales realizados por la demostración. Los cambios persistentes deben revertirse desde el perfil o la administración.', 'exePocRestore', false, true],
    ['WordPress', 'wp-rename', '✎', 'Cambiar nombre del usuario', 'Intenta usar la sesión y el nonce REST de WordPress para cambiar el nombre visible del usuario actual.', 'exePocWpRename', true, false],
    ['WordPress', 'wp-avatar', '🖼', 'Cambiar avatar y subir imagen', 'Intenta modificar avatares visibles y subir una imagen a la biblioteca de medios con las credenciales de la sesión.', 'exePocWpPhoto', true, false],
    ['WordPress', 'wp-content', '▤', 'Crear entradas y páginas', 'Intenta crear dos entradas y dos páginas publicadas mediante la API REST de WordPress.', 'exePocWpCreateContent', true, false]
  ];

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function readableValue(value) {
    if (value === true) { return 'Sí'; }
    if (value === false) { return 'No'; }
    if (value === 'not_attempted') { return 'No intentado'; }
    if (value === 'REDACTED' || value === 'redacted') { return 'Redactado'; }
    if (value === null || typeof value === 'undefined' || value === '') { return 'Sin datos'; }
    return String(value);
  }

  function probeState(value, policy) {
    if (policy === 'true-safe' && typeof value === 'boolean') { return value ? 'safe' : 'danger'; }
    if (policy === 'false-safe' && typeof value === 'boolean') { return value ? 'danger' : 'safe'; }
    return 'info';
  }

  function probeStateLabel(value, policy) {
    var state = probeState(value, policy);
    if (state === 'safe') { return policy === 'true-safe' ? 'Protegido' : 'Bloqueado'; }
    if (state === 'danger') { return 'Accesible'; }
    return readableValue(value);
  }

  function isolationStatus(result) {
    var dangerous = result.sandboxAllowsSameOrigin || result.canAccessParent ||
      result.canReadParentDocument || result.canReadParentCookie || result.canFindSesskey ||
      result.canFindCourseEditForms || result.canFindCourseEditLinks || result.canAccessTop ||
      result.canCallScormApi;

    if (dangerous) {
      return ['danger', '⚠', 'El contenido puede alcanzar el LMS/CMS',
        'Se han detectado capacidades de mismo origen o acceso a la página padre. El sandbox no está conteniendo completamente el recurso.'];
    }
    if (result.isOpaqueOrigin) {
      return ['safe', '✓', 'El contenido está contenido',
        'La sonda no ha podido salir del sandbox ni acceder al documento, cookies o sesión del LMS/CMS.'];
    }
    return ['warning', '?', 'Aislamiento no concluyente',
      'No se detectó acceso directo, pero el origen no aparece como opaco. Revisa la configuración del iframe y las pruebas detalladas.'];
  }

  function probeRow(result, probe) {
    var key = probe[0], value = result[key], state = probeState(value, probe[3]);
    var rawValue = readableValue(value);
    return '<li class="exe-poc-probe exe-poc-probe--' + state + '"><span class="exe-poc-state" aria-hidden="true"></span>' +
      '<span class="exe-poc-probe-label">' + escapeHtml(probe[1]) + '</span>' +
      '<span class="exe-poc-probe-value" title="Valor técnico: ' + escapeHtml(rawValue) + '">' + escapeHtml(probeStateLabel(value, probe[3])) + '</span>' +
      '<button class="exe-poc-help" type="button" aria-expanded="false" aria-label="Ayuda sobre ' + escapeHtml(probe[1]) + '">?</button>' +
      '<span class="exe-poc-help-text" hidden>' + escapeHtml(probe[2]) + '<small>Campo técnico: <code>' + escapeHtml(key) + '</code>. Valor: <code>' + escapeHtml(rawValue) + '</code>.</small></span></li>';
  }

  function probeGroups(result) {
    var html = '';
    for (var i = 0; i < GROUPS.length; i++) {
      var rows = '', dangerCount = 0, group = GROUPS[i];
      for (var j = 0; j < group.probes.length; j++) {
        if (probeState(result[group.probes[j][0]], group.probes[j][3]) === 'danger') { dangerCount++; }
        rows += probeRow(result, group.probes[j]);
      }
      html += '<details class="exe-poc-section"><summary><span>' + escapeHtml(group.title) + '</span><span class="exe-poc-section-count' +
        (dangerCount ? ' exe-poc-section-count--danger' : '') + '">' + (dangerCount ? dangerCount + ' riesgo' + (dangerCount === 1 ? '' : 's') : group.probes.length + ' pruebas') +
        '</span></summary><p class="exe-poc-section-description">' + escapeHtml(group.description) + '</p><ul class="exe-poc-probe-list">' + rows + '</ul></details>';
    }
    return html;
  }

  function demoCard(demo) {
    return '<article class="exe-poc-demo" data-demo-id="' + demo[1] + '"><div class="exe-poc-demo-main">' +
      '<button class="exe-poc-demo-button" type="button" data-demo-run="' + demo[1] + '"><span aria-hidden="true">' + demo[2] + '</span> ' + escapeHtml(demo[3]) + '</button>' +
      '<button class="exe-poc-help" type="button" aria-expanded="false" aria-label="Ayuda sobre ' + escapeHtml(demo[3]) + '">?</button></div>' +
      '<span class="exe-poc-help-text" hidden>' + escapeHtml(demo[4]) + '</span>' +
      '<div class="exe-poc-demo-result" data-demo-result="' + demo[1] + '" aria-live="polite"><span class="exe-poc-demo-result-title">Sin ejecutar</span>' +
      '<span class="exe-poc-demo-result-detail">Pulsa el botón para comprobar si el contenido puede realizar esta acción.</span></div></article>';
  }

  function demosHtml() {
    var groups = ['Moodle', 'WordPress'], html = '';
    for (var i = 0; i < groups.length; i++) {
      var cards = '';
      for (var j = 0; j < DEMOS.length; j++) { if (DEMOS[j][0] === groups[i]) { cards += demoCard(DEMOS[j]); } }
      html += '<section class="exe-poc-demo-group"><h4>' + groups[i] + '</h4>' + cards + '</section>';
    }
    return html;
  }

  function errorsHtml(result) {
    var rows = '', count = 0;
    for (var key in result.errors) {
      if (Object.prototype.hasOwnProperty.call(result.errors, key) && result.errors[key]) {
        count++; rows += '<li><code>' + escapeHtml(key) + '</code><span>' + escapeHtml(result.errors[key]) + '</span></li>';
      }
    }
    return count ? '<details class="exe-poc-section exe-poc-errors"><summary><span>Errores redactados</span><span class="exe-poc-section-count">' + count +
      '</span></summary><p class="exe-poc-section-description">Solo se conserva el nombre del tipo de error; nunca el mensaje ni datos sensibles.</p><ul>' + rows + '</ul></details>' : '';
  }

  function styles() {
    return '#exe-poc-result{all:initial}#exe-poc-panel,#exe-poc-panel *{box-sizing:border-box}#exe-poc-panel{position:fixed;top:12px;right:12px;width:min(430px,calc(100vw - 24px));max-height:calc(100vh - 24px);z-index:2147483647;display:flex;flex-direction:column;font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18212b;background:#fff;border:1px solid #c9d2dc;border-radius:12px;box-shadow:0 12px 38px rgba(18,31,45,.28);overflow:hidden}' +
      '#exe-poc-panel button{font:inherit}.exe-poc-header{display:flex;gap:10px;align-items:flex-start;padding:12px 12px 10px;border-bottom:1px solid #e4e9ee;background:#f8fafc}.exe-poc-title{min-width:0;flex:1}.exe-poc-title h2{margin:0;font-size:15px;line-height:1.2}.exe-poc-title p{margin:3px 0 0;color:#596776;font-size:11px}.exe-poc-window-actions{display:flex;gap:5px}.exe-poc-window-actions button{width:28px;height:28px;border:1px solid #c9d2dc;border-radius:6px;background:#fff;color:#354250;cursor:pointer}.exe-poc-window-actions button:hover,.exe-poc-window-actions button:focus-visible{background:#edf2f6;outline:2px solid #2667a8;outline-offset:1px}' +
      '.exe-poc-body{overflow:auto;padding:10px}.exe-poc-body[hidden]{display:none}.exe-poc-overall{display:grid;grid-template-columns:34px 1fr;gap:9px;padding:10px;border-radius:9px;margin-bottom:9px;border:1px solid}.exe-poc-overall--safe{background:#ecf8ef;border-color:#8bc89a;color:#125b25}.exe-poc-overall--danger{background:#fff0f1;border-color:#e29aa2;color:#861827}.exe-poc-overall--warning{background:#fff8e5;border-color:#e3c36c;color:#704f00}.exe-poc-overall-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;font-weight:800;font-size:18px;background:rgba(255,255,255,.72)}.exe-poc-overall h3{margin:0;font-size:14px}.exe-poc-overall p{margin:3px 0 0;font-size:12px}' +
      '.exe-poc-intro{margin:0 0 8px;border:1px solid #dce3e9;border-radius:8px;background:#fff}.exe-poc-intro summary{cursor:pointer;padding:8px 10px;font-weight:650}.exe-poc-intro div{padding:0 10px 9px;color:#4f5e6c;font-size:12px}.exe-poc-section{margin:0 0 7px;border:1px solid #dce3e9;border-radius:8px;background:#fff;overflow:hidden}.exe-poc-section>summary{display:flex;justify-content:space-between;gap:8px;align-items:center;cursor:pointer;padding:8px 10px;font-weight:650;background:#f8fafc}.exe-poc-section-count{font-size:10px;font-weight:700;color:#5d6a77;background:#e9eef3;border-radius:999px;padding:2px 7px;white-space:nowrap}.exe-poc-section-count--danger{background:#ffe0e3;color:#8b1424}.exe-poc-section-description{margin:0;padding:8px 10px 5px;color:#596776;font-size:11px}' +
      '.exe-poc-probe-list{list-style:none;margin:0;padding:0 7px 7px}.exe-poc-probe{display:grid;grid-template-columns:8px minmax(0,1fr) auto 24px;gap:7px;align-items:center;padding:7px 4px;border-top:1px solid #edf1f4}.exe-poc-probe:first-child{border-top:0}.exe-poc-state{width:8px;height:8px;border-radius:50%;background:#788694}.exe-poc-probe--safe .exe-poc-state{background:#21883a}.exe-poc-probe--danger .exe-poc-state{background:#c1263d}.exe-poc-probe-value{font-size:10px;font-weight:750;text-transform:uppercase;color:#63707d;background:#edf1f4;border-radius:999px;padding:2px 6px;white-space:nowrap}.exe-poc-probe--safe .exe-poc-probe-value{color:#17682c;background:#dff2e4}.exe-poc-probe--danger .exe-poc-probe-value{color:#981b2f;background:#ffe1e5}' +
      '.exe-poc-help{display:inline-grid;place-items:center;width:22px;height:22px;padding:0;border:1px solid #bcc8d2;border-radius:50%;background:#fff;color:#415264;font-weight:750;cursor:pointer}.exe-poc-help:hover,.exe-poc-help:focus-visible{background:#eaf2fa;border-color:#2667a8;outline:2px solid #8db8df;outline-offset:1px}.exe-poc-help-text{grid-column:2/-1;padding:7px 8px;margin:2px 0 1px;border-left:3px solid #81a7c8;background:#f3f7fa;color:#40505f;font-size:11px;border-radius:0 5px 5px 0}.exe-poc-help-text small{display:block;margin-top:5px;color:#657482}.exe-poc-help-text code{font-size:10px}' +
      '.exe-poc-demo-area{margin-top:9px;border-top:1px solid #dce3e9;padding-top:9px}.exe-poc-demo-area>h3{margin:0;font-size:14px}.exe-poc-demo-warning{margin:4px 0 8px;color:#795b08;font-size:11px}.exe-poc-demo-group{margin-top:8px}.exe-poc-demo-group h4{margin:0 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#687583}.exe-poc-demo{border:1px solid #dce3e9;border-radius:8px;margin-bottom:6px;overflow:hidden}.exe-poc-demo-main{display:grid;grid-template-columns:minmax(0,1fr) 28px;gap:6px;align-items:center;padding:6px}.exe-poc-demo-button{width:100%;padding:7px 8px;border:1px solid #9dadbb;border-radius:6px;background:#fff;color:#253647;text-align:left;font-weight:650;cursor:pointer}.exe-poc-demo-button:hover,.exe-poc-demo-button:focus-visible{background:#eef5fb;border-color:#2667a8;outline:2px solid #8db8df;outline-offset:1px}.exe-poc-demo-button:disabled{opacity:.65;cursor:wait}' +
      '.exe-poc-demo>.exe-poc-help-text{display:block;margin:0 6px 6px;padding:7px 8px}.exe-poc-demo>.exe-poc-help-text[hidden]{display:none}.exe-poc-demo-result{display:flex;flex-direction:column;gap:2px;padding:7px 9px;background:#f7f9fb;border-top:1px solid #e5eaee;color:#596776}.exe-poc-demo-result-title{font-weight:750;font-size:11px}.exe-poc-demo-result-detail{font-size:11px;white-space:pre-wrap;max-height:90px;overflow:auto}.exe-poc-demo-result--safe{background:#eaf7ed;color:#155f29}.exe-poc-demo-result--danger{background:#ffebed;color:#8d1728}.exe-poc-demo-result--warning{background:#fff6dd;color:#705100}.exe-poc-demo-result--pending{background:#eef4fa;color:#2f5d88}.exe-poc-errors ul{list-style:none;margin:0;padding:0 10px 8px}.exe-poc-errors li{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #edf1f4;font-size:11px}@media(max-width:520px){#exe-poc-panel{top:6px;right:6px;width:calc(100vw - 12px);max-height:calc(100vh - 12px)}.exe-poc-header{padding:10px}.exe-poc-body{padding:8px}}';
  }

  function panelHtml(result) {
    var status = isolationStatus(result);
    return '<div id="exe-poc-panel" role="dialog" aria-modal="false" aria-labelledby="exe-poc-title"><header class="exe-poc-header">' +
      '<div class="exe-poc-title"><h2 id="exe-poc-title">Sonda de aislamiento</h2><p>Contenido eXeLearning no confiable</p></div>' +
      '<div class="exe-poc-window-actions"><button id="exe-poc-minimize" type="button" aria-expanded="true" aria-label="Minimizar ventana" title="Minimizar">−</button><button id="exe-poc-close" type="button" aria-label="Cerrar ventana" title="Cerrar">×</button></div></header>' +
      '<div id="exe-poc-body" class="exe-poc-body"><section class="exe-poc-overall exe-poc-overall--' + status[0] + '" aria-live="polite"><span class="exe-poc-overall-icon" aria-hidden="true">' + status[1] + '</span><div><h3>' + escapeHtml(status[2]) + '</h3><p>' + escapeHtml(status[3]) + '</p></div></section>' +
      '<details class="exe-poc-intro"><summary>¿Qué comprueba esta ventana?</summary><div>La sonda automática solo mide capacidades y redacta datos sensibles. No realiza peticiones ni cambios. Las pruebas activas de la parte inferior solo se ejecutan al pulsar sus botones y deben usarse en sistemas propios o autorizados.</div></details>' +
      probeGroups(result) + errorsHtml(result) + '<section class="exe-poc-demo-area"><h3>Pruebas activas de escape</h3><p class="exe-poc-demo-warning">Estas acciones pueden realizar cambios reales y reversibles. Ejecútalas únicamente en un entorno de laboratorio autorizado.</p>' + demosHtml() + '</section></div></div>';
  }

  function findDemo(id) {
    for (var i = 0; i < DEMOS.length; i++) { if (DEMOS[i][1] === id) { return DEMOS[i]; } }
    return null;
  }

  function blockedResult(text) { return /\b(BLOQUEADO|BLOCKED)\b|SecurityError|origen opaco|modo secure/i.test(text); }
  function detailText(value) { if (typeof value === 'string') { return value; } try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); } }

  function updateDemoResult(id, state, title, detail) {
    var result = document.querySelector('[data-demo-result="' + id + '"]');
    if (!result) { return; }
    result.className = 'exe-poc-demo-result exe-poc-demo-result--' + state;
    result.querySelector('.exe-poc-demo-result-title').textContent = title;
    result.querySelector('.exe-poc-demo-result-detail').textContent = detail;
  }

  function classifyDemo(demo, value, probeResult) {
    var text = detailText(value);
    if (demo[7]) { return [blockedResult(text) ? 'safe' : 'warning', blockedResult(text) ? 'No había acceso para restaurar' : 'Restauración ejecutada', text]; }
    if (blockedResult(text)) { return ['safe', 'PROTEGIDO · No pudo escapar del sandbox', text]; }
    if (probeResult.canReadParentDocument || probeResult.canAccessParent || probeResult.sandboxAllowsSameOrigin) { return ['danger', 'VULNERABLE · Alcanzó el LMS/CMS', text]; }
    return ['warning', 'Resultado inconcluso', text];
  }

  function runDemo(demo, probeResult) {
    var fn = window[demo[5]], button = document.querySelector('[data-demo-run="' + demo[1] + '"]');
    var complete = function (value) {
      var classified = classifyDemo(demo, value, probeResult);
      updateDemoResult(demo[1], classified[0], classified[1], classified[2]);
      if (button) { button.disabled = false; }
    };
    if (typeof fn !== 'function') { updateDemoResult(demo[1], 'warning', 'Prueba no disponible', 'No se encontró la función ' + demo[5] + '.'); return; }
    if (button) { button.disabled = true; }
    updateDemoResult(demo[1], 'pending', 'Ejecutando la prueba…', 'Comprobando si la acción queda contenida por el sandbox.');
    try { if (demo[6]) { fn(complete); } else { complete(fn()); } } catch (e) { complete('BLOQUEADO: ' + (e && e.name ? e.name : 'Error')); }
  }

  function bindEvents(host, result) {
    host.addEventListener('click', function (event) {
      var helpButton = event.target.closest ? event.target.closest('.exe-poc-help') : null;
      var runButton = event.target.closest ? event.target.closest('[data-demo-run]') : null;
      if (helpButton) {
        var container = helpButton.closest('.exe-poc-probe, .exe-poc-demo');
        var helpText = container ? container.querySelector('.exe-poc-help-text') : null;
        var expanded = helpButton.getAttribute('aria-expanded') === 'true';
        helpButton.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        if (helpText) { helpText.hidden = expanded; }
        return;
      }
      if (runButton) { var demo = findDemo(runButton.getAttribute('data-demo-run')); if (demo) { runDemo(demo, result); } }
    });
    var close = host.querySelector('#exe-poc-close'), minimize = host.querySelector('#exe-poc-minimize'), body = host.querySelector('#exe-poc-body');
    if (close) { close.addEventListener('click', function () { if (host.parentNode) { host.parentNode.removeChild(host); } }); }
    if (minimize && body) {
      minimize.addEventListener('click', function () {
        var expanded = minimize.getAttribute('aria-expanded') === 'true';
        minimize.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        minimize.setAttribute('aria-label', expanded ? 'Expandir ventana' : 'Minimizar ventana');
        minimize.title = expanded ? 'Expandir' : 'Minimizar'; minimize.textContent = expanded ? '+' : '−'; body.hidden = expanded;
      });
    }
  }

  function enhance() {
    var result = window.__EXE_POC_RESULT, oldHost = document.getElementById('exe-poc-result');
    if (!result || !oldHost) { if (retryCount < RETRY_LIMIT) { retryCount++; window.setTimeout(enhance, 50); } return; }
    if (oldHost.getAttribute('data-enhanced') === 'true') { return; }
    var style = document.getElementById('exe-poc-ui-styles');
    if (!style) { style = document.createElement('style'); style.id = 'exe-poc-ui-styles'; style.textContent = styles(); (document.head || document.documentElement).appendChild(style); }
    oldHost.setAttribute('data-enhanced', 'true'); oldHost.innerHTML = panelHtml(result); bindEvents(oldHost, result);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function () { window.setTimeout(enhance, 0); }); } else { window.setTimeout(enhance, 0); }
}());
