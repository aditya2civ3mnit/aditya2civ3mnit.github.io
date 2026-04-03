const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');

const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const uploadRoutes = require('./routes/uploads');
const healthRoutes = require('./routes/health');

function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map(function (item) { return item.trim(); }),
      credentials: true
    })
  );
  app.use(express.json({ limit: '25mb' }));
  app.use(morgan('dev'));

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/trades', tradeRoutes);
  app.use('/api/uploads', uploadRoutes);

  app.use(function (req, res) {
    res.status(404).json({ message: 'Route not found' });
  });

  app.use(function (err, req, res, next) {
    const status = err.status || 500;
    const payload = { message: err.message || 'Internal server error' };

    if (process.env.NODE_ENV !== 'production' && err.stack) {
      payload.stack = err.stack;
    }

    res.status(status).json(payload);
  });

  return app;
}

module.exports = createApp;
