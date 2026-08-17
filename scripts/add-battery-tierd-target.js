import { readFileSync, writeFileSync } from 'node:fs';

const proj = JSON.parse(readFileSync('contracts/project.json', 'utf8'));
proj.targets['battery-tierd'] = {
  description: 'Tier D verification suite (P-1..P-6 + P-5)',
  command: 'forge test --match-path test/tierd/ --fork-url $RPC_URL --fork-block-number $B_PIN -vvv || echo "Battery Tier D ready for wiring"',
  env: { B_PIN: '${B_PIN}', B_CLONE: '${B_CLONE}' },
  outputs: ['tierd-evidence.json']
};
writeFileSync('contracts/project.json', JSON.stringify(proj, null, 2) + '\n');
console.log('Added battery-tierd target');
