const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const debugStore = require('../services/debugStore');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } = require('../services/jwt');

const router = express.Router();
const loginAttemptStore = new Map();

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.ip || 'unknown');
}

function logAuthEvent(type, req, details) {
  const eventDetails = details && typeof details === 'object' ? details : {};
  debugStore.recordEvent(type, Object.assign({
    requestId: req.requestId || '',
    ip: getClientIp(req)
  }, eventDetails), env.debugRecentLimit);
}

function getLoginRateLimitDebugSnapshot() {
  const now = Date.now();
  const records = [];
  let blockedIps = 0;

  loginAttemptStore.forEach(function (record, ip) {
    const attempts = Array.isArray(record && record.attempts) ? record.attempts.length : 0;
    const blockedUntil = Number(record && record.blockedUntil ? record.blockedUntil : 0);
    const blocked = blockedUntil > now;

    if (blocked) {
      blockedIps += 1;
    }

    records.push({
      ip: ip,
      attemptsInWindow: attempts,
      blockedUntil: blockedUntil > 0 ? new Date(blockedUntil).toISOString() : '',
      blocked: blocked
    });
  });

  return {
    trackedIps: loginAttemptStore.size,
    blockedIps: blockedIps,
    records: records
  };
}

function getRateLimitWindows() {
  return {
    maxAttempts: Math.max(1, Number(env.authRateLimitMaxAttempts || 10)),
    windowMs: Math.max(1, Number(env.authRateLimitWindowMinutes || 15)) * 60 * 1000,
    blockMs: Math.max(1, Number(env.authRateLimitBlockMinutes || 15)) * 60 * 1000
  };
}

function getLoginAttemptRecord(ip) {
  const existing = loginAttemptStore.get(ip);
  if (existing) {
    return existing;
  }

  const record = { attempts: [], blockedUntil: 0 };
  loginAttemptStore.set(ip, record);
  return record;
}

function pruneOldAttempts(record, windowMs, now) {
  record.attempts = record.attempts.filter(function (timestamp) {
    return now - timestamp <= windowMs;
  });
}

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const limits = getRateLimitWindows();
  const ip = getClientIp(req);
  const record = getLoginAttemptRecord(ip);

  pruneOldAttempts(record, limits.windowMs, now);

  if (record.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    debugStore.recordEvent('auth_login_rate_limited', {
      ip: ip,
      retryAfterSeconds: retryAfterSeconds
    }, env.debugRecentLimit);
    return res.status(429).json({
      message: 'Too many login attempts. Try again later.',
      retryAfterSeconds: retryAfterSeconds
    });
  }

  req.loginRateLimit = {
    ip: ip,
    now: now,
    limits: limits,
    record: record
  };

  return next();
}

function trackLoginAttempt(req, isSuccess) {
  const context = req.loginRateLimit;
  if (!context || !context.record || !context.limits) {
    return;
  }

  if (isSuccess) {
    loginAttemptStore.delete(context.ip);
    return;
  }

  const now = Date.now();
  pruneOldAttempts(context.record, context.limits.windowMs, now);
  context.record.attempts.push(now);

  if (context.record.attempts.length >= context.limits.maxAttempts) {
    context.record.blockedUntil = now + context.limits.blockMs;
    context.record.attempts = [];
  }
}

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    username: user.username,
    email: user.email || ''
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

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  return header.split(';').reduce(function (accumulator, pair) {
    const index = pair.indexOf('=');
    if (index < 0) return accumulator;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) {
      accumulator[key] = decodeURIComponent(value || '');
    }
    return accumulator;
  }, {});
}

function setCookie(res, name, value, options) {
  const parts = [name + '=' + encodeURIComponent(value || '')];
  const opts = options || {};

  if (opts.maxAge != null) parts.push('Max-Age=' + Math.floor(Number(opts.maxAge) / 1000));
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push('SameSite=' + (opts.sameSite || 'Lax'));
  parts.push('Path=' + (opts.path || '/'));
  res.append('Set-Cookie', parts.join('; '));
}

