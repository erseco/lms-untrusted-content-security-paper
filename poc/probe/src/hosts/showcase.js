/*
 * Vitrina de impacto: ejemplos de lo que podría hacer una persona
 * malintencionada con material didáctico no aislado.
 *
 * Las cinco pintan sobre el DOM del anfitrión, así que solo funcionan sin
 * aislamiento; bajo origen opaco devuelven BLOQUEADO. Ninguna hace red, ninguna
 * persiste, todas se deshacen con un clic y se auto-retiran al vencer el plazo.
 *
 * La maqueta de login NO captura nada: servicio inventado, campos decorativos y
 * aviso al primer contacto. Se demuestra la capacidad visual, que es el riesgo
 * real, sin dejar aquí un recolector de credenciales.
 */

const MARK_ATTR = 'data-exe-showcase-mark';
const LAYER_ATTR = 'data-exe-showcase';

// Selectores probados en orden hasta encontrar una imagen: primero los sitios
// habituales de un logotipo de cabecera, con "img" a secas como último
// recurso genérico. Nunca se toca el archivo enlazado, solo el atributo src
// del elemento en el DOM del anfitrión.
const HEADER_IMG_SELECTORS = [
  'header img',
  '[role="banner"] img',
  '.logo img, #logo img, .site-logo img, .navbar-brand img',
  'nav img',
  'img',
];

function findHeaderImage(doc) {
  for (const sel of HEADER_IMG_SELECTORS) {
    const found = doc.querySelector(sel);
    if (found) return found;
  }
  return null;
}

// Imagen de reemplazo generada en el momento (SVG en un data: URI, sin red ni
// archivo alguno) con el propio aviso de demostración escrito encima: aunque
// la franja no se viera, la imagen sustituida ya delataría que es una prueba.
function demoLogoDataUri(buildId) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="64">' +
    '<rect width="220" height="64" fill="#ff2d55"/>' +
    '<text x="110" y="27" font-family="system-ui,sans-serif" font-size="13" ' +
    'font-weight="700" fill="#fff" text-anchor="middle">LOGOTIPO SUSTITUIDO</text>' +
    '<text x="110" y="45" font-family="system-ui,sans-serif" font-size="10" ' +
    'fill="#ffd7de" text-anchor="middle">DEMOSTRACIÓN · build ' + buildId + '</text>' +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function blocked(ctx) {
  try {
    if (ctx.win.origin === 'null' || (ctx.win.location && ctx.win.location.origin === 'null')) {
      return 'BLOQUEADO (origen opaco / modo secure)';
    }
  } catch (e) { /* ignorado */ }
  if (!ctx.parentDoc()) return 'BLOQUEADO: sin acceso al padre (origen opaco / modo secure)';
  return null;
}

