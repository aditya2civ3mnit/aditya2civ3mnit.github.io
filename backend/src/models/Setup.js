const { Schema, model } = require('mongoose');

const SetupItemSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    nodeType: { type: String, default: 'check', trim: true },
    title: { type: String, required: true, trim: true },
    ifTitle: { type: String, default: 'If', trim: true },
    elseTitle: { type: String, default: 'Else', trim: true },
    description: { type: String, default: '', trim: true },
    required: { type: Boolean, default: true },
    allowMedia: { type: Boolean, default: true },
    children: { type: [Schema.Types.Mixed], default: [] },
    branches: { type: Schema.Types.Mixed, default: () => ({ then: [], else: [] }) }
  },
  {
    _id: false,
    minimize: false
  }
);

const SetupSegmentSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    items: { type: [SetupItemSchema], default: [] }
  },
  {
    _id: false,
    minimize: false
  }
);

const SetupSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false, index: true },
    preTradeSegments: { type: [SetupSegmentSchema], default: [] },
    postTradeSegments: { type: [SetupSegmentSchema], default: [] }
  },
  {
    timestamps: true,
    minimize: false
  }
);

SetupSchema.index({ userId: 1, name: 1 }, { unique: true });

SetupSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.userId = ret.userId ? ret.userId.toString() : null;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = model('Setup', SetupSchema);