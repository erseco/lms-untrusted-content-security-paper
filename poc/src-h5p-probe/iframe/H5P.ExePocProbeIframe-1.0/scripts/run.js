(function (H5P) {
  'use strict';

  function ExePocProbeIframe(params, contentId) {
    this.params = params || {};
    this.contentId = contentId;
  }

  ExePocProbeIframe.prototype.attach = function ($container) {
    var root = $container && $container[0] ? $container[0] : document.body;

    if (!window.ExeProbe || typeof window.ExeProbe.startProbe !== 'function') {
      root.textContent = '[EXE-POC] No se pudo cargar la sonda pasiva.';
      return;
    }

    window.ExeProbe.startProbe({
      win: window,
      doc: document,
      buildId: 'h5p-library-iframe',
      allowSelfHost: window.parent === window,
      measurementOnly: true,
      anchorTo: root
    });
  };

  H5P.ExePocProbeIframe = ExePocProbeIframe;
})(window.H5P = window.H5P || {});
