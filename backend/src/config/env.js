require('dotenv').config();

function cleanUrl(value) {
  return String(value || '').replace(/\/$/, '');
}

function parseCsvList(value) {
  return String(value || '')
    .split(',')
    .map(function (item) { return String(item || '').trim(); })
    .filter(Boolean);
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGO_URI || '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  googleClientId: String(process.env.GOOGLE_CLIENT_ID || '').trim(),
  googleClientIds: parseCsvList(process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || ''),
  googleClientSecret: String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
  googleRedirectUri: String(process.env.GOOGLE_REDIRECT_URI || '').trim(),
  frontendBaseUrl: cleanUrl(process.env.FRONTEND_BASE_URL || 'http://127.0.0.1:5500'),
  awsRegion: process.env.AWS_REGION || '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  awsS3Bucket: process.env.AWS_S3_BUCKET || '',
  awsS3Prefix: process.env.AWS_S3_PREFIX || 'trade-media',
  cdnBaseUrl: cleanUrl(process.env.CDN_BASE_URL || ''),
  supportEmail: String(process.env.SUPPORT_EMAIL || 'support@example.com').trim(),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  corsOrigins: parseCsvList(process.env.CORS_ORIGIN || ''),
  authRateLimitMaxAttempts: Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 10),
  authRateLimitWindowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15),
  authRateLimitBlockMinutes: Number(process.env.AUTH_RATE_LIMIT_BLOCK_MINUTES || 15),
  uploadMaxFileSizeMb: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 10),
  uploadMaxFileCount: Number(process.env.UPLOAD_MAX_FILE_COUNT || 20),
  uploadAllowedMimeTypes: parseCsvList(process.env.UPLOAD_ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime'),
  adminDebugToken: String(process.env.ADMIN_DEBUG_TOKEN || '').trim(),
  debugRecentLimit: Number(process.env.DEBUG_RECENT_LIMIT || 50),
  seedDemoUsers: String(process.env.SEED_DEMO_USERS || 'true').toLowerCase() === 'true',
  demoUsers: [
    {
      name: 'Yonous',
      username: 'yonous',
      password: process.env.DEMO_USER_YONOUS_PASSWORD || 'yonous123'
    },
    {
      name: 'Shashank',
      username: 'shashank',
      password: process.env.DEMO_USER_SHASHANK_PASSWORD || 'shashank123'
    }
  ]
};