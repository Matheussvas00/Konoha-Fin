// Ponto de entrada do app. Registra o capturador global de erros (web) ANTES de
// qualquer código do app, para que falhas de avaliação/render apareçam na tela
// em vez de uma tela branca. Depois delega para o entry do expo-router.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const show = (m) => {
    let el = document.getElementById('__err');
    if (!el) {
      el = document.createElement('pre');
      el.id = '__err';
      el.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;max-height:60%;overflow:auto;margin:0;' +
        'padding:12px;background:#1a0000;color:#ff8a8a;font:12px/1.4 monospace;' +
        'z-index:2147483647;white-space:pre-wrap';
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = (el.textContent || '') + m + '\n\n';
  };
  window.addEventListener('error', (e) => {
    const msg = e.message || (e.error && e.error.message) || 'erro desconhecido';
    const where = e.filename ? ` @ ${e.filename}:${e.lineno}:${e.colno}` : '';
    const stack = (e.error && e.error.stack) || '';
    show('ERROR: ' + msg + where + '\n' + stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason || {};
    show('PROMISE: ' + (r.message || String(r)) + '\n' + (r.stack || ''));
  });
}

require('expo-router/entry');
