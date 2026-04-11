const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const debugStore = require('../services/debugStore');
const User = require('../models/User');
const Trade = require('../models/Trade');
const Setup = require('../models/Setup');
const authRoutes = require('./auth');

const router = express.Router();

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.ip || 'unknown');
}

function safeCompare(expected, provided) {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(provided || ''));

  if (left.length === 0 || left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function requireAdminDebugToken(req, res, next) {
  if (!env.adminDebugToken) {
    return res.status(503).json({ message: 'Admin debug endpoint is disabled. Set ADMIN_DEBUG_TOKEN.' });
  }

  const providedToken = String(req.headers['x-admin-debug-token'] || req.query.token || '').trim();
  if (!safeCompare(env.adminDebugToken, providedToken)) {
    debugStore.recordEvent('admin_debug_auth_failed', {
      path: req.originalUrl,
      ip: getClientIp(req)
    }, env.debugRecentLimit);
    return res.status(401).json({ message: 'Invalid admin debug token' });
  }

  return next();
}

function mongoStateLabel(state) {
  const labels = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return labels[state] || 'unknown';
}

router.get(
  '/debug',
  requireAdminDebugToken,
  asyncHandler(async function (req, res) {
    const limit = Math.max(1, Number(req.query.limit || env.debugRecentLimit || 50));
    const snapshot = debugStore.snapshot(limit);
    const rateLimitSnapshot = typeof authRoutes.getLoginRateLimitDebugSnapshot === 'function'
      ? authRoutes.getLoginRateLimitDebugSnapshot()
      : { trackedIps: 0, blockedIps: 0, records: [] };

    const [userCount, tradeCount, setupCount] = await Promise.all([
      User.countDocuments({}),
      Trade.countDocuments({}),
      Setup.countDocuments({})
    ]);

    const mongo = mongoose.connection || {};
    const dbInfo = {
      readyState: Number(mongo.readyState || 0),
      state: mongoStateLabel(Number(mongo.readyState || 0)),
      host: mongo.host || '',
      name: mongo.name || ''
    };

    debugStore.recordEvent('admin_debug_snapshot', {
      ip: getClientIp(req),
      limit: limit
    }, env.debugRecentLimit);

    res.json({
      serverTime: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'development',
      pid: process.pid,
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      memory: process.memoryUsage(),
      db: dbInfo,
      config: {
        corsOrigins: env.corsOrigins,
        authRateLimit: {
          maxAttempts: env.authRateLimitMaxAttempts,
          windowMinutes: env.authRateLimitWindowMinutes,
          blockMinutes: env.authRateLimitBlockMinutes
        },
        upload: {
          maxFileSizeMb: env.uploadMaxFileSizeMb,
          maxFileCount: env.uploadMaxFileCount,
          allowedMimeTypes: env.uploadAllowedMimeTypes
        },
        googleConfigured: Boolean(env.googleClientId && env.googleClientSecret && env.googleRedirectUri),
        supportEmail: env.supportEmail,
        seedDemoUsers: env.seedDemoUsers
      },
      collections: {
        users: userCount,
        trades: tradeCount,
        setups: setupCount
      },
      authRateLimit: rateLimitSnapshot,
      recent: snapshot
    });
  })
);

router.post(
  '/debug/clear',
  requireAdminDebugToken,
  asyncHandler(async function (req, res) {
    debugStore.clear();
    debugStore.recordEvent('admin_debug_cleared', {
      ip: getClientIp(req)
    }, env.debugRecentLimit);
    res.json({ ok: true });
  })
);

module.exports = router;