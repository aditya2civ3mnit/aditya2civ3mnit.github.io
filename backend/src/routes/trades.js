const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const debugStore = require('../services/debugStore');
const { requireAuth } = require('../middleware/auth');
const Trade = require('../models/Trade');
const { deleteByKey } = require('../services/s3');

const router = express.Router();

function logTradeEvent(type, req, details) {
  const eventDetails = details && typeof details === 'object' ? details : {};
  debugStore.recordEvent(type, Object.assign({
    requestId: req.requestId || '',
    userId: req.user && req.user.id ? req.user.id : '',
    ip: req.headers['x-forwarded-for'] || req.ip || ''
  }, eventDetails), env.debugRecentLimit);
}

function createEmptyMedia() {
  return Trade.createEmptyMedia();
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

  const sectionSet = new Set(
    Object.keys(result).concat(Object.keys(media))
  );

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

function normalizeSetupSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  return snapshot;
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

function normalizeTradeBody(body) {
  const source = body && typeof body === 'object' ? body : {};
  const notes = source.notes && typeof source.notes === 'object' ? source.notes : {};
  const progress = source.progress && typeof source.progress === 'object' ? source.progress : {};
  const setup = source.setup && typeof source.setup === 'object' ? source.setup : {};
  const setupSnapshot = normalizeSetupSnapshot(source.setupSnapshot);
  const archived = source.archived === true;
  const deletedAt = source.deletedAt ? new Date(source.deletedAt) : null;
  const branchSelections = normalizeBranchSelections(source.branchSelections);

  const setupId = String(source.setupId || setup.id || setup._id || '').trim();
  const setupName = String(source.setupName || setup.name || '').trim();
  const tradeName = String(source.tradeName || notes.tradeName || '').trim();
  const instrument = String(source.instrument || notes.instrument || '').trim();
  const tradeTimestamp = String(source.tradeTimestamp || notes.tradeTimestamp || source.timestamp || '').trim();
  const bias = String(body.bias || 'short').toLowerCase() === 'long' ? 'long' : 'short';
  const checkedIds = Array.isArray(body.checkedIds) ? body.checkedIds.map(String) : [];
  const postTradeCheckedIds = Array.isArray(body.postTradeCheckedIds) ? body.postTradeCheckedIds.map(String) : [];
  const prices = body.prices && typeof body.prices === 'object' ? body.prices : {};
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
    archived,
    deletedAt,
    media: setupId && mediaBySetup[setupId] ? mediaBySetup[setupId] : normalizeMedia(source.media),
    mediaBySetup
  };
}

