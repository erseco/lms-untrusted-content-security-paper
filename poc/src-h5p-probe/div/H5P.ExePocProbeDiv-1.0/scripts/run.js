(function (H5P) {
  'use strict';

  function ExePocProbeDiv(params, contentId) {
    this.params = params || {};
    this.contentId = contentId;
  }

  ExePocProbeDiv.prototype.attach = function ($container) {
    var root = $container && $container[0] ? $container[0] : document.body;

    if (!window.ExeProbe || typeof window.ExeProbe.startProbe !== 'function') {
      root.textContent = '[EXE-POC] No se pudo cargar la sonda pasiva.';
      return;
    }

    window.ExeProbe.startProbe({
      win: window,
      doc: document,
      buildId: 'h5p-library-div',
      allowSelfHost: window.parent === window,
      measurementOnly: true,
      anchorTo: root
    });
  };

  H5P.ExePocProbeDiv = ExePocProbeDiv;
})(window.H5P = window.H5P || {});
