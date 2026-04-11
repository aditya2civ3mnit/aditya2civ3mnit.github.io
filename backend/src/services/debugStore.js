const DEFAULT_MAX_ITEMS = 200;

const state = {
  requests: [],
  events: [],
  errors: []
};

function toIsoNow() {
  return new Date().toISOString();
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimArray(list, maxItems) {
  while (list.length > maxItems) {
    list.shift();
  }
}

function redactBody(body) {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const unsafeKeys = ['password', 'confirmPassword', 'refreshToken', 'token', 'idToken'];
  const summary = {};

  Object.keys(body).forEach(function (key) {
    if (unsafeKeys.includes(key)) {
      summary[key] = '[redacted]';
      return;
    }

    const value = body[key];
    if (value == null) {
      summary[key] = value;
      return;
    }

    if (typeof value === 'string') {
      summary[key] = value.length > 120 ? value.slice(0, 120) + '...' : value;
      return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value;
      return;
    }

    if (Array.isArray(value)) {
      summary[key] = '[array:' + value.length + ']';
      return;
    }

    summary[key] = '[object]';
  });

  return summary;
}

function recordRequest(payload, maxItems) {
  const requestPayload = payload && typeof payload === 'object' ? payload : {};
  state.requests.push({
    at: toIsoNow(),
    requestId: String(requestPayload.requestId || ''),
    method: String(requestPayload.method || ''),
    path: String(requestPayload.path || ''),
    status: toNumber(requestPayload.status, 0),
    durationMs: toNumber(requestPayload.durationMs, 0),
    ip: String(requestPayload.ip || ''),
    origin: String(requestPayload.origin || ''),
    body: redactBody(requestPayload.body)
  });

  trimArray(state.requests, Math.max(10, toNumber(maxItems, DEFAULT_MAX_ITEMS)));
}

function recordEvent(type, details, maxItems) {
  const eventType = String(type || 'event');
  const eventDetails = details && typeof details === 'object' ? details : {};

  state.events.push({
    at: toIsoNow(),
    type: eventType,
    details: eventDetails
  });

  trimArray(state.events, Math.max(10, toNumber(maxItems, DEFAULT_MAX_ITEMS)));
}

function recordError(payload, maxItems) {
  const errorPayload = payload && typeof payload === 'object' ? payload : {};

  state.errors.push({
    at: toIsoNow(),
    requestId: String(errorPayload.requestId || ''),
    method: String(errorPayload.method || ''),
    path: String(errorPayload.path || ''),
    status: toNumber(errorPayload.status, 500),
    message: String(errorPayload.message || 'Internal server error'),
    stack: String(errorPayload.stack || '')
  });

  trimArray(state.errors, Math.max(10, toNumber(maxItems, DEFAULT_MAX_ITEMS)));
}

function snapshot(limit) {
  const maxItems = Math.max(1, toNumber(limit, 50));

  return {
    requestCount: state.requests.length,
    eventCount: state.events.length,
    errorCount: state.errors.length,
    requests: state.requests.slice(-maxItems),
    events: state.events.slice(-maxItems),
    errors: state.errors.slice(-maxItems)
  };
}

function clear() {
  state.requests = [];
  state.events = [];
  state.errors = [];
}

module.exports = {
  recordRequest,
  recordEvent,
  recordError,
  snapshot,
  clear
};