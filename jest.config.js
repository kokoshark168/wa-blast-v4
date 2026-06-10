// NOTE: tests are run from backend/ via `npm test` (see backend/jest.config.js).
// This root config exists only for editor/tooling integration.
// Do NOT add `extensionsToTreatAsEsm: ['.js']` — Jest throws on it; .js files
// are already treated as ESM because backend/package.json sets "type": "module".
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'backend/**/*.js',
    '!backend/tests/**',
    '!backend/node_modules/**'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};