function mergeDeep(baseValue, patchValue) {
  const base = baseValue && typeof baseValue === 'object' ? baseValue : {};
  const patch = patchValue && typeof patchValue === 'object' ? patchValue : {};
  const result = Array.isArray(base) ? base.slice() : Object.assign({}, base);

  Object.keys(patch).forEach(function (key) {
    const next = patch[key];
    const prev = base[key];

    if (Array.isArray(next)) {
      result[key] = next.slice();
      return;
    }

    if (next && typeof next === 'object') {
      result[key] = mergeDeep(prev, next);
      return;
    }

    result[key] = next;
  });

  return result;
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

function parsePnlAmount(value) {
  if (value == null) return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOutcome(outcome) {
  const value = String(outcome || '').toLowerCase();
  if (value === 'win' || value === 'tp-hit') return 'win';
  if (value === 'loss' || value === 'sl-hit') return 'loss';
  if (value === 'breakeven') return 'breakeven';
  if (value === 'cancelled') return 'cancelled';
  return 'pending';
}

function effectiveTradeDate(trade) {
  const fromTimestamp = trade && trade.tradeTimestamp ? new Date(trade.tradeTimestamp) : null;
  if (fromTimestamp && !Number.isNaN(fromTimestamp.getTime())) {
    return fromTimestamp;
  }

  const fromCreatedAt = trade && trade.createdAt ? new Date(trade.createdAt) : null;
  if (fromCreatedAt && !Number.isNaN(fromCreatedAt.getTime())) {
    return fromCreatedAt;
  }

  return null;
}

function tradePnl(trade) {
  const notes = trade && trade.notes && typeof trade.notes === 'object' ? trade.notes : {};
  const parsed = parsePnlAmount(notes.pnlAmount);
  if (parsed != null) return parsed;

  const outcome = normalizeOutcome(notes.outcome);
  if (outcome === 'win') return 1;
  if (outcome === 'loss') return -1;
  return 0;
}

function summarizeMonthlyTrades(trades, year, month) {
  const targetYear = Number(year);
  const targetMonth = Number(month);
  const totalDays = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(targetYear, targetMonth - 1, 1)).getUTCDay();
  const dayMap = {};

  for (let day = 1; day <= totalDays; day += 1) {
    dayMap[day] = {
      day,
      dateKey: targetYear + '-' + String(targetMonth).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
      pnl: 0,
      tradeCount: 0,
      wins: 0,
      losses: 0,
      status: 'flat'
    };
  }

  (Array.isArray(trades) ? trades : []).forEach(function (trade) {
    const date = effectiveTradeDate(trade);
    if (!date) return;

    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    if (y !== targetYear || m !== targetMonth) return;

    const day = date.getUTCDate();
    const bucket = dayMap[day];
    if (!bucket) return;

    const outcome = normalizeOutcome(trade && trade.notes ? trade.notes.outcome : '');
    const pnl = tradePnl(trade);

    bucket.tradeCount += 1;
    bucket.pnl += pnl;
    if (outcome === 'win') bucket.wins += 1;
    if (outcome === 'loss') bucket.losses += 1;
  });

  const days = Object.keys(dayMap).map(function (key) {
    const bucket = dayMap[key];
    if (bucket.pnl > 0) bucket.status = 'green';
    else if (bucket.pnl < 0) bucket.status = 'red';
    else bucket.status = bucket.tradeCount > 0 ? 'flat' : 'none';
    return bucket;
  });

  const totals = days.reduce(function (accumulator, day) {
    if (day.status === 'green') accumulator.greenDays += 1;
    if (day.status === 'red') accumulator.redDays += 1;
    if (day.status === 'flat') accumulator.flatDays += 1;
    accumulator.tradeDays += day.tradeCount > 0 ? 1 : 0;
    accumulator.pnl += day.pnl;
    return accumulator;
  }, { greenDays: 0, redDays: 0, flatDays: 0, tradeDays: 0, pnl: 0 });

  const weekMap = {};
  days.forEach(function (day) {
    const weekIndex = Math.floor((firstWeekday + day.day - 1) / 7) + 1;
    if (!weekMap[weekIndex]) {
      weekMap[weekIndex] = {
        week: weekIndex,
        pnl: 0,
        greenDays: 0,
        redDays: 0,
        tradeDays: 0
      };
    }

    const week = weekMap[weekIndex];
    week.pnl += day.pnl;
    if (day.status === 'green') week.greenDays += 1;
    if (day.status === 'red') week.redDays += 1;
    if (day.tradeCount > 0) week.tradeDays += 1;
  });

  const weeks = Object.keys(weekMap)
    .map(function (key) { return weekMap[key]; })
    .sort(function (a, b) { return a.week - b.week; });

  return {
    month: {
      year: targetYear,
      month: targetMonth,
      totalDays,
      firstWeekday
    },
    totals,
    days,
    weeks
  };
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
      setupSnapshot: payload.setupSnapshot,
      tradeName: payload.tradeName,
      instrument: payload.instrument,
      tradeTimestamp: payload.tradeTimestamp,
      bias: payload.bias,
      checkedIds: payload.checkedIds,
      postTradeCheckedIds: payload.postTradeCheckedIds,
      branchSelections: payload.branchSelections,
      progress: payload.progress,
      prices: payload.prices,
      notes: payload.notes,
      media: payload.media,
      mediaBySetup: payload.mediaBySetup,
      archived: payload.archived,
      deletedAt: payload.deletedAt
    });

    logTradeEvent('trade_create_success', req, {
      tradeId: trade._id.toString(),
      setupId: payload.setupId,
      tradeName: payload.tradeName
    });

    res.status(201).json({ trade });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async function (req, res) {
    const trades = await Trade.find({ userId: req.user.id }).sort({ createdAt: -1 });
    logTradeEvent('trade_list_success', req, {
      count: trades.length
    });
    res.json({ trades });
  })
);

