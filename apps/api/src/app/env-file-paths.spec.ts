import { resolveEnvFilePaths } from './env-file-paths';

/**
 * Regression guard for env hermeticity: tests must never load real env
 * files (a populated .env once leaked CHAIN_MODE/keys into unit suites).
 * Pure helper so both branches run deterministically in CI, where no
 * .env exists and a runtime canary would pass trivially.
 */
describe('resolveEnvFilePaths (test hermeticity guard)', () => {
  it('loads .env then .env.example outside test runs', () => {
    expect(resolveEnvFilePaths({})).toEqual(['.env', '.env.example']);
    expect(resolveEnvFilePaths({ NODE_ENV: 'development' })).toEqual([
      '.env',
      '.env.example',
    ]);
  });

  it('loads no env files under NODE_ENV=test', () => {
    expect(resolveEnvFilePaths({ NODE_ENV: 'test' })).toEqual([]);
  });
});
