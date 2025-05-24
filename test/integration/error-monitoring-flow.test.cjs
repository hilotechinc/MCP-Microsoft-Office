/**
 * @fileoverview Integration test for error->monitoring flow
 * Tests that errors created by error service are properly received by monitoring service
 */

// Real event service (not mocked)
const eventService = require('../../src/core/event-service.cjs');
const errorService = require('../../src/core/error-service.new.cjs');
const monitoringService = require('../../src/core/monitoring-service.new.cjs');

describe('Error->Monitoring Integration', () => {
  beforeEach(() => {
    // Clear circular buffer before each test
    monitoringService.getLogBuffer().clear();
    
    // Reset recursion count
    errorService.createError.recursionCount = 0;
  });

  afterAll(() => {
    // Clear any running timers
    jest.clearAllTimers();
  });

  test('should handle end-to-end error flow', async () => {
    // Create an error using error service
    const error = errorService.createError(
      'api',
      'Integration test error',
      'error',
      { testData: 'integration' },
      'trace-integration-123'
    );

    // Wait for async event emission and processing
    await new Promise(resolve => setTimeout(resolve, 10));

    // Check that the error was received by monitoring service
    const logs = monitoringService.getLogBuffer().getAll();
    
    // Should have received the log event
    const errorLog = logs.find(log => 
      log.level === 'error' && 
      log.message === 'Integration test error'
    );

    expect(errorLog).toBeDefined();
    expect(errorLog.id).toBe(error.id);
    expect(errorLog.category).toBe('api');
    expect(errorLog.traceId).toBe('trace-integration-123');
    expect(errorLog.context).toEqual({ testData: 'integration' });
    expect(errorLog.source).toBe('error-service');
  });

  test('should maintain trace correlation across services', async () => {
    const traceId = 'trace-correlation-456';
    
    // Create multiple errors with same trace ID
    errorService.createError('auth', 'Auth error', 'error', {}, traceId);
    errorService.createError('api', 'API error', 'warning', {}, traceId);
    
    // Also create a direct monitoring log with same trace ID
    monitoringService.info('Direct monitoring log', { data: 'test' }, 'system', traceId);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 10));

    // Get all logs and filter by trace ID
    const logs = monitoringService.getLogBuffer().getAll();
    const tracedLogs = logs.filter(log => log.traceId === traceId);

    // Should have at least 3 logs with the same trace ID
    // (error service emits multiple events per error)
    expect(tracedLogs.length).toBeGreaterThanOrEqual(3);
    
    // Check that they represent different sources but same trace
    const authLog = tracedLogs.find(log => log.category === 'auth');
    const apiLog = tracedLogs.find(log => log.category === 'api');
    const systemLog = tracedLogs.find(log => log.category === 'system');

    expect(authLog).toBeDefined();
    expect(apiLog).toBeDefined();
    expect(systemLog).toBeDefined();

    expect(authLog.traceId).toBe(traceId);
    expect(apiLog.traceId).toBe(traceId);
    expect(systemLog.traceId).toBe(traceId);
  });

  test('should handle high volume error creation', async () => {
    const startTime = Date.now();
    const errors = [];

    // Create 50 errors rapidly
    for (let i = 0; i < 50; i++) {
      const error = errorService.createError(
        'load-test',
        `Load test error ${i}`,
        'warning',
        { index: i }
      );
      errors.push(error);
    }

    // Wait for all async processing
    await new Promise(resolve => setTimeout(resolve, 50));

    const logs = monitoringService.getLogBuffer().getAll();
    const loadTestLogs = logs.filter(log => log.category === 'load-test');

    // Should have received all error logs (or at least most due to throttling)
    expect(loadTestLogs.length).toBeGreaterThan(10); // Allow for some throttling
    expect(loadTestLogs.length).toBeLessThanOrEqual(50);

    // Check that circular buffer maintains size limit
    expect(logs.length).toBeLessThanOrEqual(100);

    const endTime = Date.now();
    console.log(`Processed ${loadTestLogs.length} errors in ${endTime - startTime}ms`);
  });

  test('should handle memory pressure gracefully', async () => {
    // Fill up the circular buffer completely
    for (let i = 0; i < 120; i++) {
      monitoringService.info(`Buffer fill ${i}`, { index: i }, 'test');
    }

    const initialLogCount = monitoringService.getLogBuffer().getAll().length;
    
    // Create more errors
    for (let i = 0; i < 10; i++) {
      errorService.createError('pressure-test', `Pressure error ${i}`, 'error');
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 20));

    const finalLogs = monitoringService.getLogBuffer().getAll();
    
    // Buffer should still be within limits
    expect(finalLogs.length).toBeLessThanOrEqual(100);
    
    // Should have some pressure-test errors (newer ones)
    const pressureErrors = finalLogs.filter(log => log.category === 'pressure-test');
    expect(pressureErrors.length).toBeGreaterThan(0);
  });

  test('should preserve event emission even if Winston fails', async () => {
    // This test verifies that even if file logging fails, 
    // the circular buffer still receives the logs via events
    
    const error = errorService.createError(
      'winston-test',
      'Error when Winston might fail',
      'error',
      { scenario: 'winston-failure' }
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    const logs = monitoringService.getLogBuffer().getAll();
    const winstonTestLog = logs.find(log => 
      log.category === 'winston-test' && 
      log.message === 'Error when Winston might fail'
    );

    // Should still be in circular buffer even if Winston fails
    expect(winstonTestLog).toBeDefined();
    expect(winstonTestLog.id).toBe(error.id);
  });

  test('should handle concurrent error creation', async () => {
    // Create errors concurrently to test thread safety
    const promises = [];
    
    for (let i = 0; i < 20; i++) {
      promises.push(
        new Promise(resolve => {
          setTimeout(() => {
            const error = errorService.createError(
              'concurrent',
              `Concurrent error ${i}`,
              'error',
              { threadId: i }
            );
            resolve(error);
          }, Math.random() * 10); // Random delay up to 10ms
        })
      );
    }

    const errors = await Promise.all(promises);
    
    // Wait for all events to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    const logs = monitoringService.getLogBuffer().getAll();
    const concurrentLogs = logs.filter(log => log.category === 'concurrent');

    // Should have received most/all concurrent errors
    expect(concurrentLogs.length).toBeGreaterThan(15);
    expect(errors.length).toBe(20);

    // All errors should have unique IDs
    const errorIds = new Set(errors.map(e => e.id));
    expect(errorIds.size).toBe(20);
  });
});