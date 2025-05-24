/**
 * @fileoverview Unit tests for new monitoring service with circular buffer
 */

const path = require('path');

// Mock event service to avoid dependencies during testing
const mockEventService = {
  emit: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(1),
  unsubscribe: jest.fn().mockResolvedValue(undefined)
};

// Mock the event service before requiring monitoring service
jest.mock('../../src/core/event-service.cjs', () => mockEventService);

// Now require the monitoring service
const monitoringService = require('../../src/core/monitoring-service.new.cjs');

describe('New Monitoring Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Clear the circular buffer
    monitoringService.getLogBuffer().clear();
  });

  afterAll(() => {
    // Clear any running timers to prevent Jest from hanging
    jest.clearAllTimers();
  });

  describe('Circular Buffer', () => {
    test('should maintain size limit', () => {
      const buffer = monitoringService.getLogBuffer();
      
      // Add more items than the buffer size (100)
      for (let i = 0; i < 150; i++) {
        monitoringService.info(`Test message ${i}`, {}, 'test');
      }
      
      const logs = buffer.getAll();
      expect(logs.length).toBeLessThanOrEqual(100);
    });

    test('should store logs in correct format', () => {
      monitoringService.info('Test message', { key: 'value' }, 'test', 'trace123');
      
      const logs = monitoringService.getLogBuffer().getAll();
      expect(logs.length).toBe(1);
      
      const log = logs[0];
      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('timestamp');
      expect(log.level).toBe('info');
      expect(log.message).toBe('Test message');
      expect(log.category).toBe('test');
      expect(log.traceId).toBe('trace123');
      expect(log.context).toEqual({ key: 'value' });
    });

    test('should overwrite oldest entries when full', () => {
      const buffer = monitoringService.getLogBuffer();
      
      // Fill buffer with exactly 100 items
      for (let i = 0; i < 100; i++) {
        monitoringService.info(`Message ${i}`, {}, 'test');
      }
      
      // Add one more - should overwrite the first entry
      monitoringService.info('New message', {}, 'test');
      
      const logs = buffer.getAll();
      expect(logs.length).toBe(100);
      
      // Should not contain the very first message
      const hasFirstMessage = logs.some(log => log.message === 'Message 0');
      expect(hasFirstMessage).toBe(false);
      
      // Should contain the last message
      const hasLastMessage = logs.some(log => log.message === 'New message');
      expect(hasLastMessage).toBe(true);
    });

    test('should clear buffer correctly', () => {
      // Add some logs
      monitoringService.info('Test 1', {}, 'test');
      monitoringService.info('Test 2', {}, 'test');
      
      expect(monitoringService.getLogBuffer().getAll().length).toBe(2);
      
      // Clear buffer
      monitoringService.getLogBuffer().clear();
      
      expect(monitoringService.getLogBuffer().getAll().length).toBe(0);
    });
  });

  describe('Event Emission', () => {
    test('should emit events for each log level', () => {
      monitoringService.info('Info message', {}, 'test');
      monitoringService.warn('Warn message', {}, 'test');
      monitoringService.error('Error message', {}, 'test');
      monitoringService.debug('Debug message', {}, 'test');
      
      // Should have emitted 4 events
      expect(mockEventService.emit).toHaveBeenCalledTimes(4);
      
      // Check event types
      expect(mockEventService.emit).toHaveBeenCalledWith('log:info', expect.any(Object));
      expect(mockEventService.emit).toHaveBeenCalledWith('log:warn', expect.any(Object));
      expect(mockEventService.emit).toHaveBeenCalledWith('log:error', expect.any(Object));
      expect(mockEventService.emit).toHaveBeenCalledWith('log:debug', expect.any(Object));
    });

    test('should emit metric events', () => {
      monitoringService.trackMetric('test_metric', 42, { unit: 'ms' });
      
      expect(mockEventService.emit).toHaveBeenCalledWith('log:metric', expect.objectContaining({
        type: 'metric',
        metric: 'test_metric',
        value: 42,
        context: { unit: 'ms' }
      }));
    });
  });

  describe('Error Handling', () => {
    test('should handle logError with error object', () => {
      const errorObj = {
        id: 'error-123',
        category: 'test',
        message: 'Test error',
        severity: 'error',
        context: { code: 500 },
        timestamp: new Date().toISOString()
      };
      
      monitoringService.logError(errorObj);
      
      const logs = monitoringService.getLogBuffer().getAll();
      expect(logs.length).toBe(1);
      expect(logs[0].id).toBe('error-123');
      expect(logs[0].level).toBe('error');
    });

    test('should apply error throttling', () => {
      // Generate many errors in the same category quickly
      for (let i = 0; i < 20; i++) {
        monitoringService.error('Repeated error', {}, 'test');
      }
      
      const logs = monitoringService.getLogBuffer().getAll();
      // Should throttle after 10 errors per second
      expect(logs.length).toBeLessThan(20);
    });
  });

  describe('Memory Protection', () => {
    test('should filter calendar/graph errors', () => {
      // These specific errors should be filtered out
      monitoringService.error('Graph API request failed', {}, 'calendar');
      monitoringService.error('Unable to read error response', {}, 'graph');
      
      const logs = monitoringService.getLogBuffer().getAll();
      
      // In non-development mode, these should be filtered
      if (process.env.NODE_ENV !== 'development') {
        expect(logs.length).toBe(0);
      }
    });

    test('should skip API/calendar info logs in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      monitoringService.info('API request', {}, 'api');
      monitoringService.info('Calendar event', {}, 'calendar');
      monitoringService.info('Other info', {}, 'other');
      
      const logs = monitoringService.getLogBuffer().getAll();
      
      // Only the 'other' category should be logged
      expect(logs.length).toBe(1);
      expect(logs[0].category).toBe('other');
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain same method signatures as original', () => {
      // Test that all original methods exist with correct signatures
      expect(typeof monitoringService.logError).toBe('function');
      expect(typeof monitoringService.error).toBe('function');
      expect(typeof monitoringService.info).toBe('function');
      expect(typeof monitoringService.warn).toBe('function');
      expect(typeof monitoringService.debug).toBe('function');
      expect(typeof monitoringService.trackMetric).toBe('function');
      expect(typeof monitoringService.subscribeToLogs).toBe('function');
      expect(typeof monitoringService.subscribeToMetrics).toBe('function');
      expect(typeof monitoringService.getLatestLogs).toBe('function');
      expect(typeof monitoringService.initLogger).toBe('function');
      expect(typeof monitoringService._resetLoggerForTest).toBe('function');
    });

    test('should return logs from getLatestLogs', async () => {
      monitoringService.info('Test 1', {}, 'test');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      monitoringService.info('Test 2', {}, 'test');
      
      const logs = await monitoringService.getLatestLogs(10);
      
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(2);
      
      // Should be sorted newest first
      expect(logs[0].message).toBe('Test 2');
      expect(logs[1].message).toBe('Test 1');
    });

    test('should provide buffer access via getLogBuffer', () => {
      expect(typeof monitoringService.getLogBuffer).toBe('function');
      
      const buffer = monitoringService.getLogBuffer();
      expect(buffer).toHaveProperty('add');
      expect(buffer).toHaveProperty('getAll');
      expect(buffer).toHaveProperty('clear');
    });
  });
});