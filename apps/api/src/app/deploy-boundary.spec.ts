import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Wave-5 firewall layer-3 BOUNDARY spec (vault design doc §1 layer 3).
 * Reads the order-worker source at test time and turns "automation
 * never produces deploys" into a red/green property that survives
 * refactors:
 *
 *  1. No order-worker file constructs a `kind: 'deploy'` intent.
 *  2. No order-worker file imports DeployContext (or any deploy-facing
 *     type) — the import boundary is enforced here, not by convention.
 *  3. The swap-only builder is the SOLE TransactionIntent construction
 *     site (positive pin per Review54 F3: textual scanning alone can be
 *     evaded by non-literal construction, so the spec also asserts the
 *     builder's exclusivity; L1's unconditional runtime rejection stays
 *     the binding layer regardless).
 */

const ORDER_WORKER_DIR = join(__dirname, '..', 'order-worker');
const BUILDER_FILE = 'swap-intent.builder.ts';

function sourceFiles(dir: string): string[] {
  const collected: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collected.push(...sourceFiles(path));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      collected.push(path);
    }
  }
  return collected;
}

/**
 * Scan CODE, not prose: strip block and line comments before matching
 * so doc comments may discuss the firewall without tripping it.
 * (Defense-in-depth only — L1 runtime rejection is the binding layer.)
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('order-worker deploy boundary (firewall layer 3)', () => {
  const files = sourceFiles(ORDER_WORKER_DIR);

  it('scans real order-worker source (guard against a silent empty scan)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.endsWith(BUILDER_FILE))).toBe(true);
  });

  it('no file constructs a deploy intent literal', () => {
    const violations = files.filter((file) =>
      /kind:\s*['"]deploy['"]/.test(codeOnly(readFileSync(file, 'utf8'))),
    );
    expect(violations).toEqual([]);
  });

  it('no file imports DeployContext or deploy-facing types', () => {
    const importViolations = files.filter((file) =>
      /import[^;]*\bDeployContext\b[^;]*from/.test(
        codeOnly(readFileSync(file, 'utf8')),
      ),
    );
    expect(importViolations).toEqual([]);
    const referenceViolations = files.filter((file) =>
      /validateDeployPreconditions|DeployAllowlistPort/.test(
        codeOnly(readFileSync(file, 'utf8')),
      ),
    );
    expect(referenceViolations).toEqual([]);
  });

  it('the swap-only builder is the SOLE intent construction site', () => {
    // Any `kind:` literal inside an intent construction must live in the
    // builder; a second construction site (even via a shared const or
    // variable) would have to name a kind somewhere — this pin forces
    // review of ANY such addition.
    const constructionSites = files.filter((file) =>
      /kind:\s*['"][a-z]+['"]/.test(codeOnly(readFileSync(file, 'utf8'))),
    );
    expect(constructionSites.map((file) => file.split('/').pop())).toEqual([
      BUILDER_FILE,
    ]);
  });

  it('the builder return type pins kind to the swap literal', () => {
    const builder = readFileSync(
      join(ORDER_WORKER_DIR, 'domain', BUILDER_FILE),
      'utf8',
    );
    expect(builder).toMatch(/TransactionIntent\s*&\s*\{\s*kind:\s*'swap'\s*\}/);
  });
});
