const cacheService = require('../../../src/core/cache-service');

describe('CacheService', () => {
    beforeEach(async () => {
        await cacheService.clear();
    });

    it('should set and get a value', async () => {
        await cacheService.set('foo', 'bar', 2);
        const result = await cacheService.get('foo');
        expect(result).toBe('bar');
    });

    it('should expire a value after TTL', async () => {
        await cacheService.set('exp', 123, 1);
        const immediate = await cacheService.get('exp');
        expect(immediate).toBe(123);
        await new Promise(res => setTimeout(res, 1100));
        const expired = await cacheService.get('exp');
        expect(expired).toBeNull();
    });

    it('should invalidate a key', async () => {
        await cacheService.set('del', 'gone', 10);
        await cacheService.invalidate('del');
        const val = await cacheService.get('del');
        expect(val).toBeNull();
    });

    it('should track stats', async () => {
        await cacheService.set('s', 1, 2);
        await cacheService.get('s'); // hit
        await cacheService.get('nope'); // miss
        await cacheService.invalidate('s');
        const stats = await cacheService.stats();
        expect(stats.hits).toBeGreaterThan(0);
        expect(stats.misses).toBeGreaterThan(0);
        expect(stats.sets).toBeGreaterThan(0);
        expect(stats.deletes).toBeGreaterThan(0);
    });
});
