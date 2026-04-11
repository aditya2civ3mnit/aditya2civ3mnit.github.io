const express = require('express');
const multer = require('multer');

const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const debugStore = require('../services/debugStore');
const { requireAuth } = require('../middleware/auth');
const { buildObjectKey, uploadBuffer } = require('../services/s3');

const router = express.Router();
const allowedMimeTypes = Array.isArray(env.uploadAllowedMimeTypes) ? env.uploadAllowedMimeTypes : [];
const maxFileSizeBytes = Math.max(1, Number(env.uploadMaxFileSizeMb || 10)) * 1024 * 1024;
const maxFileCount = Math.max(1, Number(env.uploadMaxFileCount || 20));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeBytes },
  fileFilter: function (req, file, callback) {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      const error = new Error('Unsupported file type: ' + file.mimetype);
      error.status = 400;
      return callback(error);
    }

    return callback(null, true);
  }
});

function uploadFilesMiddleware(req, res, next) {
  return upload.array('files', maxFileCount)(req, res, function (error) {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        debugStore.recordEvent('upload_rejected_file_size', {
          ip: req.headers['x-forwarded-for'] || req.ip,
          maxFileSizeMb: Number(env.uploadMaxFileSizeMb || 10)
        }, env.debugRecentLimit);
        return res.status(400).json({ message: 'Each file must be <= ' + Number(env.uploadMaxFileSizeMb || 10) + 'MB' });
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        debugStore.recordEvent('upload_rejected_file_count', {
          ip: req.headers['x-forwarded-for'] || req.ip,
          maxFileCount: maxFileCount
        }, env.debugRecentLimit);
        return res.status(400).json({ message: 'Too many files. Max allowed is ' + maxFileCount });
      }

      return res.status(400).json({ message: error.message || 'Invalid upload payload' });
    }

    if (error && error.message) {
      debugStore.recordEvent('upload_rejected_other', {
        ip: req.headers['x-forwarded-for'] || req.ip,
        message: error.message
      }, env.debugRecentLimit);
    }

    return next(error);
  });
}

router.post(
  '/media',
  requireAuth,
  uploadFilesMiddleware,
  asyncHandler(async function (req, res) {
    const section = String(req.body.section || 'general');
    const files = Array.isArray(req.files) ? req.files : [];

    if (files.length === 0) {
      debugStore.recordEvent('upload_rejected_empty', {
        userId: req.user && req.user.id ? req.user.id : '',
        section: section
      }, env.debugRecentLimit);
      return res.status(400).json({ message: 'No files received' });
    }

    const uploaded = [];

    for (const file of files) {
      const key = buildObjectKey(req.user.id, section, file.originalname);
      const saved = await uploadBuffer({
        buffer: file.buffer,
        contentType: file.mimetype,
        key
      });

      uploaded.push({
        section,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        key: saved.key,
        url: saved.url
      });
    }

    debugStore.recordEvent('upload_success', {
      userId: req.user && req.user.id ? req.user.id : '',
      section: section,
      files: uploaded.length
    }, env.debugRecentLimit);

    res.status(201).json({ files: uploaded });
  })
);

module.exports = router;