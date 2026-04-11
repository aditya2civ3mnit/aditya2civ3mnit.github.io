(function () {
  function ensureStyles() {
    if (document.getElementById('app-toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'app-toast-styles';
    style.textContent = [
      '.app-toast-stack {',
      '  position: fixed;',
      '  left: 50%;',
      '  top: 50%;',
      '  transform: translate(-50%, -50%);',
      '  z-index: 4200;',
      '  display: grid;',
      '  gap: 8px;',
      '  width: min(420px, calc(100vw - 28px));',
      '  pointer-events: none;',
      '  justify-items: center;',
      '}',
      '.app-toast {',
      '  border: 1px solid #252c36;',
      '  border-radius: 10px;',
      '  background: rgba(17, 20, 24, 0.96);',
      '  color: #c8d0da;',
      '  padding: 10px 12px;',
      '  font-family: "IBM Plex Mono", monospace;',
      '  font-size: 10px;',
      '  letter-spacing: 0.06em;',
      '  text-transform: uppercase;',
      '  text-align: center;',
      '  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);',
      '  opacity: 0;',
      '  transform: translateY(16px) scale(0.96);',
      '  animation: app-toast-in 0.24s cubic-bezier(0.22, 1, 0.36, 1) forwards;',
      '  transition: opacity 0.18s ease, transform 0.18s ease;',
      '}',
      '.app-toast.ok {',
      '  border-color: rgba(82, 199, 122, 0.5);',
      '  color: #b9f2ca;',
      '  background: rgba(15, 30, 20, 0.95);',
      '}',
      '.app-toast.err {',
      '  border-color: rgba(239, 107, 107, 0.5);',
      '  color: #ffc0c0;',
      '  background: rgba(35, 19, 20, 0.95);',
      '}',
      '@keyframes app-toast-in {',
      '  0% {',
      '    opacity: 0;',
      '    transform: translateY(16px) scale(0.96);',
      '    filter: blur(2px);',
      '  }',
      '  to {',
      '    opacity: 1;',
      '    transform: translateY(0) scale(1);',
      '    filter: blur(0);',
      '  }',
      '}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function ensureStack() {
    let stack = document.getElementById('app-toast-stack');
    if (stack) return stack;

    stack = document.createElement('div');
    stack.id = 'app-toast-stack';
    stack.className = 'app-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'true');
    document.body.appendChild(stack);
    return stack;
  }

  function show(message, isError) {
    ensureStyles();
    const stack = ensureStack();
    const toast = document.createElement('div');
    toast.className = 'app-toast ' + (isError ? 'err' : 'ok');
    toast.textContent = String(message || '').trim() || (isError ? 'Something went wrong.' : 'Done.');
    stack.appendChild(toast);

    window.setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      window.setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 180);
    }, 2600);
  }

  window.AppToast = {
    show: show,
    success: function (message) { show(message, false); },
    error: function (message) { show(message, true); }
  };
})();
