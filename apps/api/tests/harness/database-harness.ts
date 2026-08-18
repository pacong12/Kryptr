/**
 * Database Harness for E2E Testing
 * Provides clean test database state and table management utilities
 */

import { Pool, PoolClient } from 'pg';

export class DatabaseHarness {
  private pool: Pool | null = null;
  private client: PoolClient | null = null;

  constructor(private readonly databaseUrl: string) {}

  async setup(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: this.databaseUrl,
        max: 10, // Limit connections for test scenarios
      });

      // Create a dedicated client for cleanup operations
      this.client = await this.pool.connect();
      
      // Enable transaction mode for all cleanup operations
      await this.client.query('BEGIN');
      
      console.log('[DatabaseHarness] Setup complete - connected to test database');
    } catch (error) {
      console.error('[DatabaseHarness] Failed to setup:', error);
      throw error;
    }
  }

  /**
   * Clear specific tables with their indexes and constraints
   */
  async clearTables(tableNames: string[]): Promise<void> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    try {
      for (const tableName of tableNames) {
        // Delete all rows from table (faster than TRUNCATE for dependent tables)
        await this.client!.query(`DELETE FROM "${tableName}"`);
        
        // Reset auto-increment counters
        await this.client!.query(
          `ALTER TABLE "${tableName}" ALTER COLUMN id RESTART WITH 1`
        );
      }

      console.log(`[DatabaseHarness] Cleared tables: ${tableNames.join(', ')}`);
    } catch (error) {
      console.error('[DatabaseHarness] Failed to clear tables:', error);
      throw error;
    }
  }

  /**
   * Insert test data into wallets table
   */
  async insertWallet(data: {
    name: string;
    address: string;
    chains: string[];
  }): Promise<string> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    const result = await this.client.query(
      `INSERT INTO wallets (name, address, chains, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       RETURNING id`,
      [data.name, data.address, JSON.stringify(data.chains)]
    );

    return result.rows[0].id;
  }

  /**
   * Verify wallet exists in database
   */
  async verifyWalletExists(walletId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    const result = await this.client.query(
      'SELECT EXISTS(SELECT 1 FROM wallets WHERE id = $1)',
      [walletId]
    );

    return result.rows[0].exists;
  }

  /**
   * Get wallet count for validation
   */
  async getWalletCount(): Promise<number> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    const result = await this.client.query('SELECT COUNT(*) FROM wallets');
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Commit transaction
   */
  async commit(): Promise<void> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    await this.client.query('COMMIT');
    console.log('[DatabaseHarness] Transaction committed');
  }

  /**
   * Rollback transaction
   */
  async rollback(): Promise<void> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    await this.client.query('ROLLBACK');
    console.log('[DatabaseHarness] Transaction rolled back');
  }

  /**
   * Execute arbitrary query
   */
  async query(sql: string, params?: any[]): Promise<any[]> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    const result = await this.client.query(sql, params);
    return result.rows;
  }

  /**
   * Cleanup and release resources
   */
  async cleanup(): Promise<void> {
    if (this.client) {
      await this.rollback().catch(() => {});
      this.client.release();
      this.client = null;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    console.log('[DatabaseHarness] Cleanup complete');
  }
}
