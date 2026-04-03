const express = require('express');
const multer = require('multer');

const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { buildObjectKey, uploadBuffer } = require('../services/s3');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post(
  '/media',
  requireAuth,
  upload.array('files', 20),
  asyncHandler(async function (req, res) {
    const section = String(req.body.section || 'general');
    const files = Array.isArray(req.files) ? req.files : [];

    if (files.length === 0) {
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

    res.status(201).json({ files: uploaded });
  })
);

module.exports = router;