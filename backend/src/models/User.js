const { Schema, model } = require('mongoose');

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: null, trim: true, lowercase: true, unique: true, sparse: true },
    username: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    passwordHash: { type: String, default: null },
    authProvider: { type: String, default: 'local', enum: ['local', 'google'] },
    googleSub: { type: String, default: null, unique: true, sparse: true },
    refreshTokenHash: { type: String, default: null }
  },
  { timestamps: true }
);

UserSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.refreshTokenHash;
    return ret;
  }
});

module.exports = model('User', UserSchema);