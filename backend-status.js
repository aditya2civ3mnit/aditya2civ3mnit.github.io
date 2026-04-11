(function () {
  const env = window.APP_ENV || {};
  const BASE_URL = String(env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

  function buildHealthUrl() {
    return BASE_URL + '/api/health';
  }

  function ensureButton() {
    let button = document.getElementById('backend-status-indicator');
    if (button) return button;

    button = document.createElement('button');
    button.id = 'backend-status-indicator';
    button.type = 'button';
    button.title = 'Click to re-check backend connection';
    button.textContent = 'Backend: Checking...';

    button.style.position = 'fixed';
    button.style.right = '16px';
    button.style.top = '14px';
    button.style.zIndex = '1300';
    button.style.borderRadius = '999px';
    button.style.padding = '8px 12px';
    button.style.fontSize = '11px';
    button.style.fontFamily = 'IBM Plex Mono, monospace';
    button.style.letterSpacing = '0.05em';
    button.style.textTransform = 'uppercase';
    button.style.border = '1px solid #3a4658';
    button.style.background = '#2f3a4a';
    button.style.color = '#d7deea';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.35)';
    button.style.cursor = 'pointer';

    button.addEventListener('click', function () {
      runCheck(true);
    });

    document.body.appendChild(button);
    return button;
  }

  function setStatus(state, detail) {
    const button = ensureButton();

    if (state === 'connected') {
      button.textContent = 'Backend: Connected';
      button.style.background = '#123021';
      button.style.borderColor = '#1f7a4e';
      button.style.color = '#d9ffe9';
      button.title = detail || 'Backend is healthy';
      return;
    }

    if (state === 'offline') {
      button.textContent = 'Backend: Offline';
      button.style.background = '#3c1a1a';
      button.style.borderColor = '#8d3a3a';
      button.style.color = '#ffd9d9';
      button.title = detail || 'Backend is not reachable';
      return;
    }

    button.textContent = 'Backend: Checking...';
    button.style.background = '#2f3a4a';
    button.style.borderColor = '#3a4658';
    button.style.color = '#d7deea';
    button.title = 'Checking backend health';
  }

  async function runCheck(showAlertOnFailure) {
    setStatus('checking');

    try {
      const response = await fetch(buildHealthUrl(), {
        method: 'GET',
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Health endpoint returned ' + response.status);
      }

      const payload = await response.json();
      if (!payload || payload.ok !== true) {
        throw new Error('Health response is invalid');
      }

      setStatus('connected', 'Backend healthy at ' + BASE_URL);
    } catch (error) {
      const detail = error && error.message ? error.message : 'Unknown error';
      setStatus('offline', detail);
      if (showAlertOnFailure) {
        if (window.AppToast && AppToast.error) {
          AppToast.error('Backend not ready: ' + detail);
        } else {
          console.error('Backend not ready: ' + detail);
        }
      }
    }
  }

  function start() {
    ensureButton();
    runCheck(false);
    window.setInterval(function () {
      runCheck(false);
    }, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
