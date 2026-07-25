/*
 * Adaptador por defecto. Es el que gana bajo origen opaco, porque ahí el DOM del
 * padre y document.referrer están cortados y NO se puede identificar el
 * anfitrión. Eso no es un fallo del instrumento: es una medida, y el panel lo
 * dice con esas palabras.
 */
export default {
  id: 'generic',
  label: 'Anfitrión no identificado',
  detect() {
    return {
      matched: false,
      confidence: 'weak',
      signals: ['sin acceso al DOM del padre: el anfitrión no puede identificarse'],
    };
  },
  measure() {
    return {};
  },
  demos: [],
};
