const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const debugStore = require('../services/debugStore');
const { requireAuth } = require('../middleware/auth');
const Watchlist = require('../models/Watchlist');
const { deleteByKey } = require('../services/s3');

const router = express.Router();

function logWatchlistEvent(type, req, details) {
  const eventDetails = details && typeof details === 'object' ? details : {};
  debugStore.recordEvent(type, Object.assign({
    requestId: req.requestId || '',
    userId: req.user && req.user.id ? req.user.id : '',
    ip: req.headers['x-forwarded-for'] || req.ip || ''
  }, eventDetails), env.debugRecentLimit);
}

function createEmptyMedia() {
  return Watchlist.createEmptyMedia();
}

function normalizeMediaItem(section, item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  return {
    section: String(section || '').trim(),
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

  const sectionSet = new Set(Object.keys(result).concat(Object.keys(media)));

  sectionSet.forEach(function (rawSection) {
    const section = String(rawSection || '').trim();
    if (!section) {
      return;
    }

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

function normalizeMediaBySetup(mediaBySetup, legacyMedia, setupId) {
  const source = mediaBySetup && typeof mediaBySetup === 'object' ? mediaBySetup : {};
  const result = {};

  Object.keys(source).forEach(function (rawSetupId) {
    const normalizedSetupId = String(rawSetupId || '').trim();
    if (!normalizedSetupId) {
      return;
    }

    result[normalizedSetupId] = normalizeMedia(source[rawSetupId]);
  });

  if (setupId && !result[setupId]) {
    result[setupId] = normalizeMedia(legacyMedia);
  }

  return result;
}

function normalizeBranchSelections(branchSelections) {
  const source = branchSelections && typeof branchSelections === 'object' ? branchSelections : {};
  const sections = source.sections && typeof source.sections === 'object' ? source.sections : {};
  const conditions = source.conditions && typeof source.conditions === 'object' ? source.conditions : {};

  return {
    sections: Object.keys(sections).reduce(function (accumulator, key) {
      accumulator[String(key)] = sections[key] === 'else' ? 'else' : 'then';
      return accumulator;
    }, {}),
    conditions: Object.keys(conditions).reduce(function (accumulator, key) {
      accumulator[String(key)] = conditions[key] === 'else' ? 'else' : 'then';
      return accumulator;
    }, {})
  };
}

function normalizeWatchlistBody(body) {
  const source = body && typeof body === 'object' ? body : {};
  const notes = source.notes && typeof source.notes === 'object' ? source.notes : {};
  const progress = source.progress && typeof source.progress === 'object' ? source.progress : {};
  const setup = source.setup && typeof source.setup === 'object' ? source.setup : {};
  const setupSnapshot = source.setupSnapshot && typeof source.setupSnapshot === 'object' ? source.setupSnapshot : null;
  const branchSelections = normalizeBranchSelections(source.branchSelections);

  const setupId = String(source.setupId || setup.id || setup._id || '').trim();
  const setupName = String(source.setupName || setup.name || '').trim();
  const tradeName = String(source.tradeName || notes.tradeName || '').trim();
  const instrument = String(source.instrument || notes.instrument || '').trim();
  const tradeTimestamp = String(source.tradeTimestamp || notes.tradeTimestamp || source.timestamp || '').trim();
  const bias = String(source.bias || 'short').toLowerCase() === 'long' ? 'long' : 'short';
  const checkedIds = Array.isArray(source.checkedIds) ? source.checkedIds.map(String) : [];
  const postTradeCheckedIds = Array.isArray(source.postTradeCheckedIds) ? source.postTradeCheckedIds.map(String) : [];
  const prices = source.prices && typeof source.prices === 'object' ? source.prices : {};
  const mediaBySetup = normalizeMediaBySetup(source.mediaBySetup, source.media, setupId);

  return {
    setupId,
    setupName,
    setupSnapshot,
    tradeName,
    instrument,
    tradeTimestamp,
    bias,
    checkedIds,
    postTradeCheckedIds,
    branchSelections,
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
      tradeState: String(notes.tradeState || source.tradeState || 'placed'),
      outcome: String(notes.outcome || source.outcome || 'pending'),
      comments: String(notes.comments || source.comments || notes.partialCloseReason || source.partialCloseReason || ''),
      pnlAmount: String(notes.pnlAmount || source.pnlAmount || ''),
      pnlCurrency: String(notes.pnlCurrency || source.pnlCurrency || ''),
      reviewNotes: String(notes.reviewNotes || source.reviewNotes || ''),
      nodeComments: notes.nodeComments && typeof notes.nodeComments === 'object' ? notes.nodeComments : {}
    },
    media: setupId && mediaBySetup[setupId] ? mediaBySetup[setupId] : normalizeMedia(source.media),
    mediaBySetup
  };
}

function mediaKeys(item) {
  const media = item && item.media && typeof item.media === 'object' ? item.media : createEmptyMedia();
  const keys = [];

  Object.keys(media).forEach(function (section) {
    const items = Array.isArray(media[section]) ? media[section] : [];
    items.forEach(function (entry) {
      if (entry && entry.key) {
        keys.push(entry.key);
      }
    });
  });

  return Array.from(new Set(keys));
}

router.post('/', requireAuth, asyncHandler(async function (req, res) {
  const payload = normalizeWatchlistBody(req.body || {});

  const item = await Watchlist.create(Object.assign({ userId: req.user.id }, payload));

  logWatchlistEvent('watchlist_create_success', req, {
    watchlistId: item._id.toString(),
    tradeName: payload.tradeName
  });

  res.status(201).json({ watchlist: item });
}));

router.get('/', requireAuth, asyncHandler(async function (req, res) {
  const items = await Watchlist.find({ userId: req.user.id }).sort({ createdAt: -1 });

  logWatchlistEvent('watchlist_list_success', req, {
    count: items.length
  });

  res.json({ watchlist: items });
}));

router.get('/:id', requireAuth, asyncHandler(async function (req, res) {
  const item = await Watchlist.findOne({ _id: req.params.id, userId: req.user.id });
  if (!item) {
    logWatchlistEvent('watchlist_get_not_found', req, {
      watchlistId: req.params.id
    });
    return res.status(404).json({ message: 'Watchlist item not found' });
  }

  logWatchlistEvent('watchlist_get_success', req, {
    watchlistId: item._id.toString()
  });

  res.json({ watchlist: item });
}));

router.delete('/:id', requireAuth, asyncHandler(async function (req, res) {
  const item = await Watchlist.findOne({ _id: req.params.id, userId: req.user.id });
  if (!item) {
    logWatchlistEvent('watchlist_delete_not_found', req, {
      watchlistId: req.params.id
    });
    return res.status(404).json({ message: 'Watchlist item not found' });
  }

  for (const key of mediaKeys(item)) {
    await deleteByKey(key);
  }

  await item.deleteOne();

  logWatchlistEvent('watchlist_delete_success', req, {
    watchlistId: req.params.id
  });

  res.json({ ok: true });
}));

module.exports = router;
