import { Injectable, OnModuleInit } from '@nestjs/common';
import { IntentExecutionStorePort } from './intent-store.port';

interface IntentUpdateEvent {
  intentId: string;
  status: string;
  timestamp: number;
}

/**
 * Service for managing Server-Sent Events subscription and broadcasting
 */
@Injectable()
export class IntentStreamService implements OnModuleInit {
  private subscribers: Set<(event: IntentUpdateEvent) => void> = new Set();
  private executionStore: IntentExecutionStorePort | null = null;

  constructor(private readonly intentStore: IntentExecutionStorePort) {}

  async onModuleInit() {
    this.executionStore = this.intentStore;

    // Periodically broadcast current state to all subscribers
    setInterval(() => {
      this.broadcastState();
    }, 500); // 500ms update frequency
  }

  onIntentUpdate(callback: (event: IntentUpdateEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private async broadcastState() {
    if (!this.executionStore) {
      return;
    }

    try {
      const intents = await this.executionStore.getAllIntents();

      intents.forEach((intent) => {
        const event: IntentUpdateEvent = {
          intentId: intent.id,
          status: intent.status,
          timestamp: Date.now(),
        };

        this.subscribers.forEach((callback) => {
          try {
            callback(event);
          } catch (err) {
            console.error('SSE subscriber error:', err);
          }
        });
      });
    } catch (error) {
      console.error('Error broadcasting intent state:', error);
    }
  }
}
