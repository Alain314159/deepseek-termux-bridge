(function () {
  const ogPush = history.pushState;
  const ogReplace = history.replaceState;
  function notify() { window.dispatchEvent(new Event('tb:locationchange')); }
  history.pushState = function () { const r = ogPush.apply(this, arguments); notify(); return r; };
  history.replaceState = function () { const r = ogReplace.apply(this, arguments); notify(); return r; };
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
  console.log('[TermuxBridge] URL observer instalado');
})();
