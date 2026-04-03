const { Schema, model } = require('mongoose');

function createEmptyMedia() {
  return {
    htf: [],
    liquidity: [],
    bias: [],
    ideal: [],
    real: []
  };
}

const MediaItemSchema = new Schema(
  {
    section: { type: String, required: true },
    name: { type: String, default: '' },
    type: { type: String, default: '' },
    size: { type: Number, default: 0 },
    key: { type: String, default: '' },
    url: { type: String, default: '' }
  },
  { _id: false }
);

const TradeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tradeName: { type: String, default: '' },
    bias: { type: String, default: 'short', enum: ['short', 'long'] },
    checkedIds: { type: [String], default: [] },
    progress: { type: Schema.Types.Mixed, default: {} },
    prices: { type: Schema.Types.Mixed, default: {} },
    notes: { type: Schema.Types.Mixed, default: {} },
    media: { type: Schema.Types.Mixed, default: createEmptyMedia },
    archived: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

TradeSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.userId = ret.userId ? ret.userId.toString() : null;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

TradeSchema.statics.createEmptyMedia = createEmptyMedia;
TradeSchema.statics.MediaItemSchema = MediaItemSchema;

module.exports = model('Trade', TradeSchema);