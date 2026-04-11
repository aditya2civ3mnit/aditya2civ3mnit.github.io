const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const debugStore = require('../services/debugStore');
const { requireAuth } = require('../middleware/auth');
const Setup = require('../models/Setup');
const SuggestedSetup = require('../models/SuggestedSetup');

const router = express.Router();

function logSetupEvent(type, req, details) {
  const eventDetails = details && typeof details === 'object' ? details : {};
  debugStore.recordEvent(type, Object.assign({
    requestId: req.requestId || '',
    userId: req.user && req.user.id ? req.user.id : '',
    ip: req.headers['x-forwarded-for'] || req.ip || ''
  }, eventDetails), env.debugRecentLimit);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}

function makeId(value, fallback) {
  return slugify(value) || fallback;
}

function buildDefaultSetup() {
  return {
    name: 'EMA + VWAP Default Setup',
    preTradeSegments: [
      {
        id: 'trend-filter',
        title: 'Trend Filter',
        items: [
          { id: 'ema-20-50', title: '20 EMA is aligned with 50 EMA', description: 'Use this as your trend confirmation before entry.', required: true, allowMedia: true },
          { id: 'ema-direction', title: 'Price is respecting the EMA direction', description: 'Price should be above or below the moving average stack for bias alignment.', required: true, allowMedia: true },
          { id: 'ema-pullback', title: 'Pullback into EMA support or resistance', description: 'Wait for a clean pullback instead of chasing extension.', required: false, allowMedia: false }
        ]
      },
      {
        id: 'location-and-triggers',
        title: 'Location and Trigger',
        items: [
          { id: 'vwap-tap', title: 'Price is tapping VWAP or a key mean-reversion line', description: 'Look for the market to interact with VWAP before taking the setup.', required: true, allowMedia: true },
          { id: 'liquidity-sweep', title: 'Liquidity sweep or rejection has formed', description: 'Use the sweep or rejection as the trigger area.', required: true, allowMedia: true },
          { id: 'entry-set', title: 'Entry is planned with risk defined', description: 'Entry, stop loss, and target are defined before execution.', required: true, allowMedia: true }
        ]
      }
    ],
    postTradeSegments: [
      {
        id: 'post-trade-analysis',
        title: 'Execution Analysis',
        items: [
          { id: 'planned-vs-real', title: 'Planned vs real execution compared', description: 'Check whether the trade followed the setup.', required: true, allowMedia: true },
          { id: 'mistakes-noted', title: 'Mistakes noted', description: 'Record execution issues or emotional mistakes.', required: false, allowMedia: false },
          { id: 'lesson-recorded', title: 'Lesson recorded', description: 'Capture the improvement point.', required: true, allowMedia: true }
        ]
      },
      {
        id: 'post-trade-media-review',
        title: 'Media Review and Notes',
        items: [
          { id: 'screenshot-reviewed', title: 'Screenshots reviewed', description: 'Review the screenshots against the planned setup.', required: true, allowMedia: true },
          { id: 'notes-complete', title: 'Journal notes completed', description: 'Write the exact reason the trade worked or failed.', required: true, allowMedia: false },
          { id: 'next-step', title: 'Next improvement step is defined', description: 'Turn the review into a clear actionable change.', required: false, allowMedia: false }
        ]
      }
    ]
  };
}