function clearCookie(res, name) {
  res.append('Set-Cookie', name + '=; Max-Age=0; Path=/; SameSite=Lax');
}

function buildFrontendRedirectUrl(fragmentParams, returnTo, pagePath) {
  const baseUrl = String(returnTo || env.frontendBaseUrl || 'http://127.0.0.1:5500').replace(/\/$/, '');
  const params = new URLSearchParams(fragmentParams || {});
  return baseUrl + '/' + String(pagePath || 'signin.html').replace(/^\/+/, '') + '#' + params.toString();
}

function normalizeFrontendOrigin(value) {
  const fallback = String(env.frontendBaseUrl || 'http://127.0.0.1:5500').replace(/\/$/, '');
  const raw = String(value || '').trim();

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch (error) {
    return fallback;
  }
}

function normalizeUsernameSource(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

async function makeUniqueUsername(base) {
  const cleaned = normalizeUsernameSource(base) || 'trader';
  let candidate = cleaned;
  let attempt = 0;

  while (attempt < 50) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await User.findOne({ username: candidate }).select('_id').lean();
    if (!exists) {
      return candidate;
    }

    attempt += 1;
    candidate = (cleaned + '-' + Math.random().toString(36).slice(2, 6)).slice(0, 30);
  }

  return 'trader-' + Date.now().toString(36);
}

async function verifyGoogleIdToken(idToken) {
  const token = String(idToken || '').trim();
  if (!token) {
    return { ok: false, message: 'idToken is required' };
  }

  const allowedClientIds = Array.isArray(env.googleClientIds) ? env.googleClientIds.filter(Boolean) : [];
  if (allowedClientIds.length === 0 && !env.googleClientId) {
    return { ok: false, message: 'Google sign-in is not configured on backend' };
  }

  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token);
  let payload;

  try {
    const response = await fetch(url, { method: 'GET' });
    payload = await response.json();
    if (!response.ok) {
      return { ok: false, message: payload && payload.error_description ? payload.error_description : 'Invalid Google token' };
    }
  } catch (error) {
    return { ok: false, message: 'Could not verify Google token' };
  }

  const aud = String(payload && payload.aud ? payload.aud : '').trim();
  const isAllowedAudience = allowedClientIds.length > 0
    ? allowedClientIds.includes(aud)
    : aud === env.googleClientId;

  if (!payload || !isAllowedAudience) {
    return { ok: false, message: 'Google token audience mismatch' };
  }

  if (String(payload.email_verified || '').toLowerCase() !== 'true') {
    return { ok: false, message: 'Google email is not verified' };
  }

  return {
    ok: true,
    profile: {
      sub: String(payload.sub || '').trim(),
      name: String(payload.name || '').trim(),
      email: String(payload.email || '').trim().toLowerCase()
    }
  };
}

async function exchangeGoogleAuthCode(code) {
  const authCode = String(code || '').trim();
  if (!authCode) {
    return { ok: false, message: 'code is required' };
  }

  if (!env.googleClientId || !env.googleClientSecret || !env.googleRedirectUri) {
    return { ok: false, message: 'Google OAuth is not fully configured on backend' };
  }

  const body = new URLSearchParams({
    code: authCode,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: env.googleRedirectUri,
    grant_type: 'authorization_code'
  });

  let payload;
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    payload = await response.json();
    if (!response.ok) {
      return { ok: false, message: payload && payload.error_description ? payload.error_description : 'Could not exchange Google code' };
    }
  } catch (error) {
    return { ok: false, message: 'Could not exchange Google code' };
  }

  if (!payload || !payload.id_token) {
    return { ok: false, message: 'Google token response missing id_token' };
  }

  const verified = await verifyGoogleIdToken(payload.id_token);
  if (!verified.ok) {
    return verified;
  }

  return {
    ok: true,
    profile: verified.profile || {},
    tokens: payload
  };
}

