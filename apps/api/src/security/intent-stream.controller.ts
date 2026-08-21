import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { IntentStreamService } from './intent-stream.service';

interface IntentUpdateEvent {
  intentId: string;
  status: string;
  timestamp: number;
}

/**
 * Server-Sent Events controller for real-time intent streaming
 * Emits intent status updates via SSE connection
 */
@Controller('security')
export class IntentStreamController {
  constructor(private readonly intentStreamService: IntentStreamService) {}

  @Get('intents/stream')
  streamIntentUpdates(@Res({ passthrough: true }) res: Response) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // SSE heartbeat interval (15 seconds)
    const heartbeatInterval = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    // Subscribe to intent updates
    const unsubscribe = this.intentStreamService.onIntentUpdate(
      (event: IntentUpdateEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
    );

    // Clean up on client disconnect
    res.on('close', () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
    });

    return null;
  }
}