function buildSmcLiquiditySuggestedSetup() {
  return {
    key: 'smc-liquidity',
    name: 'SMC Liquidity Setup',
    preTradeSegments: [
      {
        id: 'higher-timeframe-setup',
        title: 'Higher Timeframe Setup',
        items: [
          { id: 'htf-poi', title: 'Price has tapped a HTF POI', description: 'Order Block (OB) or Fair Value Gap (FVG) on the higher timeframe has been reached.', required: true, allowMedia: true },
          { id: 'htf-reaction', title: 'Price is reacting to the POI (not just touching)', description: 'Look for rejection candles, wicks, or displacement away from the zone.', required: true, allowMedia: true }
        ]
      },
      {
        id: 'liquidity-sweep',
        title: 'Liquidity Sweep',
        items: [
          { id: 'sweep', title: 'A liquidity pool has been swept', description: 'Buy-side (BSL) swept for shorts and Sell-side (SSL) swept for longs.', required: true, allowMedia: true },
          { id: 'sweep-reaction', title: 'Price has reacted to the sweep', description: 'Sharp reversal or strong close back inside range after the sweep wick.', required: true, allowMedia: true }
        ]
      },
      {
        id: 'trade-bias',
        title: 'Trade Bias',
        items: [
          { id: 'choch-confirmed', title: 'CHoCH confirmed on LTF in trade direction', description: 'Structure shift supports your long or short bias.', required: true, allowMedia: true },
          { id: 'fvg-from-choch', title: 'FVG identified from CHoCH leg', description: 'Use retracement into this FVG as your execution area.', required: true, allowMedia: true }
        ]
      },
      {
        id: 'entry-levels-and-tp',
        title: 'Entry Levels & Take Profit',
        items: [
          { id: 'rr-calculator', title: 'Entry, SL and nearest LRL entered in calculator', description: 'Confirm risk is valid before trigger.', required: true, allowMedia: false },
          { id: 'tp-and-be-plan', title: 'TP set and breakeven plan defined', description: 'TP at 1:2 RR or nearest LRL (whichever is closer), with BE move at +1R.', required: true, allowMedia: false }
        ]
      },
      {
        id: 'final-filters',
        title: 'Final Filters',
        items: [
          { id: 'session-check', title: 'Active session check passed', description: 'Prefer London or New York session for execution quality.', required: true, allowMedia: false },
          { id: 'news-and-filters', title: 'News and final filters check passed', description: 'No high-impact news conflict and trade aligns with your filter rules.', required: true, allowMedia: false }
        ]
      }
    ],
    postTradeSegments: [
      {
        id: 'execution-review',
        title: 'Execution Review',
        items: [
          { id: 'entry-quality', title: 'Entry quality scored', description: 'Was entry at intended liquidity zone?', required: true, allowMedia: true },
          { id: 'risk-control', title: 'Risk management respected', description: 'Check if stop and position sizing were followed.', required: true, allowMedia: false },
          { id: 'target-logic', title: 'Target selection respected structure', description: 'Was TP selected using opposing liquidity/structure?', required: true, allowMedia: true }
        ]
      },
      {
        id: 'smc-journal-notes',
        title: 'SMC Journal Notes',
        items: [
          { id: 'emotion-check', title: 'Emotional state documented', description: 'Record emotional changes through the trade.', required: false, allowMedia: false },
          { id: 'rule-violations', title: 'Any rule violations documented', description: 'Capture misses to prevent repeated errors.', required: true, allowMedia: false },
          { id: 'one-improvement', title: 'One improvement action defined', description: 'Write one actionable fix for next session.', required: true, allowMedia: false }
        ]
      }
    ]
  };
}

function buildSuggestedTemplates() {
  const defaultSetup = buildDefaultSetup();
  return [
    {
      key: 'ema-vwap',
      name: 'EMA + VWAP Setup',
      preTradeSegments: defaultSetup.preTradeSegments,
      postTradeSegments: defaultSetup.postTradeSegments
    },
    buildSmcLiquiditySuggestedSetup()
  ];
}

async function ensureSuggestedSetups() {
  const templates = buildSuggestedTemplates();

  await Promise.all(templates.map(async function (template) {
    const existing = await SuggestedSetup.findOne({ key: template.key });
    if (existing) {
      existing.name = template.name;
      existing.preTradeSegments = template.preTradeSegments;
      existing.postTradeSegments = template.postTradeSegments;
      await existing.save();
      return;
    }

    await SuggestedSetup.create(template);
  }));
}

