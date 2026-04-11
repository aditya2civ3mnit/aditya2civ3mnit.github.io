require('dotenv').config();

const createApp = require('./app');
const env = require('./config/env');
const connectDb = require('./config/db');
const seedDefaultUsers = require('./seed/defaultUsers');

async function start() {
  await connectDb();

  if (env.seedDemoUsers) {
    await seedDefaultUsers(env.demoUsers);
  }

  const app = createApp();
  const port = Number(env.port || 3000);

  app.listen(port, function () {
    console.log('Backend listening on http://localhost:' + port);
  });
}

start().catch(function (error) {
  console.error('Failed to start backend', error);
  process.exit(1);
});
