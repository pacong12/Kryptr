import { Test } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = app.get<AppService>(AppService);
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      expect(service.getData()).toEqual({ message: 'Hello API' });
    });
  });

  describe('health', () => {
    it('should return a healthy envelope', () => {
      const res = service.health();
      expect(res.ok).toBe(true);
      expect(res.data?.status).toBe('healthy');
      expect(res.data?.service).toBe('@kryptr/api');
    });
  });
});
