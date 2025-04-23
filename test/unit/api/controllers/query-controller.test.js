/**
 * @fileoverview Unit tests for query-controller (dependency-injected).
 */
// Use Jest's built-in expect
// const { expect } = require('chai');
// Using Jest's built-in mocking instead of sinon
const httpMocks = require('node-mocks-http');
const queryControllerFactory = require('../../../../src/api/controllers/query-controller');

function mockDeps(overrides = {}) {
    return {
        nluAgent: { processQuery: jest.fn().mockResolvedValue({ intent: 'testIntent', entities: { foo: 'bar' } }) },
        contextService: {
            updateContext: jest.fn().mockResolvedValue(),
            getCurrentContext: jest.fn().mockResolvedValue({ context: 'mocked' })
        },
        errorService: { createError: jest.fn() },
        ...overrides
    };
}

describe('query-controller', () => {
    it('should return 400 for invalid input', async () => {
        const deps = mockDeps();
        const { handleQuery } = queryControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: {} });
        const res = httpMocks.createResponse();
        await handleQuery(req, res);
        expect(res.statusCode).toBe(400);
        const data = res._getJSONData();
        expect(data).toHaveProperty('error');
    });

    it('should call NLU and context services and return structured response', async () => {
        const deps = mockDeps();
        const { handleQuery } = queryControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { query: 'test' } });
        const res = httpMocks.createResponse();
        await handleQuery(req, res);
        expect(deps.nluAgent.processQuery).toHaveBeenCalledTimes(1);
        expect(deps.contextService.updateContext).toHaveBeenCalledTimes(1);
        expect(deps.contextService.getCurrentContext).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        const data = res._getJSONData();
        expect(data).toHaveProperty('response');
        expect(data).toHaveProperty('context');
    });

    it('should handle internal errors and return 500', async () => {
        const deps = mockDeps({ nluAgent: { processQuery: jest.fn().mockRejectedValue(new Error('fail')) } });
        const { handleQuery } = queryControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { query: 'test' } });
        const res = httpMocks.createResponse();
        await handleQuery(req, res);
        expect(res.statusCode).toBe(500);
        const data = res._getJSONData();
        expect(data).toHaveProperty('error');
    });
});
