require('dotenv').config();

function cleanUrl(value) {
  return String(value || '').replace(/\/$/, '');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGO_URI || '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  awsRegion: process.env.AWS_REGION || '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  awsS3Bucket: process.env.AWS_S3_BUCKET || '',
  awsS3Prefix: process.env.AWS_S3_PREFIX || 'trade-media',
  cdnBaseUrl: cleanUrl(process.env.CDN_BASE_URL || ''),
  corsOrigin: process.env.CORS_ORIGIN || '*',
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