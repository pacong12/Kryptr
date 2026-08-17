/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@kryptr/api-postgres',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['**/*.integration.spec.ts'],
  // S1 Postgres suites share ONE database and truncate between tests:
  // they MUST run serially (--runInBand at the target), never in
  // parallel workers — a concurrent truncate wipes in-flight rows.
  maxWorkers: 1,
  // Real Postgres round trips incl. 8-racer concurrency proofs.
  testTimeout: 60_000,
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
};
