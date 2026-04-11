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
  { _id: false }
);

const SetupSegmentSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    items: { type: [SetupItemSchema], default: [] }
  },
  { _id: false }
);

const SuggestedSetupSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    preTradeSegments: { type: [SetupSegmentSchema], default: [] },
    postTradeSegments: { type: [SetupSegmentSchema], default: [] }
  },
  { timestamps: true }
);

SuggestedSetupSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = model('SuggestedSetup', SuggestedSetupSchema);
