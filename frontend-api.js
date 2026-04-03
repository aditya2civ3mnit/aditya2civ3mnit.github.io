(function () {
  const env = window.APP_ENV || {};
  const sessionKey = 'auth_session';
  const modeKey = 'smc_runtime_mode_v1';

  function getStoredMode() {
    try {
      const value = String(localStorage.getItem(modeKey) || '').toLowerCase();
      return value === 'api' || value === 'local' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function getMode() {
    const storedMode = getStoredMode();
    if (storedMode) return storedMode;
    return env.USE_API ? 'api' : 'local';
  }

  function setMode(mode) {
    const normalized = String(mode || '').toLowerCase();
    if (normalized !== 'api' && normalized !== 'local') {
      throw new Error('Mode must be either api or local');
    }

    localStorage.setItem(modeKey, normalized);
    return normalized;
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(sessionKey);
  }

  function handleAuthFailure(message) {
    clearSession();
    try {
      setMode('local');
    } catch (error) {
      // ignore mode persistence failures during forced logout
    }

    if (window.location && window.location.pathname && !window.location.pathname.endsWith('signin.html')) {
      window.location.href = 'signin.html';
    }

    throw new Error(message || 'Session expired. Please sign in again.');
  }

  function isApiMode() {
    return getMode() === 'api';
  }

  function buildUrl(path) {
    const base = String(env.API_BASE_URL || '').replace(/\/$/, '');
    const suffix = String(path || '').startsWith('/') ? path : '/' + path;
    return base + suffix;
  }

  function buildHeaders(options) {
    const headers = Object.assign({}, (options && options.headers) || {});
    const session = getSession();

    if (session && session.token) {
      headers.Authorization = 'Bearer ' + session.token;
    }

    return headers;
  }

  async function request(path, options) {
    if (!isApiMode()) {
      throw new Error('API mode is disabled');
    }

    const requestOptions = Object.assign({}, options || {});
    const headers = buildHeaders(requestOptions);
    const isFormData = typeof FormData !== 'undefined' && requestOptions.body instanceof FormData;

    if (requestOptions.body && !isFormData && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    requestOptions.headers = headers;

    const response = await fetch(buildUrl(path), requestOptions);
    let payload = null;

    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && payload.message ? payload.message : 'Request failed';

      const authExpired = response.status === 401 && /invalid or expired token|invalid token|expired token|unauthorized/i.test(message);
      if (authExpired) {
        handleAuthFailure('Session expired. Please sign in again.');
      }

      throw new Error(message);
    }

    return payload;
  }

  async function checkBackendHealth() {
    const response = await fetch(buildUrl('/api/health'), { method: 'GET' });
    if (!response.ok) {
      throw new Error('Backend health check failed');
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!payload || payload.ok !== true) {
      throw new Error('Backend is not ready');
    }

    return payload;
  }

  async function enableApiMode() {
    const health = await checkBackendHealth();
    setMode('api');

    const session = getSession();
    if (session && session.mode === 'demo') {
      clearSession();
    }

    return health;
  }

  function enableLocalMode() {
    setMode('local');

    const session = getSession();
    if (session && session.mode === 'api') {
      clearSession();
    }
  }

  async function login(username, password) {
    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    if (!isApiMode()) {
      const user = (env.DEMO_USERS || []).find(function (item) {
        return item.username === username && item.password === password;
      });

      if (!user) {
        throw new Error('Invalid username or password');
      }

      const session = {
        mode: 'demo',
        userId: user.userId,
        username: user.username,
        name: user.name || user.username,
        token: null
      };

      setSession(session);
      return session;
    }

    const result = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username, password: password })
    });

    const session = {
      mode: 'api',
      userId: result.user && result.user.id ? result.user.id : null,
      username: result.user && result.user.username ? result.user.username : username,
      name: result.user && result.user.name ? result.user.name : username,
      token: result.accessToken || null,
      refreshToken: result.refreshToken || null
    };

    setSession(session);
    return session;
  }

  async function register(name, username, password) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: name, username: username, password: password })
    });
  }

  async function refreshSession() {
    const session = getSession();
    if (!session || !session.refreshToken) {
      throw new Error('Refresh token is missing');
    }

    const result = await request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken })
    });

    const nextSession = {
      mode: 'api',
      userId: result.user && result.user.id ? result.user.id : session.userId,
      username: result.user && result.user.username ? result.user.username : session.username,
      name: result.user && result.user.name ? result.user.name : session.name,
      token: result.accessToken || session.token,
      refreshToken: result.refreshToken || session.refreshToken
    };

    setSession(nextSession);
    return nextSession;
  }

  async function logout() {
    const session = getSession();
    if (session && session.refreshToken && isApiMode()) {
      try {
        await request('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: session.refreshToken })
        });
      } catch (error) {
        // Ignore logout failures and clear local state.
      }
    }

    clearSession();
  }

  async function getCurrentUser() {
    return request('/api/auth/me', { method: 'GET' });
  }

  async function listTrades() {
    return request('/api/trades', { method: 'GET' });
  }

  async function getTrade(id) {
    return request('/api/trades/' + encodeURIComponent(id), { method: 'GET' });
  }

  async function createTrade(payload) {
    return request('/api/trades', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  async function updateTrade(id, payload) {
    return request('/api/trades/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(payload || {})
    });
  }

  async function deleteTrade(id) {
    return request('/api/trades/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  async function uploadTradeMedia(section, files) {
    if (!isApiMode()) {
      throw new Error('API mode is disabled');
    }

    const formData = new FormData();
    formData.append('section', section || 'general');

    Array.from(files || []).forEach(function (file) {
      formData.append('files', file);
    });

    return request('/api/uploads/media', {
      method: 'POST',
      body: formData
    });
  }

  window.FrontendAPI = {
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    getMode: getMode,
    setMode: setMode,
    enableApiMode: enableApiMode,
    enableLocalMode: enableLocalMode,
    checkBackendHealth: checkBackendHealth,
    login: login,
    register: register,
    refreshSession: refreshSession,
    logout: logout,
    getCurrentUser: getCurrentUser,
    listTrades: listTrades,
    getTrade: getTrade,
    createTrade: createTrade,
    updateTrade: updateTrade,
    deleteTrade: deleteTrade,
    uploadTradeMedia: uploadTradeMedia,
    request: request,
    buildUrl: buildUrl,
    isApiMode: isApiMode
  };
})();
