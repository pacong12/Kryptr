/**
 * Database Mock Harness for E2E Testing
 * Provides isolated database state management without actual PostgreSQL connection
 */

import { v4 as uuidv4 } from 'uuid';

interface IntentRecord {
  id: string;
  kind: string;
  walletId: string;
  origin: string;
  intentData: any;
  decision: 'pending' | 'approved' | 'rejected' | 'needs_human_approval';
  createdAt: Date;
  updatedAt: Date;
  decisionAt?: Date;
}

interface TransactionRecord {
  id: string;
  intentId: string;
  amount: string;
  assetAddress: string;
  recipient: string;
  status: 'pending' | 'executed' | 'failed';
  createdAt: Date;
}

export class DatabaseMockHarness {
  private intents: Map<string, IntentRecord> = new Map();
  private transactions: Map<string, TransactionRecord> = new Map();
  private spendLedger: Map<string, number> = new Map(); // walletId -> totalSpentMicros
  private history: Array<{ operation: string; timestamp: Date; details: any }> = [];

  constructor() {
    this.history.push({
      operation: 'harness_initialized',
      timestamp: new Date(),
      details: { intentCount: 0, transactionCount: 0 },
    });
  }

  /**
   * Save intent to in-memory store
   */
  async saveIntent(intent: Omit<IntentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<IntentRecord> {
    const record: IntentRecord = {
      ...intent,
      id: `intent-db-mock-${Date.now()}-${uuidv4().substring(0, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.intents.set(record.id, record);
    
    this.recordOperation('save_intent', record.id, {
      kind: intent.kind,
      walletId: intent.walletId,
      decision: intent.decision,
    });

    return record;
  }

  /**
   * Find intent by ID
   */
  async findById(intentId: string): Promise<IntentRecord | null> {
    this.recordOperation('find_intent', intentId, {});
    return this.intents.get(intentId) || null;
  }

  /**
   * List all intents for a wallet
   */
  async findByWalletId(walletId: string): Promise<IntentRecord[]> {
    this.recordOperation('find_by_wallet', walletId, {});
    
    const results = Array.from(this.intents.values()).filter(
      (intent) => intent.walletId === walletId
    );

    // Sort by creation time descending
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Update intent decision
   */
  async updateDecision(intentId: string, decision: string, reason: string): Promise<boolean> {
    const record = this.intents.get(intentId);
    
    if (!record) {
      this.recordOperation('update_decision', intentId, { success: false, error: 'not_found' });
      return false;
    }

    record.decision = decision as any;
    record.updatedAt = new Date();
    record.decisionAt = new Date();

    this.recordOperation('update_decision', intentId, {
      decision,
      reason,
    });

    return true;
  }

  /**
   * Record transaction
   */
  async recordTransaction(txData: Omit<TransactionRecord, 'id' | 'createdAt'>): Promise<TransactionRecord> {
    const record: TransactionRecord = {
      ...txData,
      id: `tx-db-mock-${Date.now()}-${uuidv4().substring(0, 8)}`,
      createdAt: new Date(),
    };

    this.transactions.set(record.id, record);
    
    // Update spend ledger
    const micros = parseInt(txData.amount, 10) || 0;
    const currentSpend = this.spendLedger.get(txData.intentId) || 0;
    this.spendLedger.set(txData.intentId, currentSpend + micros);

    this.recordOperation('record_transaction', record.id, {
      intentId: txData.intentId,
      amount: txData.amount,
    });

    return record;
  }

  /**
   * Get spend ledger balance for wallet
   */
  async getSpendLedger(walletId: string): Promise<number> {
    let total = 0;
    for (const [intentId, spent] of this.spendLedger.entries()) {
      const intent = this.intents.get(intentId);
      if (intent?.walletId === walletId) {
        total += spent;
      }
    }
    return total;
  }

  /**
   * Check daily cap compliance
   */
  async checkDailyCap(walletId: string, capMicros: number): Promise<boolean> {
    const currentSpend = await this.getSpendLedger(walletId);
    return currentSpend < capMicros;
  }

  /**
   * Reserve spend in ledger
   */
  async reserveSpend(intentId: string, micros: number): Promise<boolean> {
    const existing = this.spendLedger.get(intentId) || 0;
    
    // Deduct reservation temporarily
    this.spendLedger.set(intentId, existing + micros);
    
    this.recordOperation('reserve_spend', intentId, { micros });
    
    return true;
  }

  /**
   * Commit transaction (confirm persistence)
   */
  async commitTransaction(intentId: string, txId: string): Promise<boolean> {
    const tx = this.transactions.get(txId);
    if (!tx) {
      return false;
    }

    // Update transaction status
    const updatedTx = {
      ...tx,
      status: 'executed',
    };
    this.transactions.set(txId, updatedTx);

    this.recordOperation('commit_transaction', intentId, { txId });
    return true;
  }

  /**
   * Rollback transaction (simulate failure)
   */
  async rollbackTransaction(intentId: string, txId: string): Promise<boolean> {
    const tx = this.transactions.get(txId);
    if (!tx) {
      return false;
    }

    // Update transaction status to failed
    const updatedTx = {
      ...tx,
      status: 'failed',
    };
    this.transactions.set(txId, updatedTx);

    // Revert spend ledger
    const currentSpend = this.spendLedger.get(intentId) || 0;
    const microAmount = parseInt(tx.amount, 10) || 0;
    this.spendLedger.set(intentId, Math.max(0, currentSpend - microAmount));

    this.recordOperation('rollback_transaction', intentId, { txId });
    return true;
  }

  /**
   * Get all transactions for an intent
   */
  async getTransactionsByIntent(intentId: string): Promise<TransactionRecord[]> {
    this.recordOperation('find_transactions', intentId, {});
    
    const results = Array.from(this.transactions.values()).filter(
      (tx) => tx.intentId === intentId
    );

    return results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Clear all test data
   */
  async clearAll(): Promise<void> {
    this.intents.clear();
    this.transactions.clear();
    this.spendLedger.clear();
    
    this.recordOperation('clear_all', 'all', {});
  }

  /**
   * Clear specific table
   */
  async clearTable(tableName: string): Promise<void> {
    switch (tableName) {
      case 'intents':
        this.intents.clear();
        break;
      case 'transactions':
        this.transactions.clear();
        break;
      default:
        throw new Error(`Unknown table: ${tableName}`);
    }

    this.recordOperation('clear_table', tableName, {});
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    intentCount: number;
    transactionCount: number;
    totalReservations: number;
  }> {
    return {
      intentCount: this.intents.size,
      transactionCount: this.transactions.size,
      totalReservations: this.spendLedger.size,
    };
  }

  /**
   * Verify transaction integrity
   */
  async verifyIntegrity(): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Check that all transactions reference existing intents
    for (const tx of this.transactions.values()) {
      if (!this.intents.has(tx.intentId)) {
        errors.push(`Transaction ${tx.id} references non-existent intent ${tx.intentId}`);
      }
    }

    // Check that spent amounts match transactions
    for (const [intentId, spent] of this.spendLedger.entries()) {
      const intent = this.intents.get(intentId);
      if (!intent) continue;

      const recordedTx = await this.getTransactionsByIntent(intentId);
      const calculatedTotal = recordedTx.reduce((sum, tx) => sum + parseInt(tx.amount, 10), 0);

      if (Math.abs(spent - calculatedTotal) > 1) {
        errors.push(
          `Intent ${intentId} has inconsistent spend: ledger=${spent}, calculated=${calculatedTotal}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Record operation for audit trail
   */
  private recordOperation(operation: string, targetId: string, details: any): void {
    this.history.push({
      operation,
      timestamp: new Date(),
      details: {
        targetId,
        ...details,
      },
    });
  }

  /**
   * Get audit history
   */
  getAuditHistory(limit: number = 100): typeof this.history {
    return this.history.slice(-limit);
  }

  /**
   * Reset harness completely
   */
  reset(): void {
    this.intents.clear();
    this.transactions.clear();
    this.spendLedger.clear();
    this.history = [];
    
    this.history.push({
      operation: 'harness_reset',
      timestamp: new Date(),
      details: {},
    });
  }
}

/**
 * Export singleton instance
 */
export const dbMock = new DatabaseMockHarness();
