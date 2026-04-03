const { randomUUID } = require('crypto');
const {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client
} = require('@aws-sdk/client-s3');

const env = require('../config/env');

let s3Client = null;

function getClient() {
  if (!s3Client) {
    if (!env.awsRegion || !env.awsAccessKeyId || !env.awsSecretAccessKey || !env.awsS3Bucket) {
      throw new Error('AWS S3 environment variables are required');
    }

    s3Client = new S3Client({
      region: env.awsRegion,
      credentials: {
        accessKeyId: env.awsAccessKeyId,
        secretAccessKey: env.awsSecretAccessKey
      }
    });
  }

  return s3Client;
}

function sanitizeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function buildObjectKey(userId, section, originalName) {
  const prefix = String(env.awsS3Prefix || 'trade-media').replace(/\/$/, '');
  const safeSection = sanitizeName(section || 'general');
  const safeName = sanitizeName(originalName);
  return [prefix, String(userId), safeSection, `${Date.now()}-${randomUUID()}-${safeName}`].join('/');
}

function buildPublicUrl(key) {
  if (env.cdnBaseUrl) {
    return `${env.cdnBaseUrl}/${key}`;
  }

  return `https://${env.awsS3Bucket}.s3.${env.awsRegion}.amazonaws.com/${key}`;
}

async function uploadBuffer({ buffer, contentType, key }) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.awsS3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream'
    })
  );

  return {
    key,
    url: buildPublicUrl(key)
  };
}

async function deleteByKey(key) {
  if (!key) return;

  await getClient().send(
    new DeleteObjectCommand({
      Bucket: env.awsS3Bucket,
      Key: key
    })
  );
}

module.exports = {
  buildObjectKey,
  buildPublicUrl,
  deleteByKey,
  uploadBuffer
};