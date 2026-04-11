const { Schema, model } = require('mongoose');

function createEmptyMedia() {
  return {};
}

const WatchlistSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    setupId: { type: String, default: '', index: true },
    setupName: { type: String, default: '' },
    setupSnapshot: { type: Schema.Types.Mixed, default: null },
    tradeName: { type: String, default: '' },
    instrument: { type: String, default: '' },
    tradeTimestamp: { type: String, default: '' },
    bias: { type: String, default: 'short', enum: ['short', 'long'] },
    checkedIds: { type: [String], default: [] },
    postTradeCheckedIds: { type: [String], default: [] },
    branchSelections: { type: Schema.Types.Mixed, default: { sections: {}, conditions: {} } },
    progress: { type: Schema.Types.Mixed, default: {} },
    prices: { type: Schema.Types.Mixed, default: {} },
    notes: { type: Schema.Types.Mixed, default: {} },
    media: { type: Schema.Types.Mixed, default: createEmptyMedia },
    mediaBySetup: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

WatchlistSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.userId = ret.userId ? ret.userId.toString() : null;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

WatchlistSchema.statics.createEmptyMedia = createEmptyMedia;

module.exports = model('Watchlist', WatchlistSchema);