export function createShowcase(options) {
  const buildId = (options && options.buildId) || 'dev';
  const timeoutMs = options && typeof options.timeoutMs === 'number' ? options.timeoutMs : 60000;
  const timers = [];
  const cleanups = [];
  let flipTimer = null;

  function markStrip(doc, onRemove) {
    const strip = doc.createElement('div');
    strip.setAttribute(MARK_ATTR, '');
    strip.style.cssText =
      'position:absolute;top:0;left:0;right:0;z-index:2;display:flex;gap:8px;' +
      'align-items:center;justify-content:center;padding:6px 10px;font:12px/1.3 ' +
      'system-ui,sans-serif;background:#111;color:#ffdf5d;border-bottom:2px solid #ffdf5d';
    const text = doc.createElement('span');
    text.textContent = 'DEMOSTRACIÓN eXeLearning · build ' + buildId;
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = 'Quitar';
    button.style.cssText = 'font:inherit;padding:1px 8px;cursor:pointer';
    button.addEventListener('click', onRemove);
    strip.appendChild(text);
    strip.appendChild(button);
    return strip;
  }

  function mountLayer(ctx, kind, build) {
    const doc = ctx.parentDoc();
    const layer = doc.createElement('div');
    layer.setAttribute(LAYER_ATTR, kind);
    layer.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;overflow:hidden;' +
      'font:14px/1.4 system-ui,sans-serif';

    const layerCleanups = [];
    const onCleanup = (fn) => { layerCleanups.push(fn); };

    const remove = () => {
      while (layerCleanups.length) {
        try { layerCleanups.pop()(); } catch (e) { /* ignorado */ }
      }
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    };
    layer.appendChild(markStrip(doc, remove));
    build(doc, layer, remove, onCleanup);
    doc.body.appendChild(layer);

    cleanups.push(remove);
    timers.push(setTimeout(remove, timeoutMs));
    return layer;
  }

  function flip(ctx, journal, cb) {
    const stop = blocked(ctx);
    if (stop) { cb(stop); return; }
    const body = ctx.parentDoc().body;
    const on = body.style.transform.indexOf('scaleX(-1)') !== -1;

    if (flipTimer) { clearTimeout(flipTimer); flipTimer = null; }

    const revert = () => { body.style.transform = ''; body.style.transformOrigin = ''; };

    if (on) {
      revert();
      cb('OK: el anfitrión ha vuelto a su orientación normal.');
      return;
    }

    body.style.transform = 'scaleX(-1)';
    body.style.transformOrigin = 'center';
    cleanups.push(revert);
    flipTimer = setTimeout(revert, timeoutMs);
    timers.push(flipTimer);
    cb('OK: el anfitrión se ha volteado en horizontal desde el recurso. Reversible.');
  }

  function terminal(ctx, journal, cb) {
    const stop = blocked(ctx);
    if (stop) { cb(stop); return; }

    mountLayer(ctx, 'terminal', (doc, layer, remove, onCleanup) => {
      const mono =
        'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace';
      layer.style.background = '#020804';
      layer.style.color = '#39ff14';
      layer.style.fontFamily = mono;

      // Lluvia Matrix a pantalla completa (katakana + alfanuméricos, cabeza brillante).
      const canvas = doc.createElement('canvas');
      canvas.setAttribute('data-exe-showcase-rain', '');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:.72';
      layer.appendChild(canvas);

      // Viñeta + scanlines CRT (solo CSS, sin imagen ni red).
      const crt = doc.createElement('div');
      crt.setAttribute('aria-hidden', 'true');
      crt.style.cssText =
        'position:absolute;inset:0;z-index:1;pointer-events:none;' +
        'background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.55) 100%),' +
        'repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0,rgba(0,0,0,.12) 1px,transparent 1px,transparent 3px)';
      layer.appendChild(crt);

      // Panel de intrusión: log de comandos + barra de progreso.
      const hud = doc.createElement('div');
      hud.setAttribute('data-exe-showcase-hack', '');
      hud.style.cssText =
        'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;' +
        'width:min(520px,92vw);padding:18px 18px 16px;box-sizing:border-box;' +
        'background:rgba(0,12,4,.88);border:1px solid rgba(57,255,20,.45);' +
        'box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 40px rgba(57,255,20,.18),inset 0 0 60px rgba(0,40,10,.35);' +
        'backdrop-filter:blur(2px)';

      const title = doc.createElement('div');
      title.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;gap:10px;' +
        'margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(57,255,20,.25);' +
        'font:600 12px/1.3 ' + mono + ';letter-spacing:.06em;color:#9dff9a;text-transform:uppercase';
      const titleLeft = doc.createElement('span');
      titleLeft.textContent = 'root@host — intrusion sequence';
      const titleRight = doc.createElement('span');
      titleRight.setAttribute('data-exe-showcase-phase', '');
      titleRight.style.cssText = 'color:#39ff14;opacity:.85';
      titleRight.textContent = 'INIT';
      title.appendChild(titleLeft);
      title.appendChild(titleRight);

      const log = doc.createElement('pre');
      log.setAttribute('data-exe-showcase-log', '');
      log.style.cssText =
        'margin:0 0 14px;min-height:9.5em;max-height:11em;overflow:hidden;' +
        'font:12px/1.55 ' + mono + ';color:#39ff14;white-space:pre-wrap;word-break:break-word';

      const progWrap = doc.createElement('div');
      progWrap.style.cssText = 'margin-bottom:8px';
      const progMeta = doc.createElement('div');
      progMeta.style.cssText =
        'display:flex;justify-content:space-between;margin-bottom:6px;' +
        'font:11px/1 ' + mono + ';color:#9dff9a;letter-spacing:.04em';
      const progLabel = doc.createElement('span');
      progLabel.textContent = 'BREACH PROGRESS';
      const progPct = doc.createElement('span');
      progPct.setAttribute('data-exe-showcase-pct', '');
      progPct.textContent = '0%';
      progMeta.appendChild(progLabel);
      progMeta.appendChild(progPct);

      const track = doc.createElement('div');
      track.style.cssText =
        'position:relative;height:14px;background:rgba(0,30,8,.9);' +
        'border:1px solid rgba(57,255,20,.4);overflow:hidden';
      const fill = doc.createElement('div');
      fill.setAttribute('data-exe-showcase-bar', '');
      fill.style.cssText =
        'height:100%;width:0%;background:linear-gradient(90deg,#0a5,#39ff14 55%,#c8ffb0);' +
        'box-shadow:0 0 12px rgba(57,255,20,.65);transition:width .35s linear';
      track.appendChild(fill);
      progWrap.appendChild(progMeta);
      progWrap.appendChild(track);

      const status = doc.createElement('div');
      status.setAttribute('data-exe-showcase-status', '');
      status.style.cssText =
        'font:11px/1.4 ' + mono + ';color:#7dcf7a;opacity:.9';
      status.textContent = 'Esperando vector de ataque…';

      hud.appendChild(title);
      hud.appendChild(log);
      hud.appendChild(progWrap);
      hud.appendChild(status);
      layer.appendChild(hud);

      // Banner final (PWNED): oculto hasta completar la barra.
      const banner = doc.createElement('div');
      banner.setAttribute('data-exe-showcase-pwned', '');
      banner.style.cssText =
        'position:absolute;inset:0;display:none;place-items:center;z-index:3;' +
        'font:700 clamp(32px,10vw,104px)/1 ' + mono + ';' +
        'color:#ff2d55;text-shadow:0 0 8px rgba(255,45,85,.95),0 0 42px rgba(255,45,85,.55);' +
        'letter-spacing:.12em;pointer-events:none';
      banner.textContent = 'PWNED';
      layer.appendChild(banner);

      const STEPS = [
        { pct: 8, phase: 'SCAN', line: '[*] Escaneando origen del anfitrión…', status: 'Reconocimiento' },
        { pct: 18, phase: 'SCAN', line: '[*] User-Agent y cookies de sesión en alcance', status: 'Reconocimiento' },
        { pct: 28, phase: 'PROBE', line: '[+] parent.document accesible (mismo origen)', status: 'Sin sandbox' },
        { pct: 40, phase: 'PROBE', line: '[*] Escalando al marco padre…', status: 'Escalada de marco' },
        { pct: 52, phase: 'INJECT', line: '[+] Inyectando capa overlay z-index:2147483646', status: 'Inyección DOM' },
        { pct: 64, phase: 'INJECT', line: '[*] Secuestrando viewport del anfitrión', status: 'Inyección DOM' },
        { pct: 76, phase: 'BREACH', line: '[*] Comprometiendo sesión visual…', status: 'Breach en curso' },
        { pct: 88, phase: 'BREACH', line: '[+] Controles de UI del anfitrión inaccesibles', status: 'Breach en curso' },
        { pct: 100, phase: 'ROOT', line: '[!] ACCESO TOTAL — pantalla secuestrada', status: 'Sistema comprometido' },
      ];

      const lines = [];
      let step = 0;
      let blink = 0;
      let blinkOn = true;
      let stepTimer = 0;
      let revealTimer = 0;

      const setProgress = (pct) => {
        fill.style.width = pct + '%';
        progPct.textContent = pct + '%';
      };

      const revealPwned = () => {
        revealTimer = 0;
        hud.style.opacity = '.35';
        hud.style.filter = 'blur(1px)';
        banner.style.display = 'grid';
        banner.textContent = 'PWNED';
        banner.style.opacity = '1';
        if (blink) clearInterval(blink);
        blink = setInterval(() => {
          blinkOn = !blinkOn;
          banner.textContent = blinkOn ? 'PWNED' : 'ACCESO CONCEDIDO';
          banner.style.opacity = blinkOn ? '1' : '.55';
        }, 600);
      };

      const tick = () => {
        if (step >= STEPS.length) {
          clearInterval(stepTimer);
          stepTimer = 0;
          if (!revealTimer && banner.style.display !== 'grid') revealPwned();
          return;
        }
        const s = STEPS[step];
        step += 1;
        lines.push(s.line);
        if (lines.length > 7) lines.shift();
        log.textContent = lines.join('\n');
        titleRight.textContent = s.phase;
        status.textContent = s.status;
        setProgress(s.pct);
        if (s.pct >= 100) {
          clearInterval(stepTimer);
          stepTimer = 0;
          // Pequeña pausa dramática antes del banner.
          revealTimer = setTimeout(revealPwned, 450);
        }
      };

      // Primer tick ya (no esperar el intervalo) para que la capa no quede vacía.
      tick();
      stepTimer = setInterval(tick, 480);

      // Lluvia: glifos tipo Matrix, cabeza clara, estela en degradado.
      const GLYPHS =
        'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF<>{}/*#$%&';
      const view = doc.defaultView || ctx.win;
      const cx = canvas.getContext ? canvas.getContext('2d') : null;
      let cols = 0;
      let drops = [];
      let speeds = [];
      let raf = 0;
      const cell = 16;

      const resize = () => {
        const w = layer.clientWidth || (view.innerWidth) || 800;
        const h = layer.clientHeight || (view.innerHeight) || 600;
        canvas.width = w;
        canvas.height = h;
        cols = Math.max(1, Math.floor(w / cell));
        drops = new Array(cols).fill(0).map(() => Math.random() * (h / cell));
        speeds = new Array(cols).fill(0).map(() => 0.55 + Math.random() * 0.9);
      };
      resize();

      const draw = () => {
        if (cx) {
          // mountLayer llama a build() antes de appendChild: al primer frame ya
          // está en el DOM y clientWidth refleja el viewport real.
          const lw = layer.clientWidth;
          const lh = layer.clientHeight;
          if (lw > 0 && lh > 0 && (canvas.width !== lw || canvas.height !== lh)) resize();

          cx.fillStyle = 'rgba(2,8,4,.12)';
          cx.fillRect(0, 0, canvas.width, canvas.height);
          cx.font = '14px ' + mono;
          for (let i = 0; i < drops.length; i++) {
            const ch = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
            const x = i * cell;
            const y = drops[i] * cell;
            cx.fillStyle = '#d8ffe0';
            cx.fillText(ch, x, y);
            cx.fillStyle = 'rgba(57,255,20,.55)';
            cx.fillText(GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)), x, y - cell);
            cx.fillStyle = 'rgba(20,140,40,.35)';
            cx.fillText(GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)), x, y - cell * 2);
            drops[i] += speeds[i];
            if (drops[i] * cell > canvas.height && Math.random() > 0.975) {
              drops[i] = 0;
              speeds[i] = 0.55 + Math.random() * 0.9;
            }
          }
        }
        if (view.requestAnimationFrame) raf = view.requestAnimationFrame(draw);
      };
      if (view.requestAnimationFrame) raf = view.requestAnimationFrame(draw);

      onCleanup(() => {
        if (stepTimer) { clearInterval(stepTimer); stepTimer = 0; }
        if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
        if (blink) { clearInterval(blink); blink = 0; }
        if (raf && view.cancelAnimationFrame) view.cancelAnimationFrame(raf);
      });
    });

    cb('OK: el recurso ha tomado la pantalla completa del anfitrión. Reversible.');
  }

  function login(ctx, journal, cb) {
    const stop = blocked(ctx);
    if (stop) { cb(stop); return; }

    // Flujo de login estilo «cuenta de identidad» (el patrón visual que la gente
    // asocia a Google): card blanca, logo multicolor PROPIO, pasos correo →
    // contraseña. Marca inventada: Orbe. Nunca un logo ni nombre real.
    mountLayer(ctx, 'login', (doc, layer) => {
      const sans = 'Roboto,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif';
      layer.style.background = '#f0f4f9';
      layer.style.fontFamily = sans;
      layer.style.overflow = 'auto';

      const shell = doc.createElement('div');
      shell.style.cssText =
        'min-height:100%;display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;padding:48px 16px 32px;box-sizing:border-box';

      const card = doc.createElement('div');
      card.setAttribute('data-exe-showcase-login-card', '');
      card.style.cssText =
        'width:min(450px,100%);background:#fff;border:1px solid #dadce0;border-radius:8px;' +
        'padding:48px 40px 36px;box-sizing:border-box;' +
        'box-shadow:0 1px 3px rgba(60,64,67,.08)';

      // Logo inventado: círculo de 4 sectores de color (no es la «G»).
      const logo = doc.createElement('div');
      logo.setAttribute('data-exe-showcase-login-brand', '');
      logo.setAttribute('aria-hidden', 'true');
      logo.style.cssText = 'display:flex;justify-content:center;margin-bottom:16px';
      const logoSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      logoSvg.setAttribute('width', '48');
      logoSvg.setAttribute('height', '48');
      logoSvg.setAttribute('viewBox', '0 0 48 48');
      // Anillo partido en 4 arcos de color + punto central.
      const arcs = [
        ['#4285F4', 'M24 6 A18 18 0 0 1 42 24'],
        ['#34A853', 'M42 24 A18 18 0 0 1 24 42'],
        ['#FBBC05', 'M24 42 A18 18 0 0 1 6 24'],
        ['#EA4335', 'M6 24 A18 18 0 0 1 24 6'],
      ];
      for (const [color, d] of arcs) {
        const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', color);
        p.setAttribute('stroke-width', '6');
        p.setAttribute('stroke-linecap', 'round');
        logoSvg.appendChild(p);
      }
      const core = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      core.setAttribute('cx', '24');
      core.setAttribute('cy', '24');
      core.setAttribute('r', '5');
      core.setAttribute('fill', '#5f6368');
      logoSvg.appendChild(core);
      logo.appendChild(logoSvg);

      const brand = doc.createElement('div');
      brand.style.cssText =
        'text-align:center;font:500 14px/1.2 ' + sans + ';color:#5f6368;margin-bottom:18px;letter-spacing:.02em';
      // Servicio INVENTADO a propósito: nunca una marca real.
      brand.textContent = 'Orbe';

      const title = doc.createElement('h1');
      title.setAttribute('data-exe-showcase-login-title', '');
      title.style.cssText =
        'margin:0 0 8px;text-align:center;font:400 24px/1.3 ' + sans + ';color:#202124';
      title.textContent = 'Inicia sesión';

      const subtitle = doc.createElement('div');
      subtitle.setAttribute('data-exe-showcase-login-sub', '');
      subtitle.style.cssText =
        'text-align:center;font:400 16px/1.4 ' + sans + ';color:#202124;margin-bottom:28px';
      subtitle.textContent = 'Usa tu cuenta de Orbe';

      const form = doc.createElement('form');
      form.addEventListener('submit', (e) => e.preventDefault());

      const reveal = doc.createElement('p');
      reveal.setAttribute('data-exe-showcase-reveal', '');
      reveal.hidden = true;
      reveal.style.cssText =
        'margin:0 0 16px;padding:10px 12px;background:#fce8e6;border-radius:4px;' +
        'border-left:4px solid #d93025;font:13px/1.45 ' + sans + ';color:#c5221f;text-align:left';
      reveal.textContent =
        'DEMOSTRACIÓN — no se ha capturado nada. Esta ventana la ha pintado el ' +
        'material didáctico dentro de la página legítima: la barra de direcciones ' +
        'seguiría mostrando la dirección correcta.';

      const show = () => { reveal.hidden = false; };

      // Paso 1: correo · Paso 2: contraseña (patrón de cuenta unificada).
      const stepEmail = doc.createElement('div');
      stepEmail.setAttribute('data-exe-showcase-login-step', 'email');
      const stepPass = doc.createElement('div');
      stepPass.setAttribute('data-exe-showcase-login-step', 'password');
      stepPass.hidden = true;

      const fieldStyle =
        'display:block;width:100%;box-sizing:border-box;height:54px;padding:13px 15px;' +
        'border:1px solid #dadce0;border-radius:4px;font:16px/1.25 ' + sans +
        ';color:#202124;background:#fff;outline:none';
      const linkStyle =
        'display:inline-block;margin-top:10px;border:0;background:none;padding:0;' +
        'font:500 14px/1.4 ' + sans + ';color:#1a73e8;cursor:pointer;text-align:left';

      const emailInput = doc.createElement('input');
      emailInput.type = 'email';
      emailInput.setAttribute('data-exe-showcase-login-email', '');
      // Decorativo: readonly y sin lectura de value en ningún punto del código.
      emailInput.readOnly = true;
      emailInput.setAttribute('readonly', '');
      emailInput.setAttribute('autocomplete', 'off');
      emailInput.setAttribute('placeholder', 'Correo electrónico o teléfono');
      emailInput.style.cssText = fieldStyle;
      emailInput.addEventListener('focus', show);
      emailInput.addEventListener('keydown', show);

      const forgotEmail = doc.createElement('button');
      forgotEmail.type = 'button';
      forgotEmail.textContent = '¿Has olvidado tu correo electrónico?';
      forgotEmail.style.cssText = linkStyle;
      forgotEmail.addEventListener('click', show);

      const guestHint = doc.createElement('p');
      guestHint.style.cssText =
        'margin:28px 0 0;font:14px/1.5 ' + sans + ';color:#5f6368;text-align:left';
      guestHint.textContent =
        '¿No es tu ordenador? Usa el modo de invitado para iniciar sesión de forma privada.';

      stepEmail.appendChild(emailInput);
      stepEmail.appendChild(forgotEmail);
      stepEmail.appendChild(guestHint);

      const chip = doc.createElement('button');
      chip.type = 'button';
      chip.setAttribute('data-exe-showcase-login-chip', '');
      chip.style.cssText =
        'display:inline-flex;align-items:center;gap:8px;margin:0 auto 24px;padding:4px 12px 4px 4px;' +
        'border:1px solid #dadce0;border-radius:16px;background:#fff;cursor:pointer;' +
        'font:500 14px/1.2 ' + sans + ';color:#3c4043';
      const avatar = doc.createElement('span');
      avatar.setAttribute('aria-hidden', 'true');
      avatar.style.cssText =
        'width:24px;height:24px;border-radius:50%;background:#1a73e8;color:#fff;' +
        'display:inline-grid;place-items:center;font:600 12px/1 ' + sans;
      avatar.textContent = 'U';
      const chipLabel = doc.createElement('span');
      chipLabel.textContent = 'usuario@ejemplo.org';
      chip.appendChild(avatar);
      chip.appendChild(chipLabel);
      chip.addEventListener('click', () => {
        show();
        stepPass.hidden = true;
        stepEmail.hidden = false;
        title.textContent = 'Inicia sesión';
        subtitle.textContent = 'Usa tu cuenta de Orbe';
        nextBtn.textContent = 'Siguiente';
      });

      const passInput = doc.createElement('input');
      passInput.type = 'password';
      passInput.setAttribute('data-exe-showcase-login-pass', '');
      passInput.readOnly = true;
      passInput.setAttribute('readonly', '');
      passInput.setAttribute('autocomplete', 'off');
      passInput.setAttribute('placeholder', 'Introduce tu contraseña');
      passInput.style.cssText = fieldStyle;
      passInput.addEventListener('focus', show);
      passInput.addEventListener('keydown', show);

      const showPassRow = doc.createElement('label');
      showPassRow.style.cssText =
        'display:flex;align-items:center;gap:10px;margin-top:14px;' +
        'font:14px/1.3 ' + sans + ';color:#202124;cursor:pointer;user-select:none';
      const showPass = doc.createElement('input');
      showPass.type = 'checkbox';
      showPass.setAttribute('data-exe-showcase-login-showpass', '');
      // Solo cosmético: no hay valor real que revelar.
      showPass.addEventListener('change', show);
      const showPassText = doc.createElement('span');
      showPassText.textContent = 'Mostrar contraseña';
      showPassRow.appendChild(showPass);
      showPassRow.appendChild(showPassText);

      stepPass.appendChild(chip);
      stepPass.appendChild(passInput);
      stepPass.appendChild(showPassRow);

      const actions = doc.createElement('div');
      actions.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;margin-top:32px;gap:12px';

      const createBtn = doc.createElement('button');
      createBtn.type = 'button';
      createBtn.textContent = 'Crear cuenta';
      createBtn.style.cssText =
        'border:0;background:none;padding:8px 8px;font:500 14px/1.2 ' + sans +
        ';color:#1a73e8;cursor:pointer';
      createBtn.addEventListener('click', show);

      const nextBtn = doc.createElement('button');
      nextBtn.type = 'submit';
      nextBtn.setAttribute('data-exe-showcase-login-next', '');
      nextBtn.textContent = 'Siguiente';
      nextBtn.style.cssText =
        'border:0;border-radius:4px;padding:10px 24px;font:500 14px/1.2 ' + sans +
        ';color:#fff;background:#1a73e8;cursor:pointer;box-shadow:0 1px 2px rgba(60,64,67,.3)';
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        show();
        if (!stepPass.hidden) return;
        stepEmail.hidden = true;
        stepPass.hidden = false;
        title.textContent = 'Te damos la bienvenida';
        subtitle.textContent = 'para continuar en la plataforma';
        nextBtn.textContent = 'Siguiente';
      });

      actions.appendChild(createBtn);
      actions.appendChild(nextBtn);

      form.appendChild(reveal);
      form.appendChild(stepEmail);
      form.appendChild(stepPass);
      form.appendChild(actions);

      card.appendChild(logo);
      card.appendChild(brand);
      card.appendChild(title);
      card.appendChild(subtitle);
      card.appendChild(form);

      const footer = doc.createElement('div');
      footer.style.cssText =
        'width:min(450px,100%);margin-top:18px;display:flex;justify-content:space-between;' +
        'align-items:center;font:12px/1.3 ' + sans + ';color:#5f6368;box-sizing:border-box;padding:0 4px';
      const lang = doc.createElement('span');
      lang.textContent = 'Español (España)';
      const links = doc.createElement('span');
      links.style.cssText = 'display:flex;gap:18px';
      for (const t of ['Ayuda', 'Privacidad', 'Condiciones']) {
        const a = doc.createElement('span');
        a.textContent = t;
        links.appendChild(a);
      }
      footer.appendChild(lang);
      footer.appendChild(links);

      shell.appendChild(card);
      shell.appendChild(footer);
      layer.appendChild(shell);
    });

    cb('OK: el recurso ha pintado una ventana de identificación falsa sobre el anfitrión. Reversible.');
  }

  function logo(ctx, journal, cb) {
    const stop = blocked(ctx);
    if (stop) { cb(stop); return; }

    const hostDoc = ctx.parentDoc();
    const img = findHeaderImage(hostDoc);
    if (!img) {
      cb('OK: no se ha encontrado ninguna imagen de cabecera en el anfitrión que sustituir.');
      return;
    }

    const hadSrc = img.hasAttribute('src');
    const originalSrc = hadSrc ? img.getAttribute('src') : null;

    // La capa a pantalla completa solo sirve de soporte para la franja: no
    // bloquea el resto de la página (pointer-events:none), porque el efecto
    // real ocurre en el <img> del anfitrión, fuera de esta capa.
    mountLayer(ctx, 'logo', (doc, layer, remove, onCleanup) => {
      layer.style.pointerEvents = 'none';
      const strip = layer.querySelector('[' + MARK_ATTR + ']');
      if (strip) strip.style.pointerEvents = 'auto';

      img.setAttribute('src', demoLogoDataUri(buildId));

      onCleanup(() => {
        if (hadSrc) img.setAttribute('src', originalSrc);
        else img.removeAttribute('src');
      });
    });

    cb('OK: el recurso ha sustituido el logotipo de la cabecera del anfitrión. Reversible.');
  }

  function notice(ctx, journal, cb) {
    const stop = blocked(ctx);
    if (stop) { cb(stop); return; }

    // Página de mantenimiento a pantalla completa: el patrón visual que
    // cualquiera reconoce (status page genérica), sin marcas reales.
    mountLayer(ctx, 'notice', (doc, layer, remove, onCleanup) => {
      const sans = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
      layer.style.background = 'linear-gradient(165deg,#f0f4f8 0%,#e2e8f0 45%,#dbe4ee 100%)';
      layer.style.color = '#1e293b';
      layer.style.fontFamily = sans;
      layer.style.overflow = 'auto';

      // Fondo con patrón sutil de engranajes (SVG data URI, sin red).
      const pattern = doc.createElement('div');
      pattern.setAttribute('aria-hidden', 'true');
      pattern.style.cssText =
        'position:absolute;inset:0;opacity:.07;pointer-events:none;' +
        'background-image:url("data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
          '<g fill="none" stroke="#334155" stroke-width="2">' +
          '<circle cx="20" cy="20" r="8"/><path d="M20 8v4M20 28v4M8 20h4M28 20h4M11 11l3 3M26 26l3 3M11 29l3-3M26 14l3-3"/>' +
          '<circle cx="58" cy="52" r="10"/><path d="M58 38v5M58 61v5M44 52h5M67 52h5M46 40l3.5 3.5M66.5 60.5l3.5 3.5M46 64l3.5-3.5M66.5 43.5l3.5-3.5"/>' +
          '</g></svg>'
        ) +
        '");background-size:80px 80px';
      layer.appendChild(pattern);

      const shell = doc.createElement('div');
      shell.setAttribute('data-exe-showcase-notice-page', '');
      shell.style.cssText =
        'position:relative;z-index:1;min-height:100%;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;padding:56px 20px 40px;box-sizing:border-box';

      const card = doc.createElement('div');
      card.style.cssText =
        'width:min(560px,100%);background:#fff;border-radius:16px;' +
        'box-shadow:0 1px 2px rgba(15,23,42,.06),0 12px 40px rgba(15,23,42,.1);' +
        'border:1px solid rgba(148,163,184,.35);padding:40px 36px 32px;text-align:center';

      // Icono de engranaje (inline SVG, sin emoji).
      const iconWrap = doc.createElement('div');
      iconWrap.setAttribute('aria-hidden', 'true');
      iconWrap.style.cssText =
        'width:72px;height:72px;margin:0 auto 20px;border-radius:50%;' +
        'background:linear-gradient(145deg,#eff6ff,#dbeafe);' +
        'display:grid;place-items:center;border:1px solid #bfdbfe';
      const gear = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      gear.setAttribute('width', '36');
      gear.setAttribute('height', '36');
      gear.setAttribute('viewBox', '0 0 24 24');
      gear.setAttribute('fill', 'none');
      gear.setAttribute('stroke', '#2563eb');
      gear.setAttribute('stroke-width', '1.75');
      gear.setAttribute('stroke-linecap', 'round');
      gear.setAttribute('stroke-linejoin', 'round');
      const gearCircle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      gearCircle.setAttribute('cx', '12');
      gearCircle.setAttribute('cy', '12');
      gearCircle.setAttribute('r', '3');
      const gearPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      gearPath.setAttribute(
        'd',
        'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06' +
        'a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09' +
        'a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06' +
        'a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09' +
        'a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06' +
        'a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09' +
        'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06' +
        'a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09' +
        'a1.65 1.65 0 0 0-1.51 1z'
      );
      gear.appendChild(gearCircle);
      gear.appendChild(gearPath);
      iconWrap.appendChild(gear);

      const badge = doc.createElement('div');
      badge.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;margin-bottom:14px;' +
        'padding:4px 10px;border-radius:999px;background:#fef3c7;color:#92400e;' +
        'font:600 11px/1.2 ' + sans + ';letter-spacing:.04em;text-transform:uppercase';
      const pulse = doc.createElement('span');
      pulse.setAttribute('aria-hidden', 'true');
      pulse.style.cssText =
        'width:7px;height:7px;border-radius:50%;background:#f59e0b;' +
        'box-shadow:0 0 0 3px rgba(245,158,11,.25)';
      const badgeText = doc.createElement('span');
      badgeText.textContent = 'Mantenimiento en curso';
      badge.appendChild(pulse);
      badge.appendChild(badgeText);

      const title = doc.createElement('h1');
      title.style.cssText =
        'margin:0 0 12px;font:700 clamp(22px,4.5vw,32px)/1.2 ' + sans +
        ';color:#0f172a;letter-spacing:-.02em';
      title.textContent = 'Volvemos enseguida';

      // Deliberadamente genérico: ningún nombre de marca o institución real.
      const msg = doc.createElement('p');
      msg.setAttribute('data-exe-showcase-notice-msg', '');
      msg.style.cssText =
        'margin:0 0 28px;font:15px/1.55 ' + sans + ';color:#475569';
      msg.textContent =
        'Estamos realizando un mantenimiento programado para mejorar el servicio. ' +
        'El acceso a la plataforma está temporalmente suspendido. ' +
        'Sus datos están a salvo; no es necesario reiniciar la sesión ni contactar con soporte.';

      const details = doc.createElement('div');
      details.style.cssText =
        'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;text-align:left';

      const detailItems = [
        ['Estado', 'Interrupción total del servicio'],
        ['Inicio', 'Hoy · 08:00 (hora local)'],
        ['Duración estimada', 'aproximadamente 45 minutos'],
        ['Referencia', 'MAINT-' + String(Date.now()).slice(-6)],
      ];
      for (const [label, value] of detailItems) {
        const cell = doc.createElement('div');
        cell.style.cssText =
          'padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px';
        const lab = doc.createElement('div');
        lab.style.cssText =
          'font:600 10px/1.2 ' + sans +
          ';color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px';
        lab.textContent = label;
        const val = doc.createElement('div');
        val.style.cssText = 'font:600 13px/1.35 ' + sans + ';color:#1e293b';
        val.textContent = value;
        cell.appendChild(lab);
        cell.appendChild(val);
        details.appendChild(cell);
      }

      const progLabel = doc.createElement('div');
      progLabel.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;' +
        'margin-bottom:8px;font:12px/1.3 ' + sans + ';color:#64748b';
      const progLeft = doc.createElement('span');
      progLeft.textContent = 'Progreso del mantenimiento';
      const progRight = doc.createElement('span');
      progRight.setAttribute('data-exe-showcase-notice-eta', '');
      progRight.style.cssText =
        'font-variant-numeric:tabular-nums;color:#2563eb;font-weight:600';
      progRight.textContent = 'en curso…';
      progLabel.appendChild(progLeft);
      progLabel.appendChild(progRight);

      const track = doc.createElement('div');
      track.style.cssText =
        'height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:22px';
      const fill = doc.createElement('div');
      fill.setAttribute('data-exe-showcase-notice-bar', '');
      fill.style.cssText =
        'height:100%;width:18%;border-radius:999px;' +
        'background:linear-gradient(90deg,#3b82f6,#60a5fa);' +
        'box-shadow:0 0 12px rgba(59,130,246,.45);transition:width .8s ease';
      track.appendChild(fill);

      const cta = doc.createElement('div');
      cta.style.cssText =
        'padding:14px 16px;background:#f1f5f9;border-radius:10px;' +
        'font:13px/1.45 ' + sans + ';color:#475569';
      cta.textContent =
        'Actualizaremos esta página automáticamente cuando el servicio se restablezca. ' +
        'Gracias por su paciencia.';

      card.appendChild(iconWrap);
      card.appendChild(badge);
      card.appendChild(title);
      card.appendChild(msg);
      card.appendChild(details);
      card.appendChild(progLabel);
      card.appendChild(track);
      card.appendChild(cta);

      const footer = doc.createElement('div');
      footer.style.cssText =
        'margin-top:28px;font:12px/1.4 ' + sans + ';color:#94a3b8;text-align:center';
      footer.textContent = 'Estado del sistema · Mantenimiento programado · No cierre esta ventana';

      shell.appendChild(card);
      shell.appendChild(footer);
      layer.appendChild(shell);

      // Avance lento de la barra (cosmético; no llega al 100% a propósito).
      let pct = 18;
      const barTimer = setInterval(() => {
        if (pct >= 72) return;
        pct += 3 + Math.floor(Math.random() * 5);
        if (pct > 72) pct = 72;
        fill.style.width = pct + '%';
        progRight.textContent = pct + '% · en curso…';
      }, 900);

      onCleanup(() => { clearInterval(barTimer); });
    });

    cb('OK: el recurso ha superpuesto un aviso de mantenimiento falso sobre el anfitrión. Reversible.');
  }

  return {
    id: 'showcase',
    label: 'Vitrina de impacto',

    restoreAll(ctx) {
      while (timers.length) clearTimeout(timers.pop());
      while (cleanups.length) {
        try { cleanups.pop()(); } catch (e) { /* ignorado */ }
      }
      const doc = ctx && ctx.parentDoc();
      if (!doc) return;
      for (const layer of doc.querySelectorAll('[' + LAYER_ATTR + ']')) {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }
      if (doc.body) { doc.body.style.transform = ''; doc.body.style.transformOrigin = ''; }
    },

    demos: [
      {
        id: 'showcase-flip',
        label: 'Voltear la página (espejo)',
        icon: '🔄',
        persists: false,
        help: {
          intenta: 'Aplica scaleX(-1) al body del anfitrión desde el iframe del recurso.',
          protege: 'Demuestra control del DOM del anfitrión: si esto funciona, también funciona todo lo demás de esta página.',
          reversion: 'Pulsa Restaurar todo, o el mismo botón otra vez.',
          doc: 'matriz-seguridad.md',
        },
        run: flip,
      },
      {
        id: 'showcase-terminal',
        label: 'Terminal «Matrix» a pantalla completa',
        icon: '🖥',
        persists: false,
        help: {
          intenta: 'Cubre el anfitrión con una capa a pantalla completa estilo Matrix: lluvia de glifos, secuencia de intrusión simulada con barra de progreso y PWNED al completar.',
          protege: 'Secuestro visual de la pantalla entera del anfitrión: denegación de servicio visual, bulos y capturas comprometedoras a nombre de la institución.',
          reversion: 'Se retira sola en 60 s, con el botón Quitar de su franja, o con Restaurar todo.',
          doc: 'matriz-seguridad.md',
        },
        run: terminal,
      },
      {
        id: 'showcase-login',
        label: 'Ventana de identificación falsa',
        icon: '🎣',
        persists: false,
        help: {
          intenta: 'Pinta un flujo de inicio de sesión estilo cuenta unificada (card Material, pasos correo → contraseña) con marca inventada «Orbe». Los campos son decorativos: NO captura ni transmite nada.',
          protege: 'Phishing dentro de la sesión legítima: la víctima ve la dirección correcta del anfitrión en la barra del navegador mientras teclea en una ventana ajena.',
          reversion: 'Se retira sola en 60 s, con el botón Quitar de su franja, o con Restaurar todo.',
          doc: 'anexos-tecnicos.md',
        },
        run: login,
      },
      {
        id: 'showcase-logo',
        label: 'Sustituir el logotipo de la institución',
        icon: '🖼',
        persists: false,
        help: {
          intenta: 'Busca la imagen de cabecera del anfitrión (o la primera imagen visible de la página) y cambia su atributo src por una imagen propia, sin escribir ni modificar el archivo original en el servidor.',
          protege: 'Suplantación de la identidad visual de la institución dentro de su propia sesión: quien mira la página ve un logotipo distinto sin que la plataforma lo sepa ni lo registre.',
          reversion: 'Se retira sola en 60 s, con el botón Quitar de su franja, o con Restaurar todo: el src original se restaura tal cual.',
          doc: 'matriz-seguridad.md',
        },
        run: logo,
      },
      {
        id: 'showcase-notice',
        label: 'Mostrar un aviso de mantenimiento falso',
        icon: '📢',
        persists: false,
        help: {
          intenta: 'Cubre el anfitrión con una página de mantenimiento a pantalla completa (estilo status page genérico: engranaje, badge en curso, detalles y barra de progreso), sin nombrar ninguna marca ni institución real.',
          protege: 'Bulos e ingeniería social con apariencia oficial: cualquier mensaje que el material pinte sobre el anfitrión parece venir de la plataforma, no del recurso incrustado.',
          reversion: 'Se retira sola en 60 s, con el botón Quitar de su franja, o con Restaurar todo.',
          doc: 'matriz-seguridad.md',
        },
        run: notice,
      },
    ],
  };
}
