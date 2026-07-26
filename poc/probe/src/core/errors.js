/*
 * Único punto que convierte una excepción en texto publicable.
 *
 * Solo el NOMBRE del error sale de aquí. El mensaje puede arrastrar valores
 * (una cookie en un stack, un token en una URL), así que no se toca nunca.
 */
export function errName(e) {
  if (!e) return null;
  return e.name || 'Error';
}