function normalizeNodes(nodes, parentId) {
  return (Array.isArray(nodes) ? nodes : [])
    .map(function (item, itemIndex) {
      const raw = item && typeof item === 'object' ? item : {};
      const title = String(raw.title || '').trim();

      if (!title) {
        return null;
      }

      const nodeType = String(raw.nodeType || raw.type || 'check').trim() || 'check';
      const id = makeId(raw.id || title, parentId + '-item-' + (itemIndex + 1));
      const children = normalizeNodes(raw.children, id + '-children');
      const rawBranches = raw.branches && typeof raw.branches === 'object' ? raw.branches : {};

      return {
        id,
        nodeType,
        title,
        ifTitle: String(raw.ifTitle || 'If').trim() || 'If',
        elseTitle: String(raw.elseTitle || 'Else').trim() || 'Else',
        description: String(raw.description || '').trim(),
        required: raw.required !== false,
        allowMedia: raw.allowMedia !== false,
        children,
        branches: {
          then: normalizeNodes(rawBranches.then, id + '-then'),
          else: normalizeNodes(rawBranches.else, id + '-else')
        }
      };
    })
    .filter(Boolean);
}

function normalizeSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map(function (segment, segmentIndex) {
      const raw = segment && typeof segment === 'object' ? segment : {};
      const title = String(raw.title || '').trim();

      if (!title) {
        return null;
      }

      const id = makeId(raw.id || title, 'segment-' + (segmentIndex + 1));
  const items = normalizeNodes(raw.items, id);

      if (items.length === 0) {
        return null;
      }

      return {
        id,
        title,
        items
      };
    })
    .filter(Boolean);
}

function normalizeSetupBody(body) {
  const source = body && typeof body === 'object' ? body : {};

  return {
    name: String(source.name || '').trim(),
    isDefault: source.isDefault === true,
    preTradeSegments: normalizeSegments(source.preTradeSegments),
    postTradeSegments: normalizeSegments(source.postTradeSegments)
  };
}

async function ensureDefaultSetup(userId) {
  let setup = await Setup.findOne({ userId, isDefault: true });
  if (setup) return setup;

  setup = await Setup.findOne({ userId }).sort({ createdAt: 1 });
  if (setup) {
    setup.isDefault = true;
    await setup.save();
    await Setup.updateMany({ userId, _id: { $ne: setup._id } }, { $set: { isDefault: false } });
    return setup;
  }

  const defaultSetup = buildDefaultSetup();
  setup = await Setup.create({
    userId,
    name: defaultSetup.name,
    isDefault: true,
    preTradeSegments: defaultSetup.preTradeSegments,
    postTradeSegments: defaultSetup.postTradeSegments
  });

  return setup;
}

async function setDefaultSetup(userId, setupId) {
  await Setup.updateMany({ userId }, { $set: { isDefault: false } });
  await Setup.updateOne({ _id: setupId, userId }, { $set: { isDefault: true } });
}

router.get('/', requireAuth, asyncHandler(async function (req, res) {
  const setups = await Setup.find({ userId: req.user.id }).sort({ isDefault: -1, updatedAt: -1 });
  logSetupEvent('setup_list_success', req, { count: setups.length });
  res.json({ setups });
}));

router.get('/default', requireAuth, asyncHandler(async function (req, res) {
  const setup = await Setup.findOne({ userId: req.user.id, isDefault: true }).sort({ updatedAt: -1 })
    || await Setup.findOne({ userId: req.user.id }).sort({ updatedAt: -1 });
  logSetupEvent('setup_default_success', req, { hasSetup: Boolean(setup) });
  res.json({ setup });
}));

router.get('/suggested', requireAuth, asyncHandler(async function (req, res) {
  await ensureSuggestedSetups();
  const setups = await SuggestedSetup.find({}).sort({ name: 1 });
  logSetupEvent('setup_suggested_list_success', req, { count: setups.length });
  res.json({ setups });
}));

