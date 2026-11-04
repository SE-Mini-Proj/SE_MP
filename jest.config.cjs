module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
  forceExit: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/db/migrate.js',
    '!src/db/seed.js',
  ],
  coverageReporters: ['text', 'text-summary', 'json-summary', 'lcov'],
};
