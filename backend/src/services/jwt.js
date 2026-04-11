const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { username: user.username, name: user.name },
    env.jwtAccessSecret,
    { subject: String(user._id || user.id), expiresIn: env.accessTokenTtl }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { username: user.username, name: user.name, type: 'refresh' },
    env.jwtRefreshSecret,
    { subject: String(user._id || user.id), expiresIn: env.refreshTokenTtl }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

module.exports = {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};