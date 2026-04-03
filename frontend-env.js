window.APP_ENV = window.APP_ENV || {
  USE_API: true,
  API_BASE_URL: 'http://localhost:3000',
  AUTH_BASE_PATH: '/api/auth',
  TRADES_BASE_PATH: '/api/trades',
  DEMO_USERS: [
    { username: 'yonous', password: 'yonous123', userId: 'user-yonous', name: 'Yonous' },
    { username: 'shashank', password: 'shashank123', userId: 'user-shashank', name: 'Shashank' }
  ]
};
