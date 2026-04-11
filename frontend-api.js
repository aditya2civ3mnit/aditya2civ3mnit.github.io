(function () {
  const env = window.APP_ENV || {};
  const sessionKey = 'auth_session';

  function getMode() {
    return 'api';
  }

  function setMode(mode) {
    const normalized = String(mode || '').toLowerCase();
    if (normalized !== 'api') {
      throw new Error('Only api mode is supported');
    }
    return 'api';
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

    if (window.location && window.location.pathname && !window.location.pathname.endsWith('signin.html')) {
      window.location.href = 'signin.html';
    }

    throw new Error(message || 'Session expired. Please sign in again.');
  }

  function isApiMode() {
    return true;
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
    return checkBackendHealth();
  }

  function enableLocalMode() {
    throw new Error('Local mode is no longer supported. Use backend API mode.');
  }

  async function login(username, password) {
    if (!username || !password) {
      throw new Error('Username and password are required');
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

  async function register(name, username, password, email) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: name, username: username, password: password, email: email || '' })
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
    if (session && session.refreshToken) {
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

  async function updateProfile(payload) {
    return request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload || {})
    });
  }

  async function setCredentials(payload) {
    const result = await request('/api/auth/credentials', {
      method: 'PUT',
      body: JSON.stringify(payload || {})
    });

    const session = {
      mode: 'api',
      userId: result.user && result.user.id ? result.user.id : null,
      username: result.user && result.user.username ? result.user.username : '',
      name: result.user && result.user.name ? result.user.name : '',
      email: result.user && result.user.email ? result.user.email : '',
      token: result.accessToken || null,
      refreshToken: result.refreshToken || null
    };

    setSession(session);
    return session;
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

  async function listWatchlist() {
    return request('/api/watchlist', { method: 'GET' });
  }

  async function getWatchlist(id) {
    return request('/api/watchlist/' + encodeURIComponent(id), { method: 'GET' });
  }

  async function createWatchlist(payload) {
    return request('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  async function deleteWatchlist(id) {
    return request('/api/watchlist/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  async function getMonthlyTradeSummary(year, month) {
    const query = '?year=' + encodeURIComponent(String(year)) + '&month=' + encodeURIComponent(String(month));
    return request('/api/trades/monthly-summary' + query, { method: 'GET' });
  }

  async function uploadTradeMedia(section, files) {
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

  async function listSetups() {
    return request('/api/setups', { method: 'GET' });
  }

  async function getLandingContent() {
    return request('/api/landing', { method: 'GET' });
  }

  async function getDefaultSetup() {
    return request('/api/setups/default', { method: 'GET' });
  }

  async function listSuggestedSetups() {
    return request('/api/setups/suggested', { method: 'GET' });
  }

  async function createSetup(payload) {
    return request('/api/setups', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  async function updateSetup(id, payload) {
    return request('/api/setups/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(payload || {})
    });
  }

  async function setDefaultSetup(id) {
    return request('/api/setups/' + encodeURIComponent(id) + '/default', { method: 'POST' });
  }

  async function deleteSetup(id) {
    return request('/api/setups/' + encodeURIComponent(id), { method: 'DELETE' });
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
    updateProfile: updateProfile,
    setCredentials: setCredentials,
    listTrades: listTrades,
    getTrade: getTrade,
    createTrade: createTrade,
    updateTrade: updateTrade,
    deleteTrade: deleteTrade,
    listWatchlist: listWatchlist,
    getWatchlist: getWatchlist,
    createWatchlist: createWatchlist,
    deleteWatchlist: deleteWatchlist,
    getMonthlyTradeSummary: getMonthlyTradeSummary,
    uploadTradeMedia: uploadTradeMedia,
    getLandingContent: getLandingContent,
    listSetups: listSetups,
    getDefaultSetup: getDefaultSetup,
    listSuggestedSetups: listSuggestedSetups,
    createSetup: createSetup,
    updateSetup: updateSetup,
    setDefaultSetup: setDefaultSetup,
    deleteSetup: deleteSetup,
    request: request,
    buildUrl: buildUrl,
    isApiMode: isApiMode
  };
})();
