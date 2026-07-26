import { describe, it, expect, vi } from 'vitest';
import moodle from '../src/hosts/moodle.js';
import { createCourse, resolveCurrentCourseId, swapAvatarInDom } from '../src/hosts/moodle-actions.js';
import { createContext, validateAdapter } from '../src/hosts/contract.js';
import { createJournal } from '../src/core/journal.js';

function moodleParent() {
  const doc = document.implementation.createHTMLDocument('moodle');
  doc.body.id = 'page-course-view';
  doc.body.innerHTML = '<input name="sesskey" value="SESSKEY-CENTINELA">' +
    '<a href="/enrol/users.php?id=7">Matricular</a>';
  const parent = { document: doc, location: { href: 'http://localhost/course/view.php' },
    M: { cfg: { sesskey: 'SESSKEY-CENTINELA', wwwroot: 'http://localhost', courseId: 7 } } };
  const win = { parent, origin: 'http://localhost', location: { origin: 'http://localhost' } };
  win.parent.parent = parent;
  return createContext({ win, journal: null, buildId: 'b' });
}

function blindCtx() {
  const win = { get parent() { throw new DOMException('no', 'SecurityError'); } };
  return createContext({ win, journal: null, buildId: 'b' });
}

describe('adaptador moodle', () => {
  it('cambia al vuelo el avatar actual de Boost/Playground y lo anima', () => {
    const doc = document.implementation.createHTMLDocument('moodle');
    doc.body.innerHTML = `
      <span class="userbutton"><span class="avatars"><span class="avatar current">
        <img src="/pluginfile.php/5/user/icon/boost/f2?rev=14"
             class="userpicture" width="35" height="35" alt="">
      </span></span></span>`;
    const img = doc.querySelector('img');
    img.animate = vi.fn();

    expect(swapAvatarInDom({ document: doc })).toBe(1);
    expect(img.getAttribute('data-exe-orig')).toContain('/pluginfile.php/');
    expect(img.src).toMatch(/^data:image\/svg\+xml/);
    expect(img.style.outline).toContain('#39ff77');
    expect(img.animate).toHaveBeenCalledOnce();
  });

  it('mantiene el avatar y el borde verde, pero no anima con movimiento reducido', () => {
    const doc = document.implementation.createHTMLDocument('moodle');
    doc.body.innerHTML = '<span class="userbutton"><span class="avatars">' +
      '<span class="avatar current"><img src="/user/icon/boost/f2" alt=""></span>' +
      '</span></span>';
    const img = doc.querySelector('img');
    img.animate = vi.fn();
    const win = {
      document: doc,
      matchMedia: vi.fn(() => ({ matches: true })),
    };

    expect(swapAvatarInDom(win)).toBe(1);
    expect(img.src).toMatch(/^data:image\/svg\+xml/);
    expect(img.style.outline).toContain('#39ff77');
    expect(img.animate).not.toHaveBeenCalled();
  });

  it('identifica el curso actual por M.cfg y por las pistas del DOM', () => {
    expect(resolveCurrentCourseId({ M: { cfg: { courseId: 23 } } })).toBe('23');
    const doc = document.implementation.createHTMLDocument('moodle');
    doc.body.className = 'format-topics course-41';
    expect(resolveCurrentCourseId({ document: doc })).toBe('41');
    doc.body.className = '';
    doc.body.innerHTML = '<a href="/course/view.php?id=52">Curso</a>';
    expect(resolveCurrentCourseId({ document: doc })).toBe('52');
  });

  it('si no puede crear curso, crea un foro y 50 discusiones en el curso actual', async () => {
    const ctx = moodleParent();
    const parent = ctx.parentWin();
    let forumPosts = 0;
    parent.fetch = vi.fn((url, init = {}) => {
      const target = String(url);
      if (target.includes('/course/edit.php') && (!init.method || init.method === 'GET')) {
        return Promise.resolve({ ok: false, status: 403 });
      }
      if (target.includes('modedit.php?add=forum')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(
            '<form action="/course/modedit.php"><input name="_qf__mod_forum_mod_form" value="1">' +
            '<input name="name"><textarea name="introeditor[text]"></textarea>' +
            '<button name="submitbutton">Guardar</button></form>'
          ),
        });
      }
      if (target.endsWith('/course/modedit.php') && init.method === 'POST') {
        return Promise.resolve({ url: 'http://localhost/course/view.php?id=7' });
      }
      if (target.includes('/mod/forum/index.php?id=7')) {
        return Promise.resolve({
          text: () => Promise.resolve('<a href="view.php?id=33">POC-SAFE Forum</a>'),
        });
      }
      if (target.includes('/mod/forum/view.php?id=33') && (!init.method || init.method === 'GET')) {
        return Promise.resolve({
          text: () => Promise.resolve(
            '<form action="/mod/forum/post.php"><input name="forum" value="8">' +
            '<input name="subject"><textarea name="message[text]"></textarea>' +
            '<button name="submitbutton">Enviar</button></form>'
          ),
        });
      }
      if (target.includes('/mod/forum/post.php') && init.method === 'POST') {
        forumPosts += 1;
        return Promise.resolve({ url: 'http://localhost/mod/forum/view.php?id=33' });
      }
      return Promise.reject(new Error(`URL inesperada: ${target}`));
    });
    const journal = createJournal({ buildId: 'test', storage: null });
    const raw = await new Promise((resolve) => createCourse(ctx, journal, resolve));
    const result = JSON.parse(raw);

    expect(result).toMatchObject({
      created: false,
      fallback: true,
      courseId: '7',
      forumCreated: true,
      forumMessages: 50,
    });
    expect(forumPosts).toBe(50);
    expect(journal.entries()[0].kind).toBe('forum');
  });

  it('cumple el contrato', () => {
    expect(validateAdapter(moodle)).toEqual([]);
  });

  it('detecta Moodle por M.cfg y por el DOM', () => {
    const r = moodle.detect(moodleParent());
    expect(r.matched).toBe(true);
    expect(r.confidence).toBe('strong');
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it('no detecta nada sin acceso al padre', () => {
    expect(moodle.detect(blindCtx()).matched).toBe(false);
  });

  it('mide sin publicar el valor del sesskey', () => {
    const m = moodle.measure(moodleParent());
    expect(m.moodleSesskeyReachable).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/SESSKEY-CENTINELA/);
  });

  it('devuelve todo en falso sin acceso al padre', () => {
    const m = moodle.measure(blindCtx());
    expect(m.moodleSesskeyReachable).toBe(false);
    expect(m.moodleAdminLinksReachable).toBe(false);
    expect(m.moodleEnrolReachable).toBe(false);
  });

  // La matriculación en un curso ajeno es la cuarta acción de la maqueta de
  // diseño (apartado 5.1) que el paquete NO implementa como demo: se queda
  // en medida. moodleEnrolReachable solo comprueba si un enlace o un
  // formulario de matriculación está referenciado en el DOM del padre,
  // nunca envía la matrícula.
  it('mide si la superficie de matriculación es alcanzable, sin matricular a nadie', () => {
    const m = moodle.measure(moodleParent());
    expect(m.moodleEnrolReachable).toBe(true);
    expect(typeof m.moodleEnrolReachable).toBe('boolean');
  });

  it('declara dos demos, ambas de escritura', () => {
    expect(moodle.demos.map((d) => d.id)).toEqual(['moodle-own-user', 'moodle-course']);
    expect(moodle.demos.every((d) => d.persists)).toBe(true);
  });

  it('cada demo documenta qué intenta, de qué protege y cómo se revierte', () => {
    for (const d of moodle.demos) {
      expect(d.help.intenta.length).toBeGreaterThan(10);
      expect(d.help.protege.length).toBeGreaterThan(10);
      expect(d.help.reversion.length).toBeGreaterThan(5);
    }
  });

  it('bajo origen opaco las demos devuelven BLOQUEADO sin tocar el diario', async () => {
    const journal = createJournal({ buildId: 'b', storage: null });
    const ctx = blindCtx();
    ctx.win.origin = 'null';
    for (const demo of moodle.demos) {
      const raw = await new Promise((res) => demo.run(ctx, journal, res));
      expect(String(raw)).toMatch(/^BLOQUEADO/);
    }
    expect(journal.entries()).toHaveLength(0);
  });
});