router.post('/', requireAuth, asyncHandler(async function (req, res) {
  const payload = normalizeSetupBody(req.body || {});

  if (!payload.name) {
    logSetupEvent('setup_create_validation_failed', req, { reason: 'missing_name' });
    return res.status(400).json({ message: 'Setup name is required' });
  }

  if (payload.preTradeSegments.length === 0 && payload.postTradeSegments.length === 0) {
    logSetupEvent('setup_create_validation_failed', req, { reason: 'empty_segments' });
    return res.status(400).json({ message: 'Add at least one pre-trade or post-trade segment' });
  }

  const setup = await Setup.create({
    userId: req.user.id,
    name: payload.name,
    isDefault: false,
    preTradeSegments: payload.preTradeSegments,
    postTradeSegments: payload.postTradeSegments
  });

  const existingCount = await Setup.countDocuments({ userId: req.user.id });
  if (payload.isDefault || existingCount === 1) {
    await setDefaultSetup(req.user.id, setup._id);
  }

  const saved = await Setup.findById(setup._id);
  logSetupEvent('setup_create_success', req, {
    setupId: setup._id.toString(),
    name: payload.name
  });
  res.status(201).json({ setup: saved });
}));

router.put('/:id', requireAuth, asyncHandler(async function (req, res) {
  const setup = await Setup.findOne({ _id: req.params.id, userId: req.user.id });
  if (!setup) {
    logSetupEvent('setup_update_not_found', req, { setupId: req.params.id });
    return res.status(404).json({ message: 'Setup not found' });
  }

  const payload = normalizeSetupBody(req.body || {});

  if (!payload.name) {
    logSetupEvent('setup_update_validation_failed', req, {
      setupId: req.params.id,
      reason: 'missing_name'
    });
    return res.status(400).json({ message: 'Setup name is required' });
  }

  if (payload.preTradeSegments.length === 0 && payload.postTradeSegments.length === 0) {
    logSetupEvent('setup_update_validation_failed', req, {
      setupId: req.params.id,
      reason: 'empty_segments'
    });
    return res.status(400).json({ message: 'Add at least one pre-trade or post-trade segment' });
  }

  setup.name = payload.name;
  setup.preTradeSegments = payload.preTradeSegments;
  setup.postTradeSegments = payload.postTradeSegments;

  if (payload.isDefault) {
    setup.isDefault = true;
  }

  await setup.save();

  if (payload.isDefault) {
    await setDefaultSetup(req.user.id, setup._id);
  }

  const saved = await Setup.findById(setup._id);
  logSetupEvent('setup_update_success', req, {
    setupId: setup._id.toString(),
    name: payload.name
  });
  res.json({ setup: saved });
}));

router.post('/:id/default', requireAuth, asyncHandler(async function (req, res) {
  const setup = await Setup.findOne({ _id: req.params.id, userId: req.user.id });
  if (!setup) {
    logSetupEvent('setup_set_default_not_found', req, { setupId: req.params.id });
    return res.status(404).json({ message: 'Setup not found' });
  }

  await setDefaultSetup(req.user.id, setup._id);
  const saved = await Setup.findById(setup._id);
  logSetupEvent('setup_set_default_success', req, { setupId: setup._id.toString() });
  res.json({ setup: saved });
}));

router.delete('/:id', requireAuth, asyncHandler(async function (req, res) {
  const setup = await Setup.findOne({ _id: req.params.id, userId: req.user.id });
  if (!setup) {
    logSetupEvent('setup_delete_not_found', req, { setupId: req.params.id });
    return res.status(404).json({ message: 'Setup not found' });
  }

  const wasDefault = setup.isDefault;
  await setup.deleteOne();

  if (wasDefault) {
    const nextDefault = await Setup.findOne({ userId: req.user.id }).sort({ updatedAt: -1 });
    if (nextDefault) {
      await setDefaultSetup(req.user.id, nextDefault._id);
    }
  }

  logSetupEvent('setup_delete_success', req, {
    setupId: req.params.id,
    wasDefault: wasDefault
  });

  res.json({ ok: true });
}));

module.exports = router;