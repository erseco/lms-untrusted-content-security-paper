import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVATAR_SVG, AVATAR_DATA_URI, avatarPng } from '../src/hosts/avatar.js';

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = join(here, '..', '..', 'pwned-avatar.svg');

describe('avatar de las demos', () => {
  it('el literal embebido coincide byte a byte con poc/pwned-avatar.svg', () => {
    expect(AVATAR_SVG).toBe(readFileSync(svgPath, 'utf8'));
  });

  it('el data URI no necesita red', () => {
    expect(AVATAR_DATA_URI.startsWith('data:image/svg+xml;')).toBe(true);
    // El unico http(s) admisible es la declaracion de namespace SVG, que el
    // navegador NO descarga. Cualquier recurso externo de verdad —<image>,
    // href, url(...), @import— si saldria a la red al pintar el avatar.
    expect(AVATAR_SVG).not.toMatch(/<image\b/i);
    expect(AVATAR_SVG).not.toMatch(/\bhref\s*=/i);
    expect(AVATAR_SVG).not.toMatch(/url\(\s*['"]?https?:/i);
    expect(AVATAR_SVG).not.toMatch(/@import/i);
    const noNamespace = AVATAR_SVG.replace(/xmlns[^=]*="[^"]*"/g, '');
    expect(noNamespace).not.toMatch(/https?:/i);
  });

  it('el avatar no lleva script dentro', () => {
    expect(AVATAR_SVG).not.toMatch(/<script\b/i);
    expect(AVATAR_SVG).not.toMatch(/\son\w+\s*=/i);
    expect(AVATAR_SVG).not.toMatch(/<foreignObject\b/i);
  });

  it('sin canvas devuelve el data URI en vez de fingir un PNG', () => new Promise((resolve) => {
    // jsdom no implementa getContext('2d'): es exactamente el caso degradado.
    avatarPng(window, 64, (blob, dataUrl) => {
      expect(blob).toBe(null);
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/')).toBe(true);
      resolve();
    });
  }));

  it('ninguna fuente de la sonda descarga imágenes de terceros', () => {
    const srcDir = join(here, '..', 'src');
    const walk = (dir) => readdirSync(dir).flatMap((n) => {
      const full = join(dir, n);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
    const offenders = walk(srcDir)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => /upload\.wikimedia\.org|trollface/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
