const graphClientFactory = require('../../../src/graph/graph-client');
const authService = require('../../../src/core/auth-service');
const fetch = require('node-fetch');

jest.mock('../../../src/core/auth-service');
jest.mock('node-fetch');

const TEST_TOKEN = 'test-access-token';
const TEST_PROFILE = { displayName: 'Test User', mail: 'test@example.com' };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GraphClientFactory', () => {
    it('should create a client with a valid token and make a /me API call', async () => {
        authService.getToken.mockResolvedValue(TEST_TOKEN);
        fetch.mockResolvedValue({
            ok: true,
            json: async () => TEST_PROFILE
        });
        const client = await graphClientFactory.createClient();
        const profile = await client.api('/me').get();
        expect(profile).toHaveProperty('displayName', 'Test User');
        expect(profile).toHaveProperty('mail', 'test@example.com');
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/me'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: `Bearer ${TEST_TOKEN}`
                })
            })
        );
    });

    it('should retry failed requests up to 2 times', async () => {
        authService.getToken.mockResolvedValue(TEST_TOKEN);
        let callCount = 0;
        fetch.mockImplementation(async () => {
            callCount++;
            if (callCount < 3) return { ok: false, status: 500, json: async () => ({}) };
            return { ok: true, json: async () => TEST_PROFILE };
        });
        const client = await graphClientFactory.createClient();
        const profile = await client.api('/me').get();
        expect(profile).toHaveProperty('displayName', 'Test User');
        expect(callCount).toBe(3);
    });

    it('should support batching multiple requests', async () => {
        authService.getToken.mockResolvedValue(TEST_TOKEN);
        fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ responses: [ { body: { displayName: 'A' } }, { body: { displayName: 'B' } } ] })
        });
        const client = await graphClientFactory.createClient();
        const batchResults = await client.batch([
            { method: 'GET', url: '/me' },
            { method: 'GET', url: '/me/drive' }
        ]);
        expect(batchResults).toHaveLength(2);
        expect(batchResults[0]).toHaveProperty('displayName', 'A');
        expect(batchResults[1]).toHaveProperty('displayName', 'B');
    });
});