router.get(
  '/monthly-summary',
  requireAuth,
  asyncHandler(async function (req, res) {
    const now = new Date();
    const year = Number(req.query.year || now.getUTCFullYear());
    const month = Number(req.query.month || (now.getUTCMonth() + 1));

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      logTradeEvent('trade_monthly_summary_invalid_year', req, {
        year: year
      });
      return res.status(400).json({ message: 'Invalid year' });
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      logTradeEvent('trade_monthly_summary_invalid_month', req, {
        month: month
      });
      return res.status(400).json({ message: 'Invalid month' });
    }

    const trades = await Trade.find({
      userId: req.user.id,
      archived: { $ne: true }
    })
      .select({ createdAt: 1, tradeTimestamp: 1, notes: 1 })
      .lean();

    const summary = summarizeMonthlyTrades(trades, year, month);
    logTradeEvent('trade_monthly_summary_success', req, {
      year: year,
      month: month,
      sourceTrades: trades.length
    });
    res.json({ summary });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async function (req, res) {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user.id });
    if (!trade) {
      logTradeEvent('trade_get_not_found', req, {
        tradeId: req.params.id
      });
      return res.status(404).json({ message: 'Trade not found' });
    }

    logTradeEvent('trade_get_success', req, {
      tradeId: trade._id.toString()
    });

    res.json({ trade });
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async function (req, res) {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user.id });
    if (!trade) {
      logTradeEvent('trade_update_not_found', req, {
        tradeId: req.params.id
      });
      return res.status(404).json({ message: 'Trade not found' });
    }

    const mergedSource = mergeDeep(trade.toObject(), req.body || {});
    const payload = normalizeTradeBody(mergedSource);

    trade.bias = payload.bias;
    trade.setupId = payload.setupId;
    trade.setupName = payload.setupName;
    trade.setupSnapshot = payload.setupSnapshot;
    trade.tradeName = payload.tradeName;
    trade.instrument = payload.instrument;
    trade.tradeTimestamp = payload.tradeTimestamp;
    trade.checkedIds = payload.checkedIds;
    trade.postTradeCheckedIds = payload.postTradeCheckedIds;
    trade.branchSelections = payload.branchSelections;
    trade.progress = payload.progress;
    trade.prices = payload.prices;
    trade.notes = payload.notes;
    trade.archived = payload.archived;
    trade.deletedAt = payload.deletedAt;
    trade.media = payload.media;
    trade.mediaBySetup = payload.mediaBySetup;

    await trade.save();

    logTradeEvent('trade_update_success', req, {
      tradeId: trade._id.toString(),
      setupId: payload.setupId,
      tradeName: payload.tradeName
    });

    res.json({ trade });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async function (req, res) {
    const trade = await Trade.findOne({ _id: req.params.id, userId: req.user.id });
    if (!trade) {
      logTradeEvent('trade_delete_not_found', req, {
        tradeId: req.params.id
      });
      return res.status(404).json({ message: 'Trade not found' });
    }

    for (const key of mediaKeys(trade)) {
      await deleteByKey(key);
    }

    await trade.deleteOne();

    logTradeEvent('trade_delete_success', req, {
      tradeId: req.params.id
    });

    res.json({ ok: true });
  })
);

module.exports = router;
