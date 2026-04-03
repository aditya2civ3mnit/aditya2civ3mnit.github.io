const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../services/jwt');

function unauthorized(res, message) {
  return res.status(401).json({ message: message || 'Unauthorized' });
}

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  return null;
}

const requireAuth = asyncHandler(async function (req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return unauthorized(res);
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    return unauthorized(res, 'Invalid or expired token');
  }

  const userId = payload && payload.sub ? payload.sub : null;
  if (!userId) {
    return unauthorized(res, 'Invalid token payload');
  }

  const user = await User.findById(userId);
  if (!user) {
    return unauthorized(res, 'User not found');
  }

  req.user = {
    id: user._id.toString(),
    name: user.name,
    username: user.username
  };
  req.userRecord = user;
  req.authPayload = payload;

  next();
});

module.exports = {
  requireAuth,
  extractBearerToken
};