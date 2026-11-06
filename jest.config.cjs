module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15000,
  forceExit: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/db/migrate.js',
    '!src/db/seed.js',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary', 'clover'],
};
