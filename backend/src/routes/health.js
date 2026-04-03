const express = require('express');
const env = require('../config/env');

const router = express.Router();

router.get('/', function (req, res) {
  res.json({
    ok: true,
    service: 'smc-trade-backend',
    apiMode: 'mongodb+s3',
    cdnBaseUrl: env.cdnBaseUrl || null
  });
});

module.exports = router;
