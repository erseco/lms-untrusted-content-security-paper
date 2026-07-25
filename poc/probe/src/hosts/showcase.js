/*
 * Vitrina de impacto: ejemplos de lo que podría hacer una persona
 * malintencionada con material didáctico no aislado.
 *
 * Las tres pintan sobre el DOM del anfitrión, así que solo funcionan sin
 * aislamiento; bajo origen opaco devuelven BLOQUEADO. Ninguna hace red, ninguna
 * persiste, todas se deshacen con un clic y se auto-retiran al vencer el plazo.
 *
 * La maqueta de login NO captura nada: servicio inventado, campos decorativos y
 * aviso al primer contacto. Se demuestra la capacidad visual, que es el riesgo
 * real, sin dejar aquí un recolector de credenciales.
 */

const MARK_ATTR = 'data-exe-showcase-mark';
const LAYER_ATTR = 'data-exe-showcase';

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
      layer.style.background = '#000';
      layer.style.color = '#38ff6a';

      const canvas = doc.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      layer.appendChild(canvas);

      const banner = doc.createElement('div');
      banner.style.cssText =
        'position:absolute;inset:0;display:grid;place-items:center;z-index:1;' +
        'font:700 clamp(28px,9vw,96px)/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'color:#ff2d55;text-shadow:0 0 18px rgba(255,45,85,.8);letter-spacing:.08em';
      banner.textContent = 'PWNED';
      layer.appendChild(banner);

      let visible = true;
      const blink = setInterval(() => {
        visible = !visible;
        banner.textContent = visible ? 'PWNED' : 'ACCESO CONCEDIDO';
        banner.style.opacity = visible ? '1' : '.55';
      }, 600);

      const view = doc.defaultView || ctx.win;
      const cx = canvas.getContext ? canvas.getContext('2d') : null;
      const cols = Math.floor(canvas.width / 14);
      const drops = new Array(cols).fill(0);
      let raf = 0;

      const draw = () => {
        if (cx) {
          cx.fillStyle = 'rgba(0,0,0,.08)';
          cx.fillRect(0, 0, canvas.width, canvas.height);
          cx.fillStyle = '#38ff6a';
          cx.font = '13px monospace';
          for (let i = 0; i < drops.length; i++) {
            cx.fillText(String(Math.floor(Math.random() * 10)), i * 14, drops[i] * 16);
            drops[i] = drops[i] * 16 > canvas.height && Math.random() > 0.975 ? 0 : drops[i] + 1;
          }
        }
        if (view.requestAnimationFrame) raf = view.requestAnimationFrame(draw);
      };
      if (view.requestAnimationFrame) raf = view.requestAnimationFrame(draw);

      onCleanup(() => {
        clearInterval(blink);
        if (raf && view.cancelAnimationFrame) view.cancelAnimationFrame(raf);
      });
    });

    cb('OK: el recurso ha tomado la pantalla completa del anfitrión. Reversible.');
  }

  function login(ctx, journal, cb) {
    const stop = blocked(ctx);
    if (stop) { cb(stop); return; }

    mountLayer(ctx, 'login', (doc, layer) => {
      layer.style.background = 'linear-gradient(#0a2a5e,#123f8c)';

      const card = doc.createElement('div');
      card.style.cssText =
        'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(360px,86vw);' +
        'background:#f4f4ef;border:2px solid #7a7a6e;border-radius:2px;padding:18px;' +
        'box-shadow:6px 6px 0 rgba(0,0,0,.35);font-family:Verdana,Geneva,sans-serif';

      const brand = doc.createElement('div');
      brand.style.cssText = 'font:700 20px/1 Verdana,sans-serif;color:#123f8c;margin-bottom:2px';
      // Servicio INVENTADO a propósito: nunca una marca real.
      brand.textContent = 'CorreoNube 98';
      const claim = doc.createElement('div');
      claim.style.cssText = 'font-size:11px;color:#555;margin-bottom:14px';
      claim.textContent = 'Su sesión ha caducado. Vuelva a identificarse.';

      const form = doc.createElement('form');
      form.addEventListener('submit', (e) => e.preventDefault());

      const reveal = doc.createElement('p');
      reveal.setAttribute('data-exe-showcase-reveal', '');
      reveal.hidden = true;
      reveal.style.cssText =
        'margin:10px 0 0;padding:8px;background:#ffe8e8;border-left:4px solid #b00020;' +
        'font-size:11px;color:#8e0019';
      reveal.textContent =
        'DEMOSTRACIÓN — no se ha capturado nada. Esta ventana la ha pintado el ' +
        'material didáctico dentro de la página legítima: la barra de direcciones ' +
        'seguiría mostrando la dirección correcta.';

      const show = () => { reveal.hidden = false; };

      for (const [label, type] of [['Dirección de correo', 'text'], ['Contraseña', 'password']]) {
        const row = doc.createElement('label');
        row.style.cssText = 'display:block;font-size:11px;color:#333;margin-bottom:8px';
        row.textContent = label;
        const input = doc.createElement('input');
        input.type = type;
        // Decorativo: readonly y sin lectura de value en ningún punto del código.
        input.readOnly = true;
        input.setAttribute('readonly', '');
        input.setAttribute('autocomplete', 'off');
        input.style.cssText =
          'display:block;width:100%;margin-top:3px;padding:5px;border:1px solid #999;background:#fff';
        input.addEventListener('focus', show);
        input.addEventListener('keydown', show);
        row.appendChild(input);
        form.appendChild(row);
      }

      const submit = doc.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Iniciar sesión';
      submit.style.cssText =
        'margin-top:4px;padding:5px 14px;font:inherit;border:2px outset #ccc;background:#e4e4dc;cursor:pointer';
      submit.addEventListener('click', show);
      form.appendChild(submit);

      card.appendChild(brand);
      card.appendChild(claim);
      card.appendChild(form);
      card.appendChild(reveal);
      layer.appendChild(card);
    });

    cb('OK: el recurso ha pintado una ventana de identificación falsa sobre el anfitrión. Reversible.');
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
          intenta: 'Cubre el anfitrión con una capa a pantalla completa con lluvia de dígitos y PWNED parpadeando.',
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
          intenta: 'Pinta una maqueta retro de un webmail inventado sobre el anfitrión. Los campos son decorativos: NO captura ni transmite nada.',
          protege: 'Phishing dentro de la sesión legítima: la víctima ve la dirección correcta del anfitrión en la barra del navegador mientras teclea en una ventana ajena.',
          reversion: 'Se retira sola en 60 s, con el botón Quitar de su franja, o con Restaurar todo.',
          doc: 'anexos-tecnicos.md',
        },
        run: login,
      },
    ],
  };
}
