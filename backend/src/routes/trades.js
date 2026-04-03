const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const Trade = require('../models/Trade');
const { deleteByKey } = require('../services/s3');

const router = express.Router();

function createEmptyMedia() {
  return Trade.createEmptyMedia();
}

function normalizeMediaItem(section, item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  return {
    section,
    name: String(item.name || '').trim(),
    type: String(item.type || '').trim(),
    size: Number(item.size || 0),
    key: String(item.key || '').trim(),
    url: String(item.url || '').trim()
  };
}

function normalizeMedia(media) {
  const result = createEmptyMedia();

  if (!media || typeof media !== 'object') {
    return result;
  }

  Object.keys(result).forEach(function (section) {
    const items = Array.isArray(media[section]) ? media[section] : [];
    result[section] = items
      .map(function (item) {
        return normalizeMediaItem(section, item);
      })
      .filter(function (item) {
        return item && item.url;
      });
  });

  return result;
}

function normalizeTradeBody(body) {
  const source = body && typeof body === 'object' ? body : {};
  const notes = source.notes && typeof source.notes === 'object' ? source.notes : {};
  const progress = source.progress && typeof source.progress === 'object' ? source.progress : {};
  const setup = source.setup && typeof source.setup === 'object' ? source.setup : {};
  const archived = source.archived === true;
  const deletedAt = source.deletedAt ? new Date(source.deletedAt) : null;

  const setupId = String(source.setupId || setup.id || '').trim();
  const setupName = String(source.setupName || setup.name || '').trim();
  const tradeName = String(source.tradeName || notes.tradeName || '').trim();
  const bias = String(body.bias || 'short').toLowerCase() === 'long' ? 'long' : 'short';
  const checkedIds = Array.isArray(body.checkedIds) ? body.checkedIds.map(String) : [];
  const prices = body.prices && typeof body.prices === 'object' ? body.prices : {};

  return {
    setupId,
    setupName,
    tradeName,
    bias,
    checkedIds,
    progress: {
      checked: Number.isFinite(Number(progress.checked)) ? Number(progress.checked) : checkedIds.length,
      total: Number.isFinite(Number(progress.total)) ? Number(progress.total) : 0
    },
    prices: {
      entry: String(prices.entry || ''),
      sl: String(prices.sl || ''),
      lrl: String(prices.lrl || '')
    },
    notes: {
      ideal: String(notes.ideal || ''),
      real: String(notes.real || ''),
      tradeState: String(notes.tradeState || source.tradeState || 'placed'),
      outcome: String(notes.outcome || source.outcome || 'pending'),
      comments: String(notes.comments || source.comments || notes.partialCloseReason || source.partialCloseReason || '')
    },
    archived,
    deletedAt,
    media: normalizeMedia(body.media)
  };
}

function mediaKeys(trade) {
  const media = trade && trade.media && typeof trade.media === 'object' ? trade.media : createEmptyMedia();
  const keys = [];

  Object.keys(media).forEach(function (section) {
    const items = Array.isArray(media[section]) ? media[section] : [];
    items.forEach(function (item) {
      if (item && item.key) {
        keys.push(item.key);
      }
    });
  });

  return Array.from(new Set(keys));
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async function (req, res) {
    const payload = normalizeTradeBody(req.body || {});

    const trade = await Trade.create({
      userId: req.user.id,
      setupId: payload.setupId,
      setupName: payload.setupName,
      tradeName: payload.tradeName,
      bias: payload.bias,
      checkedIds: payload.checkedIds,
      progress: payload.progress,
      prices: payload.prices,
      notes: payload.notes,
      media: payload.media,
      archived: payload.archived,
      deletedAt: payload.deletedAt
    });

    res.status(201).json({ trade });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async function (req, res) {
    const trades = await Trade.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ trades });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async function (req, res) {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user.id });
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }

    res.json({ trade });
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async function (req, res) {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user.id });
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }

    const payload = normalizeTradeBody(req.body || {});

    trade.bias = payload.bias;
    trade.setupId = payload.setupId;
    trade.setupName = payload.setupName;
    trade.tradeName = payload.tradeName;
    trade.checkedIds = payload.checkedIds;
    trade.progress = payload.progress;
    trade.prices = payload.prices;
    trade.notes = payload.notes;
    trade.archived = payload.archived;
    trade.deletedAt = payload.deletedAt;
    trade.media = payload.media;

    await trade.save();

    res.json({ trade });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async function (req, res) {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user.id });
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }

    for (const key of mediaKeys(trade)) {
      await deleteByKey(key);
    }

    await trade.deleteOne();

    res.json({ ok: true });
  })
);

module.exports = router;