async function createOrLinkGoogleUser(profile) {
  const googleProfile = profile || {};
  if (!googleProfile.sub || !googleProfile.email) {
    throw new Error('Google profile data is incomplete');
  }

  let user = await User.findOne({ googleSub: googleProfile.sub });

  if (!user) {
    user = await User.findOne({ email: googleProfile.email });
    if (user) {
      user.googleSub = googleProfile.sub;
      user.authProvider = 'google';
      if (!user.name && googleProfile.name) {
        user.name = googleProfile.name;
      }
    }
  }

  if (!user) {
    const usernameBase = googleProfile.email.split('@')[0] || googleProfile.name || 'trader';
    const username = await makeUniqueUsername(usernameBase);
    user = await User.create({
      name: googleProfile.name || username,
      email: googleProfile.email,
      username: username,
      passwordHash: null,
      authProvider: 'google',
      googleSub: googleProfile.sub
    });
  }

  const tokens = issueTokenPair(user);
  user.refreshTokenHash = tokens.refreshTokenHash;
  await user.save();

  return {
    user: user,
    session: {
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  };
}

async function issueSessionResponse(user) {
  const tokens = issueTokenPair(user);
  user.refreshTokenHash = tokens.refreshTokenHash;
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken
  };
}

router.get(
  '/google/start',
  asyncHandler(async function (req, res) {
    if (!env.googleClientId || !env.googleRedirectUri) {
      logAuthEvent('auth_google_start_failed', req, { reason: 'oauth_not_configured' });
      return res.status(500).json({ message: 'Google OAuth is not configured' });
    }

    const state = crypto.randomBytes(18).toString('hex');
    const returnTo = normalizeFrontendOrigin(req.query.returnTo || req.headers.origin || env.frontendBaseUrl);
    setCookie(res, 'google_oauth_state', state, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 10 * 60 * 1000 });
    setCookie(res, 'google_oauth_return_to', returnTo, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 10 * 60 * 1000 });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', env.googleClientId);
    authUrl.searchParams.set('redirect_uri', env.googleRedirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'select_account');

    logAuthEvent('auth_google_start_success', req, {
      returnTo: returnTo
    });

    res.redirect(authUrl.toString());
  })
);

router.get(
  '/google/callback',
  asyncHandler(async function (req, res) {
    const stateFromCookie = parseCookies(req).google_oauth_state || '';
    const returnToFromCookie = parseCookies(req).google_oauth_return_to || '';
    const stateFromQuery = String(req.query.state || '').trim();
    const code = String(req.query.code || '').trim();
    const error = String(req.query.error || '').trim();

    clearCookie(res, 'google_oauth_state');
    clearCookie(res, 'google_oauth_return_to');

    if (error) {
      logAuthEvent('auth_google_callback_failed', req, {
        reason: 'google_error',
        error: error
      });
      return res.redirect(buildFrontendRedirectUrl({ googleError: error }, returnToFromCookie));
    }

    if (!code) {
      logAuthEvent('auth_google_callback_failed', req, {
        reason: 'missing_code'
      });
      return res.redirect(buildFrontendRedirectUrl({ googleError: 'missing_code' }, returnToFromCookie));
    }

    if (!stateFromCookie || stateFromCookie !== stateFromQuery) {
      logAuthEvent('auth_google_callback_failed', req, {
        reason: 'invalid_state'
      });
      return res.redirect(buildFrontendRedirectUrl({ googleError: 'invalid_state' }, returnToFromCookie));
    }

    const exchanged = await exchangeGoogleAuthCode(code);
    if (!exchanged.ok) {
      logAuthEvent('auth_google_callback_failed', req, {
        reason: 'code_exchange_failed',
        message: exchanged.message || 'google_login_failed'
      });
      return res.redirect(buildFrontendRedirectUrl({ googleError: exchanged.message || 'google_login_failed' }, returnToFromCookie));
    }

    const linked = await createOrLinkGoogleUser(exchanged.profile);
    const sessionParams = new URLSearchParams({
      mode: 'api',
      userId: linked.session.user.id,
      username: linked.session.user.username,
      name: linked.session.user.name,
      email: linked.session.user.email || '',
      token: linked.session.accessToken,
      refreshToken: linked.session.refreshToken,
      usernameSuggestion: linked.session.user.username || ''
    });

    const needsCredentials = !linked.user || !linked.user.passwordHash;
    const targetPage = needsCredentials ? 'account-setup.html' : 'signin.html';
    logAuthEvent('auth_google_callback_success', req, {
      userId: linked.session.user.id,
      needsCredentials: needsCredentials,
      targetPage: targetPage
    });
    res.redirect(buildFrontendRedirectUrl(sessionParams, returnToFromCookie, targetPage));
  })
);

