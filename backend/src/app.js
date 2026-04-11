const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');
const debugStore = require('./services/debugStore');

const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const watchlistRoutes = require('./routes/watchlist');
const setupRoutes = require('./routes/setups');
const uploadRoutes = require('./routes/uploads');
const healthRoutes = require('./routes/health');
const adminRoutes = require('./routes/admin');

function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredOrigins = Array.isArray(env.corsOrigins) && env.corsOrigins.length > 0
    ? env.corsOrigins
    : String(env.corsOrigin || '')
      .split(',')
      .map(function (item) { return String(item || '').trim(); })
      .filter(Boolean);
  const allowsWildcard = configuredOrigins.includes('*');

  if (isProduction && (configuredOrigins.length === 0 || allowsWildcard)) {
    throw new Error('CORS_ORIGIN must list explicit allowed origins in production');
  }

  const allowedOrigins = allowsWildcard ? [] : configuredOrigins;

  app.use(
    cors({
      origin: function (origin, callback) {
        if (allowsWildcard || !origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error('CORS: origin not allowed'));
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: '25mb' }));
  app.use(morgan('dev'));

  app.use(function (req, res, next) {
    const startedAt = Date.now();
    const requestId = Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', function () {
      debugStore.recordRequest({
        requestId: requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        ip: req.headers['x-forwarded-for'] || req.ip,
        origin: req.headers.origin || '',
        body: req.body
      }, env.debugRecentLimit);
    });

    next();
  });

  app.use('/api/health', healthRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/trades', tradeRoutes);
  app.use('/api/watchlist', watchlistRoutes);
  app.use('/api/setups', setupRoutes);
  app.use('/api/uploads', uploadRoutes);

  app.use(function (req, res) {
    res.status(404).json({ message: 'Route not found' });
  });

  app.use(function (err, req, res, next) {
    const timestamp = new Date().toISOString();
    const status = err.status || 500;
    const payload = { message: err.message || 'Internal server error' };
    const stackPreview = err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : '';

    console.error('[' + timestamp + '] ERROR', {
      requestId: req.requestId || '',
      method: req.method,
      path: req.originalUrl,
      status: status,
      message: payload.message,
      stack: stackPreview
    });

    debugStore.recordError({
      requestId: req.requestId || '',
      method: req.method,
      path: req.originalUrl,
      status: status,
      message: payload.message,
      stack: stackPreview
    }, env.debugRecentLimit);

    if (process.env.NODE_ENV !== 'production' && err.stack) {
      payload.stack = err.stack;
    }

    res.status(status).json(payload);
  });

  return app;
}

module.exports = createApp;
