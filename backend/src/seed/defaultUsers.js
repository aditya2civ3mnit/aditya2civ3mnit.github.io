const bcrypt = require('bcryptjs');

const User = require('../models/User');

async function seedDefaultUsers(users) {
  for (const user of users || []) {
    const existing = await User.findOne({ username: String(user.username || '').toLowerCase() });
    if (existing) continue;

    const passwordHash = await bcrypt.hash(String(user.password || ''), 12);
    await User.create({
      name: user.name || user.username,
      username: String(user.username || '').toLowerCase(),
      passwordHash
    });
  }
}

module.exports = seedDefaultUsers;