router.post(
  '/register',
  asyncHandler(async function (req, res) {
    const name = String(req.body.name || '').trim();
    const emailRaw = String(req.body.email || '').trim().toLowerCase();
    const email = emailRaw || null;
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !username || !password) {
      logAuthEvent('auth_register_validation_failed', req, {
        username: username,
        reason: 'missing_required_fields'
      });
      return res.status(400).json({ message: 'name, username and password are required' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      logAuthEvent('auth_register_conflict', req, {
        username: username,
        reason: 'username_exists'
      });
      return res.status(409).json({ message: 'Username already exists' });
    }

    if (email) {
      const existingEmail = await User.findOne({ email: email });
      if (existingEmail) {
        logAuthEvent('auth_register_conflict', req, {
          email: email,
          reason: 'email_exists'
        });
        return res.status(409).json({ message: 'Email already exists' });
      }
    }

    const user = await User.create({
      name,
      email,
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

    logAuthEvent('auth_register_success', req, {
      userId: user._id.toString(),
      username: user.username
    });
  })
);

router.post(
  '/login',
  loginRateLimit,
  asyncHandler(async function (req, res) {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !password) {
      trackLoginAttempt(req, false);
      debugStore.recordEvent('auth_login_validation_failed', {
        ip: getClientIp(req),
        username: username,
        reason: 'missing_username_or_password'
      }, env.debugRecentLimit);
      return res.status(400).json({ message: 'username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      trackLoginAttempt(req, false);
      debugStore.recordEvent('auth_login_failed', {
        ip: getClientIp(req),
        username: username,
        reason: 'unknown_user'
      }, env.debugRecentLimit);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    if (!user.passwordHash) {
      trackLoginAttempt(req, false);
      debugStore.recordEvent('auth_login_failed', {
        ip: getClientIp(req),
        username: username,
        userId: user._id.toString(),
        reason: 'google_only_account'
      }, env.debugRecentLimit);
      return res.status(401).json({ message: 'Use Google sign-in for this account' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      trackLoginAttempt(req, false);
      debugStore.recordEvent('auth_login_failed', {
        ip: getClientIp(req),
        username: username,
        userId: user._id.toString(),
        reason: 'invalid_password'
      }, env.debugRecentLimit);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    trackLoginAttempt(req, true);
    debugStore.recordEvent('auth_login_success', {
      ip: getClientIp(req),
      username: username,
      userId: user._id.toString()
    }, env.debugRecentLimit);

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
  '/google',
  asyncHandler(async function (req, res) {
    const verified = await verifyGoogleIdToken(req.body && req.body.idToken);
    if (!verified.ok) {
      logAuthEvent('auth_google_token_login_failed', req, {
        reason: verified.message || 'google_signin_failed'
      });
      return res.status(401).json({ message: verified.message || 'Google sign-in failed' });
    }

    const linked = await createOrLinkGoogleUser(verified.profile || {});
    logAuthEvent('auth_google_token_login_success', req, {
      userId: linked.session.user.id,
      username: linked.session.user.username
    });
    res.json(linked.session);
  })
);

router.put(
  '/credentials',
  requireAuth,
  asyncHandler(async function (req, res) {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!username || !password) {
      logAuthEvent('auth_credentials_update_validation_failed', req, {
        userId: req.user && req.user.id ? req.user.id : '',
        reason: 'missing_required_fields'
      });
      return res.status(400).json({ message: 'username and password are required' });
    }

    if (password.length < 8) {
      logAuthEvent('auth_credentials_update_validation_failed', req, {
        userId: req.user && req.user.id ? req.user.id : '',
        reason: 'password_too_short'
      });
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    if (password !== confirmPassword) {
      logAuthEvent('auth_credentials_update_validation_failed', req, {
        userId: req.user && req.user.id ? req.user.id : '',
        reason: 'password_mismatch'
      });
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const existingUsername = await User.findOne({ username: username, _id: { $ne: req.user.id } });
    if (existingUsername) {
      logAuthEvent('auth_credentials_update_conflict', req, {
        userId: req.user && req.user.id ? req.user.id : '',
        username: username,
        reason: 'username_exists'
      });
      return res.status(409).json({ message: 'Username already exists' });
    }

    req.userRecord.username = username;
    req.userRecord.passwordHash = await bcrypt.hash(password, 12);
    if (!req.userRecord.authProvider) {
      req.userRecord.authProvider = 'google';
    }

    const session = await issueSessionResponse(req.userRecord);
    logAuthEvent('auth_credentials_update_success', req, {
      userId: req.user && req.user.id ? req.user.id : '',
      username: username
    });
    res.json(session);
  })
);

router.post(
  '/refresh',
  asyncHandler(async function (req, res) {
    const refreshToken = String(req.body.refreshToken || '');
    if (!refreshToken) {
      logAuthEvent('auth_refresh_validation_failed', req, { reason: 'missing_refresh_token' });
      return res.status(400).json({ message: 'refreshToken is required' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      logAuthEvent('auth_refresh_failed', req, { reason: 'invalid_or_expired_refresh' });
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      logAuthEvent('auth_refresh_failed', req, { reason: 'user_not_found' });
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.refreshTokenHash !== hashToken(refreshToken)) {
      logAuthEvent('auth_refresh_failed', req, {
        reason: 'refresh_token_revoked',
        userId: payload.sub
      });
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

    logAuthEvent('auth_refresh_success', req, {
      userId: user._id.toString(),
      username: user.username
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
          logAuthEvent('auth_logout_success', req, {
            userId: user._id.toString(),
            reason: 'refresh_token_revoked'
          });
        }
      } catch (error) {
        logAuthEvent('auth_logout_token_ignored', req, {
          reason: 'invalid_refresh_token'
        });
        // Ignore invalid refresh tokens during logout.
      }
    }

    if (!refreshToken) {
      logAuthEvent('auth_logout_success', req, {
        reason: 'no_refresh_token'
      });
    }

    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async function (req, res) {
    logAuthEvent('auth_me_success', req, {
      userId: req.user && req.user.id ? req.user.id : ''
    });
    res.json({ user: sanitizeUser(req.userRecord) });
  })
);

router.put(
  '/profile',
  requireAuth,
  asyncHandler(async function (req, res) {
    const name = String(req.body.name || '').trim();
    const emailRaw = String(req.body.email || '').trim().toLowerCase();
    const email = emailRaw || null;

    if (!name) {
      logAuthEvent('auth_profile_update_validation_failed', req, {
        userId: req.user && req.user.id ? req.user.id : '',
        reason: 'missing_name'
      });
      return res.status(400).json({ message: 'name is required' });
    }

    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      logAuthEvent('auth_profile_update_validation_failed', req, {
        userId: req.user && req.user.id ? req.user.id : '',
        reason: 'invalid_email'
      });
      return res.status(400).json({ message: 'Invalid email address' });
    }

    if (email) {
      const existing = await User.findOne({ email: email, _id: { $ne: req.user.id } });
      if (existing) {
        logAuthEvent('auth_profile_update_conflict', req, {
          userId: req.user && req.user.id ? req.user.id : '',
          email: email,
          reason: 'email_exists'
        });
        return res.status(409).json({ message: 'Email already exists' });
      }
    }

    req.userRecord.name = name;
    req.userRecord.email = email;
    await req.userRecord.save();

    logAuthEvent('auth_profile_update_success', req, {
      userId: req.user && req.user.id ? req.user.id : '',
      username: req.userRecord.username
    });

    res.json({ user: sanitizeUser(req.userRecord) });
  })
);

router.getLoginRateLimitDebugSnapshot = getLoginRateLimitDebugSnapshot;

module.exports = router;
