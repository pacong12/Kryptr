import { describePostgres } from '../../test/env-gate';
import {
  disconnectTestClient,
  makePostgresTestClient,
  truncateAllTables,
} from '../../test/postgres-harness';
import { PostgresWalletRepository } from './postgres-wallet.repository';
import type { PrismaClient } from '../../generated/prisma/client';
import type { AgentWallet } from '@kryptr/shared-types';

describePostgres('PostgresWalletRepository (S1 Fase 3, live Postgres)', () => {
  let db: PrismaClient;
  let repo: PostgresWalletRepository;

  const makeWallet = (
    address = '0x1111111111111111111111111111111111111111',
    ownerId = 'owner-1',
  ): AgentWallet => ({
    id: address,
    address: address as `0x${string}`,
    ownerId,
    chains: ['base'],
    createdAt: '2026-08-17T00:00:00.000Z',
    lastKeyRotationAt: null,
  });

  beforeEach(async () => {
    db = makePostgresTestClient();
    await truncateAllTables(db);
    repo = new PostgresWalletRepository(db);
  });

  afterEach(async () => {
    await disconnectTestClient(db);
  });

  it('saves and finds wallet by id and case-insensitive address', async () => {
    const wallet = makeWallet('0xAaBbCcDdEeFf0011223344556677889900112233');
    await repo.save(wallet);

    const lower = wallet.address.toLowerCase();
    const foundById = await repo.findById(lower);
    expect(foundById).toMatchObject({
      address: lower,
      ownerId: 'owner-1',
      chains: ['base'],
    });

    const foundByMixed = await repo.findByAddress(
      '0xAABBCCDDeeFF0011223344556677889900112233',
    );
    expect(foundByMixed).toMatchObject({ address: lower });
  });

  it('updates existing wallet on re-save', async () => {
    const addr = '0x0000000000000000000000000000000000000001';
    await repo.save(makeWallet(addr, 'owner-1'));
    await repo.save({
      ...makeWallet(addr, 'owner-2'),
      chains: ['base', 'robinhood-chain'],
      lastKeyRotationAt: '2026-08-17T10:00:00.000Z',
    });

    const found = await repo.findByAddress(addr);
    expect(found).toMatchObject({
      ownerId: 'owner-2',
      chains: ['base', 'robinhood-chain'],
      lastKeyRotationAt: '2026-08-17T10:00:00.000Z',
    });
  });

  it('findAll returns all wallets or filters by ownerId', async () => {
    await repo.save(makeWallet('0x0000000000000000000000000000000000000001', 'user-a'));
    await repo.save(makeWallet('0x0000000000000000000000000000000000000002', 'user-a'));
    await repo.save(makeWallet('0x0000000000000000000000000000000000000003', 'user-b'));

    const all = await repo.findAll();
    expect(all).toHaveLength(3);

    const userA = await repo.findAll({ ownerId: 'user-a' });
    expect(userA).toHaveLength(2);
    expect(userA.map((w) => w.address).sort()).toEqual([
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
    ]);
  });
});
