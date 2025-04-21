/**
 * @fileoverview Unit tests for error categories, severity levels, and error creation in ErrorService.
 */

const { CATEGORIES, SEVERITIES, createError } = require('../../../src/core/error-service');
const { validate: validateUuid } = require('uuid');

describe('ErrorService Constants', () => {
  test('CATEGORIES contains all required keys', () => {
    expect(CATEGORIES).toMatchObject({
      AUTH: 'auth',
      GRAPH: 'graph',
      API: 'api',
      DATABASE: 'database',
      MODULE: 'module',
      NLU: 'nlu',
      SYSTEM: 'system'
    });
  });

  test('SEVERITIES contains all required keys', () => {
    expect(SEVERITIES).toMatchObject({
      INFO: 'info',
      WARNING: 'warning',
      ERROR: 'error',
      CRITICAL: 'critical'
    });
  });
});

describe('ErrorService.createError', () => {
  it('creates a valid error object with all fields', async () => {
    const context = { user: 'alice', password: 'secret', token: 'abc123', info: 42 };
    const error = await createError(CATEGORIES.AUTH, 'Auth failed', SEVERITIES.ERROR, context);
    expect(error).toHaveProperty('id');
    expect(validateUuid(error.id)).toBe(true);
    expect(error.category).toBe(CATEGORIES.AUTH);
    expect(error.message).toBe('Auth failed');
    expect(error.severity).toBe(SEVERITIES.ERROR);
    expect(error).toHaveProperty('timestamp');
    expect(typeof error.timestamp).toBe('string');
    // Sanitization: password and token should not be present
    expect(error.context).toMatchObject({ user: 'alice', info: 42 });
    expect(error.context).not.toHaveProperty('password');
    expect(error.context).not.toHaveProperty('token');
  });

  it('works with minimal context', async () => {
    const error = await createError(CATEGORIES.API, 'API error', SEVERITIES.WARNING);
    expect(error.category).toBe(CATEGORIES.API);
    expect(error.message).toBe('API error');
    expect(error.severity).toBe(SEVERITIES.WARNING);
    expect(typeof error.context).toBe('object');
  });

  it('timestamp is ISO8601', async () => {
    const error = await createError(CATEGORIES.SYSTEM, 'Sys', SEVERITIES.INFO);
    expect(() => new Date(error.timestamp)).not.toThrow();
    expect(error.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });
});
