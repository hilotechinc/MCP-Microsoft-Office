/**
 * @fileoverview Unit tests for new error service with event emission
 */

// Mock event service to avoid dependencies during testing
const mockEventService = {
  emit: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(1),
  unsubscribe: jest.fn().mockResolvedValue(undefined)
};

// Mock the event service before requiring error service
jest.mock('../../src/core/event-service.cjs', () => mockEventService);

// Now require the error service
const errorService = require('../../src/core/error-service.new.cjs');

describe('New Error Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset recursion count for each test
    errorService.createError.recursionCount = 0;
  });

  afterAll(() => {
    // Clear any running timers to prevent Jest from hanging
    jest.clearAllTimers();
  });

  describe('Constants and Enums', () => {
    test('should export CATEGORIES with correct values', () => {
      expect(errorService.CATEGORIES).toEqual({
        AUTH: 'auth',
        GRAPH: 'graph',
        API: 'api',
        DATABASE: 'database',
        MODULE: 'module',
        NLU: 'nlu',
        SYSTEM: 'system'
      });
    });

    test('should export SEVERITIES with correct values', () => {
      expect(errorService.SEVERITIES).toEqual({
        INFO: 'info',
        WARNING: 'warning',
        ERROR: 'error',
        CRITICAL: 'critical'
      });
    });
  });

  describe('createError', () => {
    test('should create error object with correct structure', () => {
      const error = errorService.createError(
        'api',
        'Test error message',
        'error',
        { statusCode: 500 },
        'trace123'
      );

      expect(error).toHaveProperty('id');
      expect(error.category).toBe('api');
      expect(error.message).toBe('Test error message');
      expect(error.severity).toBe('error');
      expect(error.context).toEqual({ statusCode: 500 });
      expect(error.traceId).toBe('trace123');
      expect(error).toHaveProperty('timestamp');
      
      // Verify timestamp is a valid ISO string
      expect(new Date(error.timestamp).toISOString()).toBe(error.timestamp);
    });

    test('should generate UUID for error ID', () => {
      const error1 = errorService.createError('test', 'Error 1', 'error');
      const error2 = errorService.createError('test', 'Error 2', 'error');

      expect(error1.id).not.toBe(error2.id);
      expect(error1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    test('should sanitize sensitive context data', () => {
      const error = errorService.createError(
        'auth',
        'Login failed',
        'error',
        {
          username: 'testuser',
          password: 'secret123',
          token: 'bearer xyz',
          accessToken: 'access123',
          refreshToken: 'refresh456',
          clientSecret: 'client789',
          safeData: 'keepthis'
        }
      );

      expect(error.context).toEqual({
        username: 'testuser',
        safeData: 'keepthis'
      });
      
      expect(error.context).not.toHaveProperty('password');
      expect(error.context).not.toHaveProperty('token');
      expect(error.context).not.toHaveProperty('accessToken');
      expect(error.context).not.toHaveProperty('refreshToken');
      expect(error.context).not.toHaveProperty('clientSecret');
    });

    test('should handle missing optional parameters', () => {
      const error = errorService.createError('system', 'Basic error', 'warning');

      expect(error.category).toBe('system');
      expect(error.message).toBe('Basic error');
      expect(error.severity).toBe('warning');
      expect(error.context).toEqual({});
      expect(error.traceId).toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    test('should emit ERROR_CREATED event', async () => {
      const error = errorService.createError('api', 'Test error', 'error');

      // Wait for async event emission
      await new Promise(resolve => setImmediate(resolve));

      expect(mockEventService.emit).toHaveBeenCalledWith('error:created', error);
    });

    test('should emit log ERROR event', async () => {
      const error = errorService.createError('graph', 'Graph error', 'critical', { code: 404 }, 'trace456');

      // Wait for async event emission
      await new Promise(resolve => setImmediate(resolve));

      expect(mockEventService.emit).toHaveBeenCalledWith('log:error', expect.objectContaining({
        id: error.id,
        level: 'error',
        category: 'graph',
        message: 'Graph error',
        context: { code: 404 },
        timestamp: error.timestamp,
        traceId: 'trace456',
        severity: 'critical',
        source: 'error-service'
      }));
    });

    test('should emit both events for each error', async () => {
      errorService.createError('test', 'Test error', 'error');

      // Wait for async event emission
      await new Promise(resolve => setImmediate(resolve));

      expect(mockEventService.emit).toHaveBeenCalledTimes(2);
      expect(mockEventService.emit).toHaveBeenCalledWith('error:created', expect.any(Object));
      expect(mockEventService.emit).toHaveBeenCalledWith('log:error', expect.any(Object));
    });

    test('should handle event emission failures gracefully', async () => {
      // Mock event service to throw error
      mockEventService.emit.mockRejectedValueOnce(new Error('Event emission failed'));

      // Should not throw error
      expect(() => {
        errorService.createError('test', 'Test error', 'error');
      }).not.toThrow();

      // Wait for async event emission
      await new Promise(resolve => setImmediate(resolve));
    });
  });

  describe('Recursion Protection', () => {
    test('should prevent infinite recursion', () => {
      // Manually set recursion count to simulate deep recursion
      errorService.createError.recursionCount = 3;
      
      // This should trigger the recursion protection
      const error = errorService.createError('test', 'Recursive error', 'error');

      // Should have created an error indicating recursion limit
      expect(error.isRecursionLimitError).toBe(true);
      expect(error.message).toBe('Error recursion limit reached');
      expect(error.category).toBe('system');
      expect(error.context.originalCategory).toBe('test');
      expect(error.context.originalMessage).toBe('Recursive error');
    });
  });

  describe('createApiError', () => {
    test('should create API-safe error object', () => {
      const originalError = errorService.createError(
        'api',
        'Internal error',
        'error',
        { internalData: 'sensitive' },
        'trace789'
      );

      const apiError = errorService.createApiError(originalError);

      expect(apiError).toEqual({
        id: originalError.id,
        category: 'api',
        message: 'Internal error',
        severity: 'error',
        context: { internalData: 'sensitive' },
        timestamp: originalError.timestamp
      });

      // Should not include internal fields
      expect(apiError).not.toHaveProperty('isRecursionLimitError');
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain same method signatures as original', () => {
      expect(typeof errorService.createError).toBe('function');
      expect(typeof errorService.createApiError).toBe('function');
      expect(typeof errorService.setLoggingService).toBe('function');
    });

    test('should support setLoggingService for backward compatibility', () => {
      const mockLoggingService = { logError: jest.fn() };
      
      // Should not throw error
      expect(() => {
        errorService.setLoggingService(mockLoggingService);
      }).not.toThrow();
    });

    test('should export same constants as original', () => {
      expect(errorService).toHaveProperty('CATEGORIES');
      expect(errorService).toHaveProperty('SEVERITIES');
    });
  });

  describe('Error Categories and Severities', () => {
    test('should handle all error categories', () => {
      const categories = Object.values(errorService.CATEGORIES);
      
      categories.forEach(category => {
        const error = errorService.createError(category, 'Test error', 'error');
        expect(error.category).toBe(category);
      });
    });

    test('should handle all severity levels', () => {
      const severities = Object.values(errorService.SEVERITIES);
      
      severities.forEach(severity => {
        const error = errorService.createError('test', 'Test error', severity);
        expect(error.severity).toBe(severity);
      });
    });
  });

  describe('Context Sanitization', () => {
    test('should preserve non-sensitive data', () => {
      const context = {
        userId: '123',
        requestId: 'req-456',
        userAgent: 'Mozilla/5.0',
        ip: '192.168.1.1',
        method: 'POST',
        path: '/api/test'
      };

      const error = errorService.createError('api', 'Test error', 'error', context);
      expect(error.context).toEqual(context);
    });

    test('should handle null and undefined context', () => {
      const errorWithNull = errorService.createError('test', 'Null context', 'error', null);
      expect(errorWithNull.context).toBeNull();

      const errorWithUndefined = errorService.createError('test', 'Undefined context', 'error');
      expect(errorWithUndefined.context).toEqual({});
    });

    test('should handle non-object context', () => {
      const errorWithString = errorService.createError('test', 'String context', 'error', 'not an object');
      expect(errorWithString.context).toBe('not an object');
    });
  });
});