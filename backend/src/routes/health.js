const express = require('express');
const env = require('../config/env');
const debugStore = require('../services/debugStore');

const router = express.Router();

router.get('/', function (req, res) {
  debugStore.recordEvent('health_check', {
    requestId: req.requestId || '',
    ip: req.headers['x-forwarded-for'] || req.ip || ''
  }, env.debugRecentLimit);

  res.json({
    ok: true,
    service: 'smc-trade-backend',
    apiMode: 'mongodb+s3',
    cdnBaseUrl: env.cdnBaseUrl || null
  });
});

module.exports = router;
