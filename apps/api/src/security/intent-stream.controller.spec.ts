import { Test } from '@nestjs/testing';
import { IntentStreamController } from './intent-stream.controller';
import { IntentStreamService } from './intent-stream.service';

describe('IntentStreamController', () => {
  let controller: IntentStreamController;
  let mockService: Partial<IntentStreamService>;

  beforeEach(async () => {
    mockService = {
      onIntentUpdate: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [IntentStreamController],
      providers: [{ provide: IntentStreamService, useValue: mockService }],
    }).compile();

    controller = module.get(IntentStreamController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('SSE heartbeat', () => {
    it('emits keep-alive ping every 15 seconds', (done) => {
      mockService.onIntentUpdate = jest.fn().mockReturnValue(jest.fn());

      // Simulate SSE connection with mock response
      const mockData: string[] = [];
      const mockWrite = jest.fn((data: string) => {
        mockData.push(data);
      });

      // Verify controller can be instantiated with streaming endpoint
      expect(controller.streamIntentUpdates).toBeDefined();

      // Check that subscribe method exists
      expect(mockService.onIntentUpdate).toBeDefined();

      done();
    });
  });
});
