const express = require('express');
const bcrypt = require('bcryptjs');

const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } = require('../services/jwt');

const router = express.Router();

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    username: user.username
  };
}

function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  return {
    accessToken,
    refreshToken,
    refreshTokenHash: hashToken(refreshToken)
  };
}

router.post(
  '/register',
  asyncHandler(async function (req, res) {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !username || !password) {
      return res.status(400).json({ message: 'name, username and password are required' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const user = await User.create({
      name,
      username,
      passwordHash: await bcrypt.hash(password, 12)
    });

    const tokens = issueTokenPair(user);
    user.refreshTokenHash = tokens.refreshTokenHash;
    await user.save();

    res.status(201).json({
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  })
);

router.post(
  '/login',
  asyncHandler(async function (req, res) {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const tokens = issueTokenPair(user);
    user.refreshTokenHash = tokens.refreshTokenHash;
    await user.save();

    res.json({
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  })
);

router.post(
  '/refresh',
  asyncHandler(async function (req, res) {
    const refreshToken = String(req.body.refreshToken || '');
    if (!refreshToken) {
      return res.status(400).json({ message: 'refreshToken is required' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.refreshTokenHash !== hashToken(refreshToken)) {
      return res.status(401).json({ message: 'Refresh token revoked' });
    }

    const tokens = issueTokenPair(user);
    user.refreshTokenHash = tokens.refreshTokenHash;
    await user.save();

    res.json({
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  })
);

router.post(
  '/logout',
  asyncHandler(async function (req, res) {
    const refreshToken = String(req.body.refreshToken || '');

    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        const user = await User.findById(payload.sub);
        if (user) {
          user.refreshTokenHash = null;
          await user.save();
        }
      } catch (error) {
        // Ignore invalid refresh tokens during logout.
      }
    }

    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async function (req, res) {
    res.json({ user: req.user });
  })
);

module.exports = router;
