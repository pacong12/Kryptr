import { keccak256, encodePacked } from 'viem';
import { DryRunSigner } from './dry-run.signer';
import type { UnsignedTxPreview } from '@kryptr/shared-types';

const PREVIEW: UnsignedTxPreview = {
  to: '0x0000000000001fF3684f28c67538d4D072C22734',
  data: '0xdeadbeef',
  value: '0xde0b6b3a7640000', // 1 ETH
};

describe('DryRunSigner (wave 3 signer scaffolding)', () => {
  it('always returns status dry_run and NEVER a signature', async () => {
    const signer = new DryRunSigner();
    const request = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview: PREVIEW,
    });
    expect(request.status).toBe('dry_run');
    expect(request.note).toBe('dry-run only — nothing broadcast');
    expect(request).not.toHaveProperty('signature');
    expect(request.intentId).toBe('intent-1');
    expect(request.unsignedTx).toEqual(PREVIEW);
  });

  it('computes the digest-to-be-signed over (chainId, to, value, data) without any key', async () => {
    const signer = new DryRunSigner();
    const request = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview: PREVIEW,
    });
    const expected = keccak256(
      encodePacked(
        ['uint256', 'address', 'uint256', 'bytes'],
        [8453n, PREVIEW.to, BigInt(PREVIEW.value), PREVIEW.data],
      ),
    );
    expect(request.digest).toBe(expected);
    expect(request.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('uses the correct EVM chainId per chain (Robinhood Chain = 4663)', async () => {
    const signer = new DryRunSigner();
    const request = await signer.requestSignature({
      intentId: 'intent-2',
      chain: 'robinhood-chain',
      preview: PREVIEW,
    });
    const expected = keccak256(
      encodePacked(
        ['uint256', 'address', 'uint256', 'bytes'],
        [4663n, PREVIEW.to, BigInt(PREVIEW.value), PREVIEW.data],
      ),
    );
    expect(request.digest).toBe(expected);
  });

  it('digest changes when the unsigned tx changes', async () => {
    const signer = new DryRunSigner();
    const first = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview: PREVIEW,
    });
    const second = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview: { ...PREVIEW, value: '0x0' },
    });
    expect(second.digest).not.toBe(first.digest);
  });

  it('getStatus returns stored requests and null for unknown ids', async () => {
    const signer = new DryRunSigner();
    const request = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview: PREVIEW,
    });
    await expect(signer.getStatus(request.id)).resolves.toEqual(request);
    await expect(signer.getStatus('nope')).resolves.toBeNull();
  });

  it('stamps createdAt from the injected clock', async () => {
    const signer = new DryRunSigner({ now: () => 1_746_057_600_000 });
    const request = await signer.requestSignature({
      intentId: 'intent-1',
      chain: 'base',
      preview: PREVIEW,
    });
    expect(request.createdAt).toBe('2025-05-01T00:00:00.000Z');
  });
});